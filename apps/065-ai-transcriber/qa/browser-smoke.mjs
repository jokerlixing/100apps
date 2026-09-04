import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/apps/065-ai-transcriber/';
const outputDir = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'scribe65-smoke'));
const port = 9365;
const profile = path.resolve(os.tmpdir(), `codex-app65-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];

const browserApiMocks = String.raw`
(() => {
  class MockSpeechRecognition {
    static active = null;

    constructor() {
      this.listeners = new Map();
      this.lang = 'zh-CN';
      this.continuous = true;
      this.interimResults = true;
      this.maxAlternatives = 1;
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type, payload = {}) {
      (this.listeners.get(type) || []).forEach((listener) => listener(payload));
    }

    start() {
      MockSpeechRecognition.active = this;
    }

    stop() {
      if (MockSpeechRecognition.active === this) MockSpeechRecognition.active = null;
      this.emit('end');
    }
  }

  class MockMediaRecorder {
    static isTypeSupported() { return true; }

    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type, payload = {}) {
      (this.listeners.get(type) || []).forEach((listener) => listener(payload));
    }

    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.emit('dataavailable', { data: new Blob(['mock-audio'], { type: this.mimeType }) });
        this.emit('stop');
      });
    }
  }

  const stream = { getTracks: () => [{ stop() {} }] };
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition });
  Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: MockMediaRecorder });
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
  Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => stream },
  });

  window.__emitMockTranscript = (text) => {
    const recognition = MockSpeechRecognition.active;
    if (!recognition) throw new Error('No active mock recognition session');
    const result = [{ transcript: text }];
    result.isFinal = true;
    recognition.emit('result', { resultIndex: 0, results: [result] });
  };
})();`;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 12_000, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(webSocketUrl);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
    });
  }

  on(method, listener) {
    const current = this.listeners.get(method) || [];
    current.push(listener);
    this.listeners.set(method, current);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed';
    throw new Error(description);
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const browser = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception');
    });
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: browserApiMocks });

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Network.setBlockedURLs', { urls: ['*transcript-core.js*', '*app.js*'] });
    await client.send('Page.navigate', { url: `${baseUrl}?scripts-blocked=1` });
    await waitForExpression(client, `document.readyState === 'complete'`);
    const failOpen = await evaluate(client, `(() => {
      const heading = document.querySelector('#page-title');
      return {
        bodyOpacity: getComputedStyle(document.body).opacity,
        headingVisible: Boolean(heading && heading.getBoundingClientRect().height > 0),
        ready: document.body.classList.contains('ready')
      };
    })()`);
    assert.deepEqual(failOpen, { bodyOpacity: '1', headingVisible: true, ready: false });
    await client.send('Network.setBlockedURLs', { urls: [] });
    await navigate(client, `${baseUrl}?demo=1`);
    await evaluate(client, `window.__SCRIBE65__.resetSession()`);

    const initial = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      clock: document.querySelector('#recording-clock').textContent,
      startEnabled: !document.querySelector('#start-button').disabled,
      restartDisabled: document.querySelector('#restart-button').disabled,
      demoButtons: document.querySelectorAll('#demo-button, #empty-demo-button').length,
      versionedAssets: [...document.querySelectorAll('link[rel="stylesheet"], script[src]')]
        .every((asset) => new URL(asset.href || asset.src).searchParams.get('v') === '20260904-2'),
      emptyCopy: document.querySelector('#empty-state p').textContent.trim()
    }))()`);
    assert.equal(initial.source, 'empty');
    assert.equal(initial.clock, '00:00');
    assert.equal(initial.startEnabled, true);
    assert.equal(initial.restartDisabled, true);
    assert.equal(initial.demoButtons, 0);
    assert.equal(initial.versionedAssets, true);
    assert.match(initial.emptyCopy, /00:00/);

    const legacyDemoSession = {
      version: 1,
      title: '旧演示稿',
      language: 'zh-CN',
      segments: [{ id: 'demo-old', startMs: 0, endMs: 3_000, text: '旧演示内容', source: 'demo' }],
      updatedAt: new Date().toISOString(),
    };
    await evaluate(client, `document.body.dataset.testReload = 'pending'; localStorage.setItem('scribe65.session.v1', ${JSON.stringify(JSON.stringify(legacyDemoSession))}); location.reload()`);
    await waitForExpression(client, `!document.body.dataset.testReload && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `document.body.dataset.source`), 'empty');
    assert.equal(await evaluate(client, `document.querySelectorAll('.segment-card').length`), 0);
    assert.equal(await evaluate(client, `localStorage.getItem('scribe65.session.v1')`), null);

    await evaluate(client, `document.querySelector('#start-button').click()`);
    await waitForExpression(client, `window.__SCRIBE65__.getSnapshot().mode === 'listening'`);
    const firstStart = await evaluate(client, `(() => ({
      clock: document.querySelector('#recording-clock').textContent,
      durationMs: window.__SCRIBE65__.getSnapshot().durationMs,
      startDisabled: document.querySelector('#start-button').disabled,
      restartDisabled: document.querySelector('#restart-button').disabled
    }))()`);
    assert.equal(firstStart.clock, '00:00');
    assert.equal(firstStart.durationMs, 0);
    assert.equal(firstStart.startDisabled, true);
    assert.equal(firstStart.restartDisabled, true);

    await evaluate(client, `window.__emitMockTranscript('第一轮听写从零秒开始。')`);
    await waitForExpression(client, `document.querySelectorAll('.segment-card').length === 1`);
    assert.equal(await evaluate(client, `document.querySelector('.segment-card time').textContent`), '00:00');
    await evaluate(client, `document.querySelector('#stop-button').click()`);
    await waitForExpression(client, `window.__SCRIBE65__.getSnapshot().mode === 'idle' && !document.querySelector('#playback-rack').hidden`);

    const playback = await evaluate(client, `(() => ({
      hasAudio: window.__SCRIBE65__.getSnapshot().hasAudio,
      downloadEnabled: !document.querySelector('#download-audio').disabled,
      deleteLabel: document.querySelector('#delete-audio').textContent.trim(),
      startDisabled: document.querySelector('#start-button').disabled,
      restartEnabled: !document.querySelector('#restart-button').disabled
    }))()`);
    assert.equal(playback.hasAudio, true);
    assert.equal(playback.downloadEnabled, true);
    assert.equal(playback.deleteLabel, '删除录音');
    assert.equal(playback.startDisabled, true);
    assert.equal(playback.restartEnabled, true);

    await evaluate(client, `document.querySelector('#playback-rack').scrollIntoView({ block: 'center' })`);
    await sleep(3_000);
    await screenshot(client, 'app65-desktop-cdp.png');
    await evaluate(client, `document.querySelector('#delete-audio').click()`);
    const deletedPlayback = await evaluate(client, `(() => ({
      hidden: document.querySelector('#playback-rack').hidden,
      hasAudio: window.__SCRIBE65__.getSnapshot().hasAudio,
      src: document.querySelector('#audio-player').getAttribute('src')
    }))()`);
    assert.deepEqual(deletedPlayback, { hidden: true, hasAudio: false, src: null });

    const restoredSession = {
      version: 1,
      title: '需要重录的访谈',
      language: 'zh-CN',
      segments: [
        { id: 'old-01', startMs: 65_000, endMs: 71_500, text: '这是一段旧的听写内容。', source: 'speech' },
      ],
      updatedAt: new Date().toISOString(),
    };
    await evaluate(client, `window.__SCRIBE65__.resetSession(); localStorage.setItem('scribe65.session.v1', ${JSON.stringify(JSON.stringify(restoredSession))}); location.reload()`);
    await waitForExpression(client, `document.body.dataset.source === 'restored' && document.querySelectorAll('.segment-card').length === 1`);
    assert.equal(await evaluate(client, `document.querySelector('#recording-clock').textContent`), '01:11');
    assert.equal(await evaluate(client, `document.querySelector('#start-button').disabled`), true);
    assert.equal(await evaluate(client, `document.querySelector('#restart-button').disabled`), false);

    await evaluate(client, `document.querySelector('#restart-button').click()`);
    await waitForExpression(client, `window.__SCRIBE65__.getSnapshot().mode === 'listening' && document.querySelectorAll('.segment-card').length === 0`);
    const restarted = await evaluate(client, `(() => ({
      clock: document.querySelector('#recording-clock').textContent,
      durationMs: window.__SCRIBE65__.getSnapshot().durationMs,
      title: document.querySelector('#session-title').value,
      storedSegments: JSON.parse(localStorage.getItem('scribe65.session.v1')).segments.length
    }))()`);
    assert.deepEqual(restarted, {
      clock: '00:00',
      durationMs: 0,
      title: '需要重录的访谈',
      storedSegments: 0,
    });

    await evaluate(client, `window.__emitMockTranscript('重新听写后的第一句。')`);
    await waitForExpression(client, `document.querySelectorAll('.segment-card').length === 1`);
    await evaluate(client, `document.querySelector('#stop-button').click()`);
    await waitForExpression(client, `window.__SCRIBE65__.getSnapshot().mode === 'idle' && !document.querySelector('#playback-rack').hidden`);
    assert.equal(await evaluate(client, `window.__SCRIBE65__.getSnapshot().session.segments[0].startMs`), 0);
    assert.equal(await evaluate(client, `document.querySelector('.segment-card time').textContent`), '00:00');

    await evaluate(client, `(() => {
      const textarea = document.querySelector('.segment-card textarea');
      textarea.value = '这是已经校对过的重新听写内容。';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));
      const search = document.querySelector('#search-input');
      search.value = '校对';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(await evaluate(client, `[...document.querySelectorAll('.segment-card')].filter((card) => !card.hidden).length`), 1);
    await waitForExpression(client, `JSON.parse(localStorage.getItem('scribe65.session.v1')).segments[0].text.includes('校对')`);

    await evaluate(client, `document.querySelector('#new-session-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#reset-dialog').open`), true);
    await evaluate(client, `document.querySelector('#confirm-reset').click()`);
    await waitForExpression(client, `document.body.dataset.source === 'empty' && document.querySelectorAll('.segment-card').length === 0`);
    assert.equal(await evaluate(client, `localStorage.getItem('scribe65.session.v1')`), null);

    const showcaseSession = {
      version: 1,
      title: '产品访谈 · 现场记录',
      language: 'zh-CN',
      segments: [
        { id: 'line-01', startMs: 0, endMs: 6_500, text: '欢迎来到 SCRIBE，我们从零秒开始记录这次访谈。', source: 'speech' },
        { id: 'line-02', startMs: 8_400, endMs: 17_100, text: '每一句话都有与本轮录音一致的时间码，方便快速校对。', source: 'speech' },
        { id: 'line-03', startMs: 20_100, endMs: 31_100, text: '需要重录时，重新听写会清空旧内容并回到零秒。', source: 'speech' },
        { id: 'line-04', startMs: 34_500, endMs: 46_800, text: '整理完成后，可以复制全文或导出 TXT 与 SRT。', source: 'speech' },
      ],
      updatedAt: new Date().toISOString(),
    };
    await evaluate(client, `localStorage.setItem('scribe65.session.v1', ${JSON.stringify(JSON.stringify(showcaseSession))}); location.reload()`);
    await waitForExpression(client, `document.body.dataset.source === 'restored' && document.querySelectorAll('.segment-card').length === 4`);

    const desktop = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      segments: document.querySelectorAll('.segment-card').length,
      title: document.querySelector('#session-title').value,
      h1: document.querySelectorAll('h1').length,
      ready: document.body.classList.contains('ready'),
      engine: document.querySelector('#engine-label').textContent.trim(),
      restartEnabled: !document.querySelector('#restart-button').disabled,
      exportEnabled: [...document.querySelectorAll('.export-actions button')].every((button) => !button.disabled),
      demoButtons: document.querySelectorAll('#demo-button, #empty-demo-button').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(desktop.source, 'restored');
    assert.equal(desktop.segments, 4);
    assert.equal(desktop.title, '产品访谈 · 现场记录');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.ready, true);
    assert.equal(desktop.restartEnabled, true);
    assert.equal(desktop.exportEnabled, true);
    assert.equal(desktop.demoButtons, 0);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await waitForExpression(client, `document.body.dataset.source === 'restored' && document.querySelectorAll('.segment-card').length === 4`);

    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('.transport-button, .file-button, .new-button, .export-actions button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, height: box.height };
      });
      const consoleBox = document.querySelector('.console-panel').getBoundingClientRect();
      const transcriptBox = document.querySelector('.transcript-panel').getBoundingClientRect();
      return {
        source: document.body.dataset.source,
        segments: document.querySelectorAll('.segment-card').length,
        restartEnabled: !document.querySelector('#restart-button').disabled,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stacked: transcriptBox.top >= consoleBox.bottom - 1,
        controls
      };
    })()`);
    assert.equal(mobile.source, 'restored');
    assert.equal(mobile.segments, 4);
    assert.equal(mobile.restartEnabled, true);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.stacked, true);
    mobile.controls.forEach((box) => {
      assert.ok(box.left >= 0 && box.right <= 390, `Control outside viewport: ${JSON.stringify(box)}`);
      assert.ok(box.height >= 44, `Control too short: ${JSON.stringify(box)}`);
    });
    await evaluate(client, `document.querySelector('.transport').scrollIntoView({ block: 'center' })`);
    await sleep(200);
    await screenshot(client, 'app65-mobile-cdp.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ failOpen, initial, firstStart, playback, restarted, desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await sleep(200);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
