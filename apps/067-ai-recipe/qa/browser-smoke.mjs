import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4270 + (process.pid % 300);
const debugPort = 9470 + (process.pid % 300);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app67-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
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
    this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState < 2) this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url, runtimeErrors = []) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  try {
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
  } catch (error) {
    const page = await evaluate(client, `({ url: location.href, title: document.title, text: document.body ? document.body.innerText.slice(0, 500) : '' })`);
    throw new Error(`${error.message}\nRuntime errors: ${JSON.stringify(runtimeErrors)}\nPage: ${JSON.stringify(page)}`);
  }
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort), AI_API_KEY: '', AI_MODEL: '' },
  });
  if (appServer) {
    await waitFor(async () => {
      const response = await fetch(baseUrl);
      return response.ok;
    }, 10_000, 'PANTRY/67 server');
  }

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `(() => {
      const input = document.querySelector('#ingredient-input');
      input.value = '番茄、鸡蛋、米饭、蘑菇';
      document.querySelector('#add-ingredient').click();
      document.querySelector('#pantry-form').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.recipe-tab').length === 3`);
    await waitForExpression(client, `document.querySelector('#source-status').textContent.includes('AI 未连接')`);

    const desktop = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      chips: document.querySelectorAll('.ingredient-chip').length,
      recipes: document.querySelectorAll('.recipe-tab').length,
      title: document.querySelector('#recipe-title').textContent.trim(),
      h1: document.querySelectorAll('h1').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      ticketVisible: !document.querySelector('#ticket-output').hidden
    }))()`);
    assert.equal(desktop.source, 'local');
    assert.equal(desktop.chips, 4);
    assert.equal(desktop.recipes, 3);
    assert.equal(desktop.h1, 1);
    assert.ok(desktop.title.length >= 4);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.ticketVisible, true);

    await evaluate(client, `document.querySelectorAll('.recipe-tab')[2].click()`);
    await waitForExpression(client, `!document.querySelector('#shop-missing').disabled`);
    await evaluate(client, `document.querySelector('#shop-missing').click()`);
    assert.ok(await evaluate(client, `document.querySelectorAll('#shopping-list li').length`) > 0);
    await evaluate(client, `document.querySelector('#favorite-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#saved-count').textContent`), '1');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `document.querySelector('#saved-count').textContent`), '1');
    assert.equal(await evaluate(client, `document.querySelectorAll('.ingredient-chip').length`), 4);
    await evaluate(client, `document.querySelector('#pantry-form').requestSubmit()`);
    await waitForExpression(client, `document.querySelectorAll('.recipe-tab').length === 3`);
    await waitForExpression(client, `document.querySelector('#source-status').textContent.includes('AI 未连接')`);
    await sleep(750);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, `${baseUrl}?offline=1`, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `document.querySelector('#load-sample').click(); document.querySelector('#pantry-form').requestSubmit()`);
    await waitForExpression(client, `document.querySelectorAll('.recipe-tab').length === 3`);

    const mobile = await evaluate(client, `(() => {
      const actionBoxes = [...document.querySelectorAll('.ticket-actions button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, left: box.left, right: box.right };
      });
      const ticket = document.querySelector('#recipe-ticket').getBoundingClientRect();
      return {
        source: document.body.dataset.source,
        recipes: document.querySelectorAll('.recipe-tab').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        ticketLeft: ticket.left,
        ticketRight: ticket.right,
        actionBoxes
      };
    })()`);
    assert.equal(mobile.source, 'local');
    assert.equal(mobile.recipes, 3);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.ticketLeft >= 0 && mobile.ticketRight <= 390);
    mobile.actionBoxes.forEach((box) => {
      assert.ok(box.width >= 44 && box.left >= 0 && box.right <= 390, `Action outside viewport: ${JSON.stringify(box)}`);
    });
    await evaluate(client, `document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('#printer-title').scrollIntoView({ block: 'start' })`);
    await sleep(750);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (appServer && !appServer.killed) appServer.kill();
    await sleep(400);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
