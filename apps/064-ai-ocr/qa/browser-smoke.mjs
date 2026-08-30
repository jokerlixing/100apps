import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/apps/064-ai-ocr/';
const outputDir = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'glyph64-smoke'));
const port = 9364;
const profile = path.resolve(os.tmpdir(), `codex-app64-smoke-${process.pid}`);
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
    await sleep(100);
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
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(detail || 'Browser evaluation failed');
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
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

const workerMock = `
(() => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  window.Tesseract = {
    createWorker: async (_languages, _oem, options = {}) => {
      let terminated = false;
      return {
        recognize: async () => {
          const steps = [
            ['loading tesseract core', 0.18],
            ['loading language traineddata', 0.42],
            ['recognizing text', 0.2],
            ['recognizing text', 0.68],
            ['recognizing text', 1]
          ];
          for (const [status, progress] of steps) {
            if (terminated) throw new Error('mock worker terminated');
            options.logger?.({ status, progress });
            await delay(45);
          }
          return { data: { text: '识别校样 064\\nLOCAL OCR / PROOF SHEET\\n图片留在本机，文字由你校对。', confidence: 96.4 } };
        },
        terminate: async () => { terminated = true; }
      };
    }
  };
})();`;

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
    '--disable-features=Translate',
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: workerMock });

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(client, baseUrl);

    const initial = await evaluate(client, `(() => ({
      h1: document.querySelectorAll('h1').length,
      items: document.querySelectorAll('.queue-item').length,
      state: document.body.dataset.state,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.deepEqual(initial, { h1: 1, items: 0, state: 'empty', scrollWidth: 1440, clientWidth: 1440 });

    await evaluate(client, `document.querySelector('#sample-button').click()`);
    await waitForExpression(client, `window.Glyph64.snapshot().queue.length === 1`);
    await evaluate(client, `document.querySelector('#run-button').click()`);
    await waitForExpression(client, `window.Glyph64.snapshot().queue[0].status === 'done'`, 15_000);

    const desktop = await evaluate(client, `(() => {
      const state = window.Glyph64.snapshot();
      const editor = document.querySelector('#proof-editor');
      editor.value += '\\n人工校对完成';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        queue: state.queue.length,
        status: state.queue[0].status,
        text: editor.value,
        editorDisabled: editor.disabled,
        confidence: document.querySelector('#confidence-value').textContent,
        batch: document.querySelector('#batch-summary').textContent,
        exportDisabled: document.querySelector('#export-button').disabled,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    })()`);
    assert.equal(desktop.queue, 1);
    assert.equal(desktop.status, 'done');
    assert.match(desktop.text, /人工校对完成/);
    assert.equal(desktop.editorDisabled, false);
    assert.equal(desktop.confidence, '96%');
    assert.match(desktop.batch, /1 张完成/);
    assert.equal(desktop.exportDisabled, false);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    await sleep(3400);
    await screenshot(client, 'screenshot.png');

    await evaluate(client, `document.querySelector('#sample-button').click()`);
    await waitForExpression(client, `window.Glyph64.snapshot().queue.length === 2`);
    await evaluate(client, `document.querySelector('#run-button').click()`);
    await waitForExpression(client, `window.Glyph64.snapshot().running === true`);
    await evaluate(client, `document.querySelector('#stop-button').click()`);
    await waitForExpression(client, `window.Glyph64.snapshot().running === false`);
    const stopped = await evaluate(client, `window.Glyph64.snapshot().queue.map((item) => item.status)`);
    assert.deepEqual(stopped, ['done', 'queued']);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('#run-button, #stop-button, .import-button')]
        .filter((element) => !element.hidden)
        .map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        workspaceWidth: document.querySelector('#workspace').getBoundingClientRect().width,
        controls
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.workspaceWidth <= 390);
    mobile.controls.forEach((box) => assert.ok(box.height >= 44 && box.width > 44, `Small control: ${JSON.stringify(box)}`));

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, desktop, stopped, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await sleep(250);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      rmSync(profile, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
