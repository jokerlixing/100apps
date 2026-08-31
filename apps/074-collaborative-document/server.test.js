const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');

const { createGalleyServer } = require('./server');

let service;
let httpUrl;
let wsUrl;
const clients = [];

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function waitForClose(socket) {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

function trackedClient(url) {
  const socket = new WebSocket(url);
  const messages = [];
  const waiters = new Set();
  socket.on('message', (payload) => {
    const message = JSON.parse(payload.toString());
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  });
  const client = {
    socket,
    messages,
    next(predicate, timeout = 1500) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('Timed out waiting for WebSocket message'));
        }, timeout);
        waiters.add(waiter);
      });
    },
  };
  clients.push(client);
  return client;
}

async function join(room, id, name) {
  const client = trackedClient(`${wsUrl}/ws?room=${encodeURIComponent(room)}`);
  await waitForOpen(client.socket);
  client.socket.send(JSON.stringify({ v: 1, type: 'join', member: { id, name } }));
  const snapshot = await client.next((message) => message.type === 'snapshot');
  return { client, snapshot };
}

test.before(async () => {
  service = createGalleyServer({ roomIdleMs: 5000 });
  const address = await service.listen(0, '127.0.0.1');
  httpUrl = `http://127.0.0.1:${address.port}`;
  wsUrl = `ws://127.0.0.1:${address.port}`;
});

test.after(async () => {
  for (const client of clients) client.socket.close();
  await service.close();
});

test('health endpoint reports the collaboration protocol', async () => {
  const response = await fetch(`${httpUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, app: 'GALLEY/74', protocol: 1 });
  assert.equal((await fetch(`${httpUrl}/server.js`)).status, 404);
  assert.equal((await fetch(`${httpUrl}/qa/browser-smoke.mjs`)).status, 404);
});

test('members receive snapshots, presence, and accepted document updates', async () => {
  const first = await join('LAUNCH-74', 'member-a', '林星');
  const second = await join('LAUNCH-74', 'member-b', '陈晨');
  assert.equal(first.snapshot.state.revision, 0);
  assert.equal(second.snapshot.members.length, 2);

  const presence = await first.client.next((message) => message.type === 'presence' && message.members.length === 2);
  assert.deepEqual(presence.members.map((member) => member.name).sort(), ['林星', '陈晨'].sort());

  first.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:update',
    baseRevision: 0,
    title: '跨设备发布稿',
    content: '<h1>第一版</h1><p>共同编辑的正文。</p>',
    comments: [{
      id: 'comment-1',
      text: '请补充发布日期',
      quote: '第一版',
      author: '林星',
      createdAt: '2026-08-31T00:10:00.000Z',
      resolved: false,
    }],
  }));

  const update = await second.client.next((message) => message.type === 'document:update' && message.state.revision === 1);
  assert.equal(update.state.title, '跨设备发布稿');
  assert.equal(update.state.comments[0].text, '请补充发布日期');
  assert.equal(update.source, 'member-a');
});

test('stale revisions are rejected without replacing the authoritative state', async () => {
  const member = await join('LAUNCH-74', 'member-c', '周青');
  assert.equal(member.snapshot.state.revision, 1);
  member.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:update',
    baseRevision: 0,
    title: '覆盖稿',
    content: '<p>不应覆盖</p>',
    comments: [],
  }));
  const conflict = await member.client.next((message) => message.type === 'document:conflict');
  assert.equal(conflict.code, 'revision_conflict');
  assert.equal(conflict.state.revision, 1);
  assert.equal(conflict.state.title, '跨设备发布稿');
});

test('rooms are isolated and unsafe document content is rejected', async () => {
  const other = await join('PRIVATE-74', 'member-z', '宋雨');
  assert.equal(other.snapshot.state.revision, 0);
  other.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:update',
    baseRevision: 0,
    title: '危险稿件',
    content: '<img src=x onerror="alert(1)">',
    comments: [],
  }));
  const error = await other.client.next((message) => message.type === 'error' && message.code === 'unsafe_content');
  assert.match(error.message, /文档内容/);

  other.client.socket.send(JSON.stringify({ v: 1, type: 'ping' }));
  const pong = await other.client.next((message) => message.type === 'pong');
  assert.equal(pong.v, 1);
});

test('a historical version is restored as a new revision for the room', async () => {
  const member = await join('LAUNCH-74', 'member-d', '何叶');
  member.client.socket.send(JSON.stringify({
    v: 1,
    type: 'version:restore',
    baseRevision: 1,
    targetRevision: 0,
  }));
  const restored = await member.client.next((message) => message.type === 'version:restored' && message.state.revision === 2);
  assert.equal(restored.state.title, '协作发布稿');
  assert.equal(restored.source, 'member-d');
});

test('deleting a collaborative draft clears the room for every member and rejects stale deletion', async () => {
  const first = await join('DELETE-74', 'member-delete-a', '林星');
  const second = await join('DELETE-74', 'member-delete-b', '陈晨');

  first.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:update',
    baseRevision: 0,
    title: '待撤回发布稿',
    content: '<p>这份协作稿会被删除。</p>',
    comments: [{
      id: 'comment-delete-1',
      text: '删除时一并清空',
      quote: '这份协作稿',
      author: '林星',
      createdAt: '2026-08-31T00:20:00.000Z',
      resolved: false,
    }],
  }));
  await second.client.next((message) => message.type === 'document:update' && message.state.revision === 1);

  second.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:delete',
    baseRevision: 1,
  }));

  const deletedForFirst = await first.client.next((message) => message.type === 'document:deleted' && message.state.revision === 2);
  const deletedForSecond = await second.client.next((message) => message.type === 'document:deleted' && message.state.revision === 2);
  assert.equal(deletedForFirst.source, 'member-delete-b');
  assert.equal(deletedForSecond.state.title, '未命名文档');
  assert.equal(deletedForSecond.state.content, '');
  assert.deepEqual(deletedForSecond.state.comments, []);
  assert.deepEqual(deletedForSecond.state.versions, []);

  first.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:delete',
    baseRevision: 1,
  }));
  const conflict = await first.client.next((message) => message.type === 'document:conflict' && message.state.revision === 2);
  assert.equal(conflict.state.title, '未命名文档');
});

test('deleting a room removes its instance, moves every member, and lets the old code reopen fresh', async () => {
  const roomName = 'REMOVE-ROOM-74';
  const replacementRoom = 'FRESH-ROOM-74';
  const first = await join(roomName, 'member-room-a', '林星');
  const second = await join(roomName, 'member-room-b', '陈晨');

  first.client.socket.send(JSON.stringify({
    v: 1,
    type: 'document:update',
    baseRevision: 0,
    title: '将随房间删除的稿件',
    content: '<p>旧房间实例不应保留这段正文。</p>',
    comments: [],
  }));
  await second.client.next((message) => message.type === 'document:update' && message.state.revision === 1);

  first.client.socket.send(JSON.stringify({
    v: 1,
    type: 'room:delete',
    baseRevision: 0,
    nextRoom: replacementRoom,
  }));
  const conflict = await first.client.next((message) => message.type === 'document:conflict' && message.state.revision === 1);
  assert.equal(conflict.state.title, '将随房间删除的稿件');
  assert.equal(service.rooms.has(roomName), true);

  const firstClosed = waitForClose(first.client.socket);
  const secondClosed = waitForClose(second.client.socket);
  second.client.socket.send(JSON.stringify({
    v: 1,
    type: 'room:delete',
    baseRevision: 1,
    nextRoom: replacementRoom,
  }));

  const deletedForFirst = await first.client.next((message) => message.type === 'room:deleted');
  const deletedForSecond = await second.client.next((message) => message.type === 'room:deleted');
  assert.deepEqual({
    room: deletedForFirst.room,
    nextRoom: deletedForFirst.nextRoom,
    source: deletedForFirst.source,
  }, {
    room: roomName,
    nextRoom: replacementRoom,
    source: 'member-room-b',
  });
  assert.equal(deletedForSecond.nextRoom, replacementRoom);
  assert.equal(await firstClosed, 4004);
  assert.equal(await secondClosed, 4004);
  assert.equal(service.rooms.has(roomName), false);

  const reopened = await join(roomName, 'member-room-new', '周青');
  assert.equal(reopened.snapshot.state.revision, 0);
  assert.equal(reopened.snapshot.state.title, '协作发布稿');
  assert.match(reopened.snapshot.state.content, /一起编辑这份校样/);
  assert.equal(reopened.snapshot.members.length, 1);
});
