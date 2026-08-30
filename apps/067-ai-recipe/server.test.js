const test = require('node:test');
const assert = require('node:assert/strict');

const { createPantryServer, buildMessages } = require('./server');

async function withServer(options, callback) {
  const server = createPantryServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const request = {
  ingredients: ['番茄', '鸡蛋', '米饭'], servings: 2, maxMinutes: 30,
  diet: 'any', cuisine: '家常', exclude: [], utensils: [],
};

test('builds bounded provider messages without executable markup', () => {
  const messages = buildMessages({ ...request, ingredients: ['<script>x</script>番茄', ...request.ingredients] });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /只返回 JSON/);
  assert.equal(messages[1].role, 'user');
  assert.doesNotMatch(messages[1].content, /<script>/);
  assert.match(messages[1].content, /番茄/);
});

test('serves only public application assets', async () => {
  await withServer({}, async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /PANTRY\/67/);
    assert.match(home.headers.get('content-type'), /text\/html/);

    const stylesheet = await fetch(`${baseUrl}/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /text\/css/);

    const privateFile = await fetch(`${baseUrl}/server.js`);
    assert.equal(privateFile.status, 404);

    const traversal = await fetch(`${baseUrl}/..%2Frecipe-core.test.js`);
    assert.equal(traversal.status, 404);
  });
});

test('rejects invalid API content types and oversized bodies', async () => {
  await withServer({}, async (baseUrl) => {
    const wrongType = await fetch(`${baseUrl}/api/recommend`, { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).code, 'CONTENT_TYPE_REQUIRED');

    const tooLarge = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredients: ['x'.repeat(34 * 1024)] }),
    });
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).code, 'BODY_TOO_LARGE');
  });
});

test('returns a stable unavailable response when credentials are not configured', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'AI 增强未配置，本地推荐仍可正常使用。', code: 'AI_NOT_CONFIGURED',
    });
  });
});

test('proxies configured requests and sanitizes provider recipes', async () => {
  let providerRequest;
  const fetchImpl = async (url, options) => {
    providerRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ recipes: [{
        title: '<b>番茄鸡蛋焖饭</b>', cuisine: '家常', minutes: 28, difficulty: '容易', servings: 2,
        reason: '优先用掉番茄和鸡蛋',
        ingredients: [{ name: '西红柿', amount: '2 个' }, { name: '鸡蛋', amount: '2 个' }, { name: '大米', amount: '180 克' }],
        steps: ['大米洗净。', '食材入锅焖熟。'],
        nutrition: { calories: 520, protein: 20, carbs: 72, fat: 15 },
      }] }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await withServer({
    fetchImpl,
    env: { AI_API_KEY: 'server-secret', AI_MODEL: 'configured-model', AI_BASE_URL: 'https://provider.example/v1/' },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, 'ai');
    assert.equal(payload.recipes.length, 1);
    assert.equal(payload.recipes[0].title, '番茄鸡蛋焖饭');
    assert.deepEqual(payload.recipes[0].missing, ['大米']);
  });

  assert.equal(providerRequest.url, 'https://provider.example/v1/chat/completions');
  assert.equal(providerRequest.options.headers.authorization, 'Bearer server-secret');
  assert.equal(providerRequest.body.model, 'configured-model');
  assert.equal(providerRequest.body.store, false);
  assert.equal(providerRequest.body.messages.length, 2);
});

test('hides upstream response details behind a stable 503', async () => {
  const fetchImpl = async () => new Response('provider-secret-debug-body', { status: 401 });
  await withServer({ fetchImpl, env: { AI_API_KEY: 'key', AI_MODEL: 'model' } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommend`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /AI 增强暂时不可用/);
    assert.doesNotMatch(text, /provider-secret|401|key/);
  });
});
