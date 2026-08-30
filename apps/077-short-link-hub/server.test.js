const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server.js');

async function withServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'route-77-'));
  const storePath = path.join(tempDir, 'links.json');
  let tick = Date.parse('2026-08-31T02:00:00.000Z');
  const server = createServer({ storePath, now: () => tick++ });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ origin, storePath });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('serves the application with security headers and blocks unknown files', async () => {
  await withServer(async ({ origin }) => {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /cdn\.jsdelivr\.net/);
    assert.match(await page.text(), /ROUTE\/77/);

    const traversal = await fetch(`${origin}/..%2fserver.js`);
    assert.equal(traversal.status, 404);
    assert.equal(traversal.headers.get('x-content-type-options'), 'nosniff');
  });
});

test('reports health and starts with a seeded workspace', async () => {
  await withServer(async ({ origin }) => {
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.deepEqual(health, { ok: true, app: 'route-77', storage: 'json-file' });
    const payload = await fetch(`${origin}/api/links`).then((response) => response.json());
    assert.equal(payload.links.length, 4);
    assert.equal(payload.links.some((link) => link.slug === 'autumn-market'), true);
  });
});

test('creates a route, redirects safely and records an attributed visit', async () => {
  await withServer(async ({ origin }) => {
    const createdResponse = await fetch(`${origin}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'https://example.org/launch', slug: 'launch-day', label: 'Launch' }),
    });
    assert.equal(createdResponse.status, 201);
    const { link } = await createdResponse.json();

    const redirect = await fetch(`${origin}/r/launch-day?src=wechat`, {
      redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; Mobile)' },
    });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'https://example.org/launch');

    const routes = await fetch(`${origin}/api/links`).then((response) => response.json());
    const updated = routes.links.find((item) => item.id === link.id);
    assert.equal(updated.visits.length, 1);
    assert.equal(updated.visits[0].source, '微信');
    assert.equal(updated.visits[0].device, '手机');
  });
});

test('rejects unsafe targets, reserved aliases, duplicates and oversized JSON', async () => {
  await withServer(async ({ origin }) => {
    const request = (body) => fetch(`${origin}/api/links`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await request({ target: 'javascript:alert(1)', slug: 'unsafe-route' })).status, 400);
    assert.equal((await request({ target: 'https://example.com', slug: 'api' })).status, 400);
    assert.equal((await request({ target: 'https://example.com', slug: 'unique-route' })).status, 201);
    assert.equal((await request({ target: 'https://example.org', slug: 'unique-route' })).status, 400);

    const oversized = await fetch(`${origin}/api/links`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"target":"https://example.com","padding":"${'x'.repeat(35 * 1024)}"}`,
    });
    assert.equal(oversized.status, 413);
  });
});

test('pauses and deletes a route with controlled status codes', async () => {
  await withServer(async ({ origin }) => {
    const created = await fetch(`${origin}/api/links`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'https://example.com/pause', slug: 'pause-route' }),
    }).then((response) => response.json());
    const endpoint = `${origin}/api/links/${encodeURIComponent(created.link.id)}`;

    const paused = await fetch(endpoint, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: false }),
    });
    assert.equal(paused.status, 200);
    assert.equal((await fetch(`${origin}/r/pause-route`, { redirect: 'manual' })).status, 410);
    assert.equal((await fetch(endpoint, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(endpoint, { method: 'DELETE' })).status, 404);
  });
});

test('HEAD resolves a short route without inflating visit analytics', async () => {
  await withServer(async ({ origin }) => {
    const before = await fetch(`${origin}/api/links`).then((response) => response.json());
    const original = before.links.find((link) => link.slug === 'autumn-market');
    const head = await fetch(`${origin}/r/autumn-market`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(head.status, 302);
    const after = await fetch(`${origin}/api/links`).then((response) => response.json());
    assert.equal(after.links.find((link) => link.id === original.id).visits.length, original.visits.length);
  });
});

test('persists mutations and can restore the demo workspace', async () => {
  await withServer(async ({ origin, storePath }) => {
    await fetch(`${origin}/api/links`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'https://example.com/persist', slug: 'persist-route' }),
    });
    const persisted = JSON.parse(await fs.readFile(storePath, 'utf8'));
    assert.equal(persisted.links.some((link) => link.slug === 'persist-route'), true);

    const reset = await fetch(`${origin}/api/reset`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }).then((response) => response.json());
    assert.equal(reset.links.length, 4);
    assert.equal(reset.links.some((link) => link.slug === 'persist-route'), false);
  });
});
