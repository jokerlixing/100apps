const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALLOWED_COLORS,
  normalizeMessage,
  chooseLane,
  normalizePreferences,
  formatAudience,
  getAmbientDelay,
  canSend,
} = require('./danmaku-core.js');

test('normalizeMessage collapses whitespace and preserves valid presentation choices', () => {
  const result = normalizeMessage(
    { text: '  今晚   的鼓点 太稳了  ', author: '  星河  ', mode: 'top', color: '#f1ad3d' },
    1_725_000_000_000,
  );

  assert.equal(result.ok, true);
  assert.equal(result.message.text, '今晚 的鼓点 太稳了');
  assert.equal(result.message.author, '星河');
  assert.equal(result.message.mode, 'top');
  assert.equal(result.message.color, '#f1ad3d');
  assert.equal(result.message.createdAt, 1_725_000_000_000);
  assert.match(result.message.id, /^wave-1725000000000-/);
});

test('normalizeMessage rejects empty and overlong messages with actionable errors', () => {
  assert.deepEqual(normalizeMessage({ text: '   ' }), {
    ok: false,
    error: '输入一句弹幕再发送',
  });

  const result = normalizeMessage({ text: '浪'.repeat(49) });
  assert.equal(result.ok, false);
  assert.equal(result.error, '弹幕最多 48 个字');
});

test('normalizeMessage falls back from untrusted mode, color and author values', () => {
  const result = normalizeMessage({
    text: '<img src=x onerror=alert(1)>',
    author: 'A'.repeat(30),
    mode: 'script',
    color: 'url(javascript:alert(1))',
  }, 42);

  assert.equal(result.ok, true);
  assert.equal(result.message.text, '<img src=x onerror=alert(1)>');
  assert.equal(result.message.author.length, 16);
  assert.equal(result.message.mode, 'scroll');
  assert.equal(result.message.color, ALLOWED_COLORS[0]);
});

test('chooseLane uses the first cooled lane and otherwise the least recently used lane', () => {
  assert.equal(chooseLane([9_500, 1_000, 8_000], 10_000, 2_500), 1);
  assert.equal(chooseLane([8_000, 7_000, 6_000], 10_000, 5_000), 2);
  assert.equal(chooseLane([], 10_000, 2_500), 0);
});

test('normalizePreferences clamps numeric settings and ignores unsupported choices', () => {
  const preferences = normalizePreferences({
    mode: 'sideways',
    color: '#ff8b73',
    opacity: 9,
    speed: 0.1,
    density: 'chaos',
    danmakuVisible: 0,
    muted: 1,
    volume: -2,
    theater: true,
  });

  assert.deepEqual(preferences, {
    mode: 'scroll',
    color: '#ff8b73',
    opacity: 1,
    speed: 0.7,
    density: 'balanced',
    danmakuVisible: false,
    muted: true,
    volume: 0,
    theater: true,
  });
});

test('formatAudience produces compact Chinese live-room counts', () => {
  assert.equal(formatAudience(932), '932');
  assert.equal(formatAudience(9_999), '9,999');
  assert.equal(formatAudience(12_840), '1.3万');
  assert.equal(formatAudience(108_000_000), '1.1亿');
  assert.equal(formatAudience(-10), '0');
});

test('ambient timing reflects selected density and deterministic random input', () => {
  assert.equal(getAmbientDelay('low', 0), 3_000);
  assert.equal(getAmbientDelay('balanced', 0.5), 1_800);
  assert.equal(getAmbientDelay('high', 1), 1_050);
});

test('canSend enforces a short anti-spam cooldown', () => {
  assert.equal(canSend(1_000, 1_899), false);
  assert.equal(canSend(1_000, 1_900), true);
  assert.equal(canSend(0, 100), true);
});
