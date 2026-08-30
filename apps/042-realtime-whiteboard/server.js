"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_ROOM_CLIENTS = 20;
const MAX_STROKES = 2000;
const MAX_POINTS = 4000;
const MAX_POINTS_PER_BATCH = 160;
const MAX_MESSAGES_PER_WINDOW = 360;
const RATE_WINDOW_MS = 5000;
const VALID_TOOLS = new Set(["pen", "highlighter", "line", "eraser"]);
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
  return name || "匿名协作者";
}

function normalizeColor(value) {
  return COLOR_PATTERN.test(String(value || "")) ? String(value).toLowerCase() : "#6948d9";
}

function normalizePoint(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const pressure = value.length > 2 ? Number(value[2]) : 0.5;
  if (![x, y, pressure].every(Number.isFinite)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1 || pressure < 0 || pressure > 1) return null;
  return [Math.round(x * 100000) / 100000, Math.round(y * 100000) / 100000, Math.round(pressure * 1000) / 1000];
}

function normalizePoints(values, limit = MAX_POINTS) {
  if (!Array.isArray(values) || values.length === 0 || values.length > limit) return null;
  const points = values.map(normalizePoint);
  return points.every(Boolean) ? points : null;
}

function normalizeStroke(value, ownerId) {
  if (!value || typeof value !== "object") return null;
  const id = normalizeId(value.id);
  const clientId = normalizeId(ownerId || value.clientId);
  const tool = VALID_TOOLS.has(value.tool) && value.tool !== "eraser" ? value.tool : null;
  const color = normalizeColor(value.color);
  const size = Number(value.size);
  const points = normalizePoints(value.points);
  if (!id || !clientId || !tool || !Number.isFinite(size) || size < 1 || size > 40 || !points) return null;
  return {
    id,
    clientId,
    tool,
    color,
    size: Math.round(size * 10) / 10,
    points,
    createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now()
  };
}

function createRoom(id) {
  return {
    id,
    strokes: new Map(),
    transients: new Map(),
    clients: new Map(),
    revision: 0,
    createdAt: Date.now()
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
    strokes: [...room.strokes.values()],
    members: memberList(room),
    ts: Date.now()
  };
}

function commitStroke(room, stroke) {
  if (!stroke) return false;
  room.strokes.set(stroke.id, stroke);
  room.transients.delete(stroke.id);
  while (room.strokes.size > MAX_STROKES) {
    room.strokes.delete(room.strokes.keys().next().value);
  }
  room.revision += 1;
  return true;
}

function removeStroke(room, strokeId) {
  const removed = room.strokes.delete(strokeId);
  room.transients.delete(strokeId);
  if (removed) room.revision += 1;
  return removed;
}

function clearRoom(room) {
  const hadContent = room.strokes.size > 0 || room.transients.size > 0;
  room.strokes.clear();
  room.transients.clear();
  if (hadContent) room.revision += 1;
  return hadContent;
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

function withinRateLimit(meta) {
  const now = Date.now();
  if (now - meta.rateWindowStarted >= RATE_WINDOW_MS) {
    meta.rateWindowStarted = now;
    meta.rateCount = 0;
  }
  meta.rateCount += 1;
  return meta.rateCount <= MAX_MESSAGES_PER_WINDOW;
}

function createCollabServer(options = {}) {
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
        response.end("Whiteboard client is unavailable");
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(content);
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  function getRoom(id) {
    if (!rooms.has(id)) rooms.set(id, createRoom(id));
    return rooms.get(id);
  }

  function sendError(socket, code) {
    safeSend(socket, { v: PROTOCOL_VERSION, type: "error", code, ts: Date.now() });
  }

  function leave(socket) {
    const meta = socket.board42;
    if (!meta || !meta.room) return;
    const room = meta.room;
    if (room.clients.get(meta.clientId) !== meta) {
      meta.room = null;
      return;
    }
    room.clients.delete(meta.clientId);
    for (const [strokeId, stroke] of room.transients) {
      if (stroke.clientId === meta.clientId) room.transients.delete(strokeId);
    }
    broadcast(room, publicEvent("presence", room, meta.clientId, { members: memberList(room), action: "leave" }));
    if (room.clients.size === 0 && room.strokes.size === 0) rooms.delete(room.id);
    meta.room = null;
  }

  function join(socket, message) {
    const roomId = normalizeRoomId(message.room);
    const clientId = normalizeId(message.clientId);
    if (!roomId || !clientId) return sendError(socket, "invalid_join");
    if (socket.board42.room) leave(socket);
    const room = getRoom(roomId);
    if (room.clients.size >= MAX_ROOM_CLIENTS && !room.clients.has(clientId)) return sendError(socket, "room_full");
    const existing = room.clients.get(clientId);
    if (existing && existing.socket !== socket) existing.socket.close(4001, "Replaced by a newer connection");
    const meta = socket.board42;
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
    const meta = socket.board42;
    const room = meta.room;
    if (!room || message.room !== room.id || message.clientId !== meta.clientId) return sendError(socket, "not_joined");
    if (!withinRateLimit(meta)) return sendError(socket, "rate_limited");

    if (message.type === "ping") {
      safeSend(socket, publicEvent("pong", room, meta.clientId, { echo: Number(message.ts) || Date.now() }));
      return;
    }

    if (message.type === "cursor") {
      const point = normalizePoint(message.point);
      if (!point) return sendError(socket, "invalid_cursor");
      broadcast(room, publicEvent("cursor", room, meta.clientId, { point, name: meta.name, color: meta.color }), socket);
      return;
    }

    if (message.type === "stroke:start") {
      const stroke = normalizeStroke({ ...message.stroke, points: message.stroke && message.stroke.points }, meta.clientId);
      if (!stroke || stroke.points.length > 8) return sendError(socket, "invalid_stroke");
      room.transients.set(stroke.id, stroke);
      broadcast(room, publicEvent("stroke:start", room, meta.clientId, { stroke }), socket);
      return;
    }

    if (message.type === "stroke:points") {
      const strokeId = normalizeId(message.strokeId);
      const points = normalizePoints(message.points, MAX_POINTS_PER_BATCH);
      const transient = strokeId && room.transients.get(strokeId);
      if (!transient || transient.clientId !== meta.clientId || !points || transient.points.length + points.length > MAX_POINTS) {
        return sendError(socket, "invalid_points");
      }
      transient.points.push(...points);
      broadcast(room, publicEvent("stroke:points", room, meta.clientId, { strokeId, points }), socket);
      return;
    }

    if (message.type === "stroke:commit") {
      const stroke = normalizeStroke(message.stroke, meta.clientId);
      if (!stroke) return sendError(socket, "invalid_stroke");
      commitStroke(room, stroke);
      broadcast(room, publicEvent("stroke:commit", room, meta.clientId, { stroke, revision: room.revision }));
      return;
    }

    if (message.type === "stroke:remove") {
      const strokeId = normalizeId(message.strokeId);
      if (!strokeId) return sendError(socket, "invalid_stroke_id");
      removeStroke(room, strokeId);
      broadcast(room, publicEvent("stroke:remove", room, meta.clientId, { strokeId, revision: room.revision }));
      return;
    }

    if (message.type === "board:clear") {
      clearRoom(room);
      broadcast(room, publicEvent("board:clear", room, meta.clientId, { revision: room.revision }));
      return;
    }

    sendError(socket, "unknown_type");
  }

  wss.on("connection", socket => {
    socket.board42 = {
      socket,
      room: null,
      clientId: null,
      name: "匿名协作者",
      color: "#6948d9",
      joinedAt: Date.now(),
      rateWindowStarted: Date.now(),
      rateCount: 0
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
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  return { server, wss, rooms, stop };
}

if (require.main === module) {
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8765));
  const host = process.env.HOST || "127.0.0.1";
  const app = createCollabServer();
  app.server.listen(port, host, () => {
    console.log(`BOARD/42 is running at http://${host}:${port}`);
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
  MAX_STROKES,
  MAX_POINTS,
  normalizeRoomId,
  normalizeId,
  normalizePoint,
  normalizePoints,
  normalizeStroke,
  createRoom,
  roomSnapshot,
  commitStroke,
  removeStroke,
  clearRoom,
  parseMessage,
  createCollabServer
};
