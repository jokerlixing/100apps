(function attachIdeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IdeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIdeCore() {
  'use strict';

  const MAX_CODE_LENGTH = 200_000;
  const MAX_CONSOLE_LENGTH = 2_000;
  const SAFE_RUN_ID = /^[a-z0-9][a-z0-9_-]{2,79}$/i;
  const RUN_STATUSES = new Set(['success', 'error', 'stopped', 'timeout']);

  const MODES = Object.freeze({
    web: Object.freeze({
      id: 'web',
      label: 'Web 预览',
      shortLabel: 'WEB',
      description: 'HTML、CSS 与 JavaScript 组合预览',
      files: Object.freeze(['index.html', 'styles.css', 'script.js']),
      templates: Object.freeze({
        'index.html': `<main class="specimen">
  <p class="eyebrow">FIELD NOTE / 094</p>
  <h1>把想法放进浏览器。</h1>
  <p>修改三个文件，然后按 <kbd>Ctrl</kbd> + <kbd>Enter</kbd> 运行。</p>
  <button id="sampleButton" type="button">记录一次实验</button>
  <output id="sampleOutput">等待第一次点击。</output>
</main>`,
        'styles.css': `:root {
  color: #132b32;
  background: #c9dde3;
  font-family: system-ui, sans-serif;
}

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
}

.specimen {
  width: min(560px, calc(100% - 48px));
  padding: 40px;
  background: #eef2f0;
  border: 3px solid #132b32;
  box-shadow: 10px 10px 0 #3157d5;
}

.eyebrow { font: 700 12px/1 monospace; letter-spacing: .16em; }
h1 { max-width: 9ch; font-size: clamp(42px, 8vw, 78px); line-height: .92; }
button { padding: 12px 16px; border: 0; background: #ed653f; color: white; font-weight: 800; }
output { display: block; margin-top: 20px; font-family: monospace; }`,
        'script.js': `const button = document.querySelector('#sampleButton');
const output = document.querySelector('#sampleOutput');
let count = 0;

button.addEventListener('click', () => {
  count += 1;
  output.textContent = \`实验记录 #\${String(count).padStart(2, '0')} 已保存\`;
  console.log('experiment', { count, recordedAt: new Date().toLocaleTimeString() });
});

console.log('Web 实验台已就绪');`
      })
    }),
    javascript: Object.freeze({
      id: 'javascript',
      label: 'JavaScript',
      shortLabel: 'JS',
      description: '在隔离 Worker 中运行现代 JavaScript',
      files: Object.freeze(['main.js']),
      templates: Object.freeze({
        'main.js': `const readings = [12, 19, 7, 23, 16];
const average = readings.reduce((sum, value) => sum + value, 0) / readings.length;

console.log('样本', readings);
console.table(readings.map((value, index) => ({ sample: index + 1, value })));
console.log('平均值', average.toFixed(1));

return { samples: readings.length, average };`
      })
    }),
    python: Object.freeze({
      id: 'python',
      label: 'Python',
      shortLabel: 'PY',
      description: '通过 Pyodide 在浏览器中运行 Python',
      files: Object.freeze(['main.py']),
      templates: Object.freeze({
        'main.py': `from statistics import mean

readings = [12, 19, 7, 23, 16]
print("样本:", readings)
print("平均值:", round(mean(readings), 1))

{"samples": len(readings), "average": mean(readings)}`
      })
    })
  });

  const MODE_IDS = Object.freeze(Object.keys(MODES));

  function normalizeModeId(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODES, value) ? value : 'web';
  }

  function normalizeFileId(modeId, value) {
    const mode = MODES[normalizeModeId(modeId)];
    return typeof value === 'string' && mode.files.includes(value) ? value : mode.files[0];
  }

  function cloneTemplates(modeId) {
    const mode = MODES[normalizeModeId(modeId)];
    return Object.fromEntries(mode.files.map((file) => [file, mode.templates[file]]));
  }

  function safeCode(value, fallback) {
    return typeof value === 'string' ? value.slice(0, MAX_CODE_LENGTH) : fallback;
  }

  function countCode(value) {
    const code = typeof value === 'string' ? value : '';
    return {
      lines: code.split('\n').length,
      characters: Array.from(code).length,
      bytes: typeof TextEncoder === 'function' ? new TextEncoder().encode(code).length : unescape(encodeURIComponent(code)).length
    };
  }

  function makeLineNumbers(value) {
    const lines = countCode(value).lines;
    return Array.from({ length: lines }, (_, index) => String(index + 1)).join('\n');
  }

  function truncateText(value, maxLength = MAX_CONSOLE_LENGTH) {
    const characters = Array.from(String(value));
    return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}…` : characters.join('');
  }

  function serializeConsoleValue(value) {
    if (typeof value === 'string') return truncateText(value);
    if (typeof value === 'undefined') return 'undefined';
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
    if (value instanceof Error) return truncateText(value.stack || `${value.name}: ${value.message}`);
    if (value === null || typeof value !== 'object') return truncateText(String(value));

    const seen = new WeakSet();
    try {
      const json = JSON.stringify(value, (key, current) => {
        if (typeof current === 'bigint') return `${current}n`;
        if (typeof current === 'function') return `[Function${current.name ? ` ${current.name}` : ''}]`;
        if (typeof current === 'symbol') return current.toString();
        if (current && typeof current === 'object') {
          if (seen.has(current)) return '[Circular]';
          seen.add(current);
        }
        return current;
      }, 2);
      return truncateText(json === undefined ? String(value) : json);
    } catch {
      return '[Unserializable value]';
    }
  }

  function cleanSummary(value) {
    return Array.from(String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 100).join('');
  }

  function finiteNumber(value, fallback = 0) {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRunRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const mode = typeof value.mode === 'string' ? value.mode : '';
    const status = typeof value.status === 'string' ? value.status : '';
    if (!SAFE_RUN_ID.test(id) || !MODE_IDS.includes(mode) || !RUN_STATUSES.has(status)) return null;
    return {
      id,
      mode,
      status,
      startedAt: Math.max(0, Math.floor(finiteNumber(value.startedAt, 0))),
      duration: Math.max(0, Math.round(finiteNumber(value.duration, 0))),
      summary: cleanSummary(value.summary)
    };
  }

  function normalizeHistory(values, maxItems = 20) {
    if (!Array.isArray(values)) return [];
    const limit = Math.max(0, Math.floor(finiteNumber(maxItems, 20)));
    const seen = new Set();
    const history = [];
    for (const value of values) {
      const record = normalizeRunRecord(value);
      if (!record || seen.has(record.id)) continue;
      seen.add(record.id);
      history.push(record);
    }
    return history.slice(-limit);
  }

  function normalizeWorkspace(value) {
    const input = value && typeof value === 'object' ? value : {};
    const workspaces = {};
    const activeFiles = {};
    for (const modeId of MODE_IDS) {
      const mode = MODES[modeId];
      const storedFiles = input.workspaces && typeof input.workspaces[modeId] === 'object' ? input.workspaces[modeId] : {};
      workspaces[modeId] = Object.fromEntries(mode.files.map((file) => [file, safeCode(storedFiles[file], mode.templates[file])]));
      activeFiles[modeId] = normalizeFileId(modeId, input.activeFiles?.[modeId]);
    }
    return {
      version: 1,
      mode: normalizeModeId(input.mode),
      activeFiles,
      workspaces,
      history: normalizeHistory(input.history)
    };
  }

  return Object.freeze({
    MODES,
    MODE_IDS,
    MAX_CODE_LENGTH,
    cloneTemplates,
    normalizeModeId,
    normalizeFileId,
    countCode,
    makeLineNumbers,
    serializeConsoleValue,
    normalizeRunRecord,
    normalizeHistory,
    normalizeWorkspace
  });
});

