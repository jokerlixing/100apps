(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PulsewatchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITS = Object.freeze({ sources: 40, samples: 24, events: 80, changes: 24, snapshotBytes: 100000 });
  const SOURCE_ID = /^[a-z0-9][a-z0-9_-]{2,48}$/;
  const SAFE_STATUSES = new Set(['idle', 'initial', 'stable', 'changed', 'error', 'running']);
  const SAFE_EVENT_TYPES = new Set(['initial', 'stable', 'changed', 'error', 'info']);
  const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

  class MonitorError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'MonitorError';
      this.code = code;
    }
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maxLength);
  }

  function cleanUrl(value) {
    const raw = cleanText(value, 2048);
    if (/^demo:\/\/[a-z0-9][a-z0-9_-]*$/i.test(raw)) return raw.toLowerCase();
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new MonitorError('INVALID_URL', 'URL 必须是有效的 http(s) 或 demo 地址');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new MonitorError('INVALID_URL', '只允许不含账号密码的 http(s) 地址');
    }
    return parsed.href;
  }

  function normalizeSource(input) {
    if (!input || typeof input !== 'object') throw new MonitorError('INVALID_SOURCE', '监控源资料不完整');
    const id = cleanText(input.id, 49).toLowerCase();
    const name = cleanText(input.name, 48);
    if (!SOURCE_ID.test(id) || !name) throw new MonitorError('INVALID_SOURCE', '来源名称或标识不合法');
    const format = input.format === 'text' ? 'text' : 'json';
    const parsedInterval = Number.parseInt(input.intervalMinutes, 10);
    const intervalMinutes = Number.isFinite(parsedInterval) ? Math.max(1, Math.min(1440, parsedInterval)) : 15;
    return {
      id,
      name,
      url: cleanUrl(input.url),
      format,
      path: format === 'json' ? cleanText(input.path, 120) : '',
      intervalMinutes,
      enabled: input.enabled !== false,
      notify: Boolean(input.notify)
    };
  }

  function extractAtPath(payload, path) {
    const cleanPath = cleanText(path, 120);
    if (!cleanPath) return payload;
    const parts = cleanPath.split('.').filter(Boolean);
    if (!parts.length || parts.some((part) => UNSAFE_PATH_PARTS.has(part))) {
      throw new MonitorError('INVALID_PATH', 'JSON 路径不安全');
    }
    let current = payload;
    for (const part of parts) {
      if (current == null || !Object.prototype.hasOwnProperty.call(Object(current), part)) {
        throw new MonitorError('PATH_NOT_FOUND', `JSON 路径不存在：${cleanPath}`);
      }
      current = current[part];
    }
    return current;
  }

  function normalizedValue(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return null;
    if (seen.has(value)) throw new MonitorError('INVALID_SNAPSHOT', '快照不能包含循环引用');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = value.map((item) => normalizedValue(item, seen));
    } else {
      result = {};
      Object.keys(value).sort().forEach((key) => {
        if (!UNSAFE_PATH_PARTS.has(key)) result[key] = normalizedValue(value[key], seen);
      });
    }
    seen.delete(value);
    return result;
  }

  function canonicalize(value) {
    return JSON.stringify(normalizedValue(value, new Set()));
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
  }

  function displayValue(value) {
    if (value === undefined) return '';
    if (typeof value === 'string') return value.slice(0, 240);
    const rendered = canonicalize(value);
    return rendered.length > 240 ? `${rendered.slice(0, 237)}…` : rendered;
  }

  function flatten(value, prefix, output) {
    if (Array.isArray(value)) {
      if (!value.length) output.set(prefix || '$', []);
      value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, output));
      return output;
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      if (!keys.length) output.set(prefix || '$', {});
      keys.forEach((key) => flatten(value[key], prefix ? `${prefix}.${key}` : key, output));
      return output;
    }
    output.set(prefix || '$', value);
    return output;
  }

  function compareJson(previous, current) {
    const before = flatten(previous, '', new Map());
    const after = flatten(current, '', new Map());
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
    const changes = [];
    for (const path of paths) {
      const hasBefore = before.has(path);
      const hasAfter = after.has(path);
      if (!hasBefore) {
        changes.push({ type: 'added', path, before: '', after: displayValue(after.get(path)) });
      } else if (!hasAfter) {
        changes.push({ type: 'removed', path, before: displayValue(before.get(path)), after: '' });
      } else if (canonicalize(before.get(path)) !== canonicalize(after.get(path))) {
        changes.push({ type: 'modified', path, before: displayValue(before.get(path)), after: displayValue(after.get(path)) });
      }
    }
    return {
      changed: changes.length > 0,
      kind: changes.length ? 'changed' : 'stable',
      summary: changes.length ? `${changes.length} 个字段发生变化` : '内容未变化',
      changes: changes.slice(0, LIMITS.changes)
    };
  }

  function lineCounts(lines) {
    const counts = new Map();
    lines.forEach((line) => counts.set(line, (counts.get(line) || 0) + 1));
    return counts;
  }

  function compareText(previous, current) {
    const beforeLines = String(previous).replace(/\r\n?/g, '\n').split('\n');
    const afterLines = String(current).replace(/\r\n?/g, '\n').split('\n');
    const afterRemaining = lineCounts(afterLines);
    const removed = [];
    beforeLines.forEach((line, index) => {
      const remaining = afterRemaining.get(line) || 0;
      if (remaining) afterRemaining.set(line, remaining - 1);
      else removed.push({ type: 'removed', path: `line ${index + 1}`, before: line.slice(0, 240), after: '' });
    });
    const beforeRemaining = lineCounts(beforeLines);
    const added = [];
    afterLines.forEach((line, index) => {
      const remaining = beforeRemaining.get(line) || 0;
      if (remaining) beforeRemaining.set(line, remaining - 1);
      else added.push({ type: 'added', path: `line ${index + 1}`, before: '', after: line.slice(0, 240) });
    });
    const changes = [...removed, ...added];
    const summary = changes.length ? `新增 ${added.length} 行，移除 ${removed.length} 行` : '内容未变化';
    return { changed: changes.length > 0, kind: changes.length ? 'changed' : 'stable', summary, changes: changes.slice(0, LIMITS.changes) };
  }

  function compareSnapshots(previous, current, format) {
    if (typeof previous === 'undefined') {
      return { changed: false, kind: 'initial', summary: '已记录首份快照', changes: [] };
    }
    return format === 'text' ? compareText(previous, current) : compareJson(previous, current);
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function nextRunAt(lastRunAt, intervalMinutes, enabled) {
    const last = validDate(lastRunAt);
    if (!enabled || !last) return null;
    const interval = Math.max(1, Math.min(1440, Number.parseInt(intervalMinutes, 10) || 15));
    return new Date(new Date(last).getTime() + interval * 60000).toISOString();
  }

  function isDue(source, now) {
    if (!source || source.enabled === false) return false;
    if (!validDate(source.lastRunAt)) return true;
    const next = nextRunAt(source.lastRunAt, source.intervalMinutes, true);
    const current = validDate(now) || new Date().toISOString();
    return new Date(next).getTime() <= new Date(current).getTime();
  }

  function safeSnapshot(value) {
    try {
      const serialized = canonicalize(value);
      if (serialized.length > LIMITS.snapshotBytes) return null;
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  }

  function safeChange(change) {
    if (!change || typeof change !== 'object') return null;
    const type = ['added', 'removed', 'modified'].includes(change.type) ? change.type : 'modified';
    return {
      type,
      path: cleanText(change.path, 160),
      before: cleanText(change.before, 240),
      after: cleanText(change.after, 240)
    };
  }

  function sanitizeSourceRuntime(input) {
    const source = normalizeSource(input);
    const samples = Array.isArray(input.samples) ? input.samples.slice(-LIMITS.samples).map((sample) => {
      const at = validDate(sample && sample.at);
      const status = sample && SAFE_STATUSES.has(sample.status) ? sample.status : null;
      return at && status ? { at, status, fingerprint: cleanText(sample.fingerprint, 32) } : null;
    }).filter(Boolean) : [];
    const lastDiff = Array.isArray(input.lastDiff) ? input.lastDiff.slice(0, LIMITS.changes).map(safeChange).filter(Boolean) : [];
    return {
      ...source,
      lastRunAt: validDate(input.lastRunAt),
      lastStatus: SAFE_STATUSES.has(input.lastStatus) ? input.lastStatus : 'idle',
      lastSnapshot: safeSnapshot(input.lastSnapshot),
      lastFingerprint: /^fnv1a-[0-9a-f]{8}$/.test(input.lastFingerprint || '') ? input.lastFingerprint : '',
      lastSummary: cleanText(input.lastSummary, 180),
      lastDiff,
      samples,
      demoTick: Math.max(0, Math.min(9999, Number.parseInt(input.demoTick, 10) || 0)),
      error: cleanText(input.error, 240)
    };
  }

  function sanitizeImport(raw) {
    let input = raw;
    if (typeof raw === 'string') {
      try { input = JSON.parse(raw); } catch { throw new MonitorError('INVALID_IMPORT', '导入文件不是有效 JSON'); }
    }
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.sources)) {
      throw new MonitorError('INVALID_IMPORT', '只支持 PULSEWATCH schemaVersion 1 数据');
    }
    const ids = new Set();
    const sources = [];
    input.sources.slice(0, LIMITS.sources * 2).forEach((item) => {
      try {
        const source = sanitizeSourceRuntime(item);
        if (!ids.has(source.id) && sources.length < LIMITS.sources) {
          ids.add(source.id);
          sources.push(source);
        }
      } catch {}
    });
    const allowedFilters = new Set(['all', 'changed', 'errors', 'paused']);
    const selectedId = cleanText(input.settings && input.settings.selectedId, 49);
    const filter = allowedFilters.has(input.settings && input.settings.filter) ? input.settings.filter : 'all';
    const events = Array.isArray(input.events) ? input.events.slice(-LIMITS.events).map((event, index) => {
      if (!event || typeof event !== 'object') return null;
      const sourceId = cleanText(event.sourceId, 49);
      const at = validDate(event.at);
      if (!ids.has(sourceId) || !at) return null;
      return {
        id: cleanText(event.id, 64) || `imported-${index}`,
        sourceId,
        at,
        type: SAFE_EVENT_TYPES.has(event.type) ? event.type : 'info',
        summary: cleanText(event.summary, 180),
        changes: Array.isArray(event.changes) ? event.changes.slice(0, LIMITS.changes).map(safeChange).filter(Boolean) : []
      };
    }).filter(Boolean) : [];
    return { schemaVersion: 1, settings: { selectedId: ids.has(selectedId) ? selectedId : (sources[0] && sources[0].id) || '', filter }, sources, events };
  }

  return Object.freeze({
    LIMITS,
    MonitorError,
    normalizeSource,
    extractAtPath,
    canonicalize,
    fingerprint,
    compareSnapshots,
    nextRunAt,
    isDue,
    sanitizeImport
  });
});
