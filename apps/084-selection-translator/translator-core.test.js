const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./translator-core.js');

test('normalizeText collapses reading whitespace without changing punctuation', () => {
  assert.equal(Core.normalizeText('  A quiet\n\nmargin\tkeeps ideas close.  '), 'A quiet margin keeps ideas close.');
  assert.equal(Core.normalizeText(null), '');
});

test('validateSelection rejects empty and oversized UTF-8 selections', () => {
  assert.deepEqual(Core.validateSelection('   '), {
    ok: false,
    code: 'empty-selection',
    message: '请先选择一段文字。',
  });

  const oversized = Core.validateSelection('译'.repeat(167));
  assert.equal(oversized.ok, false);
  assert.equal(oversized.code, 'selection-too-long');
  assert.match(oversized.message, /500 字节/);

  const valid = Core.validateSelection('Measure twice. Translate once.');
  assert.equal(valid.ok, true);
  assert.equal(valid.bytes, 30);
});

test('language pairs normalize aliases and prevent translating into the same language', () => {
  assert.deepEqual(Core.validateLanguagePair('ZH_cn', 'en'), {
    ok: true,
    source: 'zh-CN',
    target: 'en',
  });
  assert.equal(Core.validateLanguagePair('en', 'en').code, 'same-language');
  assert.equal(Core.validateLanguagePair('xx', 'en').code, 'unsupported-language');
});

test('cache keys are stable across incidental whitespace but retain language direction', () => {
  const first = Core.makeCacheKey(' Proof   copy ', 'en', 'zh-CN');
  const second = Core.makeCacheKey('Proof copy', 'en', 'zh-CN');
  assert.equal(first, second);
  assert.notEqual(first, Core.makeCacheKey('Proof copy', 'zh-CN', 'en'));
});

test('parseApiPayload accepts successful MyMemory responses and rejects malformed data', () => {
  assert.deepEqual(Core.parseApiPayload({
    responseStatus: 200,
    responseData: {
      translatedText: '留白让意思有呼吸。',
      detectedLanguage: 'en',
      match: 0.92,
    },
  }), {
    ok: true,
    text: '留白让意思有呼吸。',
    detectedSource: 'en',
    confidence: 0.92,
  });

  assert.equal(Core.parseApiPayload({ responseStatus: 429, responseData: {} }).code, 'remote-quota');
  assert.equal(Core.parseApiPayload({ responseStatus: 200, responseData: { translatedText: '' } }).code, 'invalid-response');
  assert.equal(Core.parseApiPayload(null).code, 'invalid-response');
});

test('localTranslate provides labeled exact fallbacks and never invents unknown text', () => {
  const exact = Core.localTranslate('Measure twice, translate once.', 'en', 'zh-CN');
  assert.deepEqual(exact, {
    ok: true,
    text: '先确认两遍，再翻译一次。',
    source: 'local-phrasebook',
    detectedSource: 'en',
    confidence: 1,
  });

  const detected = Core.localTranslate('语言不是替换词语，而是转移语境。', 'auto', 'en');
  assert.equal(detected.ok, true);
  assert.equal(detected.detectedSource, 'zh-CN');
  assert.equal(detected.text, 'Language is not word replacement; it is the transfer of context.');

  const missing = Core.localTranslate('This sentence is not bundled.', 'en', 'zh-CN');
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'local-miss');
});

test('mergeHistory deduplicates direction and text while bounding the ledger', () => {
  const existing = Array.from({ length: 4 }, (_, index) => ({
    id: `old-${index}`,
    sourceText: `Old ${index}`,
    translatedText: `旧 ${index}`,
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    createdAt: `2026-08-31T00:0${index}:00.000Z`,
  }));
  const entry = Core.createHistoryEntry({
    sourceText: 'Old 2',
    translatedText: '新的 2',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    provider: 'remote',
    createdAt: '2026-08-31T01:00:00.000Z',
  });

  const merged = Core.mergeHistory(existing, entry, 3);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].translatedText, '新的 2');
  assert.equal(merged.filter((item) => item.sourceText === 'Old 2').length, 1);
  assert.equal(merged[0].provider, 'remote');
});

test('buildApiUrl encodes the official 500-byte GET contract', () => {
  const url = new URL(Core.buildApiUrl('read & revise', 'en', 'zh-CN'));
  assert.equal(url.origin, 'https://api.mymemory.translated.net');
  assert.equal(url.pathname, '/get');
  assert.equal(url.searchParams.get('q'), 'read & revise');
  assert.equal(url.searchParams.get('langpair'), 'en|zh-CN');
  assert.equal(url.searchParams.get('mt'), '1');
});
