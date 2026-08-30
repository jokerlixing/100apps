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
const port = 4697 + (process.pid % 200);
const debugPort = 9797 + (process.pid % 100);
const baseUrl = `http://127.0.0.1:${port}/`;
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app97-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
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

async function removeProfile() {
  if (!profile.startsWith(`${tempRoot}${path.sep}`)) return;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 5) return;
      await sleep(200 * (attempt + 1));
    }
  }
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${tempRoot}${path.sep}`), 'Browser profile must remain in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const result = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await result.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.room-cell').length === 6`);

    assert.equal(await evaluate(client, `document.querySelector('#powerMetric').textContent`), '634');
    assert.equal(await evaluate(client, `document.querySelector('#activeMetric').textContent`), '4');
    assert.equal(await evaluate(client, `document.querySelector('[data-scene="home"]').getAttribute('aria-pressed')`), 'true');

    await evaluate(client, `document.querySelector('[data-scene="cinema"]').click()`);
    await waitForExpression(client, `document.querySelector('[data-scene="cinema"]').getAttribute('aria-pressed') === 'true'`);
    const cinema = await evaluate(client, `(() => { const saved=JSON.parse(localStorage.getItem('habitat97_state_v1')); return { scene:saved.activeScene, tv:saved.devices.find((d)=>d.id==='living-tv').power, light:saved.devices.find((d)=>d.id==='living-light').level, curtain:saved.devices.find((d)=>d.id==='living-curtain').level }; })()`);
    assert.deepEqual(cinema, { scene: 'cinema', tv: true, light: 12, curtain: 0 });

    await evaluate(client, `document.querySelector('[data-room="bedroom"]').click()`);
    await waitForExpression(client, `document.querySelector('#roomHeading').textContent === '卧室' && document.querySelectorAll('.device-card').length === 2`);
    await evaluate(client, `document.querySelector('[data-device-toggle="bedroom-purifier"]').click()`);
    await evaluate(client, `(() => { const slider=document.querySelector('[data-device-range="bedroom-light"]'); slider.value='63'; slider.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    let stored = await evaluate(client, `(() => { const saved=JSON.parse(localStorage.getItem('habitat97_state_v1')); return { room:saved.selectedRoom, purifier:saved.devices.find((d)=>d.id==='bedroom-purifier').power, lamp:saved.devices.find((d)=>d.id==='bedroom-light').level }; })()`);
    assert.deepEqual(stored, { room: 'bedroom', purifier: false, lamp: 63 });

    await navigate(client, baseUrl);
    await waitForExpression(client, `document.querySelector('#roomHeading').textContent === '卧室'`);
    stored = await evaluate(client, `(() => ({ purifier:document.querySelector('[data-device-toggle="bedroom-purifier"]').getAttribute('aria-checked'), lamp:document.querySelector('[data-device-range="bedroom-light"]').value }))()`);
    assert.deepEqual(stored, { purifier: 'false', lamp: '63' });

    await evaluate(client, `document.querySelector('#airEventButton').click()`);
    await waitForExpression(client, `document.querySelector('[data-device-toggle="bedroom-purifier"]').getAttribute('aria-checked') === 'true'`);
    const automation = await evaluate(client, `(() => { const saved=JSON.parse(localStorage.getItem('habitat97_state_v1')); const purifier=saved.devices.find((d)=>d.id==='bedroom-purifier'); return { power:purifier.power, level:purifier.level, activity:saved.activity[0].text }; })()`);
    assert.equal(automation.power, true);
    assert.equal(automation.level, 80);
    assert.match(automation.activity, /空气自净/);

    await evaluate(client, `document.querySelector('#resetButton').click(); document.querySelector('#confirmResetButton').click()`);
    await waitForExpression(client, `document.querySelector('#powerMetric').textContent === '634' && document.querySelector('[data-scene="home"]').getAttribute('aria-pressed') === 'true'`);

    const desktop = await evaluate(client, `(() => { const stage=document.querySelector('.floorplan-wrap').getBoundingClientRect(); const focusTarget=document.querySelector('[data-room="living"]'); focusTarget.focus(); const focus=getComputedStyle(focusTarget); return { title:document.querySelector('h1').textContent.trim(), rooms:document.querySelectorAll('.room-cell').length, devices:JSON.parse(localStorage.getItem('habitat97_state_v1')).devices.length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, stageWidth:Math.round(stage.width), stageHeight:Math.round(stage.height), focusOutline:focus.outlineWidth }; })()`);
    assert.match(desktop.title, /家里一切正常/);
    assert.equal(desktop.rooms, 6);
    assert.equal(desktop.devices, 10);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.ok(desktop.stageWidth > 600 && desktop.stageHeight >= 500);
    assert.notEqual(desktop.focusOutline, '0px');
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#toast').classList.remove('is-visible')`);
    await sleep(180);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => { const scene=document.querySelector('[data-scene="home"]').getBoundingClientRect(); const room=document.querySelector('[data-room="living"]').getBoundingClientRect(); return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, sceneWidth:Math.round(scene.width), sceneHeight:Math.round(scene.height), roomWidth:Math.round(room.width), automationVisible:getComputedStyle(document.querySelector('.automation-section')).display, deviceColumns:getComputedStyle(document.querySelector('#deviceList')).gridTemplateColumns }; })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.sceneWidth >= 110 && mobile.sceneHeight >= 44);
    assert.ok(mobile.roomWidth > 300);
    assert.equal(mobile.automationVisible, 'none');
    assert.equal(mobile.deviceColumns.split(' ').length, 1);
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'}); document.querySelector('#toast').classList.remove('is-visible')`);
    await sleep(180);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    server.close();
    if (browser.exitCode === null) browser.kill();
    await sleep(300);
    await removeProfile();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
