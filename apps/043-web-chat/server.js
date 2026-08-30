"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 32 * 1024;
const MAX_ROOM_CLIENTS = 30;
const MAX_HISTORY = 120;
const MAX_TEXT_LENGTH = 600;
const MAX_MESSAGES_PER_WINDOW = 180;
const RATE_WINDOW_MS = 5000;
const MAX_CHAT_PER_WINDOW = 8;
const CHAT_WINDOW_MS = 10000;
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const ROOM_PATTERN = /^[A-Z0-9-]{3,24}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function normalizeRoomId(value) {
  const room = String(value || "").trim().toUpperCase();
  return ROOM_PATTERN.test(room) ? room : null;
}

function normalizeId(value) {
  const id = String(value || "").trim();
  return ID_PATTERN.test(id) ? id : null;
}

function normalizeName(value) {
  const name = String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 24);
  return name || "匿名接线员";
}

function normalizeColor(value) {
  return COLOR_PATTERN.test(String(value || "")) ? String(value).toLowerCase() : "#3454e8";
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  return text;
}

function createRoom(id) {
  return {
    id,
    history: [],
    messageIds: new Set(),
    clients: new Map(),
    revision: 0,
    createdAt: Date.now(),
    cleanupTimer: null
  };
}

function memberList(room) {
  return [...room.clients.values()].map(meta => ({
    clientId: meta.clientId,
    name: meta.name,
    color: meta.color,
    joinedAt: meta.joinedAt
  }));
}

function roomSnapshot(room) {
  return {
    v: PROTOCOL_VERSION,
    type: "snapshot",
    room: room.id,
    revision: room.revision,
    history: room.history,
    members: memberList(room),
    ts: Date.now()
  };
}

function normalizeChatMessage(value, meta, room, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const id = normalizeId(value.id);
  const text = normalizeText(value.text);
  if (!id || !text || !meta || !normalizeId(meta.clientId)) return null;
  const proposedTime = Number(value.createdAt);
  const createdAt = Number.isFinite(proposedTime)
    ? Math.max(now - 24 * 60 * 60 * 1000, Math.min(now + 60 * 1000, proposedTime))
    : now;
  const candidateReply = value.replyTo ? normalizeId(value.replyTo) : null;
  const replyTo = candidateReply && room.history.some(message => message.id === candidateReply) ? candidateReply : null;
  return {
    id,
    clientId: meta.clientId,
    name: normalizeName(meta.name),
    color: normalizeColor(meta.color),
    text,
    createdAt,
    replyTo
  };
}

function appendMessage(room, message) {
  const existing = room.history.find(item => item.id === message.id);
  if (existing) return { added: false, message: existing };
  room.history.push(message);
  room.messageIds.add(message.id);
  room.history.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  while (room.history.length > MAX_HISTORY) {
    const removed = room.history.shift();
    room.messageIds.delete(removed.id);
  }
  room.revision += 1;
  return { added: true, message };
}

function parseMessage(data) {
  const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
  if (size > MAX_MESSAGE_BYTES) return { error: "message_too_large" };
  try {
    const value = JSON.parse(String(data));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_message" };
    if (value.v !== PROTOCOL_VERSION || typeof value.type !== "string") return { error: "unsupported_protocol" };
    return { value };
  } catch (error) {
    return { error: "invalid_json" };
  }
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload, except = null) {
  const body = JSON.stringify(payload);
  for (const meta of room.clients.values()) {
    if (meta.socket !== except && meta.socket.readyState === WebSocket.OPEN) meta.socket.send(body);
  }
}

function publicEvent(type, room, clientId, extra = {}) {
  return { v: PROTOCOL_VERSION, type, room: room.id, clientId, ts: Date.now(), ...extra };
}

function withinWindow(meta, key, max, duration) {
  const now = Date.now();
  const startedKey = `${key}Started`;
  const countKey = `${key}Count`;
  if (now - meta[startedKey] >= duration) {
    meta[startedKey] = now;
    meta[countKey] = 0;
  }
  meta[countKey] += 1;
  return meta[countKey] <= max;
}

function createChatServer(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const rooms = new Map();
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, rooms: rooms.size, protocol: PROTOCOL_VERSION }));
      return;
    }
    if (requestUrl.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    fs.readFile(path.join(rootDir, "index.html"), (error, content) => {
      if (error) {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Chat client is unavailable");
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(content);
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  function getRoom(id) {
    if (!rooms.has(id)) rooms.set(id, createRoom(id));
    const room = rooms.get(id);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  function sendError(socket, code) {
    safeSend(socket, { v: PROTOCOL_VERSION, type: "error", code, ts: Date.now() });
  }

  function leave(socket) {
    const meta = socket.patch43;
    if (!meta || !meta.room) return;
    const room = meta.room;
    if (room.clients.get(meta.clientId) !== meta) {
      meta.room = null;
      return;
    }
    room.clients.delete(meta.clientId);
    broadcast(room, publicEvent("presence", room, meta.clientId, { members: memberList(room), action: "leave" }));
    if (room.clients.size === 0) {
      room.cleanupTimer = setTimeout(() => {
        if (room.clients.size === 0) rooms.delete(room.id);
      }, EMPTY_ROOM_TTL_MS);
      room.cleanupTimer.unref?.();
    }
    meta.room = null;
  }

  function join(socket, message) {
    const roomId = normalizeRoomId(message.room);
    const clientId = normalizeId(message.clientId);
    if (!roomId || !clientId) return sendError(socket, "invalid_join");
    if (socket.patch43.room) leave(socket);
    const room = getRoom(roomId);
    if (room.clients.size >= MAX_ROOM_CLIENTS && !room.clients.has(clientId)) return sendError(socket, "room_full");
    const existing = room.clients.get(clientId);
    if (existing && existing.socket !== socket) existing.socket.close(4001, "Replaced by a newer connection");
    const meta = socket.patch43;
    meta.clientId = clientId;
    meta.name = normalizeName(message.name);
    meta.color = normalizeColor(message.color);
    meta.joinedAt = Date.now();
    meta.room = room;
    room.clients.set(clientId, meta);
    safeSend(socket, roomSnapshot(room));
    broadcast(room, publicEvent("presence", room, clientId, { members: memberList(room), action: "join" }));
  }

  function handleRoomMessage(socket, message) {
    const meta = socket.patch43;
    const room = meta.room;
    if (!room || message.room !== room.id || message.clientId !== meta.clientId) return sendError(socket, "not_joined");
    if (!withinWindow(meta, "rate", MAX_MESSAGES_PER_WINDOW, RATE_WINDOW_MS)) return sendError(socket, "rate_limited");

    if (message.type === "ping") {
      safeSend(socket, publicEvent("pong", room, meta.clientId, { echo: Number(message.ts) || Date.now() }));
      return;
    }

    if (message.type === "typing") {
      broadcast(room, publicEvent("typing", room, meta.clientId, { active: Boolean(message.active), name: meta.name, color: meta.color }), socket);
      return;
    }

    if (message.type === "chat:send") {
      if (!withinWindow(meta, "chat", MAX_CHAT_PER_WINDOW, CHAT_WINDOW_MS)) return sendError(socket, "chat_rate_limited");
      const chat = normalizeChatMessage(message.message, meta, room);
      if (!chat) return sendError(socket, "invalid_chat");
      const result = appendMessage(room, chat);
      const event = publicEvent("chat:message", room, meta.clientId, { message: result.message, revision: room.revision, duplicate: !result.added });
      if (result.added) broadcast(room, event);
      else safeSend(socket, event);
      return;
    }

    sendError(socket, "unknown_type");
  }

  wss.on("connection", socket => {
    const now = Date.now();
    socket.patch43 = {
      socket,
      room: null,
      clientId: null,
      name: "匿名接线员",
      color: "#3454e8",
      joinedAt: now,
      rateStarted: now,
      rateCount: 0,
      chatStarted: now,
      chatCount: 0
    };
    socket.on("message", data => {
      const parsed = parseMessage(data);
      if (parsed.error) return sendError(socket, parsed.error);
      if (parsed.value.type === "join") return join(socket, parsed.value);
      handleRoomMessage(socket, parsed.value);
    });
    socket.on("close", () => leave(socket));
    socket.on("error", () => leave(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, webSocket => wss.emit("connection", webSocket, request));
  });

  async function stop() {
    for (const room of rooms.values()) if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  return { server, wss, rooms, stop };
}

if (require.main === module) {
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8765));
  const host = process.env.HOST || "127.0.0.1";
  const app = createChatServer();
  app.server.listen(port, host, () => {
    console.log(`PATCH/43 is running at http://${host}:${port}`);
    console.log(`WebSocket endpoint: ws://${host}:${port}/ws`);
  });
  const shutdown = () => app.stop().finally(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = {
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  MAX_ROOM_CLIENTS,
  MAX_HISTORY,
  MAX_TEXT_LENGTH,
  normalizeRoomId,
  normalizeId,
  normalizeName,
  normalizeColor,
  normalizeText,
  createRoom,
  roomSnapshot,
  normalizeChatMessage,
  appendMessage,
  parseMessage,
  createChatServer
};
