'use strict';

const nativePostMessage = self.postMessage.bind(self);
const AsyncFunction = Object.getPrototypeOf(async function empty() {}).constructor;
const MAX_LOGS = 120;
const MAX_TEXT = 2_000;

function truncate(value, length = MAX_TEXT) {
  const characters = Array.from(String(value));
  return characters.length > length ? `${characters.slice(0, length).join('')}…` : characters.join('');
}

function stringify(value) {
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
  if (value instanceof Error) return truncate(value.stack || `${value.name}: ${value.message}`);
  if (value === null || typeof value !== 'object') return truncate(String(value));

  const seen = new WeakSet();
  try {
    const result = JSON.stringify(value, (key, current) => {
      if (typeof current === 'bigint') return `${current}n`;
      if (typeof current === 'function') return `[Function${current.name ? ` ${current.name}` : ''}]`;
      if (typeof current === 'symbol') return current.toString();
      if (current && typeof current === 'object') {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      return current;
    }, 2);
    return truncate(result === undefined ? String(value) : result);
  } catch {
    return '[Unserializable value]';
  }
}

function createConsole(id) {
  let count = 0;
  const emit = (level, values) => {
    if (count >= MAX_LOGS) {
      if (count === MAX_LOGS) nativePostMessage({ type: 'log', id, level: 'warn', text: '日志超过 120 条，后续输出已截断。' });
      count += 1;
      return;
    }
    count += 1;
    nativePostMessage({ type: 'log', id, level, text: values.map(stringify).join(' ') });
  };

  return Object.freeze({
    log: (...values) => emit('log', values),
    info: (...values) => emit('info', values),
    warn: (...values) => emit('warn', values),
    error: (...values) => emit('error', values),
    table: (value) => emit('table', [value]),
    dir: (value) => emit('log', [value]),
    clear: () => nativePostMessage({ type: 'clear', id })
  });
}

function blockedCapability() {
  throw new Error('BENCH/94 已在 JavaScript Worker 中关闭网络与子 Worker 能力。');
}

self.fetch = blockedCapability;
self.XMLHttpRequest = undefined;
self.WebSocket = undefined;
self.EventSource = undefined;
self.Worker = undefined;
self.SharedWorker = undefined;
self.importScripts = blockedCapability;

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || message.type !== 'run' || typeof message.id !== 'string' || typeof message.code !== 'string') return;
  const { id, code } = message;
  const started = performance.now();
  nativePostMessage({ type: 'stage', id, stage: 'check' });

  let execute;
  try {
    execute = new AsyncFunction(
      'console',
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'Worker',
      'SharedWorker',
      'importScripts',
      'postMessage',
      'close',
      `"use strict";\nconst self = undefined;\n${code}\n//# sourceURL=bench94-main.js`
    );
  } catch (error) {
    nativePostMessage({ type: 'done', id, status: 'error', error: stringify(error), duration: performance.now() - started });
    return;
  }

  nativePostMessage({ type: 'stage', id, stage: 'run' });
  try {
    const result = await execute(
      createConsole(id),
      blockedCapability,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      blockedCapability,
      blockedCapability,
      blockedCapability
    );
    nativePostMessage({
      type: 'done',
      id,
      status: 'success',
      result: typeof result === 'undefined' ? '' : stringify(result),
      duration: performance.now() - started
    });
  } catch (error) {
    nativePostMessage({ type: 'done', id, status: 'error', error: stringify(error), duration: performance.now() - started });
  }
};

