(function screenRecorderApp() {
  "use strict";

  const {
    buildRecordingName,
    captureProfile,
    formatBytes,
    formatDuration,
    recordingExtension,
    selectMimeType,
  } = window.RecorderCore;

  const STORAGE_KEY = "frame49_capture_preferences_v1";
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    body: document.body,
    captureForm: $("#captureForm"),
    countdown: $("#countdown"),
    downloadButton: $("#downloadButton"),
    formatBadge: $("#formatBadge"),
    livePreview: $("#livePreview"),
    liveStatus: $("#liveStatus"),
    microphone: $("#microphone"),
    monitorEmpty: $("#monitorEmpty"),
    monitorState: $("#monitorState span"),
    newTakeButton: $("#newTakeButton"),
    pauseButton: $("#pauseButton"),
    playbackPreview: $("#playbackPreview"),
    resolutionValue: $("#resolutionValue"),
    resultCard: $("#resultCard"),
    resultMeta: $("#resultMeta"),
    resultName: $("#resultName"),
    sizeValue: $("#sizeValue"),
    startButton: $("#startButton"),
    stopButton: $("#stopButton"),
    supportAlert: $("#supportAlert"),
    supportMessage: $("#supportMessage"),
    systemAudio: $("#systemAudio"),
    timecode: $("#timecode"),
    toast: $("#toast"),
    transport: $("#transport"),
    useCountdown: $("#useCountdown"),
  };

  let displayStream = null;
  let microphoneStream = null;
  let recordingStream = null;
  let recorder = null;
  let audioContext = null;
  let audioNodes = [];
  let chunks = [];
  let bytesRecorded = 0;
  let timerId = null;
  let recordingStartedAt = 0;
  let pausedStartedAt = 0;
  let pausedDuration = 0;
  let finalDuration = 0;
  let resultUrl = "";
  let toastTimer = null;
  let preparationToken = 0;
  let stopInProgress = false;
  let selectedMimeType = "";

  function init() {
    restorePreferences();
    selectedMimeType = selectMimeType();
    updateFormatBadge(selectedMimeType);
    checkSupport();

    elements.captureForm.addEventListener("submit", startCapture);
    elements.pauseButton.addEventListener("click", togglePause);
    elements.stopButton.addEventListener("click", () => stopRecording("button"));
    elements.newTakeButton.addEventListener("click", resetForNewTake);
    elements.captureForm.addEventListener("change", savePreferences);
    window.addEventListener("beforeunload", releaseAllMedia);
  }

  function checkSupport() {
    const hasCapture = Boolean(navigator.mediaDevices?.getDisplayMedia);
    const hasRecorder = typeof window.MediaRecorder !== "undefined";
    const secureEnough = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";

    if (hasCapture && hasRecorder && secureEnough) {
      elements.supportAlert.hidden = true;
      elements.startButton.disabled = false;
      return true;
    }

    const reasons = [];
    if (!secureEnough) reasons.push("请通过 HTTPS 或本机地址打开");
    if (!hasCapture || !hasRecorder) reasons.push("当前浏览器不支持网页录屏");
    elements.supportMessage.textContent = `${reasons.join("；")}。建议使用最新版 Chrome 或 Edge。`;
    elements.supportAlert.hidden = false;
    elements.startButton.disabled = true;
    setState("unsupported", "UNAVAILABLE");
    announce("当前环境不支持屏幕录制");
    return false;
  }

  function restorePreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (typeof saved.systemAudio === "boolean") elements.systemAudio.checked = saved.systemAudio;
      if (typeof saved.microphone === "boolean") elements.microphone.checked = saved.microphone;
      if (typeof saved.countdown === "boolean") elements.useCountdown.checked = saved.countdown;
      const profile = ["720", "1080", "original"].includes(saved.profile) ? saved.profile : "1080";
      const profileInput = document.querySelector(`input[name="profile"][value="${profile}"]`);
      if (profileInput) profileInput.checked = true;
    } catch (_) {
      // A corrupt preference should never prevent a recording.
    }
  }

  function savePreferences() {
    const profile = document.querySelector("input[name='profile']:checked")?.value || "1080";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        systemAudio: elements.systemAudio.checked,
        microphone: elements.microphone.checked,
        countdown: elements.useCountdown.checked,
        profile,
      }));
    } catch (_) {
      // Recording remains usable when storage is disabled.
    }
  }

  async function startCapture(event) {
    event.preventDefault();
    if (!checkSupport() || recorder || displayStream) return;

    clearResult();
    stopInProgress = false;
    preparationToken += 1;
    const token = preparationToken;
    setInputsLocked(true);
    setState("requesting", "SELECT SOURCE");
    setStartCopy("等待选择", "请在浏览器面板里确认画面");
    announce("正在等待选择录制画面");

    try {
      const profileName = document.querySelector("input[name='profile']:checked")?.value || "1080";
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: captureProfile(profileName),
        audio: elements.systemAudio.checked,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: elements.systemAudio.checked ? "include" : "exclude",
      });

      if (token !== preparationToken) {
        stopStream(displayStream);
        displayStream = null;
        return;
      }

      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("没有取得可录制的视频轨道");
      videoTrack.addEventListener("ended", handleSurfaceEnded, { once: true });
      showLivePreview(displayStream);
      updateResolution(videoTrack);

      if (elements.microphone.checked) await requestMicrophone();
      recordingStream = await createRecordingStream(displayStream, microphoneStream);

      if (elements.useCountdown.checked) {
        await runCountdown(token);
      }

      if (token !== preparationToken || videoTrack.readyState === "ended") return;
      beginRecording(profileName);
    } catch (error) {
      handleCaptureError(error);
      releaseAllMedia();
      resetReadyState();
    }
  }

  async function requestMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      elements.microphone.checked = false;
      showToast("浏览器不支持麦克风采集，将只录制画面声音。", "error");
      return;
    }

    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      elements.microphone.checked = false;
      savePreferences();
      showToast(error?.name === "NotAllowedError"
        ? "未获得麦克风权限，将继续录制画面。"
        : "麦克风暂时不可用，将继续录制画面。", "error");
    }
  }

  async function createRecordingStream(screen, mic) {
    const videoTracks = screen.getVideoTracks();
    const audioTracks = [...screen.getAudioTracks(), ...(mic?.getAudioTracks() || [])];

    if (audioTracks.length <= 1) return new MediaStream([...videoTracks, ...audioTracks]);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showToast("当前浏览器无法混合双路声音，将优先录制共享音频。", "error");
      return new MediaStream([...videoTracks, audioTracks[0]]);
    }

    audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    audioNodes = audioTracks.map((track) => {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
      return source;
    });
    return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
  }

  async function runCountdown(token) {
    setState("countdown", "STAND BY");
    elements.countdown.hidden = false;
    for (const value of [3, 2, 1]) {
      if (token !== preparationToken || displayStream?.getVideoTracks()[0]?.readyState === "ended") break;
      elements.countdown.textContent = value;
      announce(`${value} 秒后开始录制`);
      await delay(800);
    }
    elements.countdown.textContent = "";
    elements.countdown.hidden = true;
  }

  function beginRecording(profileName) {
    selectedMimeType = selectMimeType();
    const options = {
      videoBitsPerSecond: profileName === "720" ? 2_500_000 : profileName === "original" ? 8_000_000 : 5_000_000,
      audioBitsPerSecond: 128_000,
    };
    if (selectedMimeType) options.mimeType = selectedMimeType;

    recorder = new MediaRecorder(recordingStream, options);
    chunks = [];
    bytesRecorded = 0;
    pausedDuration = 0;
    pausedStartedAt = 0;
    recordingStartedAt = performance.now();
    finalDuration = 0;

    recorder.addEventListener("dataavailable", handleDataAvailable);
    recorder.addEventListener("stop", finalizeRecording, { once: true });
    recorder.addEventListener("error", handleRecorderError);
    recorder.start(1000);

    elements.startButton.hidden = true;
    elements.transport.hidden = false;
    elements.pauseButton.innerHTML = '<span class="pause-icon" aria-hidden="true"></span><span>暂停</span>';
    setState("recording", "REC");
    updateFormatBadge(recorder.mimeType || selectedMimeType);
    updateTelemetry();
    timerId = window.setInterval(updateTelemetry, 250);
    announce("录制已开始");
    showToast("录制开始。结束共享或点击“结束并生成”即可保存。", "success");
  }

  function handleDataAvailable(event) {
    if (!event.data || event.data.size === 0) return;
    chunks.push(event.data);
    bytesRecorded += event.data.size;
    elements.sizeValue.textContent = formatBytes(bytesRecorded);
  }

  function togglePause() {
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      pausedStartedAt = performance.now();
      setState("paused", "PAUSED");
      elements.pauseButton.innerHTML = '<span class="play-icon" aria-hidden="true">▶</span><span>继续</span>';
      announce("录制已暂停");
      return;
    }
    if (recorder.state === "paused") {
      pausedDuration += performance.now() - pausedStartedAt;
      pausedStartedAt = 0;
      recorder.resume();
      setState("recording", "REC");
      elements.pauseButton.innerHTML = '<span class="pause-icon" aria-hidden="true"></span><span>暂停</span>';
      announce("录制已继续");
    }
  }

  function stopRecording(reason = "button") {
    if (!recorder || recorder.state === "inactive" || stopInProgress) return;
    stopInProgress = true;
    finalDuration = elapsedMilliseconds();
    window.clearInterval(timerId);
    timerId = null;
    setState("processing", "PROCESSING");
    elements.pauseButton.disabled = true;
    elements.stopButton.disabled = true;
    recorder.stop();
    stopSourceTracks();
    announce(reason === "surface" ? "共享画面已结束，正在生成录像" : "正在生成录像");
  }

  function handleSurfaceEnded() {
    preparationToken += 1;
    elements.countdown.hidden = true;
    if (recorder && recorder.state !== "inactive") {
      stopRecording("surface");
      return;
    }
    releaseAllMedia();
    resetReadyState();
    showToast("共享画面已结束，录制未开始。", "error");
  }

  function finalizeRecording() {
    const mimeType = recorder?.mimeType || selectedMimeType || chunks[0]?.type || "video/webm";
    const blob = new Blob(chunks, { type: mimeType });
    releaseAllMedia({ keepRecorder: true });

    if (!blob.size) {
      showToast("没有收到可保存的录制数据，请重新尝试。", "error");
      recorder = null;
      resetReadyState();
      return;
    }

    const extension = recordingExtension(mimeType);
    const fileName = buildRecordingName(new Date(), extension);
    resultUrl = URL.createObjectURL(blob);
    elements.playbackPreview.src = resultUrl;
    elements.playbackPreview.hidden = false;
    elements.livePreview.hidden = true;
    elements.livePreview.srcObject = null;
    elements.monitorEmpty.hidden = true;
    elements.downloadButton.href = resultUrl;
    elements.downloadButton.download = fileName;
    elements.resultName.textContent = fileName;
    elements.resultMeta.textContent = `${formatDuration(finalDuration)} · ${formatBytes(blob.size)} · ${extension.toUpperCase()}`;
    elements.resultCard.hidden = false;
    elements.timecode.textContent = formatDuration(finalDuration);
    elements.sizeValue.textContent = formatBytes(blob.size);
    elements.transport.hidden = true;
    elements.pauseButton.disabled = false;
    elements.stopButton.disabled = false;
    setState("result", "TAKE READY");
    setInputsLocked(false);
    recorder = null;
    chunks = [];
    stopInProgress = false;
    announce("录像已经生成，可以预览或下载");
    showToast("录像已生成，文件仍只保存在当前浏览器中。", "success");
  }

  function resetForNewTake() {
    clearResult();
    resetReadyState();
    elements.startButton.focus();
  }

  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = "";
    elements.playbackPreview.pause();
    elements.playbackPreview.removeAttribute("src");
    elements.playbackPreview.load();
    elements.playbackPreview.hidden = true;
    elements.resultCard.hidden = true;
    elements.resultName.textContent = "FRAME49-recording.webm";
    elements.resultMeta.textContent = "00:00:00 · 0 B";
  }

  function resetReadyState() {
    preparationToken += 1;
    elements.countdown.hidden = true;
    elements.livePreview.hidden = true;
    elements.livePreview.srcObject = null;
    elements.monitorEmpty.hidden = false;
    elements.startButton.hidden = false;
    elements.transport.hidden = true;
    elements.pauseButton.disabled = false;
    elements.stopButton.disabled = false;
    elements.timecode.textContent = "00:00:00";
    elements.sizeValue.textContent = "0 B";
    elements.resolutionValue.textContent = "—";
    setStartCopy("开始录制", "选择要分享的画面");
    setInputsLocked(false);
    if (checkSupport()) setState("ready", "READY");
    stopInProgress = false;
  }

  function showLivePreview(stream) {
    elements.livePreview.srcObject = stream;
    elements.livePreview.hidden = false;
    elements.playbackPreview.hidden = true;
    elements.monitorEmpty.hidden = true;
    elements.livePreview.play().catch(() => {});
  }

  function updateResolution(track) {
    const settings = track.getSettings?.() || {};
    elements.resolutionValue.textContent = settings.width && settings.height
      ? `${settings.width}×${settings.height}`
      : "AUTO";
  }

  function updateTelemetry() {
    elements.timecode.textContent = formatDuration(elapsedMilliseconds());
    elements.sizeValue.textContent = formatBytes(bytesRecorded);
  }

  function elapsedMilliseconds() {
    if (!recordingStartedAt) return 0;
    const end = pausedStartedAt || performance.now();
    return Math.max(0, end - recordingStartedAt - pausedDuration);
  }

  function setState(state, label) {
    elements.body.dataset.state = state;
    elements.monitorState.textContent = label;
  }

  function setStartCopy(title, subtitle) {
    const copy = elements.startButton.querySelector("span:nth-child(2)");
    if (copy) copy.innerHTML = `<strong>${title}</strong><small>${subtitle}</small>`;
  }

  function setInputsLocked(locked) {
    elements.captureForm.querySelectorAll("input").forEach((input) => {
      input.disabled = locked;
    });
    elements.startButton.disabled = locked;
  }

  function updateFormatBadge(mimeType) {
    const format = recordingExtension(mimeType).toUpperCase();
    const codec = String(mimeType).match(/codecs=([^,;]+)/i)?.[1]?.toUpperCase();
    elements.formatBadge.textContent = `${format} · ${codec || "AUTO"}`;
  }

  function handleCaptureError(error) {
    const messages = {
      AbortError: "画面选择被中断，请重新开始。",
      InvalidStateError: "请先回到当前标签页，再启动录制。",
      NotAllowedError: "没有获得画面权限。需要录制时，请重新选择并允许共享。",
      NotFoundError: "没有找到可以共享的屏幕或窗口。",
      NotReadableError: "系统暂时无法读取这个画面，可能正被其他程序占用。",
      OverconstrainedError: "当前设备不支持所选画质，请改用 720p。",
    };
    showToast(messages[error?.name] || error?.message || "录制启动失败，请重新尝试。", "error");
    announce("录制没有开始");
  }

  function handleRecorderError(event) {
    showToast(event.error?.message || "录制器发生错误，正在尝试结束并保留数据。", "error");
    stopRecording("error");
  }

  function releaseAllMedia(options = {}) {
    window.clearInterval(timerId);
    timerId = null;
    stopSourceTracks();
    audioNodes.forEach((node) => {
      try { node.disconnect(); } catch (_) {}
    });
    audioNodes = [];
    if (audioContext) audioContext.close().catch(() => {});
    audioContext = null;
    displayStream = null;
    microphoneStream = null;
    recordingStream = null;
    if (!options.keepRecorder && recorder?.state !== "inactive") {
      try { recorder.stop(); } catch (_) {}
    }
    if (!options.keepRecorder) recorder = null;
  }

  function stopSourceTracks() {
    const tracks = new Set([
      ...(displayStream?.getTracks() || []),
      ...(microphoneStream?.getTracks() || []),
      ...(recordingStream?.getTracks() || []),
    ]);
    tracks.forEach((track) => {
      track.onended = null;
      if (track.readyState !== "ended") track.stop();
    });
  }

  function stopStream(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function announce(message) {
    elements.liveStatus.textContent = "";
    requestAnimationFrame(() => { elements.liveStatus.textContent = message; });
  }

  function showToast(message, tone = "success") {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${tone === "error" ? "error" : ""}`;
    toastTimer = window.setTimeout(() => {
      elements.toast.className = "toast";
    }, 4200);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  init();
})();
