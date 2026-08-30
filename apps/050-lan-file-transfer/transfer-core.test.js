const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./transfer-core.js");

test("formatBytes and formatRate use readable binary units", () => {
  assert.equal(core.formatBytes(0), "0 B");
  assert.equal(core.formatBytes(1024), "1.00 KB");
  assert.equal(core.formatBytes(12 * 1024), "12.0 KB");
  assert.equal(core.formatBytes(150 * 1024 * 1024), "150 MB");
  assert.equal(core.formatRate(2048), "2.00 KB/s");
});

test("sanitizeFileName removes path and platform control characters", () => {
  assert.equal(core.sanitizeFileName("../../照片:夏天?.jpg"), "_.._照片_夏天_.jpg");
  assert.equal(core.sanitizeFileName("  .  "), "received-file");
  assert.equal(core.sanitizeFileName(null, "fallback.bin"), "fallback.bin");
});

test("createFileQueue preserves source objects and calculates total", () => {
  const first = { name: "notes.txt", size: 12, type: "text/plain", lastModified: 3 };
  const second = { name: "photo.png", size: 30, type: "image/png" };
  const queue = core.createFileQueue([first, second], { maxTotalBytes: 100 });
  assert.equal(queue.totalBytes, 42);
  assert.equal(queue.files[0].file, first);
  assert.deepEqual(
    queue.files.map(({ id, name, size, type }) => ({ id, name, size, type })),
    [
      { id: "file-1", name: "notes.txt", size: 12, type: "text/plain" },
      { id: "file-2", name: "photo.png", size: 30, type: "image/png" }
    ]
  );
});

test("createFileQueue rejects empty, invalid, excessive count and excessive bytes", () => {
  assert.throws(() => core.createFileQueue([]), /至少选择/);
  assert.throws(() => core.createFileQueue([{ name: "bad", size: -1 }]), /无效/);
  assert.throws(
    () => core.createFileQueue([{ name: "a", size: 1 }, { name: "b", size: 1 }], { maxFiles: 1 }),
    /最多选择 1/
  );
  assert.throws(() => core.createFileQueue([{ name: "big", size: 11 }], { maxTotalBytes: 10 }), /不能超过/);
});

test("progress and chunk helpers clamp boundary values", () => {
  assert.equal(core.progressPercentage(25, 100), 25);
  assert.equal(core.progressPercentage(150, 100), 100);
  assert.equal(core.progressPercentage(-5, 100), 0);
  assert.equal(core.chunkCount(0), 0);
  assert.equal(core.chunkCount(core.CHUNK_SIZE + 1), 2);
  assert.throws(() => core.chunkCount(2, 0), /positive/);
});

test("control messages round-trip and reject foreign protocol data", () => {
  const message = core.decodeControl(core.encodeControl("file-meta", { id: "a", size: 8 }));
  assert.equal(message.type, "file-meta");
  assert.equal(message.id, "a");
  assert.throws(() => core.encodeControl("mystery", {}), /不支持/);
  assert.throws(() => core.decodeControl('{"protocol":"other","version":1,"type":"hello"}'), /版本不匹配/);
  assert.throws(() => core.decodeControl("{"), /有效 JSON/);
});

test("raw handshake tokens round-trip sender offers", () => {
  const payload = {
    version: 1,
    role: "sender",
    description: { type: "offer", sdp: "v=0\\r\\na=ice-ufrag:示例" }
  };
  const token = core.encodeRawHandshake(payload);
  assert.equal(core.tokenCodec(token), "raw");
  assert.deepEqual(core.decodeRawHandshake(token), payload);
});

test("handshake validation enforces paired role and description type", () => {
  assert.throws(
    () => core.validateHandshake({ version: 1, role: "sender", description: { type: "answer", sdp: "v=0" } }),
    /应为邀请/
  );
  assert.throws(() => core.decodeRawHandshake("beam50.v1.r.not-base64!"), /编码无效|内容损坏/);
  assert.equal(core.tokenCodec("beam50.v1.z.abc"), "gzip");
  assert.equal(core.tokenCodec("hello"), null);
});
