const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MIME_CANDIDATES,
  buildRecordingName,
  captureProfile,
  formatBytes,
  formatDuration,
  recordingExtension,
  selectMimeType,
} = require("./recorder-core.js");

test("selectMimeType returns the first supported candidate", () => {
  const checked = [];
  const selected = selectMimeType((type) => {
    checked.push(type);
    return type.includes("vp8");
  });

  assert.equal(selected, "video/webm;codecs=vp8,opus");
  assert.deepEqual(checked, MIME_CANDIDATES.slice(0, 2));
});

test("selectMimeType returns an empty string when no candidate is supported", () => {
  assert.equal(selectMimeType(() => false), "");
});

test("formatDuration renders a stable broadcast timecode", () => {
  assert.equal(formatDuration(0), "00:00:00");
  assert.equal(formatDuration(3_999), "00:00:03");
  assert.equal(formatDuration(3_661_999), "01:01:01");
  assert.equal(formatDuration(-200), "00:00:00");
});

test("formatBytes uses compact binary units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(640), "640 B");
  assert.equal(formatBytes(1_536), "1.5 KB");
  assert.equal(formatBytes(1_048_576), "1 MB");
  assert.equal(formatBytes(Number.NaN), "0 B");
});

test("captureProfile maps UI choices to display constraints", () => {
  assert.deepEqual(captureProfile("720"), {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  });
  assert.deepEqual(captureProfile("1080"), {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
  });
  assert.deepEqual(captureProfile("original"), {
    frameRate: { ideal: 30, max: 60 },
  });
  assert.deepEqual(captureProfile("unknown"), captureProfile("1080"));
});

test("recordingExtension follows the chosen container", () => {
  assert.equal(recordingExtension("video/mp4"), "mp4");
  assert.equal(recordingExtension("video/webm;codecs=vp9,opus"), "webm");
  assert.equal(recordingExtension(""), "webm");
});

test("buildRecordingName creates a local, filesystem-safe timestamp", () => {
  const date = new Date(2026, 7, 30, 22, 22, 7);
  assert.equal(buildRecordingName(date, "webm"), "FRAME49-20260830-222207.webm");
  assert.equal(buildRecordingName(date, ".mp4"), "FRAME49-20260830-222207.mp4");
});
