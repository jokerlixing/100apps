(function initWaveCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WaveCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createWaveCore() {
  'use strict';

  const ALLOWED_MODES = Object.freeze(['scroll', 'top', 'bottom']);
  const ALLOWED_COLORS = Object.freeze([
    '#f3f0e7',
    '#f1ad3d',
    '#55b8aa',
    '#ff8b73',
    '#b7c9ff',
  ]);
  const DENSITIES = Object.freeze(['low', 'balanced', 'high']);

  const DEFAULT_PREFERENCES = Object.freeze({
    mode: 'scroll',
    color: ALLOWED_COLORS[0],
    opacity: 0.88,
    speed: 1,
    density: 'balanced',
    danmakuVisible: true,
    muted: false,
    volume: 0.55,
    theater: false,
  });

  function compactWhitespace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function clamp(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).slice(0, 7);
  }

  function normalizeMessage(input = {}, now = Date.now()) {
    const text = compactWhitespace(input.text);
    if (!text) return { ok: false, error: '输入一句弹幕再发送' };
    if (Array.from(text).length > 48) return { ok: false, error: '弹幕最多 48 个字' };

    const rawAuthor = compactWhitespace(input.author) || `访客-${String(now).slice(-4)}`;
    const author = Array.from(rawAuthor).slice(0, 16).join('');
    const mode = ALLOWED_MODES.includes(input.mode) ? input.mode : DEFAULT_PREFERENCES.mode;
    const color = ALLOWED_COLORS.includes(input.color) ? input.color : DEFAULT_PREFERENCES.color;
    const createdAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const fingerprint = hashText(`${author}|${text}|${mode}|${createdAt}`);

    return {
      ok: true,
      message: {
        id: input.id || `wave-${createdAt}-${fingerprint}`,
        text,
        author,
        mode,
        color,
        createdAt,
        source: input.source === 'remote' ? 'remote' : (input.source || 'local'),
      },
    };
  }

  function chooseLane(lastUsed = [], now = Date.now(), cooldown = 2_500) {
    if (!Array.isArray(lastUsed) || lastUsed.length === 0) return 0;
    const current = Number(now);
    const safeCooldown = Math.max(0, Number(cooldown) || 0);
    const available = lastUsed.findIndex((stamp) => current - (Number(stamp) || 0) >= safeCooldown);
    if (available >= 0) return available;

    let oldestIndex = 0;
    for (let index = 1; index < lastUsed.length; index += 1) {
      if ((Number(lastUsed[index]) || 0) < (Number(lastUsed[oldestIndex]) || 0)) oldestIndex = index;
    }
    return oldestIndex;
  }

  function normalizePreferences(input = {}) {
    return {
      mode: ALLOWED_MODES.includes(input.mode) ? input.mode : DEFAULT_PREFERENCES.mode,
      color: ALLOWED_COLORS.includes(input.color) ? input.color : DEFAULT_PREFERENCES.color,
      opacity: clamp(input.opacity, 0.35, 1, DEFAULT_PREFERENCES.opacity),
      speed: clamp(input.speed, 0.7, 1.5, DEFAULT_PREFERENCES.speed),
      density: DENSITIES.includes(input.density) ? input.density : DEFAULT_PREFERENCES.density,
      danmakuVisible: input.danmakuVisible == null
        ? DEFAULT_PREFERENCES.danmakuVisible
        : Boolean(input.danmakuVisible),
      muted: input.muted == null ? DEFAULT_PREFERENCES.muted : Boolean(input.muted),
      volume: clamp(input.volume, 0, 1, DEFAULT_PREFERENCES.volume),
      theater: input.theater == null ? DEFAULT_PREFERENCES.theater : Boolean(input.theater),
    };
  }

  function formatAudience(value) {
    const count = Math.max(0, Math.round(Number(value) || 0));
    if (count >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}亿`;
    if (count >= 10_000) return `${(count / 10_000).toFixed(1)}万`;
    return count.toLocaleString('en-US');
  }

  function getAmbientDelay(density = DEFAULT_PREFERENCES.density, random = Math.random()) {
    const ranges = {
      low: [3_000, 5_000],
      balanced: [1_200, 2_400],
      high: [650, 1_050],
    };
    const [minimum, maximum] = ranges[density] || ranges.balanced;
    const ratio = clamp(random, 0, 1, 0.5);
    return Math.round(minimum + ((maximum - minimum) * ratio));
  }

  function canSend(lastSentAt, now = Date.now(), cooldown = 900) {
    const last = Number(lastSentAt) || 0;
    if (last <= 0) return true;
    return (Number(now) - last) >= Math.max(0, Number(cooldown) || 0);
  }

  return Object.freeze({
    ALLOWED_MODES,
    ALLOWED_COLORS,
    DEFAULT_PREFERENCES,
    normalizeMessage,
    chooseLane,
    normalizePreferences,
    formatAudience,
    getAmbientDelay,
    canSend,
  });
}));
