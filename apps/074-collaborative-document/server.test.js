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
