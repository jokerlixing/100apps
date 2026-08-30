import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const appPort = 4688 + (process.pid % 200);
const debugPort = 9888 + (process.pid % 100);
const baseUrl = process.argv[2] || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app88-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')
];
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

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
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  return createServer((request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      let target = path.resolve(appDir, relative);
      if (!target.startsWith(`${appDir}${path.sep}`) && target !== path.join(appDir, 'index.html')) throw new Error('outside app');
      if (statSync(target).isDirectory()) target = path.join(target, 'index.html');
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(readFileSync(target));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });

  const server = process.argv[2] ? null : createStaticServer();
  if (server) await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const items = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
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
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.dashboard-widget').length === 6`);

    const initial = await evaluate(client, `({ widgets:document.querySelectorAll('.dashboard-widget').length, sources:document.querySelectorAll('.source-item').length, selected:document.querySelectorAll('.dashboard-widget.selected').length, h1:document.querySelectorAll('h1').length, title:document.querySelector('#project-name').value })`);
    assert.deepEqual(initial, { widgets: 6, sources: 2, selected: 1, h1: 1, title: '夏季运营控制室' });

    await evaluate(client, `document.querySelector('[data-widget-type="bar"]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.dashboard-widget').length === 7`);
    await evaluate(client, `(() => { const input=document.querySelector('[data-config="title"]'); input.value='活动实时热度'; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelector('.dashboard-widget.selected .widget-title b').textContent`), '活动实时热度');

    const moved = await evaluate(client, `(() => {
      const widget=document.querySelector('.dashboard-widget.selected'); const grip=widget.querySelector('[data-grip]'); const stage=document.querySelector('#stage').getBoundingClientRect();
      const before={col:widget.style.gridColumn,row:widget.style.gridRow};
      grip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:stage.left+80,clientY:stage.top+100}));
      document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:stage.left+stage.width*.5,clientY:stage.top+620}));
      document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
      const current=document.querySelector('.dashboard-widget.selected');
      return { before, after:{col:current.style.gridColumn,row:current.style.gridRow} };
    })()`);
    assert.notDeepEqual(moved.before, moved.after);

    await evaluate(client, `document.querySelector('#add-source-button').click()`);
    await waitForExpression(client, `document.querySelector('#source-dialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#source-name').value='直播房间';
      const radio=document.querySelector('input[name="source-format"][value="csv"]'); radio.checked=true; radio.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#source-input').value='房间,在线人数\\n主会场,2880\\n新品间,1680';
      document.querySelector('#source-form').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.source-item').length === 3 && !document.querySelector('#source-dialog').open`);
    await evaluate(client, `(() => { const select=document.querySelector('[data-source-id]'); select.value=select.options[select.options.length-1].value; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelector('[data-config="valueField"]').value`), '在线人数');

    await evaluate(client, `document.querySelector('#toast').classList.remove('show'); document.querySelector('#preview-button').click()`);
    await waitForExpression(client, `document.body.classList.contains('preview-mode')`);
    await sleep(250);
    const preview = await evaluate(client, `(() => { const stage=document.querySelector('#stage').getBoundingClientRect(); const exit=document.querySelector('#exit-preview-button').getBoundingClientRect(); return {widgets:document.querySelectorAll('.dashboard-widget').length,stageTop:stage.top,stageHeight:stage.height,exitWidth:exit.width}; })()`);
    assert.equal(preview.widgets, 7);
    assert.equal(preview.stageTop, 0);
    assert.ok(preview.stageHeight >= 1000);
    assert.ok(preview.exitWidth >= 90);
    await screenshot(client, 'screenshot-preview.png');
    await evaluate(client, `document.querySelector('#exit-preview-button').click()`);
    await waitForExpression(client, `!document.body.classList.contains('preview-mode')`);

    await evaluate(client, `document.querySelector('#toast').classList.remove('show'); document.querySelector('.stage-scroller').scrollTop=0;`);
    await sleep(300);
    const desktop = await evaluate(client, `(() => { const root=document.documentElement; const selected=document.querySelector('.dashboard-widget.selected').getBoundingClientRect(); const stage=document.querySelector('#stage').getBoundingClientRect(); return {widgets:document.querySelectorAll('.dashboard-widget').length,sources:document.querySelectorAll('.source-item').length,scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,selectedInside:selected.left>=stage.left&&selected.right<=stage.right,localSaved:Boolean(localStorage.getItem('apps100_grid88_project_v1'))}; })()`);
    assert.equal(desktop.widgets, 7);
    assert.equal(desktop.sources, 3);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.selectedInside, true);
    assert.equal(desktop.localSaved, true);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.dashboard-widget').length === 7`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.source-item').length`), 3);
    assert.equal(await evaluate(client, `[...document.querySelectorAll('.widget-title b')].some(el=>el.textContent==='活动实时热度')`), true);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => { const root=document.documentElement; const scroller=document.querySelector('#stage-scroller'); const cards=[...document.querySelectorAll('.component-card')].map(el=>{const b=el.getBoundingClientRect();return {w:b.width,h:b.height}}); return {scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,stageScrollable:scroller.scrollWidth>scroller.clientWidth,cards}; })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.stageScrollable, true);
    mobile.cards.forEach((box) => assert.ok(box.w >= 95 && box.h >= 80));
    await evaluate(client, `document.querySelector('#toast').classList.remove('show'); window.scrollTo(0,0);`);
    await sleep(300);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, moved, preview, desktop, mobile: { ...mobile, cards: `${mobile.cards.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (server) await new Promise((resolve) => server.close(resolve));
    await sleep(350);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
