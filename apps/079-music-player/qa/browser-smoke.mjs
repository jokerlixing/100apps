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
const profile = path.resolve(os.tmpdir(), `codex-app79-smoke-${process.pid}`);
const tempDir = path.resolve(os.tmpdir(), `codex-app79-files-${process.pid}`);
const port = 4479 + (process.pid % 200);
const debugPort = 9479 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${port}/`;

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

async function evaluate(client, expression, userGesture = false) {
  const result = await client.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture,
  });
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

function writeWave(filename, frequency) {
  const sampleRate = 8000;
  const duration = 2;
  const samples = sampleRate * duration;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 200, (samples - index) / 200);
    const value = Math.round(Math.sin((index / sampleRate) * frequency * Math.PI * 2) * 9000 * envelope);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  writeFileSync(filename, buffer);
}

function startStaticServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const target = path.resolve(appDir, relative);
      if (!target.startsWith(`${appDir}${path.sep}`) || !existsSync(target)) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(readFileSync(target));
    } catch {
      response.writeHead(400).end('Bad request');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function setFiles(client, selector, files) {
  const documentNode = await client.send('DOM.getDocument', { depth: 1 });
  const inputNode = await client.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector });
  assert.ok(inputNode.nodeId, `Input not found: ${selector}`);
  await client.send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  assert.ok(tempDir.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  const firstWave = path.join(tempDir, 'local-smoke.wav');
  const secondWave = path.join(tempDir, 'second-take.wav');
  const lrcFile = path.join(tempDir, 'local-smoke.lrc');
  writeWave(firstWave, 440);
  writeWave(secondWave, 554.37);
  writeFileSync(lrcFile, '[ti:Local Smoke]\n[00:00.00]本地测试音开始\n[00:01.00]第二行同步词页\n', 'utf8');

  const server = await startStaticServer();
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const values = await response.json();
      return values.length ? values : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('DOM.enable'), client.send('Network.enable')]);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);

    const initial = await evaluate(client, `({
      h1: document.querySelectorAll('h1').length,
      playlists: document.querySelectorAll('.playlist-item').length,
      queue: document.querySelectorAll('.queue-track').length,
      lyrics: document.querySelectorAll('.lyric-line').length,
      title: document.querySelector('#now-title').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })`);
    assert.deepEqual(initial, { h1: 1, playlists: 1, queue: 3, lyrics: 7, title: '夜班列车', scrollWidth: 1440, clientWidth: 1440 });

    await evaluate(client, `document.querySelector('#play-button').click()`, true);
    await waitForExpression(client, `document.body.classList.contains('is-playing')`);
    await sleep(1250);
    const playing = await evaluate(client, `({ time: document.querySelector('#current-time').textContent, activeLyrics: document.querySelectorAll('.lyric-line.is-active').length })`);
    assert.notEqual(playing.time, '00:00');
    assert.equal(playing.activeLyrics, 1);
    await evaluate(client, `document.querySelector('#play-button').click()`, true);
    await waitForExpression(client, `!document.body.classList.contains('is-playing')`);

    await evaluate(client, `(() => { const input=document.querySelector('#seek'); input.value='600'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitForExpression(client, `document.querySelector('#current-time').textContent >= '00:28'`);
    await evaluate(client, `document.querySelector('#mode-button').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#mode-button').textContent`), '随机队列');

    await evaluate(client, `document.querySelector('#new-playlist').click()`);
    await waitForExpression(client, `document.querySelector('#playlist-dialog').open`);
    await evaluate(client, `(() => { document.querySelector('#playlist-name').value='夜间测试带'; document.querySelector('#playlist-form').requestSubmit(); })()`);
    await waitForExpression(client, `document.querySelectorAll('.playlist-item').length === 2`);
    assert.equal(await evaluate(client, `document.querySelector('.playlist-item[aria-current="true"] strong').textContent`), '夜间测试带');

    await setFiles(client, '#audio-input', [firstWave, secondWave]);
    await waitForExpression(client, `document.querySelectorAll('.library-track').length === 2 && document.querySelectorAll('.queue-track').length === 2`, 15_000);
    assert.equal(await evaluate(client, `document.querySelector('#now-title').textContent`), 'local-smoke');

    await setFiles(client, '#lrc-input', [lrcFile]);
    await waitForExpression(client, `document.querySelectorAll('.lyric-line').length === 2`);
    await evaluate(client, `document.querySelectorAll('.lyric-line')[1].click()`);
    await waitForExpression(client, `document.querySelector('#current-time').textContent === '00:01'`);

    await evaluate(client, `document.querySelector('#rename-playlist').click()`);
    await waitForExpression(client, `document.querySelector('#playlist-dialog').open`);
    await evaluate(client, `(() => { document.querySelector('#playlist-name').value='验收样带'; document.querySelector('#playlist-form').requestSubmit(); })()`);
    await waitForExpression(client, `document.querySelector('.playlist-item[aria-current="true"] strong').textContent === '验收样带'`);

    const firstBefore = await evaluate(client, `document.querySelector('.queue-track strong').textContent`);
    await evaluate(client, `document.querySelector('.queue-track [data-delta="1"]').click()`);
    const firstAfter = await evaluate(client, `document.querySelector('.queue-track strong').textContent`);
    assert.notEqual(firstBefore, firstAfter);
    await evaluate(client, `document.querySelector('.queue-track [data-remove-track]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.queue-track').length === 1`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.library-track').length`), 2);

    await evaluate(client, `(() => { window.scrollTo(0, 0); document.querySelector('#toast').classList.remove('show'); })()`);
    await sleep(450);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.library-track').length === 2`);
    const restored = await evaluate(client, `({
      playlist: document.querySelector('.playlist-item[aria-current="true"] strong').textContent,
      queue: document.querySelectorAll('.queue-track').length,
      library: document.querySelectorAll('.library-track').length,
      autoplay: document.body.classList.contains('is-playing')
    })`);
    assert.deepEqual(restored, { playlist: '验收样带', queue: 1, library: 2, autoplay: false });

    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focus = await evaluate(client, `({ tag: document.activeElement.tagName, outline: getComputedStyle(document.activeElement).outlineStyle })`);
    assert.ok(focus.tag);
    assert.notEqual(focus.outline, 'none');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => {
      const boxes=[...document.querySelectorAll('button, label.button')].filter((node)=>getComputedStyle(node).display!=='none').map((node)=>{const b=node.getBoundingClientRect();return {h:b.height,l:b.left,r:b.right}});
      return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, queue: document.querySelectorAll('.queue-track').length, boxes };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.queue, 1);
    mobile.boxes.forEach((box) => assert.ok(box.l >= -1 && box.r <= 391, `Control outside viewport: ${JSON.stringify(box)}`));
    await evaluate(client, `(() => { window.scrollTo(0, 0); document.querySelector('#toast').classList.remove('show'); })()`);
    await sleep(450);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, playing, restored, focus, mobile: { scrollWidth: mobile.scrollWidth, queue: mobile.queue, controls: mobile.boxes.length }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (browser.exitCode === null && !browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await waitFor(() => browser.exitCode !== null, 3000, 'browser exit').catch(() => {});
    await sleep(300);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 180 }); } catch {}
    }
    if (tempDir.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 180 }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
