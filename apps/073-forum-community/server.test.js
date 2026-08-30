const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createForumServer,
  createForumRepository,
  hashPassword,
  verifyPassword,
  resolvePublicFile,
} = require('./server');

async function tempStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadline73-'));
  return { directory, file: path.join(directory, 'forum.json') };
}

async function startServer(dataFile) {
  const server = createForumServer({ dataFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function json(baseUrl, pathname, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let payload = {};
  try { payload = await response.json(); } catch (_) { /* assertion can inspect empty payload */ }
  return { response, payload };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test('hashes passwords with unique salts and verifies without storing plaintext', async () => {
  const first = await hashPassword('thread73pass');
  const second = await hashPassword('thread73pass');
  assert.match(first.passwordSalt, /^[a-f0-9]{32}$/);
  assert.match(first.passwordHash, /^[a-f0-9]{128}$/);
  assert.notEqual(first.passwordSalt, second.passwordSalt);
  assert.equal(await verifyPassword('thread73pass', first), true);
  assert.equal(await verifyPassword('wrong73pass', first), false);
});

test('serves only the documented public files', () => {
  assert.equal(path.basename(resolvePublicFile('/')), 'index.html');
  assert.equal(path.basename(resolvePublicFile('/styles.css')), 'styles.css');
  assert.equal(path.basename(resolvePublicFile('/forum-core.js')), 'forum-core.js');
  assert.equal(resolvePublicFile('/../server.js'), null);
  assert.equal(resolvePublicFile('/%2e%2e/server.js'), null);
  assert.equal(resolvePublicFile('/server.test.js'), null);
});

test('bootstrap exposes seeded community content without credential fields', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const app = await startServer(store.file);
  t.after(() => app.close());

  const { response, payload } = await json(app.baseUrl, '/api/bootstrap');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('vary') || '', /Authorization/i);
  assert.equal(payload.currentUser, null);
  assert.ok(payload.users.length >= 4);
  assert.ok(payload.posts.length >= 5);
  assert.equal('passwordHash' in payload.users[0], false);
  assert.equal('likes' in payload.posts[0], false);
});

test('registers, logs in, authenticates bootstrap, and revokes opaque sessions', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const app = await startServer(store.file);
  t.after(() => app.close());

  const registered = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'paper_river', displayName: '纸河', bio: '做折页和小刊物', password: 'thread73pass' } });
  assert.equal(registered.response.status, 201);
  assert.match(registered.payload.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(registered.payload.user.username, 'paper_river');
  assert.equal('passwordHash' in registered.payload.user, false);

  const duplicate = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'paper_river', displayName: '另一人', password: 'thread73pass' } });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.payload.code, 'USERNAME_TAKEN');

  const wrong = await json(app.baseUrl, '/api/login', { method: 'POST', body: { username: 'paper_river', password: 'wrong73pass' } });
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.payload.code, 'INVALID_CREDENTIALS');

  const login = await json(app.baseUrl, '/api/login', { method: 'POST', body: { username: 'paper_river', password: 'thread73pass' } });
  assert.equal(login.response.status, 200);
  const authed = await json(app.baseUrl, '/api/bootstrap', { headers: bearer(login.payload.token) });
  assert.equal(authed.payload.currentUser.username, 'paper_river');

  const logout = await json(app.baseUrl, '/api/logout', { method: 'POST', headers: bearer(login.payload.token), body: {} });
  assert.equal(logout.response.status, 204);
  const revoked = await json(app.baseUrl, '/api/bootstrap', { headers: bearer(login.payload.token) });
  assert.equal(revoked.payload.currentUser, null);
});

test('protects publishing and keeps idempotent topics scoped to their author', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const app = await startServer(store.file);
  t.after(() => app.close());

  const input = {
    title: '这份折页的阅读入口足够明显吗？',
    body: '我把入口放在右下角的折痕旁，测试时两个人先从背面开始读。希望确认是方向标记还是折法说明不够清楚。',
    stage: 'draft', focus: '第一次展开的阅读方向', tags: ['平面', '排版'], idempotencyKey: 'publish_test_0001',
  };
  const denied = await json(app.baseUrl, '/api/posts', { method: 'POST', body: input });
  assert.equal(denied.response.status, 401);

  const firstUser = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'foldmaker', displayName: '折页员', password: 'thread73pass' } });
  const created = await json(app.baseUrl, '/api/posts', { method: 'POST', headers: bearer(firstUser.payload.token), body: input });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.post.authorId, firstUser.payload.user.id);

  const retried = await json(app.baseUrl, '/api/posts', { method: 'POST', headers: bearer(firstUser.payload.token), body: input });
  assert.equal(retried.response.status, 200);
  assert.equal(retried.payload.post.id, created.payload.post.id);
  assert.equal(retried.payload.replayed, true);

  const secondUser = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'soundmaker', displayName: '声音员', password: 'thread73pass' } });
  const otherRetry = await json(app.baseUrl, '/api/posts', { method: 'POST', headers: bearer(secondUser.payload.token), body: input });
  assert.equal(otherRetry.response.status, 201);
  assert.notEqual(otherRetry.payload.post.id, created.payload.post.id);
});

test('supports replies, same-thread quotes, likes, and private viewer bookmarks', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const app = await startServer(store.file);
  t.after(() => app.close());

  const owner = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'gameowner', displayName: '游戏作者', password: 'thread73pass' } });
  const reviewer = await json(app.baseUrl, '/api/register', { method: 'POST', body: { username: 'reviewer73', displayName: '评审者', password: 'thread73pass' } });
  const topic = await json(app.baseUrl, '/api/posts', { method: 'POST', headers: bearer(owner.payload.token), body: {
    title: '玩家会看懂这个按钮的代价吗？', body: '玩家按下按钮后会消耗最后一枚车票，现在按钮只有动作名称，没有任何关于回程的提示。',
    stage: 'prototype', focus: '行动之前的代价提示', tags: ['游戏', '写作'], idempotencyKey: 'topic_choice_73',
  } });
  const postId = topic.payload.post.id;

  const reply = await json(app.baseUrl, `/api/posts/${postId}/comments`, { method: 'POST', headers: bearer(reviewer.payload.token), body: { body: '可以先在物品栏把车票标成“最后一枚”，让代价在按钮出现前被看见。', idempotencyKey: 'reply_choice_73' } });
  assert.equal(reply.response.status, 201);
  const commentId = reply.payload.comment.id;

  const invalidQuote = await json(app.baseUrl, `/api/posts/${postId}/comments`, { method: 'POST', headers: bearer(owner.payload.token), body: { body: '我想引用一条不存在的回应来回复。', quoteCommentId: 'comment_missing', idempotencyKey: 'reply_bad_quote_73' } });
  assert.equal(invalidQuote.response.status, 400);
  assert.equal(invalidQuote.payload.code, 'INVALID_QUOTE');

  const quoted = await json(app.baseUrl, `/api/posts/${postId}/comments`, { method: 'POST', headers: bearer(owner.payload.token), body: { body: '“最后一枚”是很好的前置信号，我会放进物品标签。', quoteCommentId: commentId, idempotencyKey: 'reply_quote_73' } });
  assert.equal(quoted.response.status, 201);
  assert.equal(quoted.payload.comment.quoteCommentId, commentId);

  const liked = await json(app.baseUrl, `/api/posts/${postId}/reactions`, { method: 'POST', headers: bearer(reviewer.payload.token), body: { type: 'like' } });
  assert.equal(liked.payload.post.likedByViewer, true);
  const saved = await json(app.baseUrl, `/api/posts/${postId}/reactions`, { method: 'POST', headers: bearer(reviewer.payload.token), body: { type: 'bookmark' } });
  assert.equal(saved.payload.post.bookmarkedByViewer, true);
  const commentLiked = await json(app.baseUrl, `/api/posts/${postId}/comments/${commentId}/like`, { method: 'POST', headers: bearer(owner.payload.token), body: {} });
  assert.equal(commentLiked.payload.post.comments.find((comment) => comment.id === commentId).likedByViewer, true);

  const anonymous = await json(app.baseUrl, '/api/bootstrap');
  const anonymousPost = anonymous.payload.posts.find((post) => post.id === postId);
  assert.equal(anonymousPost.likeCount, 1);
  assert.equal(anonymousPost.bookmarkedByViewer, false);
});

test('rejects unsupported bodies and payloads over 48 KiB', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const app = await startServer(store.file);
  t.after(() => app.close());

  const wrongType = await fetch(`${app.baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' });
  assert.equal(wrongType.status, 415);
  const huge = await fetch(`${app.baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'large', password: 'x'.repeat(50 * 1024) }) });
  assert.equal(huge.status, 413);
});

test('persists users, topics, and interactions across repository reloads', async (t) => {
  const store = await tempStore();
  t.after(() => fs.rm(store.directory, { recursive: true, force: true }));
  const first = await startServer(store.file);
  const user = await json(first.baseUrl, '/api/register', { method: 'POST', body: { username: 'persist73', displayName: '留下的人', password: 'thread73pass' } });
  const topic = await json(first.baseUrl, '/api/posts', { method: 'POST', headers: bearer(user.payload.token), body: {
    title: '这条主题会在重启之后留下来吗？', body: '这是持久化边界的测试主题，正文足够长，并且不会写进仓库中的真实演示数据。', stage: 'idea', focus: '单进程 JSON 持久化', tags: ['写作'], idempotencyKey: 'persist_topic_73',
  } });
  await first.close();

  const second = await startServer(store.file);
  t.after(() => second.close());
  const bootstrap = await json(second.baseUrl, '/api/bootstrap', { headers: bearer(user.payload.token) });
  assert.equal(bootstrap.payload.currentUser.username, 'persist73');
  assert.ok(bootstrap.payload.posts.some((post) => post.id === topic.payload.post.id));

  const repository = createForumRepository({ dataFile: store.file });
  const snapshot = await repository.snapshot();
  const stored = snapshot.users.find((item) => item.username === 'persist73');
  assert.equal('passwordHash' in stored, true);
  assert.equal(JSON.stringify(snapshot).includes('thread73pass'), false);
});
