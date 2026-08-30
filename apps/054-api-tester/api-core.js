(function attachApiCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ApiCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApiCore() {
  'use strict';

  const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  const SENSITIVE_HEADERS = new Set([
    'authorization',
    'cookie',
    'proxy-authorization',
    'x-api-key',
    'api-key',
    'apikey',
    'x-auth-token',
  ]);

  function normalizeUrl(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) throw new Error('请输入请求 URL');

    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error('URL 格式无效');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('只支持 HTTP 或 HTTPS URL');
    }
    if (!parsed.hostname) throw new Error('URL 缺少主机名');
    if (parsed.username || parsed.password) throw new Error('URL 中不能包含登录凭据');
    return parsed.href;
  }

  function buildRequestUrl(baseUrl, rows) {
    const parsed = new URL(normalizeUrl(baseUrl));
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || row.enabled === false) return;
      const key = String(row.key == null ? '' : row.key).trim();
      if (!key) return;
      parsed.searchParams.append(key, String(row.value == null ? '' : row.value));
    });
    return parsed.href;
  }

  function sanitizeHeaderRows(rows) {
    const collected = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || row.enabled === false) return;
      const name = String(row.key == null ? '' : row.key).trim();
      if (!name || !HEADER_NAME.test(name)) return;
      const normalized = name.toLowerCase();
      collected.set(normalized, {
        name,
        value: String(row.value == null ? '' : row.value).replace(/[\r\n]+/g, ' ').trim(),
      });
    });

    const result = {};
    collected.forEach(({ name, value }) => { result[name] = value; });
    return result;
  }

  function maskSensitiveHeaders(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const clone = { ...row };
      const key = String(clone.key == null ? '' : clone.key).trim().toLowerCase();
      if (SENSITIVE_HEADERS.has(key) || /(?:secret|token|api[-_]?key)/i.test(key)) {
        clone.value = '••••••••';
      }
      return clone;
    });
  }

  function prepareRequestBody(method, mode, source) {
    const verb = String(method || 'GET').toUpperCase();
    const bodyMode = String(mode || 'none').toLowerCase();
    const text = String(source == null ? '' : source);
    if (['GET', 'HEAD'].includes(verb) || bodyMode === 'none' || !text.trim()) return null;

    if (bodyMode === 'json') {
      let value;
      try {
        value = JSON.parse(text);
      } catch (error) {
        throw new Error(`JSON 正文无效：${error.message}`);
      }
      return {
        body: JSON.stringify(value, null, 2),
        contentType: 'application/json;charset=UTF-8',
      };
    }

    return {
      body: text,
      contentType: 'text/plain;charset=UTF-8',
    };
  }

  function detectResponseKind(contentType, text) {
    const type = String(contentType || '').toLowerCase();
    if (type.includes('/json') || type.includes('+json')) return 'json';
    if (type.includes('html')) return 'html';
    if (type.includes('xml')) return 'xml';

    const source = String(text == null ? '' : text).trim();
    if (source.startsWith('{') || source.startsWith('[')) {
      try {
        JSON.parse(source);
        return 'json';
      } catch {
        // A JSON-looking plain-text error should remain readable as text.
      }
    }
    return 'text';
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 1024) return `${Math.round(value).toLocaleString('en-US')} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function trimHistory(entries, limit = 12) {
    const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 12;
    return (Array.isArray(entries) ? entries : []).slice(0, safeLimit);
  }

  return {
    normalizeUrl,
    buildRequestUrl,
    sanitizeHeaderRows,
    maskSensitiveHeaders,
    prepareRequestBody,
    detectResponseKind,
    formatBytes,
    trimHistory,
  };
});
