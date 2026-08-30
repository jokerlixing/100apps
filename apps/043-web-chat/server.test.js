"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WebSocket } = require("ws");
const {
  MAX_HISTORY,
  normalizeRoomId,
  normalizeText,
  createRoom,
  roomSnapshot,
  normalizeChatMessage,
  appendMessage,
  parseMessage,
  createChatServer
} = require("./server");

function meta(overrides = {}) {
  return { clientId: "client_0001", name: "林小星", color: "#ff6e4a", ...overrides };
}

function rawMessage(index = 1, overrides = {}) {
  return { id: `message_${String(index).padStart(4, "0")}`, text: `第 ${index} 条消息`, createdAt: 1000 + index, replyTo: null, ...overrides };
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

function openSocket(url) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function join(socket, room, clientId, name) {
  const snapshot = waitForMessage(socket, message => message.type === "snapshot");
  socket.send(JSON.stringify({ v: 1, type: "join", room, clientId, name, color: "#3454e8" }));
  return snapshot;
}

test("room and text validation preserves plain HTML-like content", () => {
  assert.equal(normalizeRoomId("  hello-43 "), "HELLO-43");
  assert.equal(normalizeRoomId("x"), null);
  assert.equal(normalizeText("  <b>不是 HTML</b>\r\n第二行  "), "<b>不是 HTML</b>\n第二行");
  assert.equal(normalizeText("   "), null);
  assert.equal(normalizeText("x".repeat(601)), null);
});

test("history is idempotent and keeps the newest 120 messages", () => {
  const room = createRoom("CHAT-43");
  for (let index = 1; index <= MAX_HISTORY + 1; index++) {
    const message = normalizeChatMessage(rawMessage(index), meta(), room, 2000 + index);
    appendMessage(room, message);
  }
  assert.equal(room.history.length, MAX_HISTORY);
  assert.equal(room.history[0].id, "message_0002");
  const duplicate = appendMessage(room, room.history[0]);
  assert.equal(duplicate.added, false);
  assert.equal(room.history.length, MAX_HISTORY);
  assert.equal(roomSnapshot(room).history.length, MAX_HISTORY);
});

test("reply targets must exist in current room history", () => {
  const room = createRoom("REPLY-43");
  const first = normalizeChatMessage(rawMessage(1), meta(), room, 2000);
  appendMessage(room, first);
  assert.equal(normalizeChatMessage(rawMessage(2, { replyTo: first.id }), meta(), room, 2001).replyTo, first.id);
  assert.equal(normalizeChatMessage(rawMessage(3, { replyTo: "missing_0001" }), meta(), room, 2002).replyTo, null);
});

test("message parser rejects malformed, unsupported and oversized payloads", () => {
  assert.equal(parseMessage("{").error, "invalid_json");
  assert.equal(parseMessage(JSON.stringify({ v: 2, type: "join" })).error, "unsupported_protocol");
  assert.equal(parseMessage("x".repeat(32 * 1024 + 1)).error, "message_too_large");
  assert.equal(parseMessage(JSON.stringify({ v: 1, type: "join" })).value.type, "join");
});

test("WebSocket chat relays text, typing and history while isolating rooms", async t => {
  const app = createChatServer();
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.stop());
  const { port } = app.server.address();
  const url = `ws://127.0.0.1:${port}/ws`;
  const [first, second, outsider] = await Promise.all([openSocket(url), openSocket(url), openSocket(url)]);
  await join(first, "CHAT-43", "client_0001", "甲");
  await join(second, "CHAT-43", "client_0002", "乙");
  await join(outsider, "OTHER-43", "client_0003", "丙");

  const firstEcho = waitForMessage(first, message => message.type === "chat:message");
  const secondRelay = waitForMessage(second, message => message.type === "chat:message");
  first.send(JSON.stringify({ v: 1, type: "chat:send", room: "CHAT-43", clientId: "client_0001", message: rawMessage(1, { text: "<b>纯文本</b>", createdAt: Date.now() }) }));
  assert.equal((await firstEcho).message.text, "<b>纯文本</b>");
  assert.equal((await secondRelay).message.id, "message_0001");

  const typing = waitForMessage(second, message => message.type === "typing");
  first.send(JSON.stringify({ v: 1, type: "typing", room: "CHAT-43", clientId: "client_0001", active: true }));
  assert.equal((await typing).active, true);

  const outsiderReceived = await Promise.race([
    waitForMessage(outsider, message => message.type === "chat:message", 180).then(() => true).catch(() => false),
    new Promise(resolve => setTimeout(() => resolve(false), 220))
  ]);
  assert.equal(outsiderReceived, false);

  first.send(JSON.stringify({ v: 1, type: "chat:send", room: "CHAT-43", clientId: "client_0001", message: rawMessage(1, { text: "重复", createdAt: Date.now() }) }));
  const newcomer = await openSocket(url);
  const snapshot = await join(newcomer, "CHAT-43", "client_0004", "丁");
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.history[0].text, "<b>纯文本</b>");
  newcomer.close();first.close();second.close();outsider.close();
});

test("a replacement connection remains registered after the old connection closes", async t => {
  const app = createChatServer();
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.stop());
  const { port } = app.server.address();
  const url = `ws://127.0.0.1:${port}/ws`;
  const first = await openSocket(url);
  await join(first, "RELOAD-43", "client_same", "旧连接");
  const replacement = await openSocket(url);
  const snapshot = await join(replacement, "RELOAD-43", "client_same", "新连接");
  assert.equal(snapshot.members[0].name, "新连接");
  await new Promise(resolve => first.once("close", resolve));
  await new Promise(resolve => setTimeout(resolve, 20));
  const room = app.rooms.get("RELOAD-43");
  assert.equal(room.clients.size, 1);
  assert.equal(room.clients.get("client_same").name, "新连接");
  assert.equal(room.clients.get("client_same").socket.readyState, WebSocket.OPEN);
  replacement.close();
});
