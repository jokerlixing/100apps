const test = require("node:test");
const assert = require("node:assert/strict");

const Core = require("./piano-core.js");

test("生成 C4 到 B5 的两组八度与唯一键位映射", () => {
  const notes = Core.getNotes();
  assert.equal(notes.length, 24);
  assert.equal(notes[0].id, "C4");
  assert.equal(notes.at(-1).id, "B5");
  assert.equal(new Set(notes.map(note => note.code)).size, 24);
  assert.equal(Core.getNoteByCode("KeyZ").id, "C4");
  assert.equal(Core.getNoteByCode("KeyU").id, "B5");
  assert.equal(Core.getNoteByCode("Escape"), null);
});

test("按十二平均律计算标准频率", () => {
  assert.ok(Math.abs(Core.noteFrequency("A4") - 440) < 0.0001);
  assert.ok(Math.abs(Core.noteFrequency("C4") - 261.625565) < 0.001);
  assert.ok(Math.abs(Core.noteFrequency("A5") - 880) < 0.0001);
  assert.throws(() => Core.noteFrequency("H4"), /未知音符/);
});

test("录音规范化会排序、忽略重复事件并补齐悬空音符", () => {
  const events = Core.normalizeEvents([
    { type: "off", note: "C4", timeMs: 510 },
    { type: "on", note: "E4", timeMs: 250 },
    { type: "on", note: "C4", timeMs: 10 },
    { type: "on", note: "C4", timeMs: 30 },
    { type: "off", note: "G4", timeMs: 80 }
  ], 900);

  assert.deepEqual(events, [
    { type: "on", note: "C4", timeMs: 10 },
    { type: "on", note: "E4", timeMs: 250 },
    { type: "off", note: "C4", timeMs: 510 },
    { type: "off", note: "E4", timeMs: 900 }
  ]);
  assert.equal(Core.getRecordingDuration(events), 900);
});

test("同一毫秒内先松开再重按时保留两个音符片段", () => {
  const events = Core.normalizeEvents([
    { type: "on", note: "C4", timeMs: 0 },
    { type: "off", note: "C4", timeMs: 100 },
    { type: "on", note: "C4", timeMs: 100 },
    { type: "off", note: "C4", timeMs: 220 }
  ], 220);
  assert.equal(events.length, 4);
  assert.deepEqual(events.map(event => event.type), ["on", "off", "on", "off"]);
  assert.equal(Core.buildTimeline(events, 220).length, 2);
});

test("时间轴把音符对转换为相对位置", () => {
  const segments = Core.buildTimeline([
    { type: "on", note: "C4", timeMs: 100 },
    { type: "off", note: "C4", timeMs: 400 },
    { type: "on", note: "C5", timeMs: 500 },
    { type: "off", note: "C5", timeMs: 1000 }
  ], 1000);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].leftPct, 10);
  assert.equal(segments[0].widthPct, 30);
  assert.equal(segments[1].leftPct, 50);
  assert.equal(segments[1].widthPct, 50);
  assert.equal(segments[1].noteIndex, 12);
});

test("创建并校验可持久化录音", () => {
  const recording = Core.createRecording([
    { type: "on", note: "A4", timeMs: 0 },
    { type: "off", note: "A4", timeMs: 240 }
  ], { durationMs: 500, instrument: "electric", createdAt: 1234 });

  assert.equal(recording.version, 1);
  assert.equal(recording.durationMs, 500);
  assert.equal(recording.instrument, "electric");
  assert.deepEqual(Core.validateRecording(JSON.parse(JSON.stringify(recording))), recording);
  assert.equal(Core.validateRecording({ ...recording, version: 99 }), null);
  assert.equal(Core.validateRecording({ ...recording, events: [{ type: "on", note: "X9", timeMs: 0 }] }), null);
  assert.throws(() => Core.createRecording([], { durationMs: 0, instrument: "piano" }), /没有音符/);
});

test("拒绝无效事件时间、类型与音色", () => {
  assert.throws(() => Core.normalizeEvents([{ type: "start", note: "C4", timeMs: 0 }], 10), /类型无效/);
  assert.throws(() => Core.normalizeEvents([{ type: "on", note: "C4", timeMs: -1 }], 10), /非负有限数/);
  assert.throws(() => Core.createRecording([{ type: "on", note: "C4", timeMs: 0 }], { durationMs: 1, instrument: "flute" }), /音色无效/);
});
