(function regionCaptureModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegionCapture = api;
})(typeof window !== "undefined" ? window : null, function regionCaptureFactory() {
  "use strict";

  const MIN_SIZE = 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function sourcePoint(clientX, clientY, bounds, width, height) {
    if (!(bounds.width > 0 && bounds.height > 0 && width > 0 && height > 0)) {
      throw new RangeError("截图尺寸无效");
    }
    return {
      x: Math.round(clamp((clientX - bounds.left) / bounds.width, 0, 1) * width),
      y: Math.round(clamp((clientY - bounds.top) / bounds.height, 0, 1) * height),
    };
  }

  function rectangleFromPoints(start, end, width, height) {
    const x1 = Math.round(clamp(start.x, 0, width));
    const y1 = Math.round(clamp(start.y, 0, height));
    const x2 = Math.round(clamp(end.x, 0, width));
    const y2 = Math.round(clamp(end.y, 0, height));
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }

  function isValidRegion(region) {
    return Boolean(region && [region.x, region.y, region.width, region.height].every(Number.isFinite)
      && region.x >= 0 && region.y >= 0 && region.width >= MIN_SIZE && region.height >= MIN_SIZE);
  }

  function outputDimensions(region, profileName = "1080") {
    if (!isValidRegion(region)) throw new RangeError("请至少框选 2 × 2 像素的区域");
    const max = profileName === "original" ? [Infinity, Infinity] : profileName === "720" ? [1280, 720] : [1920, 1080];
    const scale = Math.min(1, max[0] / region.width, max[1] / region.height);
    return {
      width: Math.max(MIN_SIZE, Math.floor(region.width * scale)),
      height: Math.max(MIN_SIZE, Math.floor(region.height * scale)),
    };
  }

  function namedError(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  const abortError = () => namedError("AbortError", "已取消截图录制");

  function isSupported() {
    return typeof document !== "undefined" && typeof MediaStream !== "undefined"
      && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function"
      && typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
  }

  function waitForFrame(video, signal) {
    return new Promise((resolve, reject) => {
      let timeout;
      let poll;
      function finish(error) {
        clearTimeout(timeout);
        clearInterval(poll);
        video.removeEventListener("loadeddata", check);
        video.removeEventListener("resize", check);
        video.removeEventListener("error", failed);
        signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      }
      function check() {
        if (video.readyState >= 2 && video.videoWidth >= MIN_SIZE && video.videoHeight >= MIN_SIZE) finish();
      }
      function failed() { finish(new Error("无法读取共享画面，请重新选择录制来源。")); }
      function aborted() { finish(abortError()); }
      if (signal.aborted) return aborted();
      video.addEventListener("loadeddata", check);
      video.addEventListener("resize", check);
      video.addEventListener("error", failed);
      signal.addEventListener("abort", aborted, { once: true });
      timeout = setTimeout(() => finish(new Error("读取共享画面超时，请确认画面可见后重新选择。")), 15000);
      poll = setInterval(check, 50);
      // HAVE_CURRENT_DATA guarantees a drawable frame, unlike loadedmetadata alone.
      Promise.resolve(video.play()).then(check, (error) => finish(error));
      check();
    });
  }

  function selectRegion(snapshot, signal) {
    return new Promise((resolve, reject) => {
      const previouslyFocused = document.activeElement;
      const dialog = document.createElement("dialog");
      dialog.id = "regionDialog";
      dialog.className = "region-dialog";
      dialog.setAttribute("aria-labelledby", "regionTitle");
      dialog.setAttribute("aria-describedby", "regionDescription");
      dialog.innerHTML = `
        <div class="region-heading"><div><span class="region-eyebrow">SCREENSHOT / SELECT AREA</span>
          <h2 id="regionTitle">框选要录制的区域</h2></div><span class="region-step">01 / 02</span></div>
        <p id="regionDescription" class="region-description">在截图上按住并拖动，选定后点击「确认并录制」。只录制选区内的实时画面。</p>
        <div class="region-workspace"><div class="region-stage"><div id="regionSelection" class="region-selection" hidden></div></div></div>
        <div class="region-details"><output id="regionSize" aria-live="polite">尚未选择区域</output><span>截图仅用于定位，不会保存</span></div>
        <p id="regionKeyboardHelp" class="region-keyboard-help">键盘：Enter 建立选区，方向键移动，Shift + 方向键调整大小；Esc 取消。</p>
        <div class="region-actions"><button id="regionCancel" type="button">取消</button>
          <button id="regionReset" type="button" disabled>重新框选</button>
          <button id="regionConfirm" class="region-confirm" type="button" disabled>确认并录制 <span aria-hidden="true">↗</span></button></div>`;
      const stage = dialog.querySelector(".region-stage");
      const workspace = dialog.querySelector(".region-workspace");
      const selection = dialog.querySelector("#regionSelection");
      const size = dialog.querySelector("#regionSize");
      const confirm = dialog.querySelector("#regionConfirm");
      const reset = dialog.querySelector("#regionReset");
      snapshot.id = "regionScreenshot";
      snapshot.tabIndex = 0;
      snapshot.setAttribute("role", "img");
      snapshot.setAttribute("aria-label", "共享画面截图，可拖动框选或使用键盘选择录制区域");
      snapshot.setAttribute("aria-describedby", "regionKeyboardHelp regionSize");
      stage.prepend(snapshot);
      let region = null;
      let pointerId = null;
      let start = null;
      let completed = false;
      let observer = null;

      function fitScreenshot() {
        const scale = Math.min(workspace.clientWidth / snapshot.width, workspace.clientHeight / snapshot.height, 1);
        stage.style.width = `${Math.max(1, Math.floor(snapshot.width * scale))}px`;
        stage.style.height = `${Math.max(1, Math.floor(snapshot.height * scale))}px`;
      }

      function finish(error) {
        if (completed) return;
        completed = true;
        observer?.disconnect();
        window.removeEventListener("resize", fitScreenshot);
        signal.removeEventListener("abort", aborted);
        dialog.close();
        dialog.remove();
        if (previouslyFocused?.isConnected && !previouslyFocused.disabled) previouslyFocused.focus({ preventScroll: true });
        if (error) reject(error);
        else resolve(region);
      }

      function updateSelection() {
        selection.hidden = !region;
        if (region) {
          selection.style.left = `${region.x / snapshot.width * 100}%`;
          selection.style.top = `${region.y / snapshot.height * 100}%`;
          selection.style.width = `${region.width / snapshot.width * 100}%`;
          selection.style.height = `${region.height / snapshot.height * 100}%`;
        }
        const valid = isValidRegion(region);
        confirm.disabled = !valid || pointerId !== null;
        reset.disabled = !region;
        size.textContent = valid ? `已选 ${region.width} × ${region.height} 像素` : region ? "区域太小，请重新拖动框选" : "尚未选择区域";
        snapshot.setAttribute("aria-label", valid ? `已选录制区域，左侧 ${region.x}，上侧 ${region.y}，宽 ${region.width}，高 ${region.height} 像素` : "共享画面截图，可拖动框选或使用键盘选择录制区域");
      }

      const pointFor = (event) => sourcePoint(event.clientX, event.clientY, snapshot.getBoundingClientRect(), snapshot.width, snapshot.height);
      function aborted() { finish(abortError()); }
      const cancelled = () => finish(namedError("RegionSelectionCancelled", "已取消截图选区"));

      snapshot.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || pointerId !== null) return;
        event.preventDefault();
        snapshot.focus({ preventScroll: true });
        pointerId = event.pointerId;
        start = pointFor(event);
        region = rectangleFromPoints(start, start, snapshot.width, snapshot.height);
        snapshot.setPointerCapture(pointerId);
        updateSelection();
      });
      snapshot.addEventListener("pointermove", (event) => {
        if (event.pointerId !== pointerId) return;
        region = rectangleFromPoints(start, pointFor(event), snapshot.width, snapshot.height);
        updateSelection();
      });
      snapshot.addEventListener("pointerup", (event) => {
        if (event.pointerId !== pointerId) return;
        region = rectangleFromPoints(start, pointFor(event), snapshot.width, snapshot.height);
        pointerId = null;
        if (snapshot.hasPointerCapture(event.pointerId)) snapshot.releasePointerCapture(event.pointerId);
        updateSelection();
      });
      function cancelDrag(event) {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        region = null;
        updateSelection();
      }
      snapshot.addEventListener("pointercancel", cancelDrag);
      snapshot.addEventListener("lostpointercapture", cancelDrag);
      snapshot.addEventListener("keydown", (event) => {
        if (pointerId !== null) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!isValidRegion(region)) {
            const width = Math.max(MIN_SIZE, Math.floor(snapshot.width / 2));
            const height = Math.max(MIN_SIZE, Math.floor(snapshot.height / 2));
            region = { x: Math.floor((snapshot.width - width) / 2), y: Math.floor((snapshot.height - height) / 2), width, height };
            updateSelection();
          } else confirm.focus();
          return;
        }
        if (!isValidRegion(region) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const step = event.altKey ? 1 : 10;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (event.shiftKey) {
          region.width = clamp(region.width + dx, MIN_SIZE, snapshot.width - region.x);
          region.height = clamp(region.height + dy, MIN_SIZE, snapshot.height - region.y);
        } else {
          region.x = clamp(region.x + dx, 0, snapshot.width - region.width);
          region.y = clamp(region.y + dy, 0, snapshot.height - region.height);
        }
        updateSelection();
      });
      confirm.addEventListener("click", () => { if (isValidRegion(region) && pointerId === null) finish(); });
      reset.addEventListener("click", () => { region = null; updateSelection(); snapshot.focus(); });
      dialog.querySelector("#regionCancel").addEventListener("click", cancelled);
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); cancelled(); });
      dialog.addEventListener("close", () => { if (!completed) cancelled(); });
      if (signal.aborted) { reject(abortError()); return; }
      signal.addEventListener("abort", aborted, { once: true });
      document.body.append(dialog);
      try {
        dialog.showModal();
        fitScreenshot();
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(fitScreenshot);
          observer.observe(workspace);
        }
        window.addEventListener("resize", fitScreenshot);
        snapshot.focus({ preventScroll: true });
      } catch (error) { finish(error); }
    });
  }

  function startFrameClock(draw) {
    let worker = null;
    let workerUrl = null;
    let interval = null;
    let stopped = false;
    function fallback() {
      if (stopped) return;
      worker?.terminate();
      worker = null;
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      workerUrl = null;
      if (interval === null) interval = setInterval(draw, 1000 / 30);
    }
    try {
      // A worker heartbeat does not depend on the recorder tab's animation frames.
      workerUrl = URL.createObjectURL(new Blob(["setInterval(() => postMessage('frame'), 1000 / 30);"], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
      worker.onmessage = () => { if (!stopped) draw(); };
      worker.onerror = (event) => { event.preventDefault(); fallback(); };
    } catch (_) { fallback(); }
    return () => {
      stopped = true;
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
      if (interval !== null) clearInterval(interval);
    };
  }

  async function create(displayStream, { profileName = "1080", signal, onSelecting } = {}) {
    if (signal?.aborted) throw abortError();
    if (!isSupported()) throw new Error("当前浏览器不支持截图区域录制，请使用最新版 Chrome 或 Edge。");
    const sourceTrack = displayStream.getVideoTracks()[0];
    if (!sourceTrack || sourceTrack.readyState === "ended") throw new Error("共享画面已经结束，请重新选择。");
    const controller = new AbortController();
    const video = document.createElement("video");
    video.className = "region-source-video";
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("aria-hidden", "true");
    // Retain a playing element without adding another audible path for display audio.
    video.srcObject = new MediaStream([sourceTrack]);
    document.body.append(video);
    let stopped = false;
    let ownedStream = null;
    let stopClock = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let failure = null;

    function stop() {
      if (stopped) return;
      stopped = true;
      controller.abort();
      signal?.removeEventListener("abort", stop);
      sourceTrack.removeEventListener("ended", sourceEnded);
      video.removeEventListener("resize", checkDimensions);
      stopClock?.();
      ownedStream?.getTracks().forEach((track) => track.stop());
      video.pause();
      video.srcObject = null;
      video.remove();
    }

    function fail(error) {
      if (stopped) return;
      failure = error;
      const track = ownedStream?.getVideoTracks()[0];
      stop();
      // MediaStreamTrack.stop() does not emit ended; consumers must be told to finalize.
      if (track) track.dispatchEvent(new Event("ended"));
    }

    function sourceEnded() { fail(namedError("AbortError", "共享画面已经结束")); }
    function checkDimensions() {
      if (sourceWidth && (video.videoWidth !== sourceWidth || video.videoHeight !== sourceHeight)) {
        fail(namedError("RegionSourceChanged", "共享画面尺寸发生变化，请重新框选区域。"));
        return false;
      }
      return !stopped;
    }

    signal?.addEventListener("abort", stop, { once: true });
    sourceTrack.addEventListener("ended", sourceEnded, { once: true });
    video.addEventListener("resize", checkDimensions);
    try {
      await waitForFrame(video, controller.signal);
      if (stopped) throw failure || abortError();
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
      const snapshot = document.createElement("canvas");
      snapshot.width = sourceWidth;
      snapshot.height = sourceHeight;
      const snapshotContext = snapshot.getContext("2d", { alpha: false });
      if (!snapshotContext) throw new Error("无法创建截图，请重新尝试。");
      snapshotContext.drawImage(video, 0, 0);
      onSelecting?.();
      const region = await selectRegion(snapshot, controller.signal);
      // Release the full-screen still as soon as the selection has been accepted.
      snapshot.width = 0;
      snapshot.height = 0;
      if (!checkDimensions()) throw failure || abortError();
      const { width, height } = outputDimensions(region, profileName);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("无法创建区域录制画面，请重新尝试。");
      // requestFrame drives capture explicitly, including when rAF is suspended.
      const manualFrames = typeof CanvasCaptureMediaStreamTrack !== "undefined"
        && typeof CanvasCaptureMediaStreamTrack.prototype.requestFrame === "function";
      ownedStream = canvas.captureStream(manualFrames ? 0 : 30);
      const outputTrack = ownedStream.getVideoTracks()[0];
      function draw() {
        if (!checkDimensions() || video.readyState < 2) return;
        try {
          context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, width, height);
          if (manualFrames) outputTrack.requestFrame();
        } catch (_) { fail(new Error("区域画面读取失败，请重新框选后录制。")); }
      }
      draw();
      if (stopped) throw failure || abortError();
      stopClock = startFrameClock(draw);
      const stream = new MediaStream([outputTrack, ...displayStream.getAudioTracks()]);
      return { stream, width, height, stop };
    } catch (error) {
      stop();
      throw failure || error;
    }
  }

  return { create, isSupported, sourcePoint, rectangleFromPoints, isValidRegion, outputDimensions };
});
