(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WallpaperCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCE_NAMES = new Set(['bing', 'cache', 'fallback']);

  function cleanText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, 240) || fallback;
  }

  function safeHttpsUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function normalizeDate(value) {
    if (typeof value !== 'string') return '';
    const compact = value.trim().replaceAll('-', '');
    if (!/^\d{8}$/.test(compact)) return '';
    const normalized = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) return '';
    return normalized;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function titleFromCopyright(copyright) {
    const prefix = cleanText(copyright).split(/\s*\(©/u)[0].trim();
    const subject = prefix.split(/[，,]/u)[0].trim();
    return subject || prefix || '今日未命名风景';
  }

  function normalizeWallpaper(record) {
    if (!record || typeof record !== 'object') return null;
    const date = normalizeDate(record.date || record.start_date || record.startdate);
    const url = safeHttpsUrl(record.url);
    if (!date || !url) return null;

    const copyright = cleanText(record.copyright, '版权信息由图片来源提供');
    const title = cleanText(record.title, titleFromCopyright(copyright));
    const copyrightLink = safeHttpsUrl(record.copyrightLink || record.copyright_link || record.copyrightlink);
    const source = SOURCE_NAMES.has(record.source) ? record.source : 'bing';

    return {
      id: `${date}-${hashString(url)}`,
      date,
      url,
      title,
      copyright,
      copyrightLink,
      source,
    };
  }

  function normalizeCollection(records) {
    if (!Array.isArray(records)) return [];
    const seenDates = new Set();
    const normalized = [];

    records.forEach((record) => {
      const item = normalizeWallpaper(record);
      if (!item || seenDates.has(item.date)) return;
      seenDates.add(item.date);
      normalized.push(item);
    });

    return normalized.sort((a, b) => b.date.localeCompare(a.date));
  }

  function mergeWithCache(liveRecords, cachedRecords, limit = 8) {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 8;
    return normalizeCollection([
      ...(Array.isArray(liveRecords) ? liveRecords : []),
      ...(Array.isArray(cachedRecords) ? cachedRecords : []),
    ]).slice(0, safeLimit);
  }

  function toggleFavorite(favorites, id) {
    if (typeof id !== 'string' || !id.trim()) return Array.isArray(favorites) ? [...new Set(favorites)] : [];
    const current = Array.isArray(favorites) ? [...new Set(favorites.filter((item) => typeof item === 'string'))] : [];
    return current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
  }

  function selectHomepage(currentId, nextId) {
    if (typeof nextId !== 'string' || !nextId.trim()) return currentId || null;
    return currentId === nextId ? null : nextId;
  }

  function hydratePreferenceIds(ids, collection) {
    if (!Array.isArray(ids) || !Array.isArray(collection)) return [];
    const available = new Set(collection.map((item) => item && item.id).filter(Boolean));
    return [...new Set(ids.filter((id) => typeof id === 'string' && available.has(id)))];
  }

  function formatDisplayDate(value) {
    const date = normalizeDate(value);
    if (!date) return '日期未知';
    const parsed = new Date(`${date}T00:00:00Z`);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${parsed.getUTCMonth() + 1}月${parsed.getUTCDate()}日 · ${weekdays[parsed.getUTCDay()]}`;
  }

  function createDownloadName(item) {
    const date = normalizeDate(item && item.date) || 'unknown-date';
    const title = cleanText(item && item.title, 'wallpaper')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'wallpaper';
    return `LUMEN-${date}-${title}.jpg`;
  }

  return Object.freeze({
    normalizeWallpaper,
    normalizeCollection,
    mergeWithCache,
    toggleFavorite,
    selectHomepage,
    hydratePreferenceIds,
    formatDisplayDate,
    createDownloadName,
  });
});
