"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WebSocket } = require("ws");
const {
  MAX_POINTS,
  normalizeRoomId,
  normalizePoint,
  normalizeStroke,
  createRoom,
  roomSnapshot,
  commitStroke,
  removeStroke,
  clearRoom,
  parseMessage,
  createCollabServer
} = require("./server");

function sampleStroke(overrides = {}) {
  return {
    id: "stroke_0001",
    clientId: "client_0001",
    tool: "pen",
    color: "#17242d",
    size: 5,
    points: [[0.1, 0.2, 0.5], [0.8, 0.7, 1]],
    createdAt: 1000,
    ...overrides
  };
}

function waitForMessage(socket, predicate, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeout);
    function onMessage(data) {
      const message = JSON.parse(String(data));
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

test("room ids are normalized and constrained", () => {
  assert.equal(normalizeRoomId("  idea-42 "), "IDEA-42");
  assert.equal(normalizeRoomId("x"), null);
  assert.equal(normalizeRoomId("room/escape"), null);
});

test("points and strokes reject unsafe or oversized input", () => {
  assert.deepEqual(normalizePoint([0.1234567, 0.8, 0.5555]), [0.12346, 0.8, 0.556]);
  assert.equal(normalizePoint([-1, 0.5, 1]), null);
  assert.equal(normalizePoint([0.2, Number.NaN, 1]), null);
  assert.deepEqual(normalizeStroke(sampleStroke()), sampleStroke());
  assert.equal(normalizeStroke(sampleStroke({ color: "red" })).color, "#6948d9");
  assert.equal(normalizeStroke(sampleStroke({ size: 100 })), null);
  assert.equal(normalizeStroke(sampleStroke({ points: Array.from({ length: MAX_POINTS + 1 }, () => [0, 0, 0.5]) })), null);
});

test("room reducers produce idempotent snapshots", () => {
  const room = createRoom("IDEA-42");
  const stroke = normalizeStroke(sampleStroke());
  assert.equal(commitStroke(room, stroke), true);
  assert.equal(commitStroke(room, stroke), true);
  assert.equal(room.strokes.size, 1);
  assert.equal(roomSnapshot(room).strokes[0].id, stroke.id);
  assert.equal(removeStroke(room, stroke.id), true);
  assert.equal(removeStroke(room, stroke.id), false);
  commitStroke(room, stroke);
  assert.equal(clearRoom(room), true);
  assert.equal(roomSnapshot(room).strokes.length, 0);
});

test("message parser rejects malformed, unsupported and oversized payloads", () => {
  assert.equal(parseMessage("{").error, "invalid_json");
  assert.equal(parseMessage(JSON.stringify({ v: 2, type: "join" })).error, "unsupported_protocol");
  assert.equal(parseMessage("x".repeat(256 * 1024 + 1)).error, "message_too_large");
  assert.equal(parseMessage(JSON.stringify({ v: 1, type: "join" })).value.type, "join");
});

test("WebSocket rooms send snapshots, isolate rooms and relay commits", async t => {
  const app = createCollabServer();
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.stop());
  const { port } = app.server.address();
  const url = `ws://127.0.0.1:${port}/ws`;
  const first = new WebSocket(url);
  const second = new WebSocket(url);
  const outsider = new WebSocket(url);
  await Promise.all([first, second, outsider].map(socket => new Promise(resolve => socket.once("open", resolve))));

  const firstSnapshot = waitForMessage(first, message => message.type === "snapshot");
  first.send(JSON.stringify({ v: 1, type: "join", room: "IDEA-42", clientId: "client_0001", name: "甲", color: "#ff6b35" }));
  assert.equal((await firstSnapshot).room, "IDEA-42");

  const secondSnapshot = waitForMessage(second, message => message.type === "snapshot");
  second.send(JSON.stringify({ v: 1, type: "join", room: "IDEA-42", clientId: "client_0002", name: "乙", color: "#6948d9" }));
  assert.equal((await secondSnapshot).members.length, 2);

  const outsiderSnapshot = waitForMessage(outsider, message => message.type === "snapshot");
  outsider.send(JSON.stringify({ v: 1, type: "join", room: "OTHER-42", clientId: "client_0003", name: "丙", color: "#17242d" }));
  assert.equal((await outsiderSnapshot).strokes.length, 0);

  const relayed = waitForMessage(second, message => message.type === "stroke:commit");
  first.send(JSON.stringify({ v: 1, type: "stroke:commit", room: "IDEA-42", clientId: "client_0001", stroke: sampleStroke() }));
  assert.equal((await relayed).stroke.id, "stroke_0001");

  const outsiderReceivedStroke = await Promise.race([
    waitForMessage(outsider, message => message.type === "stroke:commit", 180).then(() => true).catch(() => false),
    new Promise(resolve => setTimeout(() => resolve(false), 220))
  ]);
  assert.equal(outsiderReceivedStroke, false);

  const newcomer = new WebSocket(url);
  await new Promise(resolve => newcomer.once("open", resolve));
  const snapshot = waitForMessage(newcomer, message => message.type === "snapshot");
  newcomer.send(JSON.stringify({ v: 1, type: "join", room: "IDEA-42", clientId: "client_0004", name: "丁", color: "#f06a35" }));
  assert.equal((await snapshot).strokes.length, 1);
  newcomer.close();
  first.close();
  second.close();
  outsider.close();
});

test("a newer connection with the same client id survives the old close event", async t => {
  const app = createCollabServer();
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.stop());
  const { port } = app.server.address();
  const url = `ws://127.0.0.1:${port}/ws`;
  const first = new WebSocket(url);
  await new Promise(resolve => first.once("open", resolve));
  const firstSnapshot = waitForMessage(first, message => message.type === "snapshot");
  first.send(JSON.stringify({ v: 1, type: "join", room: "RELOAD-42", clientId: "client_same", name: "旧连接", color: "#ff6b35" }));
  await firstSnapshot;

  const replacement = new WebSocket(url);
  await new Promise(resolve => replacement.once("open", resolve));
  const replacementSnapshot = waitForMessage(replacement, message => message.type === "snapshot");
  replacement.send(JSON.stringify({ v: 1, type: "join", room: "RELOAD-42", clientId: "client_same", name: "新连接", color: "#6948d9" }));
  assert.equal((await replacementSnapshot).members[0].name, "新连接");
  await new Promise(resolve => first.once("close", resolve));
  await new Promise(resolve => setTimeout(resolve, 20));

  const room = app.rooms.get("RELOAD-42");
  assert.equal(room.clients.size, 1);
  assert.equal(room.clients.get("client_same").name, "新连接");
  assert.equal(room.clients.get("client_same").socket.readyState, WebSocket.OPEN);
  replacement.close();
});
