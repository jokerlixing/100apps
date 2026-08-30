'use strict';

const http = require('node:http');
const path = require('node:path');
const { readFile, writeFile, rename, mkdir } = require('node:fs/promises');
const core = require('./shop-core');

const BODY_LIMIT = 32 * 1024;
const PUBLIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/shop-core.js': ['shop-core.js', 'text/javascript; charset=utf-8']
});

function serviceError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function validKey(value, prefix) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{16,64}$`).test(String(value || ''));
}

function wrapStoreError() {
  return serviceError('STORE_UNAVAILABLE', '订单存储暂时不可用', 503);
}

function createOrderRepository(storePath, options = {}) {
  const resolvedPath = path.resolve(storePath);
  let loaded;
  let mutationQueue = Promise.resolve();

  async function load() {
    if (!loaded) {
      loaded = (async () => {
        try {
          const content = await readFile(resolvedPath, 'utf8');
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed)) throw new Error('store root must be an array');
          return parsed.filter((order) => order && typeof order === 'object' && order.id && order.shopKey);
        } catch (error) {
          if (error && error.code === 'ENOENT') return [];
          throw wrapStoreError();
        }
      })();
    }
    return loaded;
  }

  async function persist(orders) {
    try {
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      const temporary = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(orders, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, resolvedPath);
    } catch (_) {
      throw wrapStoreError();
    }
  }

  function mutate(operation) {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => {});
    return next;
  }

  return {
    path: resolvedPath,
    async list(shopKey) {
      await mutationQueue;
      const orders = await load();
      return orders.filter((order) => order.shopKey === shopKey).map(core.publicOrder);
    },
    async create(payload) {
      return mutate(async () => {
        const orders = await load();
        const existing = core.findIdempotentOrder(orders, payload.shopKey, payload.idempotencyKey);
        if (existing) return { order: core.publicOrder(existing), created: false };
        const order = core.createOrder({ ...payload, source: 'server' }, { now: options.now, random: options.random });
        orders.unshift(order);
        if (orders.length > 500) orders.length = 500;
        await persist(orders);
        return { order: core.publicOrder(order), created: true };
      });
    },
    async transition(id, shopKey, nextStatus) {
      return mutate(async () => {
        const orders = await load();
        const index = orders.findIndex((order) => order.id === id && order.shopKey === shopKey);
        if (index < 0) throw serviceError('ORDER_NOT_FOUND', '没有找到这张订单', 404);
        const updated = core.transitionOrder(orders[index], nextStatus, { now: options.now });
        orders[index] = updated;
        await persist(orders);
        return core.publicOrder(updated);
      });
    }
  };
}

function resolvePublicFile(pathname, rootDirectory) {
  const entry = PUBLIC_FILES[pathname];
  if (!entry) return null;
  return path.join(path.resolve(rootDirectory), entry[0]);
}

async function readJsonBody(request) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw serviceError('JSON_REQUIRED', '请使用 application/json 提交', 415);
  const declaredSize = Number(request.headers['content-length'] || 0);
  if (declaredSize > BODY_LIMIT) throw serviceError('BODY_TOO_LARGE', '请求内容超过 32 KiB', 413);

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw serviceError('BODY_TOO_LARGE', '请求内容超过 32 KiB', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) {
    throw serviceError('INVALID_JSON', 'JSON 内容无法解析', 400);
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(body);
}

function errorStatus(error) {
  if (Number.isInteger(error && error.status)) return error.status;
  if (error && error.code === 'OUT_OF_STOCK') return 409;
  if (error && error.code === 'INVALID_TRANSITION') return 409;
  if (error && ['EMPTY_CART', 'INVALID_CART', 'INVALID_CHECKOUT', 'INVALID_SHOP_KEY', 'INVALID_IDEMPOTENCY_KEY'].includes(error.code)) return 400;
  return 500;
}

function publicError(error) {
  const status = errorStatus(error);
  if (status === 500) return { status, code: 'INTERNAL_ERROR', message: '订单台暂时无法处理请求' };
  return { status, code: error.code || 'REQUEST_FAILED', message: error.message || '请求失败', ...(error.fields ? { fields: error.fields } : {}) };
}

function createShopServer(options = {}) {
  const rootDirectory = path.resolve(options.rootDirectory || __dirname);
  const storePath = options.storePath || process.env.ORDER_STORE_PATH || path.join(rootDirectory, 'data', 'orders.json');
  const repository = options.repository || createOrderRepository(storePath);

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');

      if (request.method === 'GET' && url.pathname === '/api/products') {
        sendJson(response, 200, { products: core.PRODUCTS });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/orders') {
        const shopKey = url.searchParams.get('shopKey');
        if (!validKey(shopKey, 'shop')) throw serviceError('INVALID_SHOP_KEY', '店铺键无效', 400);
        sendJson(response, 200, { orders: await repository.list(shopKey) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/orders') {
        const payload = await readJsonBody(request);
        const result = await repository.create(payload);
        sendJson(response, result.created ? 201 : 200, result);
        return;
      }

      const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (request.method === 'PATCH' && orderMatch) {
        const payload = await readJsonBody(request);
        if (!validKey(payload.shopKey, 'shop')) throw serviceError('INVALID_SHOP_KEY', '店铺键无效', 400);
        const id = decodeURIComponent(orderMatch[1]);
        const order = await repository.transition(id, payload.shopKey, String(payload.status || ''));
        sendJson(response, 200, { order });
        return;
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        const filePath = resolvePublicFile(url.pathname, rootDirectory);
        if (filePath) {
          const entry = PUBLIC_FILES[url.pathname];
          const content = await readFile(filePath);
          response.writeHead(200, {
            'Content-Type': entry[1],
            'Content-Length': content.length,
            'Cache-Control': url.pathname === '/' || url.pathname === '/index.html' ? 'no-cache' : 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin'
          });
          response.end(request.method === 'HEAD' ? undefined : content);
          return;
        }
      }

      sendJson(response, 404, { code: 'NOT_FOUND', message: '没有找到这个页面或接口' });
    } catch (error) {
      const failure = publicError(error);
      if (!response.headersSent) sendJson(response, failure.status, { code: failure.code, message: failure.message, ...(failure.fields ? { fields: failure.fields } : {}) });
      else response.destroy();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 4173;
  createShopServer().listen(port, '127.0.0.1', () => {
    console.log(`COUNTER/72 listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createShopServer, createOrderRepository, resolvePublicFile };
