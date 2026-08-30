import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const port = 4680 + (process.pid % 200);
const debugPort = 9980 + (process.pid % 100);
const baseUrl = `http://127.0.0.1:${port}/`;
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app98-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')
];
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png']
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 10_000, label = 'condition') {
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
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(appDir, requested);
    if (resolved !== appDir && !resolved.startsWith(`${appDir}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const stream = createReadStream(resolved);
    stream.on('open', () => {
      response.writeHead(200, { 'Content-Type': contentTypes.get(path.extname(resolved)) || 'application/octet-stream' });
      stream.pipe(response);
    });
    stream.on('error', () => response.writeHead(404).end('Not found'));
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
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
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

async function waitForExpression(client, expression, timeout = 10_000) {
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

async function waitForProcessExit(child, timeout = 3000) {
  if (child.exitCode !== null) return;
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(timeout)]);
}

async function removeProfile() {
  if (!profile.startsWith(`${tempRoot}${path.sep}`)) return;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code)) throw error;
      if (attempt === 5) return;
      await sleep(200 * (attempt + 1));
    }
  }
}

async function submitQuery(client, query, expectedView) {
  await evaluate(client, `(() => {
    const input = document.querySelector('#queryInput');
    input.value = ${JSON.stringify(query)};
    document.querySelector('#searchForm').requestSubmit();
  })()`);
  await waitForExpression(client, `document.body.dataset.view === ${JSON.stringify(expectedView)}`);
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${tempRoot}${path.sep}`), 'Browser profile must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
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
      if (type === 'error') runtimeErrors.push(args.map((argument) => argument.value || argument.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    const initial = await evaluate(client, `(() => ({
      view: document.body.dataset.view,
      title: document.querySelector('#resultPanel h2').textContent,
      blocks: document.querySelectorAll('.block-card').length,
      transactions: document.querySelectorAll('.transaction-row').length,
      selectedBlocks: document.querySelectorAll('.block-card.selected').length,
      copyValue: document.querySelector('[data-copy]').dataset.copy,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(initial.view, 'block');
    assert.match(initial.title, /21,450,938/);
    assert.equal(initial.blocks, 5);
    assert.equal(initial.transactions, 9);
    assert.equal(initial.selectedBlocks, 1);
    assert.match(initial.copyValue, /^0x[0-9a-f]{64}$/);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await evaluate(client, `document.querySelector('[data-sample="address"]').click()`);
    await waitForExpression(client, `document.body.dataset.view === 'address'`);
    assert.equal(await evaluate(client, `document.querySelector('#resultPanel h2').textContent`), 'Atlas 验证者');
    assert.match(await evaluate(client, `location.search`), /^\?q=0x[0-9a-f]{40}$/);

    await evaluate(client, `document.querySelector('[data-sample="transaction"]').click()`);
    await waitForExpression(client, `document.body.dataset.view === 'transaction'`);
    assert.match(await evaluate(client, `document.querySelector('#resultPanel .entity-kicker').textContent`), /成功/);

    const unknownTransaction = `0x${'0'.repeat(64)}`;
    await submitQuery(client, unknownTransaction, 'empty');
    assert.equal(await evaluate(client, `document.querySelector('.empty-code').textContent`), '404');
    await submitQuery(client, 'not-a-chain-record', 'empty');
    assert.equal(await evaluate(client, `document.querySelector('.empty-code').textContent`), '400');
    assert.match(await evaluate(client, `document.querySelector('#searchMessage').textContent`), /区块高度/);

    await navigate(client, `${baseUrl}?q=21450937`);
    assert.equal(await evaluate(client, `document.body.dataset.view`), 'block');
    assert.match(await evaluate(client, `document.querySelector('#resultPanel h2').textContent`), /21,450,937/);

    await client.send('Page.bringToFront');
    await evaluate(client, `document.querySelector('#queryInput').focus(); document.querySelector('.chain-section').scrollIntoView({block:'start',behavior:'instant'})`);
    await sleep(160);
    const desktop = await evaluate(client, `(() => {
      const focus = getComputedStyle(document.querySelector('#queryInput'));
      const tape = document.querySelector('#blockTape').getBoundingClientRect();
      const sheet = document.querySelector('#resultPanel').getBoundingClientRect();
      return {
        activeId: document.activeElement?.id || '',
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        tapeWidth: Math.round(tape.width),
        sheetWidth: Math.round(sheet.width),
        focusOutline: focus.outlineWidth,
        focusShadow: focus.boxShadow
      };
    })()`);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.ok(desktop.tapeWidth > 1000);
    assert.ok(desktop.sheetWidth > 800);
    assert.equal(desktop.activeId, 'queryInput');
    assert.ok(desktop.focusOutline !== '0px' || desktop.focusShadow !== 'none', `Focus styling failed: ${JSON.stringify(desktop)}`);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844
    });
    await navigate(client, `${baseUrl}?q=21450938`);
    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('#searchForm button,.sample-queries button,.block-card,.copy-button')]
        .map((element) => { const box=element.getBoundingClientRect(); return {width:box.width,height:box.height}; });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        workspaceColumns: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,
        blockColumns: getComputedStyle(document.querySelector('#blockTape')).gridTemplateColumns,
        controls
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.workspaceColumns.split(' ').length, 1);
    assert.equal(mobile.blockColumns.split(' ').length, 5);
    mobile.controls.forEach((box) => assert.ok(box.width >= 42 && box.height >= 40, `Touch target failed: ${JSON.stringify(box)}`));
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#toast').classList.remove('show')`);
    await sleep(120);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    server.closeAllConnections();
    server.close();
    if (browser.exitCode === null) browser.kill();
    await waitForProcessExit(browser);
    await removeProfile();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
