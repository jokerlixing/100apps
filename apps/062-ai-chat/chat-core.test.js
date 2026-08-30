const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./chat-core.js');

test('normalizes compatible API bases to chat completions endpoints', () => {
  assert.equal(
    Core.normalizeEndpoint(' https://api.openai.com/v1/ '),
    'https://api.openai.com/v1/chat/completions'
  );
  assert.equal(
    Core.normalizeEndpoint('https://gateway.example/api/v1'),
    'https://gateway.example/api/v1/chat/completions'
  );
  assert.equal(
    Core.normalizeEndpoint('https://gateway.example/api/v1/chat/completions'),
    'https://gateway.example/api/v1/chat/completions'
  );
  assert.equal(
    Core.normalizeEndpoint('https://gateway.example'),
    'https://gateway.example/v1/chat/completions'
  );
});

test('allows loopback HTTP for local testing', () => {
  assert.equal(
    Core.normalizeEndpoint('http://127.0.0.1:4173/v1'),
    'http://127.0.0.1:4173/v1/chat/completions'
  );
  assert.equal(
    Core.normalizeEndpoint('http://localhost:8787/custom'),
    'http://localhost:8787/custom/chat/completions'
  );
  assert.equal(
    Core.normalizeEndpoint('http://[::1]:8787/v1'),
    'http://[::1]:8787/v1/chat/completions'
  );
});

test('rejects unsafe or ambiguous endpoint URLs', () => {
  for (const value of [
    '',
    'not a url',
    'javascript:alert(1)',
    'http://api.example.com/v1',
    'https://user:pass@api.example.com/v1',
    'https://api.example.com/v1#secret',
    'https://api.example.com/v1?key=secret'
  ]) {
    assert.throws(() => Core.normalizeEndpoint(value), { name: 'ChatCoreError' }, value);
  }
});

test('sanitizes settings without preserving unknown properties', () => {
  const settings = Core.sanitizeSettings({
    endpoint: 'https://api.example.com/v1',
    model: '  demo-model  ',
    systemPrompt: '  Be concise.  ',
    temperature: '1.25',
    apiKey: 'must-not-survive',
    injected: true
  });

  assert.deepEqual(settings, {
    endpoint: 'https://api.example.com/v1/chat/completions',
    model: 'demo-model',
    systemPrompt: 'Be concise.',
    temperature: 1.25
  });
  assert.equal('apiKey' in settings, false);
  assert.equal('injected' in settings, false);
});

test('sanitizes invalid settings to safe defaults', () => {
  assert.deepEqual(Core.sanitizeSettings({
    endpoint: 'http://public.example/v1',
    model: '',
    systemPrompt: 42,
    temperature: 99
  }), {
    endpoint: '',
    model: '',
    systemPrompt: '',
    temperature: 0.7
  });
});

test('creates a clean conversation record', () => {
  const conversation = Core.createConversation({
    id: 'chat_fixed',
    now: '2026-08-31T00:00:00.000Z'
  });

  assert.deepEqual(conversation, {
    id: 'chat_fixed',
    title: '新对话',
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    messages: []
  });
});

test('sanitizes stored conversations and messages', () => {
  const result = Core.sanitizeConversation({
    id: 'chat_01',
    title: '  发布计划  ',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T11:00:00.000Z',
    unknown: 'discard',
    messages: [
      { id: 'm1', role: 'user', content: '  帮我写计划  ', createdAt: '2026-08-30T10:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: '可以。', status: 'stopped', createdAt: 'invalid' },
      { id: 'm3', role: 'tool', content: 'hidden' },
      { id: 'm4', role: 'assistant', content: '   ' }
    ]
  });

  assert.equal(result.id, 'chat_01');
  assert.equal(result.title, '发布计划');
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages.map(({ role, content, status }) => ({ role, content, status })), [
    { role: 'user', content: '帮我写计划', status: 'complete' },
    { role: 'assistant', content: '可以。', status: 'stopped' }
  ]);
  assert.equal('unknown' in result, false);
});

test('rejects inherited conversation payloads and invalid IDs', () => {
  const inherited = Object.create({ messages: [] });
  inherited.id = 'chat_bad';
  inherited.title = 'bad';

  assert.equal(Core.sanitizeConversation(inherited), null);
  assert.equal(Core.sanitizeConversation({ id: '../escape', messages: [] }), null);
});

test('derives short readable titles from the first prompt', () => {
  assert.equal(Core.deriveTitle('  # 请帮我\n\n制定一个发布计划  '), '请帮我 制定一个发布计划');
  assert.equal(Core.deriveTitle('abcdefghijklmnopqrstuvwxyz1234567890'), 'abcdefghijklmnopqrstuvwx…');
  assert.equal(Core.deriveTitle(''), '新对话');
});

test('builds bounded request context from the newest messages', () => {
  const messages = [
    { role: 'user', content: 'old question', status: 'complete' },
    { role: 'assistant', content: 'old answer', status: 'complete' },
    { role: 'user', content: 'new question', status: 'complete' },
    { role: 'assistant', content: 'partial answer', status: 'stopped' },
    { role: 'assistant', content: '', status: 'streaming' }
  ];

  assert.deepEqual(Core.buildRequestMessages(messages, ' Keep answers short. ', 28), [
    { role: 'system', content: 'Keep answers short.' },
    { role: 'user', content: 'new question' },
    { role: 'assistant', content: 'partial answer' }
  ]);
});

test('builds a minimal compatible streaming body', () => {
  const body = Core.buildRequestBody(
    { model: 'demo-model', temperature: 0.4 },
    [{ role: 'user', content: 'Hello' }]
  );

  assert.deepEqual(body, {
    model: 'demo-model',
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 0.4,
    stream: true
  });
  assert.throws(() => Core.buildRequestBody({ model: '' }, []), { name: 'ChatCoreError' });
});

test('parses SSE JSON across arbitrary chunks and recognizes done', () => {
  const events = [];
  const errors = [];
  let doneCount = 0;
  const parser = Core.createSSEParser({
    onEvent: (event) => events.push(event),
    onDone: () => { doneCount += 1; },
    onError: (error, raw) => errors.push({ error, raw })
  });

  parser.push(': keepalive\r\n\r\ndata: {"choices":[{"delta":{"con');
  parser.push('tent":"你"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\n');
  parser.push('data: [DONE]\n\n');
  parser.finish();

  assert.equal(events.length, 2);
  assert.equal(Core.extractDeltaText(events[0]), '你');
  assert.equal(Core.extractDeltaText(events[1]), '好');
  assert.equal(doneCount, 1);
  assert.deepEqual(errors, []);
});

test('joins multiple SSE data lines and reports malformed payloads', () => {
  const events = [];
  const errors = [];
  const parser = Core.createSSEParser({
    onEvent: (event) => events.push(event),
    onError: (_error, raw) => errors.push(raw)
  });

  parser.push('event: message\ndata: {"value":\ndata: 1}\n\n');
  parser.push('data: not-json\n\n');
  parser.finish();

  assert.deepEqual(events, [{ value: 1 }]);
  assert.deepEqual(errors, ['not-json']);
});

test('flushes a final SSE event without a trailing blank line', () => {
  const events = [];
  const parser = Core.createSSEParser({ onEvent: (event) => events.push(event) });
  parser.push('data: {"choices":[{"delta":{"content":"final"}}]}');
  parser.finish();
  assert.equal(Core.extractDeltaText(events[0]), 'final');
});

test('extracts text from string and content-part deltas safely', () => {
  assert.equal(Core.extractDeltaText({ choices: [{ delta: { content: 'hello' } }] }), 'hello');
  assert.equal(Core.extractDeltaText({ choices: [{ delta: { content: [
    { type: 'text', text: 'a' },
    { type: 'output_text', text: 'b' },
    { type: 'image', image_url: 'ignored' }
  ] } }] }), 'ab');
  assert.equal(Core.extractDeltaText({ choices: [] }), '');
  assert.equal(Core.extractDeltaText(null), '');
});
