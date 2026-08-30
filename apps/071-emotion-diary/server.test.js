const test = require('node:test');
const assert = require('node:assert/strict');

const { createEmotionServer, buildMessages, requestAIInsights } = require('./server.js');

function todayKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function payload(overrides = {}) {
  return {
    version: 1,
    rangeDays: 14,
    includeNotes: false,
    records: [
      { date: todayKey(-2), mood: 3, energy: 2, emotions: ['疲惫'], factors: ['工作'] },
      { date: todayKey(-1), mood: 4, energy: 3, emotions: ['平静'], factors: ['睡眠'] },
      { date: todayKey(), mood: 5, energy: 4, emotions: ['感激'], factors: ['运动'] },
    ],
    ...overrides,
  };
}

async function withServer(options, callback) {
  const server = createEmotionServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('static server exposes only public app assets and rejects traversal', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get('content-type'), /text\/html/);
    assert.match(await root.text(), /TIDE\/71/);

    const core = await fetch(`${baseUrl}/emotion-core.js`);
    assert.equal(core.status, 200);
    assert.match(core.headers.get('content-type'), /javascript/);

    const traversal = await fetch(`${baseUrl}/%2e%2e/server.js`);
    assert.equal(traversal.status, 404);
    assert.doesNotMatch(await traversal.text(), /AI_API_KEY/);

    const unknown = await fetch(`${baseUrl}/private.txt`);
    assert.equal(unknown.status, 404);
  });
});

test('insight endpoint enforces method, JSON content type and bounded valid bodies', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/insights`)).status, 405);
    assert.equal((await fetch(`${baseUrl}/api/insights`, { method: 'POST', body: '{}' })).status, 415);

    const invalid = await fetch(`${baseUrl}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload({ records: [{ date: 'never', mood: 9, energy: 0 }] })),
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /有效记录/);

    const oversized = await fetch(`${baseUrl}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(50 * 1024) }),
    });
    assert.equal(oversized.status, 413);
  });
});

test('insight endpoint returns a stable 503 when credentials are absent', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'AI 反思服务尚未配置。' });
  });
});

test('buildMessages sends minimal bounded records and explicitly forbids diagnosis', () => {
  const messages = buildMessages(payload({
    includeNotes: true,
    records: [{
      date: todayKey(), mood: 4, energy: 3, emotions: ['平静', '未知'], factors: ['睡眠'],
      noteExcerpt: `<b>${'今天'.repeat(200)}</b>`,
    }],
  }));
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /不得诊断/);
  assert.match(messages[0].content, /JSON/);
  assert.doesNotMatch(messages[1].content, /<b>/);
  const sent = JSON.parse(messages[1].content);
  assert.equal(sent.records[0].noteExcerpt.length, 240);
  assert.deepEqual(sent.records[0].emotions, ['平静']);
});

test('configured endpoint sanitizes provider output and never returns unsafe claims', async () => {
  let capturedRequest;
  const fetchImpl = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        observations: ['<b>最近三条心情逐步上升。</b>', '你患有抑郁症。'],
        questions: ['哪一个小变化最值得继续？'],
        actions: ['明天留两分钟记录精力。'],
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await withServer({
    env: { AI_API_KEY: 'secret-key', AI_MODEL: 'test-model', AI_BASE_URL: 'https://provider.example/v1' },
    fetchImpl,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.insights.observations, ['最近三条心情逐步上升。']);
    assert.match(body.insights.disclaimer, /不能替代/);
  });

  assert.equal(capturedRequest.url, 'https://provider.example/v1/chat/completions');
  assert.equal(capturedRequest.init.headers.Authorization, 'Bearer secret-key');
  const providerBody = JSON.parse(capturedRequest.init.body);
  assert.equal(providerBody.model, 'test-model');
  assert.equal(providerBody.messages.length, 2);
  assert.equal(capturedRequest.init.body.includes('secret-key'), false);
});

test('upstream failures and malformed output are hidden behind stable errors', async () => {
  const env = { AI_API_KEY: 'secret', AI_BASE_URL: 'https://provider.example/v1' };
  const leakingFetch = async () => new Response('provider secret stack trace', { status: 500 });
  await withServer({ env, fetchImpl: leakingFetch }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /暂时不可用/);
    assert.doesNotMatch(text, /provider|secret|stack/i);
  });

  await assert.rejects(
    () => requestAIInsights(payload(), { env, fetchImpl: async () => new Response('{"choices":[]}', { status: 200 }) }),
    /invalid provider response/i,
  );
});
