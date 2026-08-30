(function attachJsonCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JsonCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createJsonCore() {
  'use strict';

  const DEFAULT_MAX_DEPTH = 128;
  const DEFAULT_SEARCH_LIMIT = 100;

  function clampInteger(value, minimum, maximum) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return minimum;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function positionToLineColumn(text, rawPosition) {
    const source = typeof text === 'string' ? text : '';
    const position = clampInteger(rawPosition, 0, source.length);
    let line = 1;
    let lineStart = 0;

    for (let index = 0; index < position; index += 1) {
      if (source[index] === '\n') {
        line += 1;
        lineStart = index + 1;
      }
    }

    return {
      position,
      line,
      column: position - lineStart + 1,
    };
  }

  function positionFromLineColumn(text, rawLine, rawColumn) {
    const source = typeof text === 'string' ? text : '';
    const targetLine = clampInteger(rawLine, 1, Number.MAX_SAFE_INTEGER);
    const targetColumn = clampInteger(rawColumn, 1, Number.MAX_SAFE_INTEGER);
    let line = 1;
    let position = 0;

    while (line < targetLine && position < source.length) {
      const nextBreak = source.indexOf('\n', position);
      if (nextBreak === -1) return source.length;
      position = nextBreak + 1;
      line += 1;
    }

    return Math.min(source.length, position + targetColumn - 1);
  }

  function extractErrorPosition(text, error) {
    const message = error && typeof error.message === 'string' ? error.message : '';
    const positionMatch = message.match(/(?:at\s+)?position\s+(\d+)/i);
    if (positionMatch) return clampInteger(positionMatch[1], 0, text.length);

    const lineColumnMatch = message.match(/line\s+(\d+)(?:\s+column\s+(\d+))?/i);
    if (lineColumnMatch) {
      return positionFromLineColumn(text, lineColumnMatch[1], lineColumnMatch[2] || 1);
    }

    return 0;
  }

  function getErrorContext(text, rawPosition, radius = 1) {
    const source = typeof text === 'string' ? text : '';
    const location = positionToLineColumn(source, rawPosition);
    const allLines = source.split(/\r?\n/);
    const safeRadius = clampInteger(radius, 0, 3);
    const start = Math.max(1, location.line - safeRadius);
    const end = Math.min(allLines.length, location.line + safeRadius);
    const lines = [];

    for (let number = start; number <= end; number += 1) {
      lines.push({ number, text: allLines[number - 1] || '' });
    }

    const lineText = allLines[location.line - 1] || '';
    const prefix = lineText.slice(0, Math.max(0, location.column - 1));
    const pointer = prefix.replace(/[^\t]/g, ' ') + '^';

    return {
      ...location,
      lineText,
      pointer,
      lines,
    };
  }

  function parseJson(text) {
    const source = typeof text === 'string' ? text : '';
    if (!source.trim()) {
      return {
        ok: false,
        empty: true,
        error: {
          message: '请输入 JSON 内容',
          ...getErrorContext(source, 0),
        },
      };
    }

    try {
      return { ok: true, empty: false, value: JSON.parse(source) };
    } catch (error) {
      const position = extractErrorPosition(source, error);
      return {
        ok: false,
        empty: false,
        error: {
          message: error && error.message ? String(error.message) : 'JSON 语法无效',
          ...getErrorContext(source, position),
        },
      };
    }
  }

  function normalizedIndent(spaces) {
    return Number(spaces) >= 4 ? 4 : 2;
  }

  function formatJson(value, spaces = 2) {
    return JSON.stringify(value, null, normalizedIndent(spaces));
  }

  function minifyJson(value) {
    return JSON.stringify(value);
  }

  function utf8Bytes(text) {
    const source = typeof text === 'string' ? text : String(text ?? '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(source).length;
    return unescape(encodeURIComponent(source)).length;
  }

  function isContainer(value) {
    return value !== null && typeof value === 'object';
  }

  function analyzeJson(value, options = {}) {
    const depthLimit = clampInteger(options.maxDepth ?? DEFAULT_MAX_DEPTH, 1, 1024);
    const stats = {
      nodes: 0,
      leaves: 0,
      objectKeys: 0,
      arrayItems: 0,
      maxDepth: 0,
      bytes: utf8Bytes(JSON.stringify(value)),
      truncated: false,
    };

    function visit(current, depth) {
      stats.nodes += 1;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (!isContainer(current)) {
        stats.leaves += 1;
        return;
      }

      const entries = Array.isArray(current)
        ? current.map((item, index) => [index, item])
        : Object.entries(current);

      if (Array.isArray(current)) stats.arrayItems += entries.length;
      else stats.objectKeys += entries.length;

      if (depth >= depthLimit) {
        if (entries.length) stats.truncated = true;
        return;
      }

      entries.forEach(([, child]) => visit(child, depth + 1));
    }

    visit(value, 0);
    return stats;
  }

  function joinPath(parentPath, segment, isIndex = false) {
    const base = typeof parentPath === 'string' && parentPath ? parentPath : '$';
    if (isIndex || typeof segment === 'number') return `${base}[${Number(segment)}]`;
    const key = String(segment);
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${base}.${key}`;
    const escaped = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `${base}['${escaped}']`;
  }

  function getValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function previewValue(value, rawLimit = 72) {
    const limit = clampInteger(rawLimit, 8, 240);
    const type = getValueType(value);
    if (type === 'object') return `{${Object.keys(value).length} 项}`;
    if (type === 'array') return `[${value.length} 项]`;
    if (type === 'string') {
      if (value.length + 2 <= limit) return `"${value}"`;
      return `"${value.slice(0, Math.max(1, limit - 3))}…"`;
    }
    if (type === 'null') return 'null';
    return String(value);
  }

  function searchJson(value, query, options = {}) {
    const needle = typeof query === 'string' ? query.trim().toLocaleLowerCase() : '';
    if (!needle) return [];

    const limit = clampInteger(options.limit ?? DEFAULT_SEARCH_LIMIT, 1, 500);
    const depthLimit = clampInteger(options.maxDepth ?? DEFAULT_MAX_DEPTH, 1, 1024);
    const results = [];

    function visit(current, path, key, depth) {
      if (results.length >= limit || depth > depthLimit) return;
      const type = getValueType(current);
      const matches = [];
      if (key !== null && String(key).toLocaleLowerCase().includes(needle)) matches.push('key');

      if (!isContainer(current)) {
        const searchable = type === 'string' ? current : String(current);
        if (searchable.toLocaleLowerCase().includes(needle)) matches.push('value');
      }

      if (matches.length) {
        results.push({
          path,
          key,
          type,
          preview: previewValue(current),
          matches,
        });
      }

      if (!isContainer(current) || depth >= depthLimit || results.length >= limit) return;
      if (Array.isArray(current)) {
        current.forEach((child, index) => visit(child, joinPath(path, index, true), index, depth + 1));
      } else {
        Object.entries(current).forEach(([childKey, child]) => {
          visit(child, joinPath(path, childKey), childKey, depth + 1);
        });
      }
    }

    visit(value, '$', null, 0);
    return results;
  }

  return Object.freeze({
    parseJson,
    positionToLineColumn,
    getErrorContext,
    formatJson,
    minifyJson,
    analyzeJson,
    joinPath,
    searchJson,
    getValueType,
    previewValue,
  });
});
