import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4476 + (process.pid % 300);
const debugPort = 9676 + (process.pid % 300);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app76-smoke-${process.pid}`);
const invalidBackupPath = path.resolve(os.tmpdir(), `codex-app76-invalid-${process.pid}.json`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
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

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && Boolean(window.DUE76)`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(appDir, relative);
    if (filePath !== appDir && !filePath.startsWith(`${appDir}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = readFileSync(filePath);
      response.writeHead(200, { 'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay inside the temp directory');
  assert.ok(invalidBackupPath.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Temporary backup must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(invalidBackupPath, 'not valid json', 'utf8');

  const appServer = externalBaseUrl ? null : createStaticServer();
  if (appServer) await new Promise((resolve) => appServer.listen(appPort, '127.0.0.1', resolve));

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
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
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable'), client.send('DOM.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.readyState === 'complete' && Boolean(window.DUE76)`);

    const empty = await evaluate(client, `({
      h1: document.querySelectorAll('h1').length,
      ledgerEmpty: !document.querySelector('#ledgerEmpty').hidden,
      timelineEmpty: !document.querySelector('#timelineEmpty').hidden,
      stored: localStorage.getItem('due76.subscriptions.v1'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })`);
    assert.deepEqual(empty, { h1: 1, ledgerEmpty: true, timelineEmpty: true, stored: null, scrollWidth: 1440, clientWidth: 1440 });

    await evaluate(client, `document.querySelector('#sampleButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.subscription-card').length === 6`);
    assert.equal(await evaluate(client, `document.querySelector('#monthlyTotal').textContent`), '¥210.00');
    assert.equal(await evaluate(client, `document.querySelector('#dueCount').textContent`), '4');
    assert.equal(await evaluate(client, `document.querySelector('#renewalCount').textContent`), '5');

    await evaluate(client, `document.querySelector('.subscription-card[data-id="sample_stream"] button[data-action="edit"]').click()`);
    await waitForExpression(client, `document.querySelector('#editorDialog').open`);
    await evaluate(client, `document.querySelector('#amountInput').value = '60'; document.querySelector('#notesInput').value = '已核对家庭成员，继续保留。'; document.querySelector('#subscriptionForm').requestSubmit()`);
    await waitForExpression(client, `window.DUE76.getSubscriptions().find(item => item.id === 'sample_stream').amount === 60`);

    await evaluate(client, `document.querySelector('.subscription-card[data-id="sample_cloud"] button[data-action="toggle"]').click()`);
    await waitForExpression(client, `window.DUE76.getSubscriptions().find(item => item.id === 'sample_cloud').status === 'paused'`);
    await evaluate(client, `document.querySelector('.subscription-card[data-id="sample_music"] button[data-action="renew"]').click()`);
    await waitForExpression(client, `window.DUE76.getSubscriptions().find(item => item.id === 'sample_music').nextRenewal > window.SubscriptionCore.todayString()`);

    await evaluate(client, `document.querySelector('#searchInput').value = 'FrameForge'; document.querySelector('#searchInput').dispatchEvent(new Event('input', { bubbles: true }))`);
    await waitForExpression(client, `document.querySelectorAll('.subscription-card').length === 1`);
    await evaluate(client, `document.querySelector('#searchInput').value = ''; document.querySelector('#searchInput').dispatchEvent(new Event('input', { bubbles: true }))`);
    await waitForExpression(client, `document.querySelectorAll('.subscription-card').length === 6`);

    await evaluate(client, `document.querySelector('#exportButton').click()`);
    await waitForExpression(client, `document.querySelector('#liveRegion').textContent.includes('已导出')`);
    const documentNode = await client.send('DOM.getDocument', { depth: 1 });
    const inputNode = await client.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#importFile' });
    await client.send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [invalidBackupPath] });
    await waitForExpression(client, `document.querySelector('#liveRegion').textContent.includes('JSON')`);

    await evaluate(client, `document.querySelector('#addButton').click()`);
    await waitForExpression(client, `document.querySelector('#editorDialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#nameInput').value = '测试月报';
      document.querySelector('#amountInput').value = '9.9';
      document.querySelector('#renewalInput').value = window.SubscriptionCore.todayString();
      document.querySelector('#categoryInput').value = 'other';
      document.querySelector('#subscriptionForm').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.subscription-card').length === 7`);
    await evaluate(client, `(() => {
      const item = window.DUE76.getSubscriptions().find(candidate => candidate.name === '测试月报');
      document.querySelector('.subscription-card[data-id="' + item.id + '"] button[data-action="delete"]').click();
    })()`);
    await waitForExpression(client, `document.querySelector('#deleteDialog').open`);
    await evaluate(client, `document.querySelector('#confirmDelete').click()`);
    await waitForExpression(client, `document.querySelectorAll('.subscription-card').length === 6`);

    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const keyboardFocus = await evaluate(client, `({ tag: document.activeElement?.tagName || '', outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : 'none' })`);
    assert.ok(keyboardFocus.tag, 'Tab should move focus');
    assert.notEqual(keyboardFocus.outline, 'none');

    const desktop = await evaluate(client, `({
      subscriptions: window.DUE76.getSubscriptions().length,
      cards: document.querySelectorAll('.subscription-card').length,
      tickets: document.querySelectorAll('.timeline-ticket').length,
      active: document.querySelector('#activeCount').textContent,
      ticketDateFont: parseFloat(getComputedStyle(document.querySelector('.ticket-date')).fontSize),
      ticketTitleFont: parseFloat(getComputedStyle(document.querySelector('.timeline-ticket strong')).fontSize),
      cardNoteFont: parseFloat(getComputedStyle(document.querySelector('.card-note')).fontSize),
      cardMetaFont: parseFloat(getComputedStyle(document.querySelector('.card-money span')).fontSize),
      cardActionFont: parseFloat(getComputedStyle(document.querySelector('.card-actions button')).fontSize),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      stored: JSON.parse(localStorage.getItem('due76.subscriptions.v1')).length
    })`);
    assert.equal(desktop.subscriptions, 6);
    assert.equal(desktop.cards, 6);
    assert.ok(desktop.tickets >= 3);
    assert.ok(desktop.ticketDateFont >= 10);
    assert.ok(desktop.ticketTitleFont >= 16);
    assert.ok(desktop.cardNoteFont >= 12);
    assert.ok(desktop.cardMetaFont >= 11);
    assert.ok(desktop.cardActionFont >= 11);
    assert.equal(desktop.stored, 6);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    await evaluate(client, `document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)`);
    await sleep(400);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.readyState === 'complete' && window.DUE76.getSubscriptions().length === 6`);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll('.card-actions button, #addButton, #sampleButton')].filter((button) => !button.hidden).map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right };
      });
      const board = document.querySelector('.renewal-board').getBoundingClientRect();
      return {
        cards: document.querySelectorAll('.subscription-card').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        boardLeft: board.left,
        boardRight: board.right,
        buttons
      };
    })()`);
    assert.equal(mobile.cards, 6);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.boardLeft >= 0 && mobile.boardRight <= 390);
    mobile.buttons.forEach((box) => assert.ok(box.height >= 44 && box.left >= 0 && box.right <= 390, `Control outside viewport: ${JSON.stringify(box)}`));
    await evaluate(client, `window.scrollTo(0, Math.max(0, document.querySelector('.renewal-board').offsetTop - 8))`);
    await sleep(500);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, keyboardFocus, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (appServer) await new Promise((resolve) => appServer.close(resolve));
    await sleep(300);
    try { rmSync(invalidBackupPath, { force: true }); } catch {}
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
