'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');
const {
  PROTOCOL_VERSION,
  normalizeRoom,
  normalizeName,
  createInitialState,
  applyDocumentUpdate,
  restoreVersion,
  deleteDocument,
  toClientState,
} = require('./sync-core');

const APP_DIR = __dirname;
const MEMBER_ID = /^[a-zA-Z0-9_-]{4,80}$/;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/app.js', '/sync-core.js']);

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function protocolMessage(type, details = {}) {
  return { v: PROTOCOL_VERSION, type, ...details };
}

function errorText(code) {
  const messages = {
    invalid_json: '消息不是有效的 JSON。',
    invalid_protocol: '协作协议版本不受支持。',
    join_required: '请先加入文档房间。',
    invalid_member: '成员信息无效，请刷新后重试。',
    room_full: '这个房间已经达到人数上限。',
    rate_limited: '编辑太频繁，请稍后继续。',
    unsafe_content: '文档内容包含不安全的标签或属性。',
    content_too_large: '文档内容超过房间限制。',
    invalid_comments: '批注列表格式无效或数量过多。',
    invalid_comment: '有一条批注格式无效。',
    invalid_document: '文档数据格式无效。',
    version_not_found: '所选历史版本已不可用。',
    unknown_message: '无法识别这条协作消息。',
  };
  return messages[code] || '协作请求未能处理。';
}

function createGalleyServer(options = {}) {
  const roomIdleMs = Number(options.roomIdleMs) > 0 ? Number(options.roomIdleMs) : 30 * 60 * 1000;
  const maxMembers = Number(options.maxMembers) > 0 ? Number(options.maxMembers) : 24;
  const rooms = new Map();

  function serveStatic(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, app: 'GALLEY/74', protocol: PROTOCOL_VERSION }));
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Bad request');
      return;
    }
    const publicAsset = pathname.startsWith('/assets/') && ['.png', '.svg'].includes(path.extname(pathname).toLowerCase());
    if (!PUBLIC_FILES.has(pathname) && !publicAsset) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const requestedPath = path.resolve(APP_DIR, `.${pathname}`);
    const insideApp = requestedPath === APP_DIR || requestedPath.startsWith(`${APP_DIR}${path.sep}`);
    if (!insideApp || !fs.existsSync(requestedPath) || !fs.statSync(requestedPath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const extension = path.extname(requestedPath).toLowerCase();
    response.writeHead(200, {
      'content-type': MIME_TYPES[extension] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=300',
    });
    fs.createReadStream(requestedPath).pipe(response);
  }

  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 192 * 1024, perMessageDeflate: false });

  function membersFor(room) {
    return [...room.clients.values()].map((client) => ({
      id: client.id,
      name: client.name,
      joinedAt: client.joinedAt,
    }));
  }

  function broadcast(room, message, exceptSocket = null) {
    for (const client of room.clients.values()) {
      if (client.socket !== exceptSocket) sendJson(client.socket, message);
    }
  }

  function broadcastPresence(room) {
    broadcast(room, protocolMessage('presence', { members: membersFor(room) }));
  }

  function roomFor(roomName) {
    let room = rooms.get(roomName);
    if (!room) {
      room = {
        name: roomName,
        state: createInitialState(roomName),
        clients: new Map(),
        cleanupTimer: null,
        deleted: false,
      };
      rooms.set(roomName, room);
    }
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  function scheduleCleanup(room) {
    if (room.deleted || room.clients.size || room.cleanupTimer) return;
    room.cleanupTimer = setTimeout(() => {
      if (!room.clients.size) rooms.delete(room.name);
    }, roomIdleMs);
    room.cleanupTimer.unref?.();
  }

  function sendError(socket, code) {
    sendJson(socket, protocolMessage('error', { code, message: errorText(code) }));
  }

  function consumeUpdateToken(client) {
    const now = Date.now();
    client.updateTimes = client.updateTimes.filter((timestamp) => now - timestamp < 10000);
    if (client.updateTimes.length >= 30) return false;
    client.updateTimes.push(now);
    return true;
  }

  function handleJoin(socket, connection, message) {
    if (message.v !== PROTOCOL_VERSION) return sendError(socket, 'invalid_protocol');
    const member = message.member;
    if (!member || !MEMBER_ID.test(String(member.id || ''))) return sendError(socket, 'invalid_member');
    const room = roomFor(connection.roomName);
    const id = String(member.id);
    if (!room.clients.has(id) && room.clients.size >= maxMembers) {
      sendError(socket, 'room_full');
      socket.close(1013, 'Room full');
      return;
    }
    const existing = room.clients.get(id);
    if (existing && existing.socket !== socket) existing.socket.close(4001, 'Session replaced');
    const client = {
      socket,
      id,
      name: normalizeName(member.name),
      joinedAt: new Date().toISOString(),
      updateTimes: [],
    };
    connection.client = client;
    connection.room = room;
    room.clients.set(id, client);
    sendJson(socket, protocolMessage('snapshot', {
      state: toClientState(room.state),
      members: membersFor(room),
    }));
    broadcastPresence(room);
  }

  function handleDocumentUpdate(socket, connection, message) {
    const { client, room } = connection;
    if (!consumeUpdateToken(client)) return sendError(socket, 'rate_limited');
    const result = applyDocumentUpdate(room.state, message, client, new Date().toISOString());
    if (!result.ok) {
      if (result.code === 'revision_conflict') {
        sendJson(socket, protocolMessage('document:conflict', {
          code: result.code,
          state: toClientState(room.state),
        }));
      } else sendError(socket, result.code);
      return;
    }
    room.state = result.state;
    broadcast(room, protocolMessage('document:update', {
      state: toClientState(room.state),
      source: client.id,
    }));
  }

  function handleVersionRestore(socket, connection, message) {
    const { client, room } = connection;
    if (!consumeUpdateToken(client)) return sendError(socket, 'rate_limited');
    const result = restoreVersion(room.state, message, client, new Date().toISOString());
    if (!result.ok) {
      if (result.code === 'revision_conflict') {
        sendJson(socket, protocolMessage('document:conflict', {
          code: result.code,
          state: toClientState(room.state),
        }));
      } else sendError(socket, result.code);
      return;
    }
    room.state = result.state;
    broadcast(room, protocolMessage('version:restored', {
      state: toClientState(room.state),
      source: client.id,
    }));
  }

  function handleDocumentDelete(socket, connection, message) {
    const { client, room } = connection;
    if (!consumeUpdateToken(client)) return sendError(socket, 'rate_limited');
    const result = deleteDocument(room.state, message, client, new Date().toISOString());
    if (!result.ok) {
      sendJson(socket, protocolMessage('document:conflict', {
        code: result.code,
        state: toClientState(room.state),
      }));
      return;
    }
    room.state = result.state;
    broadcast(room, protocolMessage('document:deleted', {
      state: toClientState(room.state),
      source: client.id,
    }));
  }

  function replacementRoomFor(currentRoom, requestedRoom) {
    const requested = String(requestedRoom == null ? '' : requestedRoom).trim();
    if (requested) {
      const normalized = normalizeRoom(requested);
      if (normalized !== currentRoom && !rooms.has(normalized)) return normalized;
    }
    let generated;
    do {
      generated = `DOC-${randomBytes(4).toString('hex').toUpperCase()}`;
    } while (generated === currentRoom || rooms.has(generated));
    return generated;
  }

  function handleRoomDelete(socket, connection, message) {
    const { client, room } = connection;
    if (!consumeUpdateToken(client)) return sendError(socket, 'rate_limited');
    const result = deleteDocument(room.state, message, client, new Date().toISOString());
    if (!result.ok) {
      sendJson(socket, protocolMessage('document:conflict', {
        code: result.code,
        state: toClientState(room.state),
      }));
      return;
    }

    const nextRoom = replacementRoomFor(room.name, message.nextRoom);
    room.deleted = true;
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
    rooms.delete(room.name);
    broadcast(room, protocolMessage('room:deleted', {
      room: room.name,
      nextRoom,
      source: client.id,
    }));
    setImmediate(() => {
      for (const member of room.clients.values()) member.socket.close(4004, 'Room deleted');
    });
  }

  wss.on('connection', (socket, request, connection) => {
    socket.on('error', () => {});
    socket.on('message', (payload, isBinary) => {
      if (isBinary) return sendError(socket, 'invalid_json');
      let message;
      try {
        message = JSON.parse(payload.toString());
      } catch {
        return sendError(socket, 'invalid_json');
      }
      if (!connection.client) {
        if (message.type !== 'join') return sendError(socket, 'join_required');
        handleJoin(socket, connection, message);
        return;
      }
      if (message.v !== PROTOCOL_VERSION) return sendError(socket, 'invalid_protocol');
      if (connection.room.deleted) return;
      if (message.type === 'document:update') handleDocumentUpdate(socket, connection, message);
      else if (message.type === 'version:restore') handleVersionRestore(socket, connection, message);
      else if (message.type === 'document:delete') handleDocumentDelete(socket, connection, message);
      else if (message.type === 'room:delete') handleRoomDelete(socket, connection, message);
      else if (message.type === 'ping') sendJson(socket, protocolMessage('pong', { at: Date.now() }));
      else sendError(socket, 'unknown_message');
    });
    socket.on('close', () => {
      const { room, client } = connection;
      if (!room || !client || room.clients.get(client.id)?.socket !== socket) return;
      room.clients.delete(client.id);
      if (room.deleted) return;
      broadcastPresence(room);
      scheduleCleanup(room);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const connection = { roomName: normalizeRoom(url.searchParams.get('room')) };
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit('connection', webSocket, request, connection);
    });
  });

  return {
    server,
    wss,
    rooms,
    listen(port = 8765, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      for (const room of rooms.values()) {
        if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
        for (const client of room.clients.values()) client.socket.terminate();
      }
      server.closeAllConnections?.();
      return new Promise((resolve) => {
        wss.close(() => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        });
      });
    },
  };
}

if (require.main === module) {
  const service = createGalleyServer();
  const port = Number(process.env.PORT) || 8765;
  const host = process.env.HOST || '127.0.0.1';
  service.listen(port, host).then((address) => {
    console.log(`GALLEY/74 listening on http://${host}:${address.port}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createGalleyServer };
