const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./ocr-core.js');

const imageFile = (overrides = {}) => ({
  name: 'receipt.png',
  type: 'image/png',
  size: 2_400_000,
  ...overrides,
});

test('validateImageFile accepts supported images inside batch limits', () => {
  assert.deepEqual(Core.validateImageFile(imageFile(), 0), { ok: true, error: '' });
  assert.deepEqual(Core.validateImageFile(imageFile({ type: 'image/jpeg' }), 11), { ok: true, error: '' });
});

test('validateImageFile rejects malformed, unsupported, oversized, and overflow files', () => {
  assert.match(Core.validateImageFile(null, 0).error, /无法读取/);
  assert.match(Core.validateImageFile(imageFile({ type: 'application/pdf' }), 0).error, /PNG、JPEG、WebP 或 BMP/);
  assert.match(Core.validateImageFile(imageFile({ size: Core.LIMITS.maxFileBytes + 1 }), 0).error, /15 MB/);
  assert.match(Core.validateImageFile(imageFile(), Core.LIMITS.maxFiles).error, /12 张/);
});

test('normalizeLanguage returns safe model metadata and falls back to simplified Chinese', () => {
  assert.deepEqual(Core.normalizeLanguage('eng'), {
    id: 'eng',
    code: 'eng',
    label: '仅英文',
  });
  assert.equal(Core.normalizeLanguage('zh-hant').code, 'chi_tra+eng');
  assert.equal(Core.normalizeLanguage('unknown').id, 'zh-hans');
});

test('createQueueItem clamps metadata into a serializable waiting record', () => {
  const item = Core.createQueueItem({
    id: 'item-01',
    name: '  invoice 01?.png  ',
    size: 3200,
    width: 1400.8,
    height: 900.2,
  });

  assert.equal(item.id, 'item-01');
  assert.equal(item.name, 'invoice 01?.png');
  assert.equal(item.width, 1401);
  assert.equal(item.height, 900);
  assert.equal(item.status, 'queued');
  assert.equal(item.progress, 0);
  assert.equal(item.text, '');
  assert.equal(item.error, '');
});

test('updateQueueItem changes one item immutably and normalizes progress', () => {
  const first = Core.createQueueItem({ id: 'a', name: 'a.png' });
  const second = Core.createQueueItem({ id: 'b', name: 'b.png' });
  const original = [first, second];
  const result = Core.updateQueueItem(original, 'b', {
    status: 'running',
    progress: 1.4,
    phase: 'recognizing text',
  });

  assert.notEqual(result, original);
  assert.equal(result[0], first);
  assert.notEqual(result[1], second);
  assert.equal(result[1].progress, 1);
  assert.equal(result[1].status, 'running');
  assert.equal(second.status, 'queued');
});

test('summarizeQueue reports completed, failed, pending, characters, and mean confidence', () => {
  const items = [
    { ...Core.createQueueItem({ id: 'a', name: 'a.png' }), status: 'done', text: '你好 world', confidence: 92 },
    { ...Core.createQueueItem({ id: 'b', name: 'b.png' }), status: 'done', text: '第二页', confidence: 78 },
    { ...Core.createQueueItem({ id: 'c', name: 'c.png' }), status: 'failed', error: 'bad image' },
    Core.createQueueItem({ id: 'd', name: 'd.png' }),
  ];

  assert.deepEqual(Core.summarizeQueue(items), {
    total: 4,
    completed: 2,
    failed: 1,
    pending: 1,
    characters: 10,
    confidence: 85,
  });
});

test('calculateProcessingSize respects edge and pixel budgets without upscaling', () => {
  assert.deepEqual(Core.calculateProcessingSize(1200, 800), { width: 1200, height: 800, scale: 1 });
  const wide = Core.calculateProcessingSize(8000, 4000, 2600, 12_000_000);
  assert.deepEqual(wide, { width: 2600, height: 1300, scale: 0.325 });
  const pixels = Core.calculateProcessingSize(5000, 5000, 6000, 12_000_000);
  assert.equal(pixels.width, 3464);
  assert.equal(pixels.height, 3464);
  assert.ok(pixels.scale < 0.7);
});

test('format helpers are deterministic and user-facing', () => {
  assert.equal(Core.formatBytes(1536), '1.5 KB');
  assert.equal(Core.formatBytes(2_621_440), '2.5 MB');
  assert.equal(Core.formatDuration(920), '0.9 秒');
  assert.equal(Core.formatDuration(65_300), '1分05秒');
  assert.equal(Core.formatConfidence(91.6), '92%');
  assert.equal(Core.formatConfidence(null), '—');
});

test('phaseLabel translates worker phases and uses actual progress', () => {
  assert.equal(Core.phaseLabel('loading tesseract core', 0), '加载识别引擎');
  assert.equal(Core.phaseLabel('loading language traineddata', 0.3), '下载语言模型 · 30%');
  assert.equal(Core.phaseLabel('recognizing text', 0.72), '识别文字 · 72%');
  assert.equal(Core.phaseLabel('unknown', 0.4), '准备识别');
});

test('normalizeRecognizedText preserves useful line breaks and removes noisy whitespace', () => {
  const value = Core.normalizeRecognizedText('  第一行  \r\n\r\n\r\n  第二行\t\t内容  \n');
  assert.equal(value, '第一行\n\n第二行 内容');
});

test('safeTextFilename removes filesystem punctuation and preserves useful names', () => {
  assert.equal(Core.safeTextFilename(' 发票 / 2026:08?.png '), '发票-2026-08.txt');
  assert.equal(Core.safeTextFilename('....'), 'GLYPH64-识别结果.txt');
});

test('createBatchText includes only completed non-empty results in queue order', () => {
  const items = [
    { ...Core.createQueueItem({ id: 'a', name: 'invoice.png' }), status: 'done', text: '金额：128 元' },
    { ...Core.createQueueItem({ id: 'b', name: 'blank.png' }), status: 'done', text: '   ' },
    { ...Core.createQueueItem({ id: 'c', name: 'note.jpg' }), status: 'failed', text: '不要导出' },
    { ...Core.createQueueItem({ id: 'd', name: 'menu.webp' }), status: 'done', text: 'MENU\nCoffee' },
  ];

  assert.equal(
    Core.createBatchText(items),
    'GLYPH/64 批量识别结果\n\n===== invoice.png =====\n金额：128 元\n\n===== menu.webp =====\nMENU\nCoffee',
  );
});
