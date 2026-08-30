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
const port = 4580 + (process.pid % 300);
const debugPort = 9880 + (process.pid % 100);
const baseUrl = `http://127.0.0.1:${port}/`;
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app80-smoke-${process.pid}`);
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

async function waitForProcessExit(child, timeout = 3_000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(timeout)
  ]);
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
      await sleep(250 * (attempt + 1));
    }
  }
}

const mediaStub = String.raw`
(() => {
  const states = new WeakMap();
  const state = (media) => {
    if (!states.has(media)) states.set(media, { currentTime: 0, paused: true, duration: 30, src: '' });
    return states.get(media);
  };
  for (const [name, descriptor] of Object.entries({
    src: { get() { return state(this).src; }, set(value) { state(this).src = String(value); } },
    currentTime: { get() { return state(this).currentTime; }, set(value) { state(this).currentTime = Math.max(0, Math.min(30, Number(value) || 0)); } },
    duration: { get() { return state(this).duration; } },
    paused: { get() { return state(this).paused; } },
    ended: { get() { return false; } }
  })) {
    try { Object.defineProperty(HTMLMediaElement.prototype, name, { configurable: true, ...descriptor }); } catch {}
  }
  HTMLMediaElement.prototype.load = function load() {
    state(this).paused = true;
    setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0);
  };
  HTMLMediaElement.prototype.play = function play() {
    state(this).paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('timeupdate'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause() {
    state(this).paused = true;
    this.dispatchEvent(new Event('pause'));
  };
})();`;

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${tempRoot}${path.sep}`), 'Browser profile must stay inside the temp directory');
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
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: mediaStub });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.playlist-item').length === 3`);

    await evaluate(client, `document.querySelector('[data-video-id="film-sintel"]').click()`);
    await waitForExpression(client, `document.querySelector('[data-video-id="film-sintel"]').classList.contains('active')`);
    await evaluate(client, `(() => { const input=document.querySelector('#bulletInput'); input.value='这个转场像一口深呼吸'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#bulletForm').requestSubmit(); })()`);
    assert.equal(await evaluate(client, `JSON.parse(localStorage.getItem('channel80_bullets_v1')).length`), 1);
    assert.match(await evaluate(client, `document.querySelector('#signalBulletCount').textContent`), /^3 条弹幕$/);
    assert.equal(await evaluate(client, `document.querySelector('.danmaku-item').textContent`), '这个转场像一口深呼吸');

    await evaluate(client, `document.querySelector('#bulletToggle').click(); document.querySelector('#autoNextToggle').click(); document.querySelector('#rateSelect').value='1.5'; document.querySelector('#rateSelect').dispatchEvent(new Event('change',{bubbles:true})); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('[data-video-id="film-sintel"]').classList.contains('active')`);
    assert.equal(await evaluate(client, `document.querySelector('#bulletToggle').getAttribute('aria-pressed')`), 'false');
    assert.equal(await evaluate(client, `document.querySelector('#autoNextToggle').getAttribute('aria-pressed')`), 'false');
    assert.equal(await evaluate(client, `document.querySelector('#rateSelect').value`), '1.5');

    await evaluate(client, `document.querySelector('#bulletToggle').click(); (() => { const input=document.querySelector('#bulletInput'); input.value='字幕之外的另一条声道'; document.querySelector('#bulletForm').requestSubmit(); input.focus(); })()`);
    await sleep(220);
    const desktop = await evaluate(client, `(() => { const focus=getComputedStyle(document.querySelector('#bulletInput')); const stage=document.querySelector('#playerStage').getBoundingClientRect(); return { title:document.querySelector('h1').textContent.trim(), active:document.querySelector('.playlist-item.active .playlist-copy b').textContent, playlistCount:document.querySelectorAll('.playlist-item').length, storedBullets:JSON.parse(localStorage.getItem('channel80_bullets_v1')).length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, stageWidth:Math.round(stage.width), focusOutline:focus.outlineWidth }; })()`);
    assert.match(desktop.title, /留在这一幕/);
    assert.equal(desktop.active, '辛特尔 · 预告');
    assert.equal(desktop.playlistCount, 3);
    assert.equal(desktop.storedBullets, 2);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.ok(desktop.stageWidth > 700);
    assert.notEqual(desktop.focusOutline, '0px');
    await evaluate(client, `window.scrollTo({top:560,behavior:'instant'}); document.querySelector('#toast').classList.remove('show')`);
    await sleep(160);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `(() => { const transfer=new DataTransfer(); transfer.items.add(new File([new Uint8Array([0,1,2,3])], '我的周末短片.mp4', {type:'video/mp4'})); const input=document.querySelector('#localVideoInput'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitForExpression(client, `document.querySelectorAll('.playlist-item').length === 4 && document.querySelector('.playlist-item.active .playlist-number').textContent === 'FILE'`);
    assert.match(await evaluate(client, `document.querySelector('#fileStatus').textContent`), /我的周末短片\.mp4/);
    assert.match(await evaluate(client, `document.querySelector('#bulletHint').textContent`), /当前标签页/);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.playlist-item').length === 3`);
    await evaluate(client, `document.querySelector('#playerStage').scrollIntoView({block:'start',behavior:'instant'}); document.querySelector('#toast').classList.remove('show')`);
    await sleep(160);
    const mobile = await evaluate(client, `(() => { const controls=[...document.querySelectorAll('#playButton,#muteButton,#bulletToggle,#autoNextToggle,#fullscreenButton,.send-button,.file-button')].map((element)=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height,left:box.left,right:box.right}}); return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, playlistColumns:getComputedStyle(document.querySelector('#playlist')).gridTemplateColumns, controls }; })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.playlistColumns.split(' ').length, 1);
    mobile.controls.forEach((box) => assert.ok(box.width >= 44 && box.height >= 40 && box.left >= 0 && box.right <= 390, `Touch target failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
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
