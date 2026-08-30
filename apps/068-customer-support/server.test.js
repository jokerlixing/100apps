const test = require('node:test');
const assert = require('node:assert/strict');

const { createRelayServer, buildMessages, requestAIReply } = require('./server.js');

const FAQ = {
  id: 'shipping-progress',
  intent: 'shipping',
  question: '发货后怎么查询物流？',
  answer: '打开订单详情查看承运商、运单号和最新轨迹。',
  keywords: ['物流', '快递', '运单'],
  aliases: ['快递到哪里了'],
  suggestedReplies: ['物流不更新怎么办？'],
  enabled: true,
};

async function withServer(options, callback) {
  const server = createRelayServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('builds bounded prompts from sanitized knowledge and recent conversation', () => {
  const messages = buildMessages({
    question: '<b>我的物流呢？</b>',
    knowledgeBase: [FAQ, { ...FAQ, id: 'disabled', enabled: false }],
    conversation: Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `消息 ${index}` })),
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /只允许依据/);
  assert.equal(messages.at(-1).role, 'user');
  const request = JSON.parse(messages.at(-1).content);
  assert.equal(request.question, '我的物流呢');
  assert.equal(request.knowledgeBase.length, 1);
  assert.equal(request.conversation.length, 8);
  assert.doesNotMatch(JSON.stringify(request), /<b>/);
});

test('serves the application and rejects unknown static paths', async () => {
  await withServer({}, async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /RELAY\/68/);

    const nested = await fetch(`${baseUrl}/apps/068-customer-support/support-core.js`);
    assert.equal(nested.status, 200);
    assert.match(nested.headers.get('content-type'), /javascript/);

    const missing = await fetch(`${baseUrl}/server.js`);
    assert.equal(missing.status, 404);
  });
});

test('rejects non-JSON and oversized API requests', async () => {
  await withServer({}, async (baseUrl) => {
    const wrongType = await fetch(`${baseUrl}/api/reply`, { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).code, 'CONTENT_TYPE_REQUIRED');

    const oversized = await fetch(`${baseUrl}/api/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '物流', padding: 'x'.repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, 'BODY_TOO_LARGE');
  });
});

test('returns a stable not-configured response without credentials', async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '我的物流在哪里？', knowledgeBase: [FAQ] }),
    });
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, 'AI_NOT_CONFIGURED');
    assert.match(payload.error, /本地路由/);
  });
});

test('proxies a configured provider and returns a validated cited reply', async () => {
  let providerRequest;
  const fetchImpl = async (url, init) => {
    providerRequest = { url, init, body: JSON.parse(init.body) };
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify({
            answer: '<b>请在订单详情查看运单轨迹。</b>',
            intent: 'shipping',
            confidence: 0.91,
            citationIds: ['shipping-progress'],
            suggestedReplies: ['物流不更新怎么办？'],
          }) } }],
        };
      },
    };
  };
  const options = {
    env: { AI_API_KEY: 'server-secret', AI_MODEL: 'support-model', AI_BASE_URL: 'https://provider.example/v1/' },
    fetchImpl,
  };
  const direct = await requestAIReply({ question: '查物流', knowledgeBase: [FAQ] }, options);
  assert.equal(direct.answer, '请在订单详情查看运单轨迹。');
  assert.deepEqual([...direct.faqIds], ['shipping-progress']);
  assert.equal(providerRequest.url, 'https://provider.example/v1/chat/completions');
  assert.equal(providerRequest.init.headers.authorization, 'Bearer server-secret');
  assert.equal(providerRequest.body.model, 'support-model');
  assert.doesNotMatch(JSON.stringify(providerRequest.body), /server-secret/);

  await withServer(options, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '查物流', knowledgeBase: [FAQ] }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, 'ai');
    assert.equal(payload.reply.source, 'ai');
    assert.deepEqual(payload.reply.faqIds, ['shipping-progress']);
  });
});

test('rejects unknown citations and hides upstream failure details', async () => {
  const invalidCitation = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify({ answer: '编造答案', citationIds: ['secret-card'] }) } }] };
    },
  });
  await withServer({ env: { AI_API_KEY: 'key', AI_MODEL: 'model' }, fetchImpl: invalidCitation }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '查物流', knowledgeBase: [FAQ] }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AI_INVALID_RESPONSE');
  });

  const upstreamFailure = async () => { throw new Error('provider internal token=do-not-leak'); };
  await withServer({ env: { AI_API_KEY: 'key', AI_MODEL: 'model' }, fetchImpl: upstreamFailure }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '查物流', knowledgeBase: [FAQ] }),
    });
    assert.equal(response.status, 503);
    const body = JSON.stringify(await response.json());
    assert.match(body, /AI_UNAVAILABLE/);
    assert.doesNotMatch(body, /do-not-leak|token/);
  });
});
