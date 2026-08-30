const test = require('node:test');
const assert = require('node:assert/strict');

const { createShopServer } = require('./server');

async function withServer(run) {
  const server = createShopServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves the storefront and assets with defensive headers', async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await page.text(), /云岫山货铺/);

    const stylesheet = await fetch(`${baseUrl}/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /^text\/css/);

    const head = await fetch(`${baseUrl}/app.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});

test('rejects unknown paths, traversal attempts, and unsupported methods', async () => {
  await withServer(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/missing.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/..%2f..%2fREADME.md`)).status, 404);
    const post = await fetch(`${baseUrl}/`, { method: 'POST', body: 'nope' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  });
});
