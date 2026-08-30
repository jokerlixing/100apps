(function attachVideoCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VideoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVideoCore() {
  'use strict';

  const BULLET_COLORS = Object.freeze(['#FFFFFF', '#F2E7D2', '#E9A45B', '#8EC7D3', '#D96C6C']);
  const PLAYBACK_RATES = Object.freeze([0.75, 1, 1.25, 1.5, 2]);
  const SAFE_ID = /^[a-z0-9][a-z0-9_-]{2,79}$/i;

  function finiteNumber(value, fallback = 0) {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function cleanText(value, maxLength = 60) {
    const normalized = String(value ?? '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const limit = Math.max(0, Math.floor(finiteNumber(maxLength, 60)));
    return Array.from(normalized).slice(0, limit).join('');
  }

  function normalizeId(value) {
    const id = String(value ?? '').trim();
    return SAFE_ID.test(id) ? id : '';
  }

  function normalizeColor(value) {
    const color = String(value ?? '').trim().toUpperCase();
    return BULLET_COLORS.includes(color) ? color : BULLET_COLORS[0];
  }

  function normalizeBullet(value) {
    if (!value || typeof value !== 'object') return null;
    const id = normalizeId(value.id);
    const videoId = normalizeId(value.videoId);
    const text = cleanText(value.text);
    const time = finiteNumber(value.time, Number.NaN);
    const createdAt = Math.max(0, Math.floor(finiteNumber(value.createdAt, 0)));
    if (!id || !videoId || !text || !Number.isFinite(time) || time < 0) return null;
    return {
      id,
      videoId,
      text,
      time: Math.min(time, 86_400),
      color: normalizeColor(value.color),
      createdAt
    };
  }

  function cleanBullets(values, maxItems = 300) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
      const bullet = normalizeBullet(value);
      if (!bullet || seen.has(bullet.id)) continue;
      seen.add(bullet.id);
      normalized.push(bullet);
    }
    normalized.sort((left, right) => left.time - right.time || left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    const limit = Math.max(0, Math.floor(finiteNumber(maxItems, 300)));
    return normalized.slice(-limit);
  }

  function bulletsForVideo(values, videoId) {
    const safeVideoId = normalizeId(videoId);
    if (!safeVideoId || !Array.isArray(values)) return [];
    return values.filter((value) => value && value.videoId === safeVideoId);
  }

  function getDueBullets(values, videoId, currentTime, windowSeconds = 0.35) {
    const now = Math.max(0, finiteNumber(currentTime, 0));
    const window = Math.max(0, finiteNumber(windowSeconds, 0.35));
    return bulletsForVideo(values, videoId).filter((bullet) => bullet.time >= now - window && bullet.time <= now + window);
  }

  function assignLanes(values, laneCount = 6, offset = 0) {
    if (!Array.isArray(values)) return [];
    const lanes = Math.max(1, Math.floor(finiteNumber(laneCount, 6)));
    const start = Math.max(0, Math.floor(finiteNumber(offset, 0)));
    return values.map((value, index) => ({ ...value, lane: (start + index) % lanes }));
  }

  function clampProgress(seconds, duration) {
    const safeDuration = finiteNumber(duration, Number.NaN);
    if (!Number.isFinite(safeDuration) || safeDuration <= 0) return 0;
    return Math.min(Math.max(0, finiteNumber(seconds, 0)), safeDuration);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(finiteNumber(seconds, 0)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    const minuteText = String(minutes).padStart(2, '0');
    const secondText = String(remainder).padStart(2, '0');
    return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`;
  }

  function nextVideoIndex(currentIndex, length, autoNext) {
    const size = Math.max(0, Math.floor(finiteNumber(length, 0)));
    if (!autoNext || size === 0) return -1;
    const current = Math.max(0, Math.floor(finiteNumber(currentIndex, 0)));
    return (current + 1) % size;
  }

  function normalizeSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    const requestedRate = finiteNumber(input.rate, 1);
    return {
      bulletsVisible: input.bulletsVisible !== false,
      autoNext: input.autoNext !== false,
      volume: Math.min(1, Math.max(0, finiteNumber(input.volume, 0.82))),
      rate: PLAYBACK_RATES.includes(requestedRate) ? requestedRate : 1,
      muted: input.muted === true
    };
  }

  function normalizeProgress(value, knownVideoIds) {
    if (!value || typeof value !== 'object' || !Array.isArray(knownVideoIds)) return {};
    const progress = {};
    for (const id of knownVideoIds) {
      const safeId = normalizeId(id);
      if (!safeId || !Object.prototype.hasOwnProperty.call(value, safeId)) continue;
      const seconds = finiteNumber(value[safeId], Number.NaN);
      if (Number.isFinite(seconds)) progress[safeId] = Math.max(0, Math.min(seconds, 86_400));
    }
    return progress;
  }

  return Object.freeze({
    BULLET_COLORS,
    PLAYBACK_RATES,
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
  });
});
