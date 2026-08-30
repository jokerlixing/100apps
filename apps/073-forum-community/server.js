const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const core = require('./forum-core');

const ROOT = __dirname;
const BODY_LIMIT = 48 * 1024;
const PUBLIC_FILES = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'], ['/forum-core.js', 'forum-core.js'],
  ['/assets/screenshot-desktop.png', 'assets/screenshot-desktop.png'],
  ['/assets/screenshot-mobile.png', 'assets/screenshot-mobile.png'],
]);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

class HttpError extends Error {
  constructor(status, code, message, field) {
    super(message); this.status = status; this.code = code; this.field = field || '';
  }
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function tokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function secureToken() { return crypto.randomBytes(32).toString('base64url'); }
function defaultId(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`; }
function nowIso() { return new Date().toISOString(); }

function resolvePublicFile(rawPath) {
  let pathname = String(rawPath || '/').split('?')[0];
  try { pathname = decodeURIComponent(pathname); } catch (_) { return null; }
  const relative = PUBLIC_FILES.get(pathname);
  if (!relative) return null;
  const absolute = path.resolve(ROOT, relative);
  return absolute.startsWith(`${path.resolve(ROOT)}${path.sep}`) ? absolute : null;
}

function hashPassword(password, salt) {
  const passwordSalt = salt || crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => crypto.scrypt(String(password), passwordSalt, 64, (error, derived) => {
    if (error) reject(error);
    else resolve({ passwordSalt, passwordHash: derived.toString('hex') });
  }));
}

async function verifyPassword(password, record) {
  if (!record || !/^[a-f0-9]{32}$/.test(record.passwordSalt || '') || !/^[a-f0-9]{128}$/.test(record.passwordHash || '')) return false;
  const derived = await hashPassword(password, record.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(derived.passwordHash, 'hex'), Buffer.from(record.passwordHash, 'hex'));
}

function defaultState() {
  return { version: 1, users: clone(core.SEED_USERS), posts: clone(core.SEED_POSTS), sessions: [], idempotency: [] };
}

function validateState(value) {
  if (!value || !Array.isArray(value.users) || !Array.isArray(value.posts)) throw new HttpError(500, 'STORE_INVALID', '社区数据文件无法读取。');
  return {
    version: 1,
    users: value.users,
    posts: value.posts,
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    idempotency: Array.isArray(value.idempotency) ? value.idempotency : [],
  };
}

function createForumRepository(options = {}) {
  const dataFile = path.resolve(options.dataFile || process.env.FORUM_STORE_PATH || path.join(ROOT, 'data', 'forum.json'));
  const clock = typeof options.now === 'function' ? options.now : nowIso;
  const makeId = typeof options.id === 'function' ? options.id : defaultId;
  let state;
  let mutationQueue = Promise.resolve();

  const ready = (async () => {
    try { state = validateState(JSON.parse(await fs.readFile(dataFile, 'utf8'))); }
    catch (error) {
      if (error && error.code === 'ENOENT') state = defaultState();
      else if (error instanceof HttpError) throw error;
      else throw new HttpError(500, 'STORE_INVALID', '社区数据文件无法读取。');
    }
  })();

  async function persist() {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temp = `${dataFile}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temp, dataFile);
  }

  async function mutate(callback) {
    await ready;
    const run = mutationQueue.catch(() => {}).then(async () => {
      const result = await callback(state);
      await persist();
      return result;
    });
    mutationQueue = run;
    return run;
  }

  async function snapshot() {
    await ready; await mutationQueue.catch(() => {}); return clone(state);
  }

  async function findUserByUsername(username) {
    await ready; await mutationQueue.catch(() => {});
    return clone(state.users.find((user) => user.username === String(username || '').trim().toLowerCase()) || null);
  }

  async function getUserById(userId) {
    await ready; await mutationQueue.catch(() => {});
    return clone(state.users.find((user) => user.id === userId) || null);
  }

  async function register(normalized, passwordRecord) {
    return mutate((draft) => {
      if (draft.users.some((user) => user.username === normalized.username)) throw new HttpError(409, 'USERNAME_TAKEN', '这个用户名已经被使用。', 'username');
      const user = {
        id: makeId('user'), username: normalized.username, displayName: normalized.displayName, bio: normalized.bio,
        createdAt: clock(), passwordSalt: passwordRecord.passwordSalt, passwordHash: passwordRecord.passwordHash,
      };
      draft.users.push(user);
      return clone(user);
    });
  }

  async function createSession(userId) {
    const token = secureToken();
    await mutate((draft) => {
      draft.sessions = draft.sessions.filter((session) => session.userId !== userId || session.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      draft.sessions.push({ tokenHash: tokenHash(token), userId, createdAt: clock() });
    });
    return token;
  }

  async function userForToken(token) {
    if (!token) return null;
    await ready; await mutationQueue.catch(() => {});
    const session = state.sessions.find((item) => item.tokenHash === tokenHash(token));
    return session ? clone(state.users.find((user) => user.id === session.userId) || null) : null;
  }

  async function revokeToken(token) {
    return mutate((draft) => { draft.sessions = draft.sessions.filter((session) => session.tokenHash !== tokenHash(token)); });
  }

  function validateKey(key) {
    const value = String(key || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new HttpError(400, 'INVALID_IDEMPOTENCY', '操作标识无效。', 'idempotencyKey');
    return value;
  }

  async function createPost(userId, input) {
    const key = validateKey(input.idempotencyKey);
    return mutate((draft) => {
      const previous = draft.idempotency.find((item) => item.scope === `post:${userId}` && item.key === key);
      if (previous) return { post: clone(draft.posts.find((post) => post.id === previous.resultId)), replayed: true };
      const post = core.createPost(userId, input, { id: () => makeId('post'), now: clock });
      draft.posts.push(post); draft.idempotency.push({ scope: `post:${userId}`, key, resultId: post.id });
      return { post: clone(post), replayed: false };
    });
  }

  async function createComment(postId, userId, input) {
    const key = validateKey(input.idempotencyKey);
    return mutate((draft) => {
      const postIndex = draft.posts.findIndex((post) => post.id === postId);
      if (postIndex < 0) throw new HttpError(404, 'POST_NOT_FOUND', '主题不存在。');
      const previous = draft.idempotency.find((item) => item.scope === `comment:${userId}:${postId}` && item.key === key);
      if (previous) {
        const comment = draft.posts[postIndex].comments.find((item) => item.id === previous.resultId);
        return { post: clone(draft.posts[postIndex]), comment: clone(comment), replayed: true };
      }
      const result = core.createComment(draft.posts[postIndex], userId, input, { id: () => makeId('comment'), now: clock });
      draft.posts[postIndex] = result.post; draft.idempotency.push({ scope: `comment:${userId}:${postId}`, key, resultId: result.comment.id });
      return { post: clone(result.post), comment: clone(result.comment), replayed: false };
    });
  }

  async function togglePostReaction(postId, userId, type) {
    return mutate((draft) => {
      const index = draft.posts.findIndex((post) => post.id === postId);
      if (index < 0) throw new HttpError(404, 'POST_NOT_FOUND', '主题不存在。');
      const field = type === 'like' ? 'likes' : type === 'bookmark' ? 'bookmarks' : '';
      if (!field) throw new HttpError(400, 'INVALID_REACTION', '不支持的互动类型。', 'type');
      draft.posts[index] = core.toggleReaction(draft.posts[index], userId, field).entity;
      return clone(draft.posts[index]);
    });
  }

  async function toggleCommentLike(postId, commentId, userId) {
    return mutate((draft) => {
      const postIndex = draft.posts.findIndex((post) => post.id === postId);
      if (postIndex < 0) throw new HttpError(404, 'POST_NOT_FOUND', '主题不存在。');
      const commentIndex = draft.posts[postIndex].comments.findIndex((comment) => comment.id === commentId);
      if (commentIndex < 0) throw new HttpError(404, 'COMMENT_NOT_FOUND', '回应不存在。');
      draft.posts[postIndex].comments[commentIndex] = core.toggleReaction(draft.posts[postIndex].comments[commentIndex], userId, 'likes').entity;
      draft.posts[postIndex].updatedAt = clock();
      return clone(draft.posts[postIndex]);
    });
  }

  return {
    dataFile, snapshot, findUserByUsername, getUserById, register, createSession, userForToken,
    revokeToken, createPost, createComment, togglePostReaction, toggleCommentLike,
  };
}

function securityHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=300',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

function sendJson(response, status, payload) {
  const headers = { ...securityHeaders('application/json; charset=utf-8'), 'Cache-Control': 'no-store', Vary: 'Authorization' };
  if (status === 204) { response.writeHead(204, headers); response.end(); return; }
  const body = JSON.stringify(payload);
  response.writeHead(status, { ...headers, 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求必须使用 application/json。');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size <= BODY_LIMIT) chunks.push(chunk); }
  if (size > BODY_LIMIT) throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容不能超过 48 KiB。');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch (_) { throw new HttpError(400, 'INVALID_JSON', '请求内容不是有效 JSON。'); }
}

function bearerToken(request) {
  const match = String(request.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/);
  return match ? match[1] : '';
}

async function publicBootstrap(repository, viewer) {
  const snapshot = await repository.snapshot();
  const viewerId = viewer && viewer.id || '';
  return {
    currentUser: core.publicUser(viewer),
    users: snapshot.users.map(core.publicUser),
    posts: core.sortPosts(snapshot.posts, 'newest').map((post) => core.publicPost(post, viewerId)),
  };
}

function statusFor(error) {
  if (error && error.status) return error.status;
  if (error && error.code === 'AUTH_REQUIRED') return 401;
  if (error && ['POST_NOT_FOUND', 'COMMENT_NOT_FOUND'].includes(error.code)) return 404;
  if (error instanceof core.DomainError) return 400;
  return 500;
}

function createForumServer(options = {}) {
  const repository = options.repository || createForumRepository({ dataFile: options.dataFile });
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://threadline.local');
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        const token = bearerToken(request);
        const viewer = await repository.userForToken(token);

        if (request.method === 'GET' && pathname === '/api/bootstrap') {
          sendJson(response, 200, await publicBootstrap(repository, viewer)); return;
        }
        if (request.method === 'POST' && pathname === '/api/register') {
          const normalized = core.normalizeRegistration(await readBody(request));
          const passwordRecord = await hashPassword(normalized.password);
          const user = await repository.register(normalized, passwordRecord);
          const session = await repository.createSession(user.id);
          sendJson(response, 201, { token: session, user: core.publicUser(user) }); return;
        }
        if (request.method === 'POST' && pathname === '/api/login') {
          const body = await readBody(request);
          const username = String(body.username || '').trim().toLowerCase();
          const user = await repository.findUserByUsername(username);
          if (!user || !await verifyPassword(String(body.password || ''), user)) throw new HttpError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确。');
          const session = await repository.createSession(user.id);
          sendJson(response, 200, { token: session, user: core.publicUser(user) }); return;
        }
        if (request.method === 'POST' && pathname === '/api/logout') {
          await readBody(request);
          if (!viewer) throw new HttpError(401, 'AUTH_REQUIRED', '请先登录。');
          await repository.revokeToken(token); sendJson(response, 204, null); return;
        }

        if (!viewer) throw new HttpError(401, 'AUTH_REQUIRED', '请先登录或创建账号。');
        if (request.method === 'POST' && pathname === '/api/posts') {
          const result = await repository.createPost(viewer.id, await readBody(request));
          sendJson(response, result.replayed ? 200 : 201, { post: core.publicPost(result.post, viewer.id), replayed: result.replayed }); return;
        }
        let match = pathname.match(/^\/api\/posts\/([A-Za-z0-9_-]+)\/comments$/);
        if (request.method === 'POST' && match) {
          const result = await repository.createComment(match[1], viewer.id, await readBody(request));
          sendJson(response, result.replayed ? 200 : 201, { post: core.publicPost(result.post, viewer.id), comment: core.publicPost(result.post, viewer.id).comments.find((comment) => comment.id === result.comment.id), replayed: result.replayed }); return;
        }
        match = pathname.match(/^\/api\/posts\/([A-Za-z0-9_-]+)\/reactions$/);
        if (request.method === 'POST' && match) {
          const body = await readBody(request); const post = await repository.togglePostReaction(match[1], viewer.id, body.type);
          sendJson(response, 200, { post: core.publicPost(post, viewer.id) }); return;
        }
        match = pathname.match(/^\/api\/posts\/([A-Za-z0-9_-]+)\/comments\/([A-Za-z0-9_-]+)\/like$/);
        if (request.method === 'POST' && match) {
          await readBody(request); const post = await repository.toggleCommentLike(match[1], match[2], viewer.id);
          sendJson(response, 200, { post: core.publicPost(post, viewer.id) }); return;
        }
        throw new HttpError(404, 'NOT_FOUND', '接口不存在。');
      }

      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持这个请求方法。');
      const file = resolvePublicFile(request.url);
      if (!file) throw new HttpError(404, 'NOT_FOUND', '页面不存在。');
      const content = await fs.readFile(file);
      response.writeHead(200, { ...securityHeaders(MIME[path.extname(file)] || 'application/octet-stream'), 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = statusFor(error);
      const code = status === 500 ? (error && error.code === 'STORE_INVALID' ? 'STORE_INVALID' : 'INTERNAL_ERROR') : (error.code || 'REQUEST_FAILED');
      const message = status === 500 && code !== 'STORE_INVALID' ? '社区服务暂时无法完成请求。' : (error.message || '请求失败。');
      if (!response.headersSent) sendJson(response, status, { code, message, ...(error.field ? { field: error.field } : {}) });
      else response.destroy();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createForumServer();
  server.listen(port, '127.0.0.1', () => console.log(`THREADLINE/73 running at http://127.0.0.1:${port}`));
}

module.exports = { createForumServer, createForumRepository, hashPassword, verifyPassword, resolvePublicFile };
