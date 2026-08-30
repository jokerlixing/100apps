const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./wallpaper-core.js');

const raw = (overrides = {}) => ({
  start_date: '20260830',
  end_date: '20260831',
  url: 'https://www.bing.com/th?id=OHR.Sample_ZH-CN_UHD.jpg',
  copyright: '海边的白色灯塔，中国 (© Example/Getty Images)',
  copyright_link: 'https://www.bing.com/search?q=sample',
  source: 'bing',
  ...overrides,
});

test('normalizeWallpaper maps the API shape to a stable safe record', () => {
  const result = Core.normalizeWallpaper(raw());

  assert.equal(result.date, '2026-08-30');
  assert.equal(result.title, '海边的白色灯塔');
  assert.equal(result.url, raw().url);
  assert.equal(result.copyrightLink, raw().copyright_link);
  assert.equal(result.source, 'bing');
  assert.match(result.id, /^2026-08-30-[a-z0-9]+$/);
  assert.equal(Core.normalizeWallpaper(raw()).id, result.id);
});

test('normalizeWallpaper rejects unsafe or incomplete remote records', () => {
  assert.equal(Core.normalizeWallpaper(raw({ url: 'javascript:alert(1)' })), null);
  assert.equal(Core.normalizeWallpaper(raw({ start_date: 'not-a-date' })), null);
  assert.equal(Core.normalizeWallpaper(raw({ url: '' })), null);
  assert.equal(Core.normalizeWallpaper(null), null);
});

test('normalizeWallpaper accepts the cached normalized shape', () => {
  const result = Core.normalizeWallpaper({
    date: '2026-08-29',
    url: 'https://example.com/day.jpg',
    title: '山谷晨雾',
    copyright: '山谷晨雾 (© Example)',
    copyrightLink: 'https://example.com/about',
    source: 'cache',
  });

  assert.equal(result.date, '2026-08-29');
  assert.equal(result.title, '山谷晨雾');
  assert.equal(result.source, 'cache');
});

test('normalizeCollection sorts newest first and keeps one record per date', () => {
  const result = Core.normalizeCollection([
    raw({ start_date: '20260828', url: 'https://example.com/28.jpg' }),
    raw({ start_date: '20260830', url: 'https://example.com/30.jpg' }),
    raw({ start_date: '20260830', url: 'https://example.com/duplicate.jpg' }),
    raw({ start_date: '20260829', url: 'https://example.com/29.jpg' }),
  ]);

  assert.deepEqual(result.map((item) => item.date), ['2026-08-30', '2026-08-29', '2026-08-28']);
  assert.equal(result[0].url, 'https://example.com/30.jpg');
});

test('mergeWithCache favors live records, fills gaps, and respects the limit', () => {
  const live = [raw({ start_date: '20260830', url: 'https://example.com/live-30.jpg' })];
  const cached = [
    raw({ start_date: '20260830', url: 'https://example.com/cache-30.jpg', source: 'cache' }),
    raw({ start_date: '20260829', url: 'https://example.com/cache-29.jpg', source: 'cache' }),
    raw({ start_date: '20260828', url: 'https://example.com/cache-28.jpg', source: 'cache' }),
  ];

  const result = Core.mergeWithCache(live, cached, 2);

  assert.deepEqual(result.map((item) => item.date), ['2026-08-30', '2026-08-29']);
  assert.equal(result[0].url, 'https://example.com/live-30.jpg');
});

test('toggleFavorite is immutable, unique, and reversible', () => {
  const original = ['day-a'];
  const added = Core.toggleFavorite(original, 'day-b');
  const removed = Core.toggleFavorite(added, 'day-a');

  assert.deepEqual(original, ['day-a']);
  assert.deepEqual(added, ['day-b', 'day-a']);
  assert.deepEqual(removed, ['day-b']);
  assert.deepEqual(Core.toggleFavorite(['day-a', 'day-a'], 'day-a'), []);
});

test('selectHomepage toggles the current choice and rejects empty IDs', () => {
  assert.equal(Core.selectHomepage(null, 'day-a'), 'day-a');
  assert.equal(Core.selectHomepage('day-a', 'day-a'), null);
  assert.equal(Core.selectHomepage('day-a', ''), 'day-a');
});

test('hydratePreferenceIds removes stale and duplicate IDs', () => {
  const collection = Core.normalizeCollection([
    raw({ start_date: '20260830', url: 'https://example.com/30.jpg' }),
    raw({ start_date: '20260829', url: 'https://example.com/29.jpg' }),
  ]);
  const [first, second] = collection.map((item) => item.id);

  assert.deepEqual(Core.hydratePreferenceIds([second, 'missing', second, first], collection), [second, first]);
  assert.deepEqual(Core.hydratePreferenceIds('invalid', collection), []);
});

test('formatDisplayDate and filename stay deterministic', () => {
  assert.equal(Core.formatDisplayDate('2026-08-30'), '8月30日 · 星期日');
  assert.equal(Core.formatDisplayDate('invalid'), '日期未知');
  assert.equal(Core.createDownloadName({ date: '2026-08-30', title: '海 / 灯塔?' }), 'LUMEN-2026-08-30-海-灯塔.jpg');
});
