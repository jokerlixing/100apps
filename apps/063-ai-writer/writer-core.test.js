const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./writer-core.js');

test('countTextMetrics counts Chinese characters and Latin words predictably', () => {
  const metrics = Core.countTextMetrics('你好 AI writer');

  assert.equal(metrics.characters, 10);
  assert.equal(metrics.words, 4);
  assert.equal(metrics.paragraphs, 1);
  assert.equal(metrics.readingMinutes, 1);
  assert.deepEqual(Core.countTextMetrics('  '), {
    characters: 0,
    words: 0,
    paragraphs: 0,
    readingMinutes: 0,
  });
});

test('buildPrompt encodes the selected operation, strength, constraints, and source', () => {
  const prompt = Core.buildPrompt({
    text: '请保留产品名 MARGIN。',
    mode: 'polish',
    strength: 'conservative',
    preserveTerms: 'MARGIN, API Key',
    notes: '不要使用感叹号',
  });

  assert.match(prompt.system, /资深中文编辑/);
  assert.match(prompt.user, /润色/);
  assert.match(prompt.user, /保守/);
  assert.match(prompt.user, /MARGIN、API Key/);
  assert.match(prompt.user, /不要使用感叹号/);
  assert.match(prompt.user, /请保留产品名 MARGIN/);
});

test('buildPrompt includes translation target and style names', () => {
  const translated = Core.buildPrompt({
    text: '让表达更清楚。',
    mode: 'translate',
    targetLanguage: 'English',
  });
  const styled = Core.buildPrompt({
    text: '让表达更清楚。',
    mode: 'style',
    style: 'social',
  });

  assert.match(translated.user, /翻译为 English/);
  assert.match(styled.user, /社交媒体/);
});

test('buildPrompt rejects empty text and unknown modes', () => {
  assert.throws(() => Core.buildPrompt({ text: ' ', mode: 'polish' }), /原稿/);
  assert.throws(() => Core.buildPrompt({ text: 'hello', mode: 'unknown' }), /模式/);
});

test('validateProviderSettings requires safe endpoint and model only in remote mode', () => {
  assert.deepEqual(Core.validateProviderSettings({ provider: 'demo' }), { valid: true, errors: [] });

  const missing = Core.validateProviderSettings({ provider: 'remote', endpoint: '', model: '' });
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.errors, ['请填写接口地址', '请填写模型名称']);

  const unsafe = Core.validateProviderSettings({
    provider: 'remote',
    endpoint: 'http://example.com/v1/chat/completions',
    model: 'writer-model',
  });
  assert.equal(unsafe.valid, false);
  assert.match(unsafe.errors[0], /HTTPS/);

  assert.equal(Core.validateProviderSettings({
    provider: 'remote',
    endpoint: 'http://127.0.0.1:8787/v1/chat/completions',
    model: 'writer-model',
  }).valid, true);
});

test('parseSSEBuffer preserves a fragmented event for the next chunk', () => {
  const first = Core.parseSSEBuffer('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"cho');

  assert.equal(first.events.length, 1);
  assert.equal(Core.extractResponseText(first.events[0]), '你');
  assert.equal(first.done, false);
  assert.equal(first.remainder, 'data: {"cho');

  const second = Core.parseSSEBuffer(`${first.remainder}ices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n`);
  assert.equal(second.events.length, 1);
  assert.equal(Core.extractResponseText(second.events[0]), '好');
  assert.equal(second.done, true);
  assert.equal(second.remainder, '');
});

test('extractResponseText accepts streaming and non-streaming compatible shapes', () => {
  assert.equal(Core.extractResponseText({ choices: [{ delta: { content: '流' } }] }), '流');
  assert.equal(Core.extractResponseText({ choices: [{ message: { content: '完整回复' } }] }), '完整回复');
  assert.equal(Core.extractResponseText({ output_text: '输出文本' }), '输出文本');
  assert.equal(Core.extractResponseText({ type: 'response.output_text.delta', delta: '增量' }), '增量');
  assert.equal(Core.extractResponseText({ output: [{ content: [{ type: 'output_text', text: '嵌套文本' }] }] }), '嵌套文本');
  assert.equal(Core.extractResponseText({ error: { message: 'bad' } }), '');
});

test('createDemoRewrite returns honest, deterministic output for every mode', () => {
  const base = { text: '我觉得其实  这个功能非常非常重要, 需要认真说明.', strength: 'balanced' };
  const polish = Core.createDemoRewrite({ ...base, mode: 'polish' });

  assert.match(polish, /^【本地演示/);
  assert.doesNotMatch(polish, /  /);
  assert.doesNotMatch(polish, /非常非常/);

  for (const mode of ['expand', 'translate', 'style']) {
    const output = Core.createDemoRewrite({
      ...base,
      mode,
      targetLanguage: 'English',
      style: 'professional',
    });
    assert.match(output, /^【本地演示/);
    assert.ok(output.length > base.text.length);
  }
});

test('diffText exposes inserted and deleted text without generating HTML', () => {
  const inserted = Core.diffText('我们做产品', '我们认真做产品');
  const deleted = Core.diffText('文字非常清楚', '文字清楚');

  assert.equal(inserted.filter((segment) => segment.type === 'add').map((segment) => segment.text).join(''), '认真');
  assert.equal(deleted.filter((segment) => segment.type === 'delete').map((segment) => segment.text).join(''), '非常');
  assert.ok(inserted.every((segment) => !segment.text.includes('<mark>')));
});

test('diffText falls back safely for oversized inputs', () => {
  const before = '甲'.repeat(500);
  const after = '乙'.repeat(500);
  const segments = Core.diffText(before, after, 120);

  assert.deepEqual(segments.map((segment) => segment.type), ['delete', 'add']);
  assert.equal(segments[0].text.length, 500);
  assert.equal(segments[1].text.length, 500);
});
