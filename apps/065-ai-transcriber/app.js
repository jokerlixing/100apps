(function () {
  'use strict';

  const Core = window.TranscriptCore;
  if (!Core) throw new Error('TranscriptCore failed to load');

  const STORAGE_KEY = 'scribe65.session.v1';
  const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
  const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const elements = {
    engineState: document.querySelector('#engine-state'),
    engineLabel: document.querySelector('#engine-label'),
    sessionTitle: document.querySelector('#session-title'),
    language: document.querySelector('#language-select'),
    tapeMachine: document.querySelector('#tape-machine'),
    takeLabel: document.querySelector('#take-label'),
    sheetTake: document.querySelector('#sheet-take'),
    clock: document.querySelector('#recording-clock'),
    waveform: document.querySelector('#waveform'),
    waveEmpty: document.querySelector('#wave-empty'),
    interim: document.querySelector('#interim-text'),
    start: document.querySelector('#start-button'),
    restart: document.querySelector('#restart-button'),
    pause: document.querySelector('#pause-button'),
    stop: document.querySelector('#stop-button'),
    audioInput: document.querySelector('#audio-input'),
    playbackRack: document.querySelector('#playback-rack'),
    audioName: document.querySelector('#audio-name'),
    audioPlayer: document.querySelector('#audio-player'),
    downloadAudio: document.querySelector('#download-audio'),
    deleteAudio: document.querySelector('#delete-audio'),
    supportNote: document.querySelector('#support-note'),
    metrics: {
      characters: document.querySelector('#metric-characters'),
      words: document.querySelector('#metric-words'),
      segments: document.querySelector('#metric-segments'),
      pace: document.querySelector('#metric-pace'),
    },
    search: document.querySelector('#search-input'),
    resultCount: document.querySelector('#result-count'),
    empty: document.querySelector('#empty-state'),
    noResults: document.querySelector('#no-results'),
    segmentList: document.querySelector('#segment-list'),
    segmentTemplate: document.querySelector('#segment-template'),
    copy: document.querySelector('#copy-button'),
    txt: document.querySelector('#txt-button'),
    srt: document.querySelector('#srt-button'),
    newSession: document.querySelector('#new-session-button'),
    resetDialog: document.querySelector('#reset-dialog'),
    confirmReset: document.querySelector('#confirm-reset'),
    toast: document.querySelector('#toast'),
    liveStatus: document.querySelector('#live-status'),
  };

  const state = {
    session: loadSession(),
    durationMs: 0,
    mode: 'idle',
    recognition: null,
    recognitionRestartTimer: 0,
    shouldRestartRecognition: false,
    stream: null,
    recorder: null,
    recorderChunks: [],
    recordingMime: '',
    audioContext: null,
    analyser: null,
    waveformFrame: 0,
    activeStartedAt: 0,
    pendingSegmentStart: 0,
    audioUrl: '',
    audioIsRecording: false,
    generation: 0,
    persistTimer: 0,
    toastTimer: 0,
  };

  state.durationMs = Core.calculateMetrics(state.session.segments).durationMs;
  state.pendingSegmentStart = state.durationMs;

  function loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      const records = Array.isArray(parsed?.segments) ? parsed.segments : [];
      const withoutDemo = records.filter((record) => record?.source !== 'demo');
      if (withoutDemo.length !== records.length) {
        if (withoutDemo.length === 0) {
          localStorage.removeItem(STORAGE_KEY);
          return Core.sanitizeSession(null);
        }
        parsed.segments = withoutDemo;
        const migrated = Core.sanitizeSession(parsed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return Core.sanitizeSession(parsed);
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return Core.sanitizeSession(null);
    }
  }

  function sessionPayload() {
    return Core.sanitizeSession({
      ...state.session,
      updatedAt: new Date().toISOString(),
    });
  }

  function persistNow() {
    clearTimeout(state.persistTimer);
    state.session = sessionPayload();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
    } catch {
      announce('浏览器无法保存稿件，请先下载 TXT 备份。', true);
    }
  }

  function schedulePersist() {
    clearTimeout(state.persistTimer);
    state.persistTimer = window.setTimeout(persistNow, 180);
  }

  function announce(message, urgent = false) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.liveStatus.textContent = '';
    requestAnimationFrame(() => { elements.liveStatus.textContent = message; });
    elements.toast.classList.add('show');
    elements.toast.dataset.urgent = String(urgent);
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), urgent ? 5200 : 2800);
  }

  function formatDurationSeconds(milliseconds) {
    const seconds = Math.max(0, milliseconds) / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} 秒`;
  }

  function sourceName(source) {
    if (source === 'manual') return '手动整理';
    return '实时识别';
  }

  function autoSize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(58, textarea.scrollHeight)}px`;
  }

  function renderMetrics() {
    const metrics = Core.calculateMetrics(state.session.segments, state.durationMs);
    elements.metrics.characters.textContent = String(metrics.characters);
    elements.metrics.words.textContent = String(metrics.words);
    elements.metrics.segments.textContent = String(metrics.segments);
    elements.metrics.pace.textContent = String(metrics.charactersPerMinute);

    const hasTranscript = metrics.segments > 0;
    elements.copy.disabled = !hasTranscript;
    elements.txt.disabled = !hasTranscript;
    elements.srt.disabled = !hasTranscript;
  }

  function applySearch() {
    const query = Core.cleanText(elements.search.value, 120).toLocaleLowerCase(state.session.language);
    const cards = [...elements.segmentList.querySelectorAll('.segment-card')];
    let visible = 0;
    cards.forEach((card) => {
      const textarea = card.querySelector('textarea');
      const matches = !query || textarea.value.toLocaleLowerCase(state.session.language).includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    elements.noResults.hidden = cards.length === 0 || visible > 0;
    elements.resultCount.textContent = query
      ? `${visible} / ${cards.length} MATCHED`
      : `${cards.length} ${cards.length === 1 ? 'SEGMENT' : 'SEGMENTS'}`;
  }

  function renderSegments(options = {}) {
    elements.segmentList.replaceChildren();
    const records = Core.normalizeSegments(state.session.segments);
    state.session.segments = records;
    elements.empty.hidden = records.length > 0;

    records.forEach((record, index) => {
      const fragment = elements.segmentTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.segment-card');
      const number = fragment.querySelector('.segment-index');
      const time = fragment.querySelector('time');
      const textarea = fragment.querySelector('textarea');
      const source = fragment.querySelector('.segment-source');
      const duration = fragment.querySelector('.segment-duration');
      const remove = fragment.querySelector('.delete-segment');

      card.dataset.segmentId = record.id;
      number.textContent = `LINE ${String(index + 1).padStart(2, '0')}`;
      time.textContent = Core.formatClock(record.startMs);
      time.dateTime = `PT${Math.round(record.startMs / 1000)}S`;
      textarea.value = record.text;
      textarea.setAttribute('aria-label', `第 ${index + 1} 段转写内容，开始于 ${Core.formatClock(record.startMs)}`);
      source.textContent = sourceName(record.source);
      duration.textContent = formatDurationSeconds(record.endMs - record.startMs);
      remove.setAttribute('aria-label', `删除第 ${index + 1} 段`);

      textarea.addEventListener('input', () => {
        autoSize(textarea);
        const next = Core.editSegment(state.session.segments, record.id, textarea.value);
        if (Core.cleanText(textarea.value)) state.session.segments = next;
        renderMetrics();
        applySearch();
        schedulePersist();
      });
      textarea.addEventListener('blur', () => {
        const cleaned = Core.cleanText(textarea.value);
        if (!cleaned) {
          textarea.value = state.session.segments.find((item) => item.id === record.id)?.text || record.text;
          announce('段落不能为空；已恢复原内容。');
        } else {
          textarea.value = cleaned;
          state.session.segments = Core.editSegment(state.session.segments, record.id, cleaned);
          schedulePersist();
        }
        autoSize(textarea);
      });
      remove.addEventListener('click', () => {
        state.session.segments = Core.deleteSegment(state.session.segments, record.id);
        renderSegments();
        renderMetrics();
        schedulePersist();
        announce(`已删除第 ${index + 1} 段。`);
      });

      elements.segmentList.append(fragment);
      autoSize(textarea);
    });

    applySearch();
    if (options.focusId) {
      const target = elements.segmentList.querySelector(`[data-segment-id="${CSS.escape(options.focusId)}"] textarea`);
      if (target) target.focus({ preventScroll: true });
    }
  }

  function renderSession() {
    elements.sessionTitle.value = state.session.title;
    elements.language.value = state.session.language;
    renderSegments();
    renderMetrics();
    const hasStoredTranscript = state.session.segments.length > 0;
    document.body.dataset.source = hasStoredTranscript ? 'restored' : 'empty';
    updateClock();
  }

  function updateClock() {
    const elapsed = currentElapsedMs();
    elements.clock.textContent = Core.formatClock(elapsed);
    elements.clock.dateTime = `PT${Math.round(elapsed / 1000)}S`;
  }

  function currentElapsedMs() {
    if (state.mode === 'listening' && state.activeStartedAt) {
      return Math.round(state.durationMs + performance.now() - state.activeStartedAt);
    }
    return state.durationMs;
  }

  function settleElapsed() {
    if (state.mode === 'listening' && state.activeStartedAt) {
      state.durationMs = currentElapsedMs();
      state.activeStartedAt = 0;
    }
    state.pendingSegmentStart = Math.max(state.pendingSegmentStart, state.durationMs);
  }

  function updateTransport() {
    const listening = state.mode === 'listening';
    const paused = state.mode === 'paused';
    const active = listening || paused || state.mode === 'starting';
    const hasTake = state.session.segments.length > 0 || state.durationMs > 0 || Boolean(state.audioUrl);
    elements.tapeMachine.dataset.state = state.mode;
    elements.start.disabled = active || hasTake || !SpeechRecognitionConstructor;
    elements.restart.disabled = active || !hasTake || !SpeechRecognitionConstructor;
    elements.pause.disabled = !listening && !paused;
    elements.stop.disabled = !listening && !paused;
    elements.audioInput.disabled = active;
    elements.pause.querySelector('b').textContent = paused ? '继续' : '暂停';
    elements.pause.querySelector('small').textContent = paused ? '继续本次听写' : '保留当前录音';
    elements.takeLabel.textContent = listening ? 'TAKE 01 · RECORDING' : paused ? 'TAKE 01 · PAUSED' : 'TAKE 01 · READY';
    elements.waveEmpty.textContent = listening ? '正在收音' : paused ? '录音已暂停' : '麦克风待机';
  }

  function createSegmentId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `seg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function appendFinalPhrase(text, source = 'speech', startMs, endMs) {
    const cleaned = Core.cleanText(text);
    if (!cleaned) return;
    const safeEnd = Math.max(0, Math.round(endMs));
    const safeStart = Math.max(0, Math.min(Math.round(startMs), safeEnd));
    const record = Core.normalizeSegment({
      id: createSegmentId(),
      startMs: safeStart,
      endMs: Math.max(safeStart + 350, safeEnd),
      text: cleaned,
      source,
    });
    if (!record) return;
    state.session.segments = Core.normalizeSegments([...state.session.segments, record]);
    state.pendingSegmentStart = record.endMs;
    renderSegments();
    renderMetrics();
    schedulePersist();
    document.body.dataset.source = source;
  }

  function setupRecognition() {
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = state.session.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('result', (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = Core.cleanText(result[0]?.transcript || '');
        if (!phrase) continue;
        if (result.isFinal) {
          const end = currentElapsedMs();
          const estimatedDuration = Math.max(700, Math.min(8000, phrase.length * 180));
          const previousEnd = state.session.segments.at(-1)?.endMs || 0;
          const start = Math.max(previousEnd, Math.min(state.pendingSegmentStart, end - estimatedDuration));
          appendFinalPhrase(phrase, 'speech', Math.max(0, start), end);
        } else {
          interim += `${phrase} `;
        }
      }
      elements.interim.textContent = interim.trim() || '正在等待下一句话…';
    });

    recognition.addEventListener('error', (event) => {
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error);
      if (event.error === 'no-speech') {
        elements.interim.textContent = '暂时没有听到清晰语音，正在继续等待…';
        return;
      }
      const messages = {
        'not-allowed': '麦克风权限被拒绝。请在地址栏站点设置中允许麦克风，然后重试。',
        'service-not-allowed': '浏览器阻止了语音识别服务，请检查站点或系统权限。',
        'audio-capture': '没有找到可用麦克风，请检查输入设备。',
        network: '语音识别服务暂时无法联网，请检查网络后重试。',
      };
      announce(messages[event.error] || `识别中断：${event.error || '未知错误'}。`, true);
      if (fatal || event.error === 'network') {
        state.shouldRestartRecognition = false;
        stopTranscription(true);
      }
    });

    recognition.addEventListener('end', () => {
      state.recognition = null;
      if (state.mode === 'listening' && state.shouldRestartRecognition) {
        clearTimeout(state.recognitionRestartTimer);
        state.recognitionRestartTimer = window.setTimeout(beginRecognition, 220);
      }
    });

    return recognition;
  }

  function beginRecognition() {
    if (state.mode !== 'listening' || !state.shouldRestartRecognition || state.recognition) return;
    try {
      state.recognition = setupRecognition();
      state.recognition.start();
    } catch (error) {
      state.recognition = null;
      announce(`识别引擎无法启动：${error.message}`, true);
      stopTranscription(true);
    }
  }

  function chooseRecordingMime() {
    if (!window.MediaRecorder) return '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function setupRecorder(stream, generation) {
    if (!window.MediaRecorder) return;
    const mimeType = chooseRecordingMime();
    state.recorderChunks = [];
    state.recordingMime = mimeType;
    state.recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    state.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) state.recorderChunks.push(event.data);
    });
    state.recorder.addEventListener('stop', () => {
      if (generation !== state.generation || state.recorderChunks.length === 0) return;
      const blob = new Blob(state.recorderChunks, { type: state.recordingMime || state.recorderChunks[0].type || 'audio/webm' });
      setPlayback(blob, `${state.session.title || '本次转写'} · 本地录音`, true);
      state.recorderChunks = [];
    });
    state.recorder.start(500);
  }

  async function setupAnalyser(stream) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    state.audioContext = new AudioContextConstructor();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.analyser.smoothingTimeConstant = .76;
    source.connect(state.analyser);
    if (state.audioContext.state === 'suspended') await state.audioContext.resume();
  }

  async function startTranscription(options = {}) {
    const fresh = options.fresh === true;
    if (!SpeechRecognitionConstructor || state.mode !== 'idle') return;
    if (!fresh && (state.session.segments.length > 0 || state.durationMs > 0 || state.audioUrl)) {
      announce('已有一轮听写；请使用“重新听写”从 00:00 开始。', true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      announce('当前页面无法申请麦克风。请使用 HTTPS 或 localhost 打开。', true);
      return;
    }

    state.mode = 'starting';
    updateTransport();
    elements.interim.textContent = '正在请求麦克风权限…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (fresh) clearCurrentTake();
      state.generation += 1;
      state.stream = stream;
      state.mode = 'listening';
      state.activeStartedAt = performance.now();
      state.pendingSegmentStart = state.durationMs;
      state.shouldRestartRecognition = true;
      setupRecorder(stream, state.generation);
      await setupAnalyser(stream);
      beginRecognition();
      updateTransport();
      elements.interim.textContent = '请开始说话；临时结果会先出现在这里。';
      document.body.dataset.source = 'speech';
      announce('听写已开始，录音只保留在当前页面。');
    } catch (error) {
      if (state.recorder && state.recorder.state !== 'inactive') {
        try { state.recorder.stop(); } catch {}
      }
      stopTracks();
      state.mode = 'idle';
      updateTransport();
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      elements.interim.textContent = denied ? '麦克风权限未开启。' : '没有取得可用的麦克风输入。';
      announce(denied
        ? '麦克风权限被拒绝。请允许此站点使用麦克风后重试。'
        : `无法打开麦克风：${error?.message || '输入设备不可用'}`, true);
    }
  }

  function pauseTranscription() {
    if (state.mode === 'paused') {
      resumeTranscription();
      return;
    }
    if (state.mode !== 'listening') return;
    settleElapsed();
    state.mode = 'paused';
    state.shouldRestartRecognition = false;
    clearTimeout(state.recognitionRestartTimer);
    try { state.recognition?.stop(); } catch {}
    state.recognition = null;
    if (state.recorder?.state === 'recording') state.recorder.pause();
    state.audioContext?.suspend().catch(() => {});
    elements.interim.textContent = '听写已暂停；继续后会从当前时间接上。';
    updateTransport();
    updateClock();
    announce('已暂停听写。');
  }

  function resumeTranscription() {
    if (state.mode !== 'paused') return;
    state.mode = 'listening';
    state.activeStartedAt = performance.now();
    state.pendingSegmentStart = state.durationMs;
    state.shouldRestartRecognition = true;
    if (state.recorder?.state === 'paused') state.recorder.resume();
    state.audioContext?.resume().catch(() => {});
    beginRecognition();
    elements.interim.textContent = '听写已继续，正在等待语音…';
    updateTransport();
    announce('已继续听写。');
  }

  function stopTracks() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
    state.analyser = null;
    if (state.audioContext) {
      state.audioContext.close().catch(() => {});
      state.audioContext = null;
    }
  }

  function stopTranscription(fromError = false) {
    if (!['listening', 'paused', 'starting'].includes(state.mode)) return;
    settleElapsed();
    state.shouldRestartRecognition = false;
    clearTimeout(state.recognitionRestartTimer);
    try { state.recognition?.stop(); } catch {}
    state.recognition = null;
    if (state.recorder && state.recorder.state !== 'inactive') {
      try { state.recorder.stop(); } catch {}
    }
    stopTracks();
    state.mode = 'idle';
    state.pendingSegmentStart = state.durationMs;
    elements.interim.textContent = fromError
      ? '本次听写已中止；已识别的段落仍然保留。'
      : '本次听写已结束，可以继续校对或导出。';
    updateTransport();
    updateClock();
    renderMetrics();
    persistNow();
    if (!fromError) announce('听写已结束，稿件已保存在当前浏览器。');
  }

  function releaseAudioUrl() {
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = '';
    state.audioIsRecording = false;
    elements.audioPlayer.removeAttribute('src');
    elements.audioPlayer.load();
    elements.downloadAudio.disabled = true;
  }

  function setPlayback(source, name, isRecording) {
    releaseAudioUrl();
    state.audioUrl = URL.createObjectURL(source);
    state.audioIsRecording = isRecording;
    elements.audioPlayer.src = state.audioUrl;
    elements.audioName.textContent = name;
    elements.playbackRack.hidden = false;
    elements.downloadAudio.disabled = !isRecording;
    updateTransport();
  }

  function deletePlayback() {
    if (!state.audioUrl) return;
    releaseAudioUrl();
    state.recorderChunks = [];
    state.recordingMime = '';
    elements.audioInput.value = '';
    elements.playbackRack.hidden = true;
    updateTransport();
    announce('本地录音已删除。');
  }

  function handleAudioImport() {
    const file = elements.audioInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      elements.audioInput.value = '';
      announce('请选择浏览器可播放的音频文件。', true);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      elements.audioInput.value = '';
      announce('音频超过 50 MB；请先裁剪或压缩后再导入。', true);
      return;
    }
    setPlayback(file, file.name, false);
    announce('音频已在本机打开，可边听边校对稿件。');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadText(kind) {
    if (state.session.segments.length === 0) return;
    const content = kind === 'srt'
      ? Core.toSrt(state.session.segments)
      : Core.toPlainText(state.session);
    const mime = kind === 'srt' ? 'application/x-subrip;charset=utf-8' : 'text/plain;charset=utf-8';
    downloadBlob(new Blob([content], { type: mime }), Core.createFilename(state.session.title, kind));
    announce(`${kind.toUpperCase()} 已生成。`);
  }

  async function copyTranscript() {
    if (state.session.segments.length === 0) return;
    const text = Core.toPlainText(state.session);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        if (!document.execCommand('copy')) throw new Error('copy command failed');
        textarea.remove();
      }
      announce('全文已复制。');
    } catch {
      announce('浏览器未允许复制，请下载 TXT。', true);
    }
  }

  function downloadRecording() {
    if (!state.audioUrl || !state.audioIsRecording) return;
    const anchor = document.createElement('a');
    const extension = state.recordingMime.includes('ogg') ? 'ogg' : 'webm';
    anchor.href = state.audioUrl;
    anchor.download = `SCRIBE-${Core.createFilename(state.session.title, 'txt').replace(/^SCRIBE-|\.txt$/g, '')}-recording.${extension}`;
    anchor.click();
    announce('录音下载已开始。');
  }

  function openResetDialog() {
    if (state.mode !== 'idle') stopTranscription();
    if (state.session.segments.length === 0 && !state.audioUrl) {
      resetSession();
      return;
    }
    if (typeof elements.resetDialog.showModal === 'function') elements.resetDialog.showModal();
    else if (window.confirm('清空当前稿件并新建会话？')) resetSession();
  }

  function clearCurrentTake(options = {}) {
    state.generation += 1;
    state.session = options.resetMetadata
      ? Core.sanitizeSession(null)
      : Core.sanitizeSession({
        title: state.session.title,
        language: state.session.language,
        segments: [],
        updatedAt: new Date().toISOString(),
      });
    state.durationMs = 0;
    state.pendingSegmentStart = 0;
    state.activeStartedAt = 0;
    state.recorder = null;
    state.recorderChunks = [];
    state.recordingMime = '';
    elements.search.value = '';
    elements.sessionTitle.value = state.session.title;
    elements.language.value = state.session.language;
    elements.takeLabel.textContent = 'TAKE 01 · READY';
    elements.sheetTake.textContent = 'TAKE 01';
    elements.interim.textContent = '开始听写后，正在识别的句子会经过播放头。';
    elements.playbackRack.hidden = true;
    elements.audioInput.value = '';
    releaseAudioUrl();
    renderSegments();
    renderMetrics();
    updateClock();
    document.body.dataset.source = 'empty';
    if (options.removeStoredSession) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    } else {
      persistNow();
    }
  }

  function resetSession() {
    if (elements.resetDialog.open) elements.resetDialog.close();
    state.mode = 'idle';
    clearCurrentTake({ resetMetadata: true, removeStoredSession: true });
    updateTransport();
    announce('已新建空白会话。');
  }

  function inspectSupport() {
    if (!SpeechRecognitionConstructor) {
      elements.engineState.dataset.tone = 'limited';
      elements.engineLabel.textContent = '此浏览器无实时识别';
      elements.start.disabled = true;
      elements.supportNote.querySelector('p').append(' 当前浏览器未提供 SpeechRecognition，请使用新版 Chrome / Edge。');
      return;
    }
    elements.engineState.dataset.tone = 'ready';
    elements.engineLabel.textContent = window.isSecureContext ? '实时识别可用' : '需要 HTTPS / localhost';
    if (!window.isSecureContext) {
      elements.engineState.dataset.tone = 'limited';
      elements.start.disabled = true;
    }
  }

  function drawWaveform() {
    const canvas = elements.waveform;
    const context = canvas.getContext('2d');
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    context.lineWidth = Math.max(2, ratio * 1.6);
    context.strokeStyle = state.mode === 'listening' ? '#5bbec2' : '#416079';
    context.beginPath();

    if (state.analyser && state.mode === 'listening') {
      const values = new Uint8Array(state.analyser.fftSize);
      state.analyser.getByteTimeDomainData(values);
      values.forEach((value, index) => {
        const x = index / (values.length - 1) * width;
        const y = value / 255 * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
    } else {
      const animated = state.mode === 'listening' && !prefersReducedMotion ? performance.now() / 900 : 0;
      const amplitude = height * .035;
      for (let x = 0; x <= width; x += 4 * ratio) {
        const carrier = Math.sin(x / (18 * ratio) + animated) + .42 * Math.sin(x / (7 * ratio) - animated * .6);
        const y = height / 2 + carrier * amplitude;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
    }
    context.stroke();
    state.waveformFrame = requestAnimationFrame(drawWaveform);
  }

  function bindEvents() {
    elements.sessionTitle.addEventListener('input', () => {
      state.session.title = Core.cleanText(elements.sessionTitle.value, 80) || '未命名转写';
      schedulePersist();
    });
    elements.sessionTitle.addEventListener('blur', () => {
      elements.sessionTitle.value = Core.cleanText(elements.sessionTitle.value, 80) || '未命名转写';
      state.session.title = elements.sessionTitle.value;
      persistNow();
    });
    elements.language.addEventListener('change', () => {
      state.session.language = elements.language.value;
      schedulePersist();
      announce('识别语言已更新，将在下一次听写时生效。');
    });
    elements.start.addEventListener('click', () => startTranscription());
    elements.restart.addEventListener('click', () => startTranscription({ fresh: true }));
    elements.pause.addEventListener('click', pauseTranscription);
    elements.stop.addEventListener('click', () => stopTranscription());
    elements.audioInput.addEventListener('change', handleAudioImport);
    elements.downloadAudio.addEventListener('click', downloadRecording);
    elements.deleteAudio.addEventListener('click', deletePlayback);
    elements.search.addEventListener('input', applySearch);
    elements.copy.addEventListener('click', copyTranscript);
    elements.txt.addEventListener('click', () => downloadText('txt'));
    elements.srt.addEventListener('click', () => downloadText('srt'));
    elements.newSession.addEventListener('click', openResetDialog);
    elements.confirmReset.addEventListener('click', resetSession);

    document.addEventListener('keydown', (event) => {
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !editing) {
        event.preventDefault();
        if (state.mode === 'idle') startTranscription();
        else stopTranscription();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !editing) {
        event.preventDefault();
        elements.search.focus();
      }
    });

    window.addEventListener('beforeunload', () => {
      clearTimeout(state.persistTimer);
      if (state.session.segments.length > 0) persistNow();
      state.shouldRestartRecognition = false;
      try { state.recognition?.stop(); } catch {}
      stopTracks();
      if (state.waveformFrame) cancelAnimationFrame(state.waveformFrame);
      releaseAudioUrl();
    });
  }

  function initialize() {
    inspectSupport();
    bindEvents();
    renderSession();
    updateTransport();
    drawWaveform();
    window.setInterval(updateClock, 250);
    document.body.classList.add('ready');

  }

  window.__SCRIBE65__ = Object.freeze({
    resetSession,
    getSnapshot: () => ({
      mode: state.mode,
      source: document.body.dataset.source,
      durationMs: state.durationMs,
      hasAudio: Boolean(state.audioUrl),
      session: Core.sanitizeSession(state.session),
    }),
  });

  initialize();
})();
