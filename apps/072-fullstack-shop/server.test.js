const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');

const core = require('./shop-core');
const { createShopServer, createOrderRepository, resolvePublicFile } = require('./server');

const SHOP_A = 'shop_aaaaaaaaaaaaaaaa';
const SHOP_B = 'shop_bbbbbbbbbbbbbbbb';

async function withTempStore(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'counter72-'));
  const storePath = path.join(directory, 'orders.json');
  try { return await run({ directory, storePath }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function startServer(options = {}) {
  const server = createShopServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function orderPayload(overrides = {}) {
  return {
    cart: [{ id: 'mk-01', qty: 2, price: 1 }],
    customer: { nickname: '阿岚', phoneSuffix: '0831', pickupSlot: 'sat-am' },
    shopKey: SHOP_A,
    idempotencyKey: 'idem_aaaaaaaaaaaaaaaa',
    ...overrides
  };
}

async function postJson(baseUrl, pathname, payload, options = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('resolves only the explicit public asset allowlist', () => {
  const root = path.resolve(__dirname);
  assert.equal(resolvePublicFile('/', root), path.join(root, 'index.html'));
  assert.equal(resolvePublicFile('/styles.css', root), path.join(root, 'styles.css'));
  assert.equal(resolvePublicFile('/../server.js', root), null);
  assert.equal(resolvePublicFile('/server.js', root), null);
});

test('serves the market interface, catalog API and blocks private files', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const home = await fetch(`${app.baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /COUNTER\/72/);

    const catalog = await fetch(`${app.baseUrl}/api/products`).then((response) => response.json());
    assert.equal(catalog.products.length, 12);

    const privateFile = await fetch(`${app.baseUrl}/server.js`);
    assert.equal(privateFile.status, 404);
  } finally { await app.close(); }
}));

test('rejects non-JSON, malformed and oversized request bodies', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const wrongType = await fetch(`${app.baseUrl}/api/orders`, { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);

    const malformed = await fetch(`${app.baseUrl}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);

    const oversized = await postJson(app.baseUrl, '/api/orders', { padding: 'x'.repeat(33000) });
    assert.equal(oversized.status, 413);
  } finally { await app.close(); }
}));

test('recalculates client prices and returns one order for a repeated idempotency key', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath, { now: () => new Date('2026-08-31T04:00:00.000Z'), random: () => 0.3 }) });
  try {
    const firstResponse = await postJson(app.baseUrl, '/api/orders', orderPayload());
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.created, true);
    assert.equal(first.order.totals.total, core.PRODUCTS[0].price * 2);

    const repeatResponse = await postJson(app.baseUrl, '/api/orders', orderPayload());
    assert.equal(repeatResponse.status, 200);
    const repeat = await repeatResponse.json();
    assert.equal(repeat.created, false);
    assert.equal(repeat.order.id, first.order.id);

    const list = await fetch(`${app.baseUrl}/api/orders?shopKey=${SHOP_A}`).then((response) => response.json());
    assert.equal(list.orders.length, 1);
  } finally { await app.close(); }
}));

test('rejects unknown products and quantities above trusted stock', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const unknown = await postJson(app.baseUrl, '/api/orders', orderPayload({ cart: [{ id: 'missing', qty: 1 }] }));
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).code, 'INVALID_CART');

    const overstock = await postJson(app.baseUrl, '/api/orders', orderPayload({ cart: [{ id: 'mk-10', qty: 99 }] }));
    assert.equal(overstock.status, 409);
    assert.equal((await overstock.json()).code, 'OUT_OF_STOCK');
  } finally { await app.close(); }
}));

test('scopes reads and transitions by shop key and enforces the state machine', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const created = await postJson(app.baseUrl, '/api/orders', orderPayload()).then((response) => response.json());
    const hidden = await fetch(`${app.baseUrl}/api/orders?shopKey=${SHOP_B}`).then((response) => response.json());
    assert.deepEqual(hidden.orders, []);

    const wrongShop = await postJson(app.baseUrl, `/api/orders/${created.order.id}`, { shopKey: SHOP_B, status: 'ready' }, { method: 'PATCH' });
    assert.equal(wrongShop.status, 404);

    const readyResponse = await postJson(app.baseUrl, `/api/orders/${created.order.id}`, { shopKey: SHOP_A, status: 'ready' }, { method: 'PATCH' });
    assert.equal(readyResponse.status, 200);
    assert.equal((await readyResponse.json()).order.status, 'ready');

    const invalid = await postJson(app.baseUrl, `/api/orders/${created.order.id}`, { shopKey: SHOP_A, status: 'cancelled' }, { method: 'PATCH' });
    assert.equal(invalid.status, 409);

    const completed = await postJson(app.baseUrl, `/api/orders/${created.order.id}`, { shopKey: SHOP_A, status: 'completed' }, { method: 'PATCH' });
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).order.status, 'completed');
  } finally { await app.close(); }
}));

test('supports cancellation only before an order is ready', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const created = await postJson(app.baseUrl, '/api/orders', orderPayload({ idempotencyKey: 'idem_cancel0000000000' })).then((response) => response.json());
    const cancelled = await postJson(app.baseUrl, `/api/orders/${created.order.id}`, { shopKey: SHOP_A, status: 'cancelled' }, { method: 'PATCH' });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).order.status, 'cancelled');
  } finally { await app.close(); }
}));

test('clears only completed orders for the requesting shop key', async () => withTempStore(async ({ storePath }) => {
  const app = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const completedA = await postJson(app.baseUrl, '/api/orders', orderPayload({ idempotencyKey: 'idem_clearcompleted01' })).then((response) => response.json());
    await postJson(app.baseUrl, `/api/orders/${completedA.order.id}`, { shopKey: SHOP_A, status: 'ready' }, { method: 'PATCH' });
    await postJson(app.baseUrl, `/api/orders/${completedA.order.id}`, { shopKey: SHOP_A, status: 'completed' }, { method: 'PATCH' });

    await postJson(app.baseUrl, '/api/orders', orderPayload({ idempotencyKey: 'idem_keep_preparing01' }));
    const completedB = await postJson(app.baseUrl, '/api/orders', orderPayload({ shopKey: SHOP_B, idempotencyKey: 'idem_othercompleted12' })).then((response) => response.json());
    await postJson(app.baseUrl, `/api/orders/${completedB.order.id}`, { shopKey: SHOP_B, status: 'ready' }, { method: 'PATCH' });
    await postJson(app.baseUrl, `/api/orders/${completedB.order.id}`, { shopKey: SHOP_B, status: 'completed' }, { method: 'PATCH' });

    const cleared = await postJson(app.baseUrl, '/api/orders/completed', { shopKey: SHOP_A }, { method: 'DELETE' });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await cleared.json(), { removed: 1 });

    const shopA = await fetch(`${app.baseUrl}/api/orders?shopKey=${SHOP_A}`).then((response) => response.json());
    assert.equal(shopA.orders.length, 1);
    assert.equal(shopA.orders[0].status, 'preparing');

    const shopB = await fetch(`${app.baseUrl}/api/orders?shopKey=${SHOP_B}`).then((response) => response.json());
    assert.equal(shopB.orders.length, 1);
    assert.equal(shopB.orders[0].status, 'completed');

    const repeated = await postJson(app.baseUrl, '/api/orders/completed', { shopKey: SHOP_A }, { method: 'DELETE' });
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { removed: 0 });
  } finally { await app.close(); }
}));

test('restores persisted orders and hides malformed store details behind a stable error', async () => withTempStore(async ({ storePath }) => {
  const first = await startServer({ repository: createOrderRepository(storePath) });
  await postJson(first.baseUrl, '/api/orders', orderPayload());
  await first.close();

  const second = await startServer({ repository: createOrderRepository(storePath) });
  const restored = await fetch(`${second.baseUrl}/api/orders?shopKey=${SHOP_A}`).then((response) => response.json());
  assert.equal(restored.orders.length, 1);
  await second.close();

  await writeFile(storePath, '{not-json', 'utf8');
  const broken = await startServer({ repository: createOrderRepository(storePath) });
  try {
    const response = await fetch(`${broken.baseUrl}/api/orders?shopKey=${SHOP_A}`);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, 'STORE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(payload), /counter72-|orders\.json|SyntaxError/);
  } finally { await broken.close(); }
}));
