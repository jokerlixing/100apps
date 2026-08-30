import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const debugPort = 20_000 + (process.pid % 30_000);
let baseUrl = '';
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app96-smoke-${process.pid}`);
const downloadDir = path.resolve(os.tmpdir(), `codex-app96-downloads-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png' };
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

function createStaticServer() {
  return http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const decoded = decodeURIComponent(requestUrl.pathname);
      let filePath = path.resolve(repoRoot, `.${decoded}`);
      if (!filePath.startsWith(`${repoRoot}${path.sep}`) && filePath !== repoRoot) return response.writeHead(403).end('Forbidden');
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!existsSync(filePath) || !statSync(filePath).isFile()) return response.writeHead(404).end('Not found');
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(readFileSync(filePath));
    } catch {
      response.writeHead(500).end('Server error');
    }
  });
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
      } else {
        (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
      }
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
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
}
async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(downloadDir, { recursive: true });
  const server = createStaticServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/apps/096-voice-bookkeeping/`;
  const browser = await import('node:child_process').then(({ spawn }) => spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' }));
  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    client = new CdpClient(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => { if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' ')); });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.entry-card').length === 5`);

    const initial = await evaluate(client, `(() => ({
      h1: document.querySelectorAll('h1').length,
      entries: document.querySelectorAll('.entry-card').length,
      summary: document.querySelector('#summary-count').textContent,
      speechStatus: document.querySelector('#recognition-status').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.deepEqual({ h1: initial.h1, entries: initial.entries, summary: initial.summary }, { h1: 1, entries: 5, summary: '5' });
    assert.ok(initial.speechStatus.length > 8);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await evaluate(client, `document.querySelector('[data-example*="午饭"]').click()`);
    await waitForExpression(client, `document.querySelector('#amount-input').value === '32.5' && !document.querySelector('#save-transaction').disabled`);
    const parsed = await evaluate(client, `({
      amount: document.querySelector('#amount-input').value,
      category: document.querySelector('#category-input').value,
      account: document.querySelector('#account-input').value,
      matches: document.querySelectorAll('#match-tape span').length
    })`);
    assert.deepEqual(parsed, { amount: '32.5', category: 'food', account: 'wechat', matches: 5 });
    await evaluate(client, `document.querySelector('#receipt-form').requestSubmit()`);
    await waitForExpression(client, `document.querySelectorAll('.entry-card').length === 6`);

    await evaluate(client, `document.querySelector('[data-example*="打车"]').click()`);
    await waitForExpression(client, `document.querySelector('#amount-input').value === '28'`);
    await evaluate(client, `document.querySelector('#amount-input').value='30'; document.querySelector('#note-input').value='机场打车（人工校对）'; document.querySelector('#receipt-form').requestSubmit()`);
    await waitForExpression(client, `[...document.querySelectorAll('.entry-copy strong')].some((node) => node.textContent.includes('机场打车'))`);

    await evaluate(client, `(() => { const card=[...document.querySelectorAll('.entry-card')].find((node)=>node.querySelector('.entry-copy strong').textContent.includes('机场打车')); card.querySelector('[data-action="edit"]').click(); })()`);
    await waitForExpression(client, `document.querySelector('#save-transaction').textContent === '保存修改'`);
    await evaluate(client, `document.querySelector('#note-input').value='机场打车（已复核）'; document.querySelector('#receipt-form').requestSubmit()`);
    await waitForExpression(client, `[...document.querySelectorAll('.entry-copy strong')].some((node) => node.textContent.includes('已复核'))`);
    await evaluate(client, `window.confirm=()=>true; (() => { const card=[...document.querySelectorAll('.entry-card')].find((node)=>node.querySelector('.entry-copy strong').textContent.includes('已复核')); card.querySelector('[data-action="delete"]').click(); })()`);
    await waitForExpression(client, `document.querySelectorAll('.entry-card').length === 6`);

    await evaluate(client, `document.querySelector('#type-filter').value='income'; document.querySelector('#type-filter').dispatchEvent(new Event('change'))`);
    const incomeFilter = await evaluate(client, `({ count: document.querySelectorAll('.entry-card').length, allIncome: [...document.querySelectorAll('.entry-card')].every((card)=>card.querySelector('.entry-amount').classList.contains('income')) })`);
    assert.ok(incomeFilter.count >= 2);
    assert.equal(incomeFilter.allIncome, true);
    await evaluate(client, `document.querySelector('#reset-filters').click(); document.querySelector('#export-csv').click()`);
    const csvName = await waitFor(() => readdirSync(downloadDir).find((name) => /^tally96-\d{4}-\d{2}\.csv$/.test(name)), 5000, 'CSV download');
    const csv = readFileSync(path.join(downloadDir, csvName), 'utf8');
    assert.match(csv, /日期,类型,金额,分类,账户,备注,原始输入/);
    assert.match(csv, /午饭/);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.entry-card').length === 6`);
    await evaluate(client, `window.scrollTo(0, 0); document.querySelector('#transcript-input').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const keyboardFocus = await evaluate(client, `(() => { const node=document.activeElement; const style=getComputedStyle(node); return { id: node.id, outline: style.outlineStyle, width: style.outlineWidth }; })()`);
    assert.equal(keyboardFocus.id, 'voice-button');
    assert.equal(keyboardFocus.outline, 'solid');
    await sleep(300);
    const desktop = await evaluate(client, `(() => {
      const focus = getComputedStyle(document.querySelector('#parse-button'));
      return {
        entries: document.querySelectorAll('.entry-card').length,
        stored: JSON.parse(localStorage.getItem('tally96-ledger-v1')).transactions.length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    })()`);
    assert.equal(desktop.entries, 6);
    assert.equal(desktop.stored, 6);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    await evaluate(client, `document.activeElement.blur()`);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('button, input, select, textarea')].filter((node) => {
        const style=getComputedStyle(node); const box=node.getBoundingClientRect();
        return style.display!=='none' && style.visibility!=='hidden' && style.pointerEvents!=='none' && box.width>0 && box.height>0 && !node.hidden && node.type!=='radio';
      }).map((node) => { const box=node.getBoundingClientRect(); return { id: node.id, height: box.height, left: box.left, right: box.right }; });
      return {
        entries: document.querySelectorAll('.entry-card').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        controls
      };
    })()`);
    assert.equal(mobile.entries, 6);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    mobile.controls.forEach((box) => {
      assert.ok(box.left >= -1 && box.right <= 391, `Control outside viewport: ${JSON.stringify(box)}`);
      if (!['transcript-input', 'search-filter', 'amount-input', 'date-input', 'note-input'].includes(box.id)) assert.ok(box.height >= 43, `Control too short: ${JSON.stringify(box)}`);
    });
    await evaluate(client, `document.querySelector('[data-example*="工资"]').click()`);
    await waitForExpression(client, `document.querySelector('#amount-input').value === '12000'`);
    await evaluate(client, `window.scrollTo(0, document.querySelector('.receipt-stage').offsetTop - document.querySelector('.masthead').offsetHeight + 50)`);
    await sleep(350);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, parsed, incomeFilter, keyboardFocus, desktop, mobile: { entries: mobile.entries, controls: mobile.controls.length, scrollWidth: mobile.scrollWidth }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(250);
    try { rmSync(downloadDir, { recursive: true, force: true }); } catch {}
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
