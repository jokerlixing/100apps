import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const appPort = 4584 + (process.pid % 200);
const debugPort = 9784 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app84-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1208/chrome-win64/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1161/chrome-win/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
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
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) || []), listener]); }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { if (this.socket.readyState < 2) this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const appServer = spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: appDir,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort) },
  });
  await waitFor(async () => (await fetch(baseUrl)).ok, 10_000, 'MARGIN / 84 static server');

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--disable-extensions-except=${appDir}`, `--load-extension=${appDir}`,
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
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.querySelector('#readingCopy') && globalThis.MarginCore`);

    await evaluate(client, `document.querySelector('.select-sentence').click()`);
    await waitForExpression(client, `document.querySelector('#translationOutput').textContent.includes('先确认两遍')`);
    const desktop = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll('button, select, a')].filter((item) => {
        const box = item.getBoundingClientRect();
        return box.width && box.height && box.top < innerHeight && box.bottom > 0;
      }).map((item) => ({ tag: item.tagName, width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height }));
      return {
        title: document.title,
        h1: document.querySelectorAll('h1').length,
        translation: document.querySelector('#translationOutput').textContent,
        history: document.querySelectorAll('.history-item').length,
        provider: document.querySelector('#proofProvider').textContent,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        buttons
      };
    })()`);
    assert.match(desktop.title, /MARGIN/);
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.translation, '先确认两遍，再翻译一次。');
    assert.equal(desktop.history, 1);
    assert.equal(desktop.provider, 'LOCAL PHRASE');
    assert.equal(desktop.scrollWidth, desktop.clientWidth);

    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focus = await evaluate(client, `({ tag: document.activeElement?.tagName, outline: getComputedStyle(document.activeElement).outlineStyle })`);
    assert.ok(focus.tag);
    assert.notEqual(focus.outline, 'none');
    await evaluate(client, `document.activeElement?.blur(); window.scrollTo(0, 0)`);
    await sleep(350);
    await screenshot(client, 'screenshot-desktop.png');

    const injectionState = await evaluate(client, `({
      loadedFlag: document.documentElement.dataset.margin84Loaded || '',
      actionExists: Boolean(document.querySelector('.margin84-action')),
      actionHidden: document.querySelector('.margin84-action')?.hidden ?? null
    })`);
    const targetsBeforeSelection = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const backgroundTarget = targetsBeforeSelection.find((target) => target.type === 'service_worker' && target.url.endsWith('/background.js'));
    assert.ok(backgroundTarget, 'MARGIN background service worker must be running');
    assert.deepEqual(injectionState, { loadedFlag: 'true', actionExists: true, actionHidden: true });

    await evaluate(client, `(() => {
      const sentence = document.querySelector('.selectable-sentence');
      const range = document.createRange();
      range.selectNodeContents(sentence);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      sentence.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelector('.margin84-action') && !document.querySelector('.margin84-action').hidden`);
    const actionPoint = await evaluate(client, `(() => {
      const box = document.querySelector('.margin84-action').getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: actionPoint.x, y: actionPoint.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: actionPoint.x, y: actionPoint.y, button: 'left', clickCount: 1 });
    await waitForExpression(client, `document.querySelector('.margin84-card') && !document.querySelector('.margin84-card').hidden && !document.querySelector('.margin84-output').textContent.includes('正在')`, 16_000);
    const extension = await evaluate(client, `({
      actionInjected: Boolean(document.querySelector('.margin84-action')),
      cardVisible: !document.querySelector('.margin84-card').hidden,
      output: document.querySelector('.margin84-output').textContent,
      note: document.querySelector('.margin84-note').textContent
    })`);
    assert.equal(extension.actionInjected, true);
    assert.equal(extension.cardVisible, true);
    assert.ok(extension.output.length > 4);
    assert.ok(extension.note.length > 4);

    const allTargets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const extensionTarget = allTargets.find((target) => target.url?.startsWith('chrome-extension://'));
    assert.ok(extensionTarget, 'The unpacked extension must start a Chrome extension target');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('.select-sentence').click()`);
    await waitForExpression(client, `document.querySelector('#translationOutput').textContent.includes('先确认两遍')`);
    const mobile = await evaluate(client, `(() => {
      const proof = document.querySelector('.translation-proof').getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        proofLeft: proof.left,
        proofRight: proof.right,
        translation: document.querySelector('#translationOutput').textContent
      };
    })()`);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.scrollWidth, 390);
    assert.ok(mobile.proofLeft >= 0 && mobile.proofRight <= 390);
    await evaluate(client, `document.querySelector('.translation-proof').scrollIntoView({ block: 'start' })`);
    await sleep(350);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, focus, extension, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (!appServer.killed) appServer.kill();
    await sleep(350);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
