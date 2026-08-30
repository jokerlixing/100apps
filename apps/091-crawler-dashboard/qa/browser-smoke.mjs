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
const appPort = 4780 + (process.pid % 200);
const debugPort = 9880 + (process.pid % 100);
const baseUrl = `http://127.0.0.1:${appPort}/`;
const profile = path.resolve(os.tmpdir(), `codex-app91-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 12000, label = 'condition') {
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

async function waitForExpression(client, expression, timeout = 12000) {
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

function createFixtureServer() {
  let fixtureReads = 0;
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/monitor-core.js', ['monitor-core.js', 'text/javascript; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
  ]);
  return createServer((request, response) => {
    if (request.url === '/fixture/status.json') {
      fixtureReads += 1;
      const payload = fixtureReads === 1
        ? { data: { version: 1, status: '正常', queue: 3 } }
        : { data: { version: 2, status: '延迟', queue: 7 } };
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      response.end(JSON.stringify(payload));
      return;
    }
    const entry = files.get((request.url || '').split('?')[0]);
    if (!entry) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    response.end(readFileSync(path.join(appDir, entry[0])));
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });

  const server = createFixtureServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(appPort, '127.0.0.1', resolve);
  });

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
    }, 10000, 'Chrome DevTools');
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
    await waitForExpression(client, `document.body.classList.contains('ready') && PulsewatchApp.getState().sources.length === 4`);

    const initial = await evaluate(client, `({ sources:document.querySelectorAll('.source-item').length, h1:document.querySelectorAll('h1').length, active:document.querySelector('#gaugeNumber').textContent })`);
    assert.deepEqual(initial, { sources: 4, h1: 1, active: '04' });

    await evaluate(client, `document.querySelector('#runAllButton').click()`);
    await waitForExpression(client, `PulsewatchApp.getState().sources.every(source => source.samples.length >= 2 && source.lastStatus !== 'running')`);
    const demoRun = await evaluate(client, `(() => { const s=PulsewatchApp.getState(); return { changed:s.sources.filter(x=>x.lastStatus==='changed').length, stable:s.sources.filter(x=>x.lastStatus==='stable').length, events:s.events.length, wave:document.querySelectorAll('.signal-sample.changed').length }; })()`);
    assert.ok(demoRun.changed >= 3, JSON.stringify(demoRun));
    assert.ok(demoRun.stable >= 1, JSON.stringify(demoRun));
    assert.ok(demoRun.events >= 5, JSON.stringify(demoRun));

    await evaluate(client, `document.querySelector('[data-source-id="demo-price"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#selectedName').textContent`), '云杉工作灯价格');
    assert.ok(await evaluate(client, `document.querySelectorAll('.diff-row').length >= 2`));
    await evaluate(client, `document.querySelector('#pauseSourceButton').click(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && PulsewatchApp.getState().settings.selectedId === 'demo-price'`);
    assert.equal(await evaluate(client, `PulsewatchApp.getState().sources.find(source=>source.id==='demo-price').enabled`), false);
    assert.equal(await evaluate(client, `document.querySelector('#pauseSourceButton').textContent`), '继续');
    await evaluate(client, `document.querySelector('#pauseSourceButton').click()`);

    await evaluate(client, `document.querySelector('#addSourceButton').click()`);
    await waitForExpression(client, `document.querySelector('#sourceDialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#sourceNameInput').value='本机队列接口';
      document.querySelector('#sourceUrlInput').value='${baseUrl}fixture/status.json';
      document.querySelector('#sourceFormatInput').value='json';
      document.querySelector('#sourceFormatInput').dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#sourcePathInput').value='data';
      document.querySelector('#sourceIntervalInput').value='1';
      document.querySelector('#sourceForm').requestSubmit();
    })()`);
    await waitForExpression(client, `PulsewatchApp.getState().sources.length === 5 && PulsewatchApp.getState().sources.find(source=>source.name==='本机队列接口')?.lastStatus === 'initial'`);
    await evaluate(client, `document.querySelector('#runSourceButton').click()`);
    await waitForExpression(client, `PulsewatchApp.getState().sources.find(source=>source.name==='本机队列接口')?.lastStatus === 'changed'`);
    const realSource = await evaluate(client, `(() => { const s=PulsewatchApp.getState().sources.find(source=>source.name==='本机队列接口'); return { status:s.lastStatus, diff:s.lastDiff.map(x=>x.path), snapshot:s.lastSnapshot, rows:document.querySelectorAll('.diff-row').length }; })()`);
    assert.equal(realSource.status, 'changed');
    assert.deepEqual(realSource.diff, ['queue', 'status', 'version']);
    assert.deepEqual(realSource.snapshot, { queue: 7, status: '延迟', version: 2 });
    assert.equal(realSource.rows, 3);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && PulsewatchApp.getState().sources.length === 5`);
    assert.equal(await evaluate(client, `PulsewatchApp.getState().sources.find(source=>source.name==='本机队列接口').lastSnapshot.version`), 2);
    const exported = await evaluate(client, `JSON.parse(PulsewatchApp.exportState())`);
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.sources.length, 5);

    await evaluate(client, `document.querySelector('#toast').classList.remove('show'); document.querySelector('#addSourceButton').focus(); window.scrollTo({top:document.querySelector('#workspace').offsetTop-96,behavior:'instant'});`);
    await sleep(400);
    const desktop = await evaluate(client, `(() => { const focus=getComputedStyle(document.querySelector('#addSourceButton')); return { sources:document.querySelectorAll('.source-item').length, changed:document.querySelector('#changedCount').textContent, events:document.querySelectorAll('.event-item').length, h1:document.querySelectorAll('h1').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, focusOutline:focus.outlineWidth, selected:document.querySelector('#selectedName').textContent }; })()`);
    assert.equal(desktop.sources, 5);
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.notEqual(desktop.focusOutline, '0px');
    assert.equal(desktop.selected, '本机队列接口');
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#toast').classList.remove('show')`);
    await sleep(350);
    const mobile = await evaluate(client, `(() => { const controls=[...document.querySelectorAll('#addSourceButton,#runAllButton,.filter-button,.source-item,.detail-actions button')].map(el=>{const b=el.getBoundingClientRect();return {w:b.width,h:b.height,left:b.left,right:b.right}}); return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, columns:getComputedStyle(document.querySelector('#workspace')).gridTemplateColumns, controls }; })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    mobile.controls.forEach((box) => assert.ok(box.h >= 40 && box.left >= 0 && box.right <= 390, `Mobile control failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ demoRun, realSource, desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(400);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
