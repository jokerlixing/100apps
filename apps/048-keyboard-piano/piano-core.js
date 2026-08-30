(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PianoCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const KEY_CODES = [
    "KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM",
    "KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU"
  ];
  const KEY_LABELS = [
    "Z", "S", "X", "D", "C", "V", "G", "B", "H", "N", "J", "M",
    "Q", "2", "W", "3", "E", "R", "5", "T", "6", "Y", "7", "U"
  ];
  const INSTRUMENTS = ["piano", "electric", "organ"];

  const NOTES = Object.freeze(Array.from({ length: 24 }, (_, index) => {
    const octave = 4 + Math.floor(index / 12);
    const semitone = index % 12;
    const midi = (octave + 1) * 12 + semitone;
    return Object.freeze({
      id: `${NOTE_NAMES[semitone]}${octave}`,
      name: NOTE_NAMES[semitone],
      octave,
      midi,
      frequency: 440 * Math.pow(2, (midi - 69) / 12),
      isBlack: NOTE_NAMES[semitone].includes("#"),
      code: KEY_CODES[index],
      key: KEY_LABELS[index],
      index
    });
  }));

  const NOTE_BY_ID = new Map(NOTES.map(note => [note.id, note]));
  const NOTE_BY_CODE = new Map(NOTES.map(note => [note.code, note]));

  function getNotes() {
    return NOTES.map(note => ({ ...note }));
  }

  function getNote(noteId) {
    return NOTE_BY_ID.get(noteId) || null;
  }

  function getNoteByCode(code) {
    return NOTE_BY_CODE.get(code) || null;
  }

  function noteFrequency(noteId) {
    const note = getNote(noteId);
    if (!note) throw new RangeError("未知音符");
    return note.frequency;
  }

  function finiteTime(value, label) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label}必须是非负有限数`);
    return Math.round(value);
  }

  function normalizeEvents(events, stopAtMs) {
    if (!Array.isArray(events)) throw new TypeError("录音事件必须是数组");
    const ordered = events.map((event, order) => {
      if (!event || (event.type !== "on" && event.type !== "off")) throw new TypeError("录音事件类型无效");
      if (!NOTE_BY_ID.has(event.note)) throw new RangeError("录音包含未知音符");
      return { type: event.type, note: event.note, timeMs: finiteTime(event.timeMs, "事件时间"), order };
    }).sort((left, right) => left.timeMs - right.timeMs || left.order - right.order);

    const requestedStop = stopAtMs == null
      ? ordered.reduce((max, event) => Math.max(max, event.timeMs), 0)
      : finiteTime(stopAtMs, "停止时间");
    const lastEventTime = ordered.reduce((max, event) => Math.max(max, event.timeMs), 0);
    const durationMs = Math.max(requestedStop, lastEventTime);
    const active = new Map();
    const normalized = [];

    ordered.forEach(event => {
      if (event.type === "on") {
        if (active.has(event.note)) return;
        active.set(event.note, event.timeMs);
        normalized.push({ type: "on", note: event.note, timeMs: event.timeMs });
        return;
      }
      if (!active.has(event.note)) return;
      active.delete(event.note);
      normalized.push({ type: "off", note: event.note, timeMs: event.timeMs });
    });

    active.forEach((_, note) => normalized.push({ type: "off", note, timeMs: durationMs }));
    normalized.sort((left, right) => left.timeMs - right.timeMs);
    return normalized;
  }

  function getRecordingDuration(events) {
    if (!Array.isArray(events) || events.length === 0) return 0;
    return events.reduce((max, event) => Math.max(max, finiteTime(event.timeMs, "事件时间")), 0);
  }

  function buildTimeline(events, durationMs) {
    const duration = Math.max(1, finiteTime(durationMs, "录音时长"));
    const normalized = normalizeEvents(events, duration);
    const starts = new Map();
    const segments = [];

    normalized.forEach(event => {
      if (event.type === "on") {
        starts.set(event.note, event.timeMs);
        return;
      }
      const startMs = starts.get(event.note);
      if (startMs == null) return;
      const note = NOTE_BY_ID.get(event.note);
      const endMs = Math.max(startMs, event.timeMs);
      segments.push({
        note: event.note,
        noteIndex: note.index,
        startMs,
        endMs,
        leftPct: Math.min(100, startMs / duration * 100),
        widthPct: Math.max(0.7, (endMs - startMs) / duration * 100)
      });
      starts.delete(event.note);
    });
    return segments;
  }

  function createRecording(events, options) {
    const settings = options || {};
    const durationMs = finiteTime(settings.durationMs, "录音时长");
    if (!INSTRUMENTS.includes(settings.instrument)) throw new RangeError("录音音色无效");
    const normalized = normalizeEvents(events, durationMs);
    if (!normalized.some(event => event.type === "on")) throw new TypeError("录音中没有音符");
    return {
      version: VERSION,
      instrument: settings.instrument,
      durationMs: Math.max(durationMs, getRecordingDuration(normalized)),
      createdAt: Number.isFinite(settings.createdAt) ? Math.round(settings.createdAt) : Date.now(),
      events: normalized
    };
  }

  function validateRecording(value) {
    if (!value || value.version !== VERSION || !INSTRUMENTS.includes(value.instrument)) return null;
    if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || !Number.isFinite(value.createdAt)) return null;
    try {
      return createRecording(value.events, {
        durationMs: value.durationMs,
        instrument: value.instrument,
        createdAt: value.createdAt
      });
    } catch (_) {
      return null;
    }
  }

  return {
    VERSION,
    INSTRUMENTS: [...INSTRUMENTS],
    buildTimeline,
    createRecording,
    getNote,
    getNoteByCode,
    getNotes,
    getRecordingDuration,
    normalizeEvents,
    noteFrequency,
    validateRecording
  };
});
