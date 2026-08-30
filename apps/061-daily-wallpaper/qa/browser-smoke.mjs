import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/apps/061-daily-wallpaper/';
const outputDir = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'lumen61-smoke'));
const port = 9331;
const profile = path.resolve(os.tmpdir(), `codex-app61-smoke-${process.pid}`);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
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
  const { existsSync } = await import('node:fs');
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.text || 'Runtime exception'));
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
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && ['live', 'mixed'].includes(document.body.dataset.source)`, 15_000);

    const desktop = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      frames: document.querySelectorAll('.film-frame').length,
      title: document.querySelector('#wallpaper-title').textContent.trim(),
      h1: document.querySelectorAll('h1').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      ready: document.body.classList.contains('ready')
    }))()`);
    assert.ok(['live', 'mixed'].includes(desktop.source));
    assert.equal(desktop.frames, 8);
    assert.equal(desktop.h1, 1);
    assert.ok(desktop.title.length > 2);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.ready, true);

    const originalId = await evaluate(client, `document.querySelector('#hero-image').dataset.itemId`);
    await evaluate(client, `document.querySelector('#favorite-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#favorite-button').getAttribute('aria-pressed')`), 'true');
    assert.equal(await evaluate(client, `document.querySelectorAll('.favorite-card').length`), 1);

    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
    await waitForExpression(client, `document.querySelector('#hero-image').dataset.itemId !== ${JSON.stringify(originalId)}`);
    await waitForExpression(client, `document.querySelector('#hero-image').complete && document.querySelector('#hero-image').naturalWidth > 0`, 15_000);

    await evaluate(client, `document.querySelector('#homepage-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#homepage-dialog').open`), true);
    assert.equal(await evaluate(client, `Boolean(JSON.parse(localStorage.getItem('lumen61.state.v1')).homepageId)`), true);
    await evaluate(client, `document.querySelector('#homepage-dialog').close(); document.querySelector('#open-favorites').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#favorites-dialog').open`), true);
    await evaluate(client, `document.querySelector('#favorites-dialog').close()`);
    await waitForExpression(client, `[...document.querySelectorAll('.film-frame img')].filter((image) => image.complete && image.naturalWidth > 0).length >= 6`, 15_000);
    await sleep(500);
    await screenshot(client, 'app61-desktop-cdp.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, `${baseUrl}?offline=1`);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.dataset.source === 'fallback'`);

    const mobile = await evaluate(client, `(() => {
      const actions = [...document.querySelectorAll('.action-button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      });
      return {
        source: document.body.dataset.source,
        frames: document.querySelectorAll('.film-frame').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        titleRight: document.querySelector('#wallpaper-title').getBoundingClientRect().right,
        actions
      };
    })()`);
    assert.equal(mobile.source, 'fallback');
    assert.equal(mobile.frames, 8);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.titleRight <= 390);
    mobile.actions.forEach((box) => {
      assert.ok(box.left >= 0 && box.right <= 390 && box.width >= 44, `Action outside viewport: ${JSON.stringify(box)}`);
    });
    await screenshot(client, 'app61-mobile-cdp.png');

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
