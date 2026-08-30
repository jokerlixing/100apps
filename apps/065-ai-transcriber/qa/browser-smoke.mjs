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

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(client, `${baseUrl}?demo=1`);
    await evaluate(client, `window.__SCRIBE65__.resetSession(); location.reload()`);
    try {
      await waitForExpression(client, `document.body.dataset.source === 'demo' && document.querySelectorAll('.segment-card').length === 4`);
    } catch (error) {
      const snapshot = await evaluate(client, `(() => ({
        source: document.body?.dataset.source,
        classes: document.body?.className,
        segments: document.querySelectorAll('.segment-card').length,
        hasApi: Boolean(window.__SCRIBE65__),
        text: document.querySelector('#interim-text')?.textContent,
        storage: localStorage.getItem('scribe65.session.v1')
      }))()`);
      throw new Error(`${error.message}\nInitial page snapshot: ${JSON.stringify(snapshot)}\nRuntime errors: ${JSON.stringify(runtimeErrors)}`);
    }

    const desktop = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      segments: document.querySelectorAll('.segment-card').length,
      title: document.querySelector('#session-title').value,
      h1: document.querySelectorAll('h1').length,
      ready: document.body.classList.contains('ready'),
      engine: document.querySelector('#engine-label').textContent.trim(),
      exportEnabled: [...document.querySelectorAll('.export-actions button')].every((button) => !button.disabled),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(desktop.source, 'demo');
    assert.equal(desktop.segments, 4);
    assert.equal(desktop.title, '产品访谈 · 演示');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.ready, true);
    assert.equal(desktop.exportEnabled, true);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);

    await evaluate(client, `(() => {
      const textarea = document.querySelector('.segment-card textarea');
      textarea.value = '这是已经校对过的第一段。';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    })()`);
    await evaluate(client, `(() => {
      const search = document.querySelector('#search-input');
      search.value = '字幕';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert.equal(await evaluate(client, `[...document.querySelectorAll('.segment-card')].filter((card) => !card.hidden).length`), 1);
    await evaluate(client, `(() => {
      const search = document.querySelector('#search-input');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('.delete-segment')].at(-1).click();
      return true;
    })()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.segment-card').length`), 3);
    await waitForExpression(client, `JSON.parse(localStorage.getItem('scribe65.session.v1')).segments.length === 3`);

    await navigate(client, baseUrl);
    await waitForExpression(client, `document.body.dataset.source === 'restored' && document.querySelectorAll('.segment-card').length === 3`);
    assert.equal(await evaluate(client, `document.querySelector('.segment-card textarea').value`), '这是已经校对过的第一段。');

    await evaluate(client, `document.querySelector('#new-session-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#reset-dialog').open`), true);
    await evaluate(client, `document.querySelector('#confirm-reset').click()`);
    await waitForExpression(client, `document.body.dataset.source === 'empty' && document.querySelectorAll('.segment-card').length === 0`);
    assert.equal(await evaluate(client, `localStorage.getItem('scribe65.session.v1')`), null);
    await evaluate(client, `document.querySelector('#demo-button').click()`);
    await waitForExpression(client, `document.body.dataset.source === 'demo' && document.querySelectorAll('.segment-card').length === 4`);
    await sleep(3000);
    await screenshot(client, 'app65-desktop-cdp.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, `${baseUrl}?demo=1`);
    await evaluate(client, `window.__SCRIBE65__.resetSession(); location.reload()`);
    await waitForExpression(client, `document.body.dataset.source === 'demo' && document.querySelectorAll('.segment-card').length === 4`);

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
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stacked: transcriptBox.top >= consoleBox.bottom - 1,
        controls
      };
    })()`);
    assert.equal(mobile.source, 'demo');
    assert.equal(mobile.segments, 4);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.stacked, true);
    mobile.controls.forEach((box) => {
      assert.ok(box.left >= 0 && box.right <= 390, `Control outside viewport: ${JSON.stringify(box)}`);
      assert.ok(box.height >= 44, `Control too short: ${JSON.stringify(box)}`);
    });
    await sleep(3000);
    await screenshot(client, 'app65-mobile-cdp.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
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
