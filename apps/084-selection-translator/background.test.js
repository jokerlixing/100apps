const test = require('node:test');
const assert = require('node:assert/strict');

const Background = require('./background.js');

function createStorage(seed = {}) {
  const data = structuredClone(seed);
  return {
    data,
    async get(keys) {
      if (keys == null) return structuredClone(data);
      const wanted = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(wanted.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
    },
    async set(values) {
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]);
    },
  };
}

test('translateRequest stores a validated remote result in cache and history', async () => {
  const storage = createStorage();
  let requestedUrl = '';
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      async json() {
        return {
          responseStatus: 200,
          responseData: { translatedText: '语境随词语一起旅行。', detectedLanguage: 'en', match: 0.97 },
        };
      },
    };
  };

  const result = await Background.translateRequest({
    text: 'Words travel with context.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }, { storage, fetchImpl, timeoutMs: 50 });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'remote');
  assert.equal(result.text, '语境随词语一起旅行。');
  assert.match(requestedUrl, /^https:\/\/api\.mymemory\.translated\.net\/get\?/);
  assert.equal(storage.data.margin84History.length, 1);
  assert.equal(Object.keys(storage.data.margin84Cache).length, 1);
});

test('translateRequest reuses a cached result without another network request', async () => {
  const key = 'en>zh-CN:Cached sentence.';
  const storage = createStorage({
    margin84Cache: {
      [key]: {
        text: '缓存译文。',
        detectedSource: 'en',
        confidence: 0.88,
        savedAt: '2026-08-31T00:00:00.000Z',
      },
    },
  });
  let calls = 0;

  const result = await Background.translateRequest({
    text: 'Cached sentence.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }, { storage, fetchImpl: async () => { calls += 1; } });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'cache');
  assert.equal(result.text, '缓存译文。');
  assert.equal(calls, 0);
});

test('translateRequest uses the labeled local phrasebook after a remote failure', async () => {
  const storage = createStorage();
  const result = await Background.translateRequest({
    text: 'Measure twice, translate once.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }, {
    storage,
    fetchImpl: async () => { throw new Error('offline'); },
    timeoutMs: 10,
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'local-phrasebook');
  assert.equal(result.text, '先确认两遍，再翻译一次。');
  assert.match(result.note, /在线服务不可用/);
});

test('translateRequest returns actionable errors and does not invent a fallback', async () => {
  const storage = createStorage();
  const result = await Background.translateRequest({
    text: 'Unknown offline sentence.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
  }, {
    storage,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'network-unavailable');
  assert.match(result.message, /检查网络/);
  assert.equal(storage.data.margin84History, undefined);
});

test('translateRequest rejects oversized input before calling fetch', async () => {
  const storage = createStorage();
  let calls = 0;
  const result = await Background.translateRequest({
    text: '译'.repeat(167),
    sourceLanguage: 'zh-CN',
    targetLanguage: 'en',
  }, { storage, fetchImpl: async () => { calls += 1; } });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'selection-too-long');
  assert.equal(calls, 0);
});

test('pruneCache keeps only the newest bounded entries', () => {
  const cache = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`key-${index}`, {
    text: `value-${index}`,
    savedAt: new Date(2026, 0, 1, 0, index).toISOString(),
  }]));
  const pruned = Background.pruneCache(cache, 60);
  assert.equal(Object.keys(pruned).length, 60);
  assert.equal(pruned['key-0'], undefined);
  assert.equal(pruned['key-63'].text, 'value-63');
});
