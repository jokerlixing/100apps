(function attachDepotCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepotCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDepotCore() {
  'use strict';

  const LIMIT_BYTES = 512 * 1024 * 1024;
  const SHARE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const KIND_LABELS = Object.freeze({
    document: '文档',
    image: '图片',
    media: '影音',
    other: '其他',
  });

  function safeName(value) {
    const source = String(value == null ? '' : value)
      .trim()
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ');
    if (!source) return '未命名文件';
    if (source.length <= 120) return source;
    const lastDot = source.lastIndexOf('.');
    const hasExtension = lastDot > 0 && source.length - lastDot <= 16;
    if (!hasExtension) return source.slice(0, 120);
    const extension = source.slice(lastDot);
    return source.slice(0, Math.max(1, 120 - extension.length)) + extension;
  }

  function classifyFile(file) {
    const type = String(file && file.type || '').toLowerCase();
    const name = String(file && file.name || '').toLowerCase();
    const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
    if (type.startsWith('image/') || /^(avif|bmp|gif|heic|jpeg|jpg|png|svg|webp)$/.test(extension)) return 'image';
    if (type.startsWith('audio/') || type.startsWith('video/') || /^(aac|flac|m4a|mkv|mov|mp3|mp4|ogg|wav|webm)$/.test(extension)) return 'media';
    if (
      type.startsWith('text/') ||
      /^(application\/(json|pdf|rtf|msword)|application\/vnd\.|application\/.*document)/.test(type) ||
      /^(csv|doc|docx|html|json|md|odt|pdf|ppt|pptx|rtf|txt|xls|xlsx|xml|yaml|yml)$/.test(extension)
    ) return 'document';
    return 'other';
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let amount = bytes / 1024;
    let unitIndex = 0;
    while (amount >= 1024 && unitIndex < units.length - 1) {
      amount /= 1024;
      unitIndex += 1;
    }
    const digits = amount < 10 && Math.abs(amount - Math.round(amount)) > 0.01 ? 1 : 0;
    return `${amount.toFixed(digits).replace(/\.0$/, '')} ${units[unitIndex]}`;
  }

  function splitExtension(name) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) return { base: name, extension: '' };
    return { base: name.slice(0, lastDot), extension: name.slice(lastDot) };
  }

  function uniqueName(value, existingNames) {
    const name = safeName(value);
    const taken = new Set((existingNames || []).map((item) => String(item).toLocaleLowerCase()));
    if (!taken.has(name.toLocaleLowerCase())) return name;
    const { base, extension } = splitExtension(name);
    let index = 2;
    let candidate = `${base} (${index})${extension}`;
    while (taken.has(candidate.toLocaleLowerCase())) {
      index += 1;
      candidate = `${base} (${index})${extension}`;
    }
    return candidate;
  }

  function validateBatch(files, existingRecords, options) {
    const settings = options || {};
    const folderId = settings.folderId || 'root';
    const limitBytes = Number.isFinite(settings.limitBytes) ? settings.limitBytes : LIMIT_BYTES;
    const records = Array.isArray(existingRecords) ? existingRecords : [];
    let projectedBytes = records.reduce((sum, item) => sum + Math.max(0, Number(item.size) || 0), 0);
    const names = records.filter((item) => (item.folderId || 'root') === folderId).map((item) => item.name);
    const accepted = [];
    const rejected = [];

    for (const input of Array.from(files || [])) {
      const size = Math.max(0, Number(input && input.size) || 0);
      const originalName = String(input && input.name || '');
      if (size === 0) {
        rejected.push({ file: input, name: safeName(originalName), code: 'EMPTY_FILE', message: '空文件未入库' });
        continue;
      }
      if (projectedBytes + size > limitBytes) {
        rejected.push({ file: input, name: safeName(originalName), code: 'QUOTA_EXCEEDED', message: '资料库容量不足' });
        continue;
      }
      const name = uniqueName(originalName, names);
      const record = {
        file: input,
        originalName,
        name,
        size,
        type: String(input && input.type || 'application/octet-stream'),
        kind: classifyFile({ name, type: input && input.type }),
        folderId,
      };
      accepted.push(record);
      names.push(name);
      projectedBytes += size;
    }
    return { accepted, rejected, projectedBytes, limitBytes };
  }

  function buildUsage(records, limitBytes) {
    const byKind = { document: 0, image: 0, media: 0, other: 0 };
    let total = 0;
    let trash = 0;
    for (const record of records || []) {
      const size = Math.max(0, Number(record.size) || 0);
      const kind = Object.prototype.hasOwnProperty.call(byKind, record.kind) ? record.kind : 'other';
      byKind[kind] += size;
      total += size;
      if (record.deletedAt) trash += size;
    }
    const limit = Math.max(0, Number(limitBytes) || LIMIT_BYTES);
    return {
      total,
      available: Math.max(0, limit - total),
      percent: limit ? Math.min(100, Math.round((total / limit) * 1000) / 10) : 100,
      trash,
      limit,
      byKind,
    };
  }

  function filterAndSort(records, options) {
    const settings = options || {};
    const query = String(settings.query || '').trim().toLocaleLowerCase();
    const view = settings.view || 'all';
    const now = Number.isFinite(settings.now) ? settings.now : Date.now();
    const recentBoundary = now - (7 * 24 * 60 * 60 * 1000);
    const result = (records || []).filter((record) => {
      if (view === 'trash') {
        if (!record.deletedAt) return false;
      } else {
        if (record.deletedAt) return false;
        if (view === 'shared' && !shareIsActive(record.share, now)) return false;
        if (view === 'recent' && Date.parse(record.createdAt || 0) < recentBoundary) return false;
        if (view === 'folder' && (record.folderId || 'root') !== settings.folderId) return false;
      }
      if (settings.kind && record.kind !== settings.kind) return false;
      return !query || String(record.name || '').toLocaleLowerCase().includes(query);
    });

    const sort = settings.sort || 'newest';
    result.sort((left, right) => {
      if (sort === 'name') return String(left.name).localeCompare(String(right.name), 'zh-CN', { sensitivity: 'base' });
      if (sort === 'size') return (Number(right.size) || 0) - (Number(left.size) || 0) || String(left.name).localeCompare(String(right.name));
      if (sort === 'oldest') return Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0);
      return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);
    });
    return result;
  }

  function createShare(record, options) {
    const settings = options || {};
    const now = typeof settings.now === 'function' ? settings.now() : Date.now();
    const random = typeof settings.random === 'function' ? settings.random : Math.random;
    const days = Number.isFinite(settings.days) ? Math.max(0, settings.days) : 7;
    let token = '';
    for (let index = 0; index < 8; index += 1) {
      token += SHARE_CHARS[Math.min(SHARE_CHARS.length - 1, Math.floor(random() * SHARE_CHARS.length))];
    }
    return {
      token,
      createdAt: new Date(now).toISOString(),
      expiresAt: days ? new Date(now + (days * 24 * 60 * 60 * 1000)).toISOString() : null,
      fileId: record && record.id || null,
    };
  }

  function shareIsActive(share, now) {
    if (!share || !share.token) return false;
    if (!share.expiresAt) return true;
    const timestamp = Number.isFinite(now) ? now : Date.now();
    return timestamp < Date.parse(share.expiresAt);
  }

  return Object.freeze({
    LIMIT_BYTES,
    KIND_LABELS,
    safeName,
    classifyFile,
    formatBytes,
    uniqueName,
    validateBatch,
    buildUsage,
    filterAndSort,
    createShare,
    shareIsActive,
  });
});
