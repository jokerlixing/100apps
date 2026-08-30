const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BULLET_COLORS,
  cleanText,
  normalizeBullet,
  cleanBullets,
  bulletsForVideo,
  getDueBullets,
  assignLanes,
  clampProgress,
  formatTime,
  nextVideoIndex,
  normalizeSettings,
  normalizeProgress
} = require('./video-core');

test('cleans danmaku text without interpreting control characters or excess length', () => {
  assert.equal(cleanText('  今晚\u0000 的   镜头\n真好看  '), '今晚 的 镜头 真好看');
  assert.equal(Array.from(cleanText('光'.repeat(80))).length, 60);
  assert.equal(cleanText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  assert.equal(cleanText(' \n\t '), '');
});

test('normalizes one bullet into a stable, safe record', () => {
  const bullet = normalizeBullet({
    id: ' bullet_01 ',
    videoId: 'film-01',
    text: '  开场的光线很漂亮  ',
    time: '12.75',
    color: '#e9a45b',
    createdAt: '1788110000000'
  });

  assert.deepEqual(bullet, {
    id: 'bullet_01',
    videoId: 'film-01',
    text: '开场的光线很漂亮',
    time: 12.75,
    color: '#E9A45B',
    createdAt: 1788110000000
  });
  assert.equal(normalizeBullet({ id: 'x', videoId: 'film-01', text: 'ok', time: 2 }), null);
  assert.equal(normalizeBullet({ id: 'bullet_02', videoId: 'bad id', text: 'ok', time: 2 }), null);
  assert.equal(normalizeBullet({ id: 'bullet_02', videoId: 'film-01', text: ' ', time: 2 }), null);
});

test('cleans, deduplicates, sorts and caps persisted danmaku', () => {
  const rows = cleanBullets([
    { id: 'bullet_02', videoId: 'film-01', text: 'later', time: 8, color: '#FFFFFF', createdAt: 2 },
    { id: 'bullet_01', videoId: 'film-01', text: 'first', time: 2, color: '#8EC7D3', createdAt: 1 },
    { id: 'bullet_01', videoId: 'film-01', text: 'duplicate', time: 3, color: '#FFFFFF', createdAt: 3 },
    { id: 'bad', videoId: 'film-01', text: '', time: 1 }
  ], 2);

  assert.deepEqual(rows.map((row) => row.id), ['bullet_01', 'bullet_02']);
  assert.equal(rows[0].color, '#8EC7D3');
});

test('selects only due danmaku for the current video and time window', () => {
  const rows = cleanBullets([
    { id: 'bullet_01', videoId: 'film-01', text: 'one', time: 5, color: '#FFFFFF', createdAt: 1 },
    { id: 'bullet_02', videoId: 'film-01', text: 'two', time: 5.35, color: '#FFFFFF', createdAt: 2 },
    { id: 'bullet_03', videoId: 'film-02', text: 'other', time: 5.1, color: '#FFFFFF', createdAt: 3 }
  ]);

  assert.deepEqual(bulletsForVideo(rows, 'film-01').map((row) => row.id), ['bullet_01', 'bullet_02']);
  assert.deepEqual(getDueBullets(rows, 'film-01', 5.2, 0.25).map((row) => row.id), ['bullet_01', 'bullet_02']);
  assert.deepEqual(getDueBullets(rows, 'film-02', 5.2, 0.05).map((row) => row.id), []);
});

test('assigns bursts across bounded deterministic lanes', () => {
  const assigned = assignLanes([
    { id: 'a', time: 1 },
    { id: 'b', time: 1 },
    { id: 'c', time: 2 },
    { id: 'd', time: 2 }
  ], 3, 1);

  assert.deepEqual(assigned.map((row) => row.lane), [1, 2, 0, 1]);
  assert.deepEqual(assignLanes([{ id: 'a' }], 0), [{ id: 'a', lane: 0 }]);
});

test('clamps progress and formats playback time', () => {
  assert.equal(clampProgress(37.4, 120), 37.4);
  assert.equal(clampProgress(-2, 120), 0);
  assert.equal(clampProgress(999, 120), 120);
  assert.equal(clampProgress(20, Number.NaN), 0);
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65.9), '01:05');
  assert.equal(formatTime(3725), '1:02:05');
});

test('advances only when auto play is enabled and wraps the playlist', () => {
  assert.equal(nextVideoIndex(0, 3, true), 1);
  assert.equal(nextVideoIndex(2, 3, true), 0);
  assert.equal(nextVideoIndex(1, 3, false), -1);
  assert.equal(nextVideoIndex(9, 0, true), -1);
});

test('normalizes player settings to supported values', () => {
  assert.deepEqual(normalizeSettings({
    bulletsVisible: false,
    autoNext: false,
    volume: 4,
    rate: 1.5,
    muted: true
  }), {
    bulletsVisible: false,
    autoNext: false,
    volume: 1,
    rate: 1.5,
    muted: true
  });
  assert.equal(normalizeSettings({ rate: 9 }).rate, 1);
  assert.equal(normalizeSettings(null).bulletsVisible, true);
  assert.deepEqual(BULLET_COLORS, ['#FFFFFF', '#F2E7D2', '#E9A45B', '#8EC7D3', '#D96C6C']);
});

test('keeps progress only for known remote videos', () => {
  const progress = normalizeProgress({
    'film-01': 31.25,
    'film-02': -5,
    'local-99': 22,
    missing: 'oops'
  }, ['film-01', 'film-02']);

  assert.deepEqual(progress, { 'film-01': 31.25, 'film-02': 0 });
});
