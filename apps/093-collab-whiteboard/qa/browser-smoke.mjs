import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const appPort = 4693 + (process.pid % 200);
const debugPort = 9793 + (process.pid % 150);
const roomCode = `SMOKE-${process.pid}`;
const baseUrl = `http://127.0.0.1:${appPort}/?room=${roomCode}`;
const profile = path.resolve(os.tmpdir(), `codex-app93-smoke-${process.pid}`);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
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

async function prepareClient(target, runtimeErrors) {
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') runtimeErrors.push(args.map((argument) => argument.value || argument.description).join(' '));
  });
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
  return client;
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && window.__ROOM93__`);
}

async function createTarget(url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to create browser target: ${response.status}`);
  return response.json();
}

async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, name), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const safe = ['index.html', 'styles.css', 'board-core.js', 'app.js'];
    if (!safe.includes(relative)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const file = path.join(appDir, relative);
    response.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let first;
  let second;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.find((item) => item.type === 'page') ? items : null;
    }, 10_000, 'Chrome DevTools');
    first = await prepareClient(targets.find((target) => target.type === 'page'), runtimeErrors);
    await first.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(first, baseUrl);
    await waitForExpression(first, `window.__ROOM93__.getState().objects.length >= 8`);

    const secondTarget = await createTarget(baseUrl);
    second = await prepareClient(secondTarget, runtimeErrors);
    await second.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false });
    await waitForExpression(second, `document.readyState === 'complete' && window.__ROOM93__`);
    await waitForExpression(first, `window.__ROOM93__.getMembers().length >= 2`);
    await waitForExpression(second, `window.__ROOM93__.getMembers().length >= 2`);

    const objectId = await evaluate(first, `window.__ROOM93__.addObject('sticky',{x:520,y:540,text:'跨标签同步验收',color:'yellow'})`);
    await waitForExpression(second, `window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收')`);

    await evaluate(first, `(() => {
      const element=document.querySelector('[data-id="${objectId}"]');
      const box=element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:71,clientX:box.left+20,clientY:box.top+20}));
      const textarea=document.querySelector('#objectText');
      textarea.value='跨标签同步验收 · 已编辑';
      textarea.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await waitForExpression(second, `window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收 · 已编辑')`);

    await evaluate(first, `document.querySelector('#undoButton').click()`);
    await waitForExpression(first, `window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收')`);
    await evaluate(first, `document.querySelector('#redoButton').click()`);
    await waitForExpression(first, `window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收 · 已编辑')`);

    await evaluate(first, `window.__ROOM93__.applyTemplate('retro')`);
    await waitForExpression(second, `window.__ROOM93__.getState().templateId === 'retro'`);
    await evaluate(first, `document.querySelector('#undoButton').click()`);
    await waitForExpression(first, `window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收 · 已编辑')`);

    await evaluate(first, `location.reload()`);
    await waitForExpression(first, `window.__ROOM93__ && window.__ROOM93__.getState().objects.some(item => item.text === '跨标签同步验收 · 已编辑')`);
    await waitForExpression(first, `window.Room93Core.parseBoardJson(JSON.stringify(window.__ROOM93__.getState())).roomId === '${roomCode}'`);
    await evaluate(first, `document.querySelector('[data-export="png"]').click()`);
    await waitForExpression(first, `document.querySelector('#toast').textContent.includes('PNG')`);

    await evaluate(first, `document.querySelector('#fitBoard').click(); document.querySelector('#toast').classList.remove('show')`);
    await sleep(350);
    const desktop = await evaluate(first, `(() => {
      const state=window.__ROOM93__.getState();
      const stage=document.querySelector('#boardStage').getBoundingClientRect();
      return {
        objects:state.objects.length,
        room:state.roomId,
        members:window.__ROOM93__.getMembers().length,
        title:document.querySelector('#boardTitle').value,
        h1:document.querySelectorAll('h1').length,
        viewportWidth:document.querySelector('#boardViewport').clientWidth,
        stageLeft:stage.left,
        stageRight:stage.right,
        documentWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
      };
    })()`);
    assert.equal(desktop.room, roomCode);
    assert.equal(desktop.h1, 1);
    assert.ok(desktop.objects >= 9);
    assert.equal(desktop.documentWidth, desktop.clientWidth);
    assert.ok(desktop.stageLeft >= 0 && desktop.stageRight <= 1440);
    await screenshot(first, 'screenshot-desktop.png');

    await first.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(first, baseUrl);
    await evaluate(first, `document.querySelector('#fitBoard').click()`);
    await sleep(350);
    const mobile = await evaluate(first, `(() => {
      const topbar=document.querySelector('.topbar').getBoundingClientRect();
      const toolbar=document.querySelector('.toolstrip').getBoundingClientRect();
      return {
        documentWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        topbarLeft:topbar.left,
        topbarRight:topbar.right,
        toolbarLeft:toolbar.left,
        toolbarRight:toolbar.right,
        title:document.querySelector('#boardTitle').value,
      };
    })()`);
    assert.equal(mobile.documentWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.topbarLeft >= 0 && mobile.topbarRight <= 390);
    assert.ok(mobile.toolbarLeft >= 0 && mobile.toolbarRight <= 390);
    await screenshot(first, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await first.send('Browser.close');
  } finally {
    if (first) first.close();
    if (second) second.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(350);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
