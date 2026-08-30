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
const appPort = 4578 + (process.pid % 300);
const debugPort = 9878 + (process.pid % 100);
const databaseName = `depot78-smoke-${process.pid}`;
const baseUrl = `http://127.0.0.1:${appPort}/?db=${databaseName}&quota=4096`;
const profile = path.resolve(os.tmpdir(), `codex-app78-smoke-${process.pid}`);
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

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
}

async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, name), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const safe = ['index.html', 'styles.css', 'file-core.js', 'storage.js', 'app.js'];
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

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await waitForExpression(client, `window.__DEPOT78__.getState().files.length === 3`);
    assert.match(await evaluate(client, `document.querySelector('#storage-status').textContent`), /已就绪/);

    await evaluate(client, `(async () => {
      const content='真实入库验收：' + '档案'.repeat(360);
      const file=new File([content], '验收记录.txt', {type:'text/plain'});
      const input=document.querySelector('#file-input');
      const transfer=new DataTransfer();
      transfer.items.add(file);
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await waitForExpression(client, `window.__DEPOT78__.getState().files.length === 4 && document.querySelector('#detail-title')?.textContent === '验收记录.txt'`);
    await waitForExpression(client, `document.querySelector('#preview-stage pre')?.textContent.includes('真实入库验收')`);

    await evaluate(client, `document.querySelector('#new-folder-button').click(); document.querySelector('#folder-name').value='验收资料'; document.querySelector('#folder-form').requestSubmit()`);
    await waitForExpression(client, `window.__DEPOT78__.getState().folders.some(folder => folder.name === '验收资料')`);
    await evaluate(client, `(() => { const folder=window.__DEPOT78__.getState().folders.find(item => item.name==='验收资料'); const select=document.querySelector('#move-folder'); select.value=folder.id; document.querySelector('#move-button').click(); })()`);
    await waitForExpression(client, `(() => { const state=window.__DEPOT78__.getState(); const folder=state.folders.find(item=>item.name==='验收资料'); return state.files.find(item=>item.name==='验收记录.txt')?.folderId===folder.id; })()`);

    await evaluate(client, `document.querySelector('#share-button').click(); document.querySelector('#create-share-button').click()`);
    await waitForExpression(client, `!document.querySelector('#share-result').hidden && document.querySelector('#share-token').textContent.length === 8`);
    const initialShareToken = await evaluate(client, `document.querySelector('#share-token').textContent`);
    assert.match(initialShareToken, /^[A-HJ-NP-Z2-9]{8}$/);
    await evaluate(client, `document.querySelector('#share-dialog').close(); document.querySelector('#trash-button').click()`);
    await waitForExpression(client, `window.__DEPOT78__.getState().files.find(file=>file.name==='验收记录.txt')?.deletedAt`);
    await evaluate(client, `document.querySelector('#restore-button').click()`);
    await waitForExpression(client, `!window.__DEPOT78__.getState().files.find(file=>file.name==='验收记录.txt')?.deletedAt`);
    await evaluate(client, `document.querySelector('#share-button').click(); document.querySelector('#create-share-button').click()`);
    await waitForExpression(client, `!document.querySelector('#share-result').hidden && document.querySelector('#share-token').textContent.length === 8`);
    const shareToken = await evaluate(client, `document.querySelector('#share-token').textContent`);
    await evaluate(client, `document.querySelector('#share-dialog').close()`);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && window.__DEPOT78__.getState().files.some(file=>file.name==='验收记录.txt')`);
    await evaluate(client, `(async () => { const before=window.__DEPOT78__.getState().files.length; await window.__DEPOT78__.uploadFiles([new File(['X'.repeat(5000)],'超额资料.txt',{type:'text/plain'})]); window.__quotaResult={before,after:window.__DEPOT78__.getState().files.length,toast:document.querySelector('#toast').textContent}; })()`);
    const quotaResult = await evaluate(client, `window.__quotaResult`);
    assert.equal(quotaResult.before, quotaResult.after);
    assert.match(quotaResult.toast, /容量不足/);

    await evaluate(client, `(() => { const button=[...document.querySelectorAll('.file-name-button')].find(item=>item.textContent.includes('验收记录')); button.click(); document.querySelector('#search-input').focus(); window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#toast').classList.remove('is-visible'); })()`);
    await sleep(350);
    const desktop = await evaluate(client, `(() => {
      const focus=getComputedStyle(document.querySelector('.search-field'));
      const state=window.__DEPOT78__.getState();
      return { files:state.files.length, folders:state.folders.length, selected:document.querySelector('#detail-title').textContent, h1:document.querySelectorAll('h1').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, outline:focus.outlineWidth, shareToken:state.files.find(file=>file.name==='验收记录.txt').share.token };
    })()`);
    assert.equal(desktop.files, 4);
    assert.equal(desktop.folders, 3);
    assert.equal(desktop.selected, '验收记录.txt');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.notEqual(desktop.outline, '0px');
    assert.equal(desktop.shareToken, shareToken);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, `${baseUrl}#share=${shareToken}`);
    await waitForExpression(client, `document.querySelector('#detail-dialog').open && document.querySelector('#detail-title')?.textContent === '验收记录.txt'`);
    await evaluate(client, `document.querySelector('#toast').classList.remove('is-visible')`);
    await sleep(350);
    const mobile = await evaluate(client, `(() => {
      const panel=document.querySelector('#detail-dialog').getBoundingClientRect();
      const controls=[...document.querySelectorAll('#detail-dialog button:not([hidden]), .masthead button:not([hidden])')].filter(element=>{const style=getComputedStyle(element);const box=element.getBoundingClientRect();return style.display!=='none'&&box.width>0&&box.height>0;}).map(element=>{const box=element.getBoundingClientRect();return {id:element.id,width:box.width,height:box.height,left:box.left,right:box.right};});
      return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, panelLeft:panel.left, panelRight:panel.right, selected:document.querySelector('#detail-title').textContent, controls };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.selected, '验收记录.txt');
    assert.ok(mobile.panelLeft >= 0 && mobile.panelRight <= 390);
    mobile.controls.forEach((box) => assert.ok(box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= 390, `Touch target failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, quotaResult, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
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
