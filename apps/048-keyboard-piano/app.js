(function () {
  "use strict";

  const Core = window.PianoCore;
  const RECORDING_KEY = "app048_tape_recording_v1";
  const SETTINGS_KEY = "app048_tape_settings_v1";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const notes = Core.getNotes();
  const noteById = new Map(notes.map(note => [note.id, note]));
  const keyElements = new Map();
  const pointerSources = new Map();

  const dom = {
    audioReadout: document.querySelector(".audio-readout"),
    audioState: document.getElementById("audioState"),
    clearBtn: document.getElementById("clearBtn"),
    clearLabel: document.getElementById("clearLabel"),
    deckMessage: document.getElementById("deckMessage"),
    deckMode: document.getElementById("deckMode"),
    piano: document.getElementById("pianoKeys"),
    playBtn: document.getElementById("playBtn"),
    playhead: document.getElementById("playhead"),
    playLabel: document.getElementById("playLabel"),
    recordBtn: document.getElementById("recordBtn"),
    stopBtn: document.getElementById("stopBtn"),
    sustain: document.getElementById("sustain"),
    sustainState: document.getElementById("sustainState"),
    timecode: document.getElementById("timecode"),
    timelineEmpty: document.getElementById("timelineEmpty"),
    timelineSegments: document.getElementById("timelineSegments"),
    voiceButtons: [...document.querySelectorAll(".voice-option")],
    volume: document.getElementById("volume"),
    volumeValue: document.getElementById("volumeValue")
  };

  const PRESETS = {
    piano: {
      attack: 0.008, decay: 0.5, sustain: 0.2, release: 0.5, filter: 3100,
      partials: [{ type: "triangle", ratio: 1, gain: 0.72 }, { type: "sine", ratio: 2, gain: 0.2 }, { type: "sine", ratio: 3, gain: 0.08 }]
    },
    electric: {
      attack: 0.015, decay: 0.72, sustain: 0.34, release: 0.8, filter: 4300, vibrato: 3.8,
      partials: [{ type: "sine", ratio: 1, gain: 0.72 }, { type: "triangle", ratio: 2, gain: 0.19 }, { type: "sine", ratio: 4, gain: 0.09 }]
    },
    organ: {
      attack: 0.035, decay: 0.08, sustain: 0.72, release: 0.2, filter: 5200,
      partials: [{ type: "sine", ratio: 1, gain: 0.58 }, { type: "sine", ratio: 2, gain: 0.27 }, { type: "square", ratio: 4, gain: 0.08 }]
    }
  };

  const state = {
    audioContext: null,
    master: null,
    instrument: "piano",
    volume: 0.72,
    sustain: false,
    noteSources: new Map(),
    liveVoices: new Map(),
    sustainedNotes: new Set(),
    isRecording: false,
    recordingStartedAt: 0,
    recordingInstrument: "piano",
    recordingEvents: [],
    recordingTimer: 0,
    savedRecording: null,
    playbackActive: false,
    playbackOffsetMs: 0,
    playbackStartedAt: 0,
    playbackVoices: new Set(),
    playbackTimers: [],
    playbackFrame: 0,
    playbackNotes: new Set(),
    clearArmed: false,
    clearTimer: 0
  };

  function formatTime(ms) {
    const safe = Math.max(0, Math.round(ms));
    const minutes = Math.floor(safe / 60000);
    const seconds = Math.floor(safe % 60000 / 1000);
    const tenths = Math.floor(safe % 1000 / 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function setAudioStatus(text, mode) {
    dom.audioState.textContent = text;
    dom.audioReadout.classList.toggle("is-ready", mode === "ready");
    dom.audioReadout.classList.toggle("is-error", mode === "error");
  }

  function setMessage(text) {
    dom.deckMessage.textContent = text;
  }

  function setDeckMode(mode, label) {
    document.body.dataset.deck = mode;
    dom.deckMode.textContent = label;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ instrument: state.instrument, volume: state.volume, sustain: state.sustain }));
    } catch (_) {
      setMessage("当前浏览器无法保存偏好，但本次演奏不受影响。");
    }
  }

  function loadSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (value && Core.INSTRUMENTS.includes(value.instrument)) state.instrument = value.instrument;
      if (value && Number.isFinite(value.volume)) state.volume = Math.min(1, Math.max(0, value.volume));
      if (value && typeof value.sustain === "boolean") state.sustain = value.sustain;
    } catch (_) {}
  }

  function loadRecording() {
    try {
      state.savedRecording = Core.validateRecording(JSON.parse(localStorage.getItem(RECORDING_KEY)));
    } catch (_) {
      state.savedRecording = null;
    }
  }

  function persistRecording(recording) {
    try {
      localStorage.setItem(RECORDING_KEY, JSON.stringify(recording));
      return true;
    } catch (_) {
      setMessage("录音已保留在本页，但浏览器没有空间保存到下次。");
      return false;
    }
  }

  async function ensureAudio() {
    if (!AudioContextClass) {
      setAudioStatus("浏览器不支持声音", "error");
      setMessage("此浏览器没有 Web Audio。请换用最新版 Chrome、Edge、Firefox 或 Safari。");
      return false;
    }
    try {
      if (!state.audioContext) {
        state.audioContext = new AudioContextClass();
        const compressor = state.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        state.master = state.audioContext.createGain();
        state.master.gain.value = state.volume * 0.72;
        state.master.connect(compressor);
        compressor.connect(state.audioContext.destination);
        state.audioContext.onstatechange = () => {
          if (state.audioContext.state === "running") setAudioStatus("声音已就绪", "ready");
          else if (state.audioContext.state === "suspended") setAudioStatus("点击琴键继续", "");
        };
      }
      if (state.audioContext.state === "suspended") await state.audioContext.resume();
      setAudioStatus("声音已就绪", "ready");
      return state.audioContext.state === "running";
    } catch (_) {
      setAudioStatus("声音启动失败", "error");
      setMessage("声音没有启动。请确认页面允许播放音频，再点击一颗琴键重试。");
      return false;
    }
  }

  function createVoice(note, instrument, startAt) {
    const context = state.audioContext;
    const preset = PRESETS[instrument];
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(preset.filter, startAt);
    filter.Q.value = instrument === "electric" ? 1.2 : 0.7;
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.82, startAt + preset.attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, preset.sustain), startAt + preset.attack + preset.decay);
    filter.connect(envelope);
    envelope.connect(state.master);

    const oscillators = preset.partials.map(partial => {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = partial.type;
      oscillator.frequency.setValueAtTime(note.frequency * partial.ratio, startAt);
      partialGain.gain.value = partial.gain;
      oscillator.connect(partialGain);
      partialGain.connect(filter);
      oscillator.start(startAt);
      return oscillator;
    });

    let vibrato = null;
    if (preset.vibrato) {
      vibrato = context.createOscillator();
      const vibratoDepth = context.createGain();
      vibrato.frequency.value = preset.vibrato;
      vibratoDepth.gain.value = 5;
      vibrato.connect(vibratoDepth);
      oscillators.forEach(oscillator => vibratoDepth.connect(oscillator.detune));
      vibrato.start(startAt);
    }
    return { envelope, instrument, oscillators, vibrato, released: false };
  }

  function releaseVoice(voice, when, fast) {
    if (!voice || voice.forced || !state.audioContext || (voice.released && !fast)) return;
    voice.released = true;
    if (fast) voice.forced = true;
    const now = state.audioContext.currentTime;
    const releaseAt = Math.max(now, when == null ? now : when);
    const releaseTime = fast ? 0.035 : PRESETS[voice.instrument].release;
    const parameter = voice.envelope.gain;
    if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(releaseAt);
    else {
      parameter.cancelScheduledValues(releaseAt);
      parameter.setValueAtTime(Math.max(0.0001, parameter.value), releaseAt);
    }
    parameter.exponentialRampToValueAtTime(0.0001, releaseAt + releaseTime);
    const stopAt = releaseAt + releaseTime + 0.06;
    voice.oscillators.forEach(oscillator => {
      try { oscillator.stop(stopAt); } catch (_) {}
    });
    if (voice.vibrato) {
      try { voice.vibrato.stop(stopAt); } catch (_) {}
    }
  }

  function recordEvent(type, noteId) {
    if (!state.isRecording) return;
    state.recordingEvents.push({ type, note: noteId, timeMs: Math.max(0, performance.now() - state.recordingStartedAt) });
    renderLiveTimeline();
  }

  function paintNote(noteId) {
    const element = keyElements.get(noteId);
    if (!element) return;
    const sources = state.noteSources.get(noteId);
    element.classList.toggle("is-active", Boolean(sources && sources.size));
    element.classList.toggle("is-sustained", state.sustainedNotes.has(noteId));
    element.setAttribute("aria-pressed", String(Boolean(sources && sources.size)));
  }

  async function noteOn(noteId, source) {
    const note = noteById.get(noteId);
    if (!note) return;
    let sources = state.noteSources.get(noteId);
    if (!sources) {
      sources = new Set();
      state.noteSources.set(noteId, sources);
    }
    if (sources.has(source)) return;
    const isFirstSource = sources.size === 0;
    sources.add(source);
    paintNote(noteId);
    if (!isFirstSource) return;

    recordEvent("on", noteId);
    const ready = await ensureAudio();
    const stillHeld = state.noteSources.get(noteId);
    if (!ready || !stillHeld || stillHeld.size === 0) return;
    if (state.liveVoices.has(noteId)) releaseVoice(state.liveVoices.get(noteId), null, true);
    state.sustainedNotes.delete(noteId);
    const voice = createVoice(note, state.instrument, state.audioContext.currentTime);
    state.liveVoices.set(noteId, voice);
    paintNote(noteId);
  }

  function noteOff(noteId, source) {
    const sources = state.noteSources.get(noteId);
    if (!sources || !sources.has(source)) return;
    sources.delete(source);
    if (sources.size > 0) return paintNote(noteId);
    state.noteSources.delete(noteId);
    recordEvent("off", noteId);
    if (state.sustain && state.liveVoices.has(noteId)) state.sustainedNotes.add(noteId);
    else {
      releaseVoice(state.liveVoices.get(noteId));
      state.liveVoices.delete(noteId);
      state.sustainedNotes.delete(noteId);
    }
    paintNote(noteId);
  }

  function releaseAll(fast) {
    const time = state.isRecording ? Math.max(0, performance.now() - state.recordingStartedAt) : 0;
    state.noteSources.forEach((sources, noteId) => {
      if (sources.size && state.isRecording) state.recordingEvents.push({ type: "off", note: noteId, timeMs: time });
    });
    state.noteSources.clear();
    state.liveVoices.forEach(voice => releaseVoice(voice, null, Boolean(fast)));
    state.liveVoices.clear();
    state.sustainedNotes.clear();
    keyElements.forEach((element, noteId) => {
      element.classList.remove("is-active", "is-sustained");
      element.setAttribute("aria-pressed", "false");
    });
  }

  function releaseSustained() {
    state.sustainedNotes.forEach(noteId => {
      releaseVoice(state.liveVoices.get(noteId));
      state.liveVoices.delete(noteId);
      paintNote(noteId);
    });
    state.sustainedNotes.clear();
  }

  function renderPiano() {
    const whiteNotes = notes.filter(note => !note.isBlack);
    const blackGap = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
    whiteNotes.forEach(note => {
      const button = createKeyButton(note, "white");
      dom.piano.appendChild(button);
    });
    notes.filter(note => note.isBlack).forEach(note => {
      const button = createKeyButton(note, "black");
      const semitone = note.index % 12;
      button.style.setProperty("--gap", blackGap[semitone] + Math.floor(note.index / 12) * 7);
      dom.piano.appendChild(button);
    });
  }

  function createKeyButton(note, color) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `piano-key ${color}`;
    button.dataset.note = note.id;
    button.setAttribute("aria-label", `${note.name.replace("#", "升")} ${note.octave}，电脑键 ${note.key}`);
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="key-label">${note.key}</span><span class="note-label">${note.name.replace("#", "♯")}${note.octave}</span>`;
    keyElements.set(note.id, button);
    return button;
  }

  function renderTimeline(events, durationMs) {
    dom.timelineSegments.replaceChildren();
    const segments = events.length ? Core.buildTimeline(events, Math.max(1, durationMs)) : [];
    segments.forEach(segment => {
      const note = noteById.get(segment.note);
      const element = document.createElement("i");
      element.className = `note-segment${note.isBlack ? " is-black" : ""}`;
      element.style.left = `${segment.leftPct}%`;
      element.style.width = `${segment.widthPct}%`;
      element.style.top = `${(23 - segment.noteIndex) / 24 * 95}%`;
      element.title = `${segment.note} · ${formatTime(segment.endMs - segment.startMs)}`;
      dom.timelineSegments.appendChild(element);
    });
    dom.timelineEmpty.hidden = segments.length > 0;
  }

  function renderSavedTimeline() {
    if (!state.savedRecording) {
      renderTimeline([], 1);
      dom.timecode.textContent = "00:00.0";
      dom.playhead.style.left = "0%";
      return;
    }
    renderTimeline(state.savedRecording.events, state.savedRecording.durationMs);
    dom.timecode.textContent = formatTime(state.savedRecording.durationMs);
  }

  function renderLiveTimeline() {
    if (!state.isRecording) return;
    const durationMs = Math.max(1, performance.now() - state.recordingStartedAt);
    renderTimeline(state.recordingEvents, durationMs);
    dom.timecode.textContent = formatTime(durationMs);
    dom.playhead.style.left = "100%";
  }

  async function startRecording() {
    if (state.isRecording) return;
    if (state.playbackActive || state.playbackOffsetMs) cancelPlayback(true);
    const ready = await ensureAudio();
    if (!ready) return;
    releaseAll(true);
    state.isRecording = true;
    state.recordingEvents = [];
    state.recordingStartedAt = performance.now();
    state.recordingInstrument = state.instrument;
    state.recordingTimer = window.setInterval(renderLiveTimeline, 80);
    setDeckMode("recording", "RECORDING");
    setMessage("正在录制。第一颗到最后一颗音都会按真实时间留在磁带上。");
    updateControls();
    renderLiveTimeline();
  }

  function stopRecording() {
    if (!state.isRecording) return;
    releaseAll(false);
    const durationMs = Math.max(0, performance.now() - state.recordingStartedAt);
    state.isRecording = false;
    window.clearInterval(state.recordingTimer);
    state.recordingTimer = 0;
    try {
      const recording = Core.createRecording(state.recordingEvents, {
        durationMs,
        instrument: state.recordingInstrument,
        createdAt: Date.now()
      });
      state.savedRecording = recording;
      const persisted = persistRecording(recording);
      if (persisted) setMessage(`这一遍已收好：${recording.events.filter(event => event.type === "on").length} 颗音，长度 ${formatTime(recording.durationMs)}。`);
    } catch (_) {
      setMessage("这次没有录到音符，最近一遍仍然保留。按下录制后再弹几颗琴键。");
    }
    setDeckMode("ready", "READY");
    state.recordingEvents = [];
    renderSavedTimeline();
    updateControls();
  }

  function schedulePlaybackVisual(noteId, active, delayMs) {
    const timer = window.setTimeout(() => {
      if (active) state.playbackNotes.add(noteId);
      else state.playbackNotes.delete(noteId);
      keyElements.get(noteId)?.classList.toggle("is-playback", active);
    }, Math.max(0, delayMs));
    state.playbackTimers.push(timer);
  }

  function clearPlaybackSchedule() {
    state.playbackTimers.forEach(timer => window.clearTimeout(timer));
    state.playbackTimers = [];
    state.playbackVoices.forEach(voice => releaseVoice(voice, null, true));
    state.playbackVoices.clear();
    state.playbackNotes.clear();
    keyElements.forEach(element => element.classList.remove("is-playback"));
    if (state.playbackFrame) cancelAnimationFrame(state.playbackFrame);
    state.playbackFrame = 0;
  }

  function currentPlaybackPosition() {
    if (!state.playbackActive) return state.playbackOffsetMs;
    return state.playbackOffsetMs + performance.now() - state.playbackStartedAt;
  }

  async function startPlayback() {
    const recording = state.savedRecording;
    if (!recording || state.isRecording) return;
    const ready = await ensureAudio();
    if (!ready) return;
    clearPlaybackSchedule();
    if (state.playbackOffsetMs >= recording.durationMs - 30) state.playbackOffsetMs = 0;
    const offset = state.playbackOffsetMs;
    const audioStart = state.audioContext.currentTime + 0.045;
    const segments = Core.buildTimeline(recording.events, recording.durationMs);

    segments.forEach(segment => {
      if (segment.endMs <= offset) return;
      const startsIn = Math.max(0, segment.startMs - offset);
      const endsIn = Math.max(1, segment.endMs - offset);
      const voice = createVoice(noteById.get(segment.note), recording.instrument, audioStart + startsIn / 1000);
      releaseVoice(voice, audioStart + endsIn / 1000, false);
      state.playbackVoices.add(voice);
      if (segment.startMs <= offset) {
        state.playbackNotes.add(segment.note);
        keyElements.get(segment.note)?.classList.add("is-playback");
      } else schedulePlaybackVisual(segment.note, true, startsIn);
      schedulePlaybackVisual(segment.note, false, endsIn);
    });

    state.playbackActive = true;
    state.playbackStartedAt = performance.now();
    setDeckMode("playing", "PLAYING");
    setMessage(`正在回放 ${new Date(recording.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 的片段。`);
    updateControls();
    updatePlaybackFrame();
  }

  function pausePlayback() {
    if (!state.playbackActive) return;
    state.playbackOffsetMs = Math.min(state.savedRecording.durationMs, currentPlaybackPosition());
    state.playbackActive = false;
    clearPlaybackSchedule();
    setDeckMode("ready", "PAUSED");
    setMessage(`已暂停在 ${formatTime(state.playbackOffsetMs)}，再次点击“继续”从这里接上。`);
    dom.timecode.textContent = formatTime(state.playbackOffsetMs);
    dom.playhead.style.left = `${state.playbackOffsetMs / state.savedRecording.durationMs * 100}%`;
    updateControls();
  }

  function cancelPlayback(reset) {
    if (state.playbackActive) state.playbackOffsetMs = currentPlaybackPosition();
    state.playbackActive = false;
    clearPlaybackSchedule();
    if (reset) state.playbackOffsetMs = 0;
    setDeckMode("ready", "READY");
    if (state.savedRecording) {
      dom.timecode.textContent = reset ? formatTime(state.savedRecording.durationMs) : formatTime(state.playbackOffsetMs);
      dom.playhead.style.left = reset ? "0%" : `${state.playbackOffsetMs / state.savedRecording.durationMs * 100}%`;
    }
    updateControls();
  }

  function finishPlayback() {
    clearPlaybackSchedule();
    state.playbackActive = false;
    state.playbackOffsetMs = 0;
    setDeckMode("ready", "READY");
    dom.playhead.style.left = "0%";
    dom.timecode.textContent = formatTime(state.savedRecording.durationMs);
    setMessage("回放结束。可以再听一遍，也可以录下新的片段覆盖它。");
    updateControls();
  }

  function updatePlaybackFrame() {
    if (!state.playbackActive || !state.savedRecording) return;
    const position = currentPlaybackPosition();
    if (position >= state.savedRecording.durationMs) return finishPlayback();
    dom.timecode.textContent = formatTime(position);
    dom.playhead.style.left = `${position / state.savedRecording.durationMs * 100}%`;
    state.playbackFrame = requestAnimationFrame(updatePlaybackFrame);
  }

  function togglePlayback() {
    if (state.playbackActive) pausePlayback();
    else startPlayback();
  }

  function clearRecording() {
    if (!state.savedRecording || state.isRecording || state.playbackActive) return;
    if (!state.clearArmed) {
      state.clearArmed = true;
      dom.clearBtn.classList.add("is-armed");
      dom.clearLabel.textContent = "再次清空";
      setMessage("再点击一次“再次清空”确认删除最近一遍；3 秒后自动取消。");
      window.clearTimeout(state.clearTimer);
      state.clearTimer = window.setTimeout(disarmClear, 3000);
      return;
    }
    disarmClear();
    state.savedRecording = null;
    state.playbackOffsetMs = 0;
    try { localStorage.removeItem(RECORDING_KEY); } catch (_) {}
    renderSavedTimeline();
    setMessage("磁带已清空。按下录制，开始新的一遍。");
    updateControls();
  }

  function disarmClear() {
    state.clearArmed = false;
    window.clearTimeout(state.clearTimer);
    dom.clearBtn.classList.remove("is-armed");
    dom.clearLabel.textContent = "清空";
  }

  function updateControls() {
    const canAudio = Boolean(AudioContextClass);
    const busy = state.isRecording;
    dom.recordBtn.disabled = !canAudio || busy || state.playbackActive;
    dom.stopBtn.disabled = !canAudio || (!state.isRecording && !state.playbackActive && state.playbackOffsetMs === 0);
    dom.playBtn.disabled = !canAudio || !state.savedRecording || state.isRecording;
    dom.clearBtn.disabled = !state.savedRecording || state.isRecording || state.playbackActive;
    dom.playLabel.textContent = state.playbackActive ? "暂停" : state.playbackOffsetMs > 0 ? "继续" : "回放";
    dom.voiceButtons.forEach(button => { button.disabled = state.isRecording; });
  }

  function applySettingsToUi() {
    dom.voiceButtons.forEach(button => {
      const active = button.dataset.instrument === state.instrument;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const percentage = Math.round(state.volume * 100);
    dom.volume.value = percentage;
    dom.volumeValue.textContent = `${percentage}%`;
    dom.volume.style.background = `linear-gradient(90deg,var(--cyan) 0 ${percentage}%,var(--navy-2) ${percentage}%)`;
    dom.sustain.checked = state.sustain;
    dom.sustainState.textContent = state.sustain ? "已踩下" : "已抬起";
  }

  function wireControls() {
    dom.voiceButtons.forEach(button => button.addEventListener("click", () => {
      if (state.isRecording) return;
      releaseAll(true);
      state.instrument = button.dataset.instrument;
      applySettingsToUi();
      saveSettings();
      setMessage(`音色已切换为“${button.querySelector("strong").textContent}”。下一颗音立即使用新声音。`);
    }));
    dom.volume.addEventListener("input", () => {
      state.volume = Number(dom.volume.value) / 100;
      if (state.master && state.audioContext) state.master.gain.setTargetAtTime(state.volume * 0.72, state.audioContext.currentTime, 0.015);
      applySettingsToUi();
      saveSettings();
    });
    dom.sustain.addEventListener("change", () => {
      state.sustain = dom.sustain.checked;
      if (!state.sustain) releaseSustained();
      applySettingsToUi();
      saveSettings();
    });
    dom.recordBtn.addEventListener("click", startRecording);
    dom.stopBtn.addEventListener("click", () => {
      if (state.isRecording) stopRecording();
      else if (state.playbackActive || state.playbackOffsetMs) {
        cancelPlayback(true);
        setMessage("回放已停止，磁头回到开头。");
      }
    });
    dom.playBtn.addEventListener("click", togglePlayback);
    dom.clearBtn.addEventListener("click", clearRecording);
  }

  function wirePianoInput() {
    dom.piano.addEventListener("pointerdown", event => {
      if (event.button != null && event.button !== 0) return;
      const key = event.target.closest(".piano-key");
      if (!key) return;
      const source = `pointer:${event.pointerId}`;
      pointerSources.set(event.pointerId, { noteId: key.dataset.note, source });
      try { key.setPointerCapture(event.pointerId); } catch (_) {}
      noteOn(key.dataset.note, source);
    });
    const releasePointer = event => {
      const entry = pointerSources.get(event.pointerId);
      if (!entry) return;
      noteOff(entry.noteId, entry.source);
      pointerSources.delete(event.pointerId);
    };
    dom.piano.addEventListener("pointerup", releasePointer);
    dom.piano.addEventListener("pointercancel", releasePointer);
    dom.piano.addEventListener("contextmenu", event => event.preventDefault());
    dom.piano.addEventListener("dragstart", event => event.preventDefault());

    keyElements.forEach((button, noteId) => {
      const source = `control:${noteId}`;
      button.addEventListener("keydown", event => {
        if ((event.code !== "Space" && event.code !== "Enter") || event.repeat) return;
        event.preventDefault();
        noteOn(noteId, source);
      });
      button.addEventListener("keyup", event => {
        if (event.code !== "Space" && event.code !== "Enter") return;
        event.preventDefault();
        noteOff(noteId, source);
      });
      button.addEventListener("blur", () => noteOff(noteId, source));
      button.addEventListener("click", event => {
        if (event.detail !== 0) return;
        const assistiveSource = `assistive:${noteId}`;
        noteOn(noteId, assistiveSource);
        window.setTimeout(() => noteOff(noteId, assistiveSource), 180);
      });
    });

    window.addEventListener("keydown", event => {
      const interactive = event.target.closest?.("input,select,textarea,button");
      const note = Core.getNoteByCode(event.code);
      if (note && !interactive) {
        event.preventDefault();
        if (!event.repeat) noteOn(note.id, `keyboard:${event.code}`);
        return;
      }
      if (interactive || event.repeat) return;
      if (event.code === "Escape" && (state.isRecording || state.playbackActive || state.playbackOffsetMs)) {
        event.preventDefault();
        if (state.isRecording) stopRecording(); else cancelPlayback(true);
      } else if (event.code === "Space" && state.savedRecording && !state.isRecording) {
        event.preventDefault();
        togglePlayback();
      } else if (event.code === "F8" && !state.isRecording && !state.playbackActive) {
        event.preventDefault();
        startRecording();
      } else if (event.code === "Delete" && state.savedRecording && !state.isRecording && !state.playbackActive) {
        event.preventDefault();
        clearRecording();
      }
    });
    window.addEventListener("keyup", event => {
      const note = Core.getNoteByCode(event.code);
      if (note) noteOff(note.id, `keyboard:${event.code}`);
    });
    window.addEventListener("blur", () => releaseAll(true));
  }

  function initialize() {
    loadSettings();
    loadRecording();
    renderPiano();
    applySettingsToUi();
    wireControls();
    wirePianoInput();
    renderSavedTimeline();
    updateControls();
    if (!AudioContextClass) {
      setAudioStatus("浏览器不支持声音", "error");
      setMessage("此浏览器没有 Web Audio。请换用最新版 Chrome、Edge、Firefox 或 Safari。");
      keyElements.forEach(key => { key.disabled = true; });
    } else if (state.savedRecording) {
      const count = state.savedRecording.events.filter(event => event.type === "on").length;
      setMessage(`已找回最近一遍：${count} 颗音，长度 ${formatTime(state.savedRecording.durationMs)}。`);
    }
  }

  initialize();
})();
