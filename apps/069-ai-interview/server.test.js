const test = require('node:test');
const assert = require('node:assert/strict');

const { createInterviewServer, buildMessages } = require('./server');

async function withServer(options, callback) {
  const server = createInterviewServer(options);
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

const config = {
  role: 'frontend', level: 'mid', type: 'comprehensive', questionCount: 3,
  focus: ['性能', '沟通'], jobDescription: '负责 React 应用与性能优化', aiEnabled: true,
};

const evaluationRequest = {
  action: 'evaluate',
  config,
  question: {
    id: 'performance', role: 'frontend', category: 'role',
    prompt: '你如何定位并改善一个首屏加载缓慢的页面？',
    hint: '说明指标与过程。', keywords: ['性能', '指标', '网络', '渲染'],
  },
  answer: '我先用性能面板定位网络和渲染问题，把 LCP 从 4 秒降到 2 秒。',
};

test('builds bounded plan and evaluation messages without executable markup', () => {
  const planMessages = buildMessages({
    action: 'plan',
    config: { ...config, jobDescription: '<script>steal()</script>React 性能岗位' },
  });
  assert.equal(planMessages.length, 2);
  assert.equal(planMessages[0].role, 'system');
  assert.match(planMessages[0].content, /只返回 JSON/);
  assert.doesNotMatch(planMessages[1].content, /<script|steal/);
  assert.match(planMessages[1].content, /React 性能岗位/);

  const evaluateMessages = buildMessages({ ...evaluationRequest, answer: '<img src=x>回答内容' });
  assert.match(evaluateMessages[0].content, /relevance/);
  assert.doesNotMatch(evaluateMessages[1].content, /<img/);
});

test('serves only the public application assets with security headers', async () => {
  await withServer({}, async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /PANEL\/69/);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);

    const stylesheet = await fetch(`${baseUrl}/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /text\/css/);

    assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/..%2Finterview-core.test.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/qa/browser-smoke.mjs`)).status, 404);
  });
});

test('rejects invalid content types, actions, input and oversized bodies', async () => {
  await withServer({}, async (baseUrl) => {
    const wrongType = await fetch(`${baseUrl}/api/coach`, { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).code, 'CONTENT_TYPE_REQUIRED');

    const badAction = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete-everything' }),
    });
    assert.equal(badAction.status, 400);
    assert.equal((await badAction.json()).code, 'INVALID_ACTION');

    const missingAnswer = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'evaluate', config }),
    });
    assert.equal(missingAnswer.status, 400);
    assert.equal((await missingAnswer.json()).code, 'INVALID_EVALUATION_INPUT');

    const tooLarge = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'plan', config: { ...config, jobDescription: 'x'.repeat(34 * 1024) } }),
    });
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).code, 'BODY_TOO_LARGE');
  });
});

test('returns a stable unavailable response when credentials are not configured', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'plan', config }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'AI 教练未配置，本地面试仍可正常使用。', code: 'AI_NOT_CONFIGURED',
    });
  });
});

test('proxies and sanitizes configured question plans', async () => {
  let providerRequest;
  const fetchImpl = async (url, options) => {
    providerRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ questions: [
        { prompt: '<b>请介绍最能代表你的前端项目</b>', category: 'intro', hint: '说明角色和结果', keywords: ['项目', '角色', '结果'] },
        { prompt: '如何定位一次复杂的前端性能问题？', category: 'role', hint: '从指标和工具开始', keywords: ['性能', '指标', '工具'] },
        { prompt: '设计要求和性能预算冲突时你如何取舍？', category: 'scenario', hint: '说清用户价值', keywords: ['取舍', '性能', '用户'] },
      ] }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await withServer({
    fetchImpl,
    env: { AI_API_KEY: 'server-secret', AI_MODEL: 'configured-model', AI_BASE_URL: 'https://provider.example/v1/' },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'plan', config }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, 'ai');
    assert.equal(payload.questions.length, 3);
    assert.equal(payload.questions[0].prompt, '请介绍最能代表你的前端项目');
  });

  assert.equal(providerRequest.url, 'https://provider.example/v1/chat/completions');
  assert.equal(providerRequest.options.headers.authorization, 'Bearer server-secret');
  assert.equal(providerRequest.body.model, 'configured-model');
  assert.equal(providerRequest.body.store, false);
  assert.equal(providerRequest.body.messages.length, 2);
});

test('proxies and sanitizes configured answer evaluations', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ evaluation: {
      score: 86,
      dimensions: { relevance: 90, structure: 78, evidence: 88, depth: 84 },
      strengths: ['<b>指标具体</b>', '定位步骤清楚'],
      improvements: ['补充方案取舍'],
      followUp: '为什么优先优化 LCP？',
      suggestedOutline: ['结论', '定位', '结果'],
    } }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  await withServer({ fetchImpl, env: { AI_API_KEY: 'key', AI_MODEL: 'model' } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evaluationRequest),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.evaluation.score, 86);
    assert.equal(payload.evaluation.strengths[0], '指标具体');
    assert.equal(payload.evaluation.followUp, '为什么优先优化 LCP？');
  });
});

test('hides upstream response details behind a stable 503', async () => {
  const fetchImpl = async () => new Response('provider-secret-debug-body', { status: 401 });
  await withServer({ fetchImpl, env: { AI_API_KEY: 'secret-key', AI_MODEL: 'model' } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(evaluationRequest),
    });
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.match(text, /AI 教练暂时不可用/);
    assert.doesNotMatch(text, /provider-secret|401|secret-key/);
  });
});
