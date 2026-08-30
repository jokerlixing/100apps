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
const port = 4820 + (process.pid % 300);
const debugPort = 10420 + (process.pid % 300);
const baseUrl = `http://127.0.0.1:${port}/`;
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app95-gallery-smoke-${process.pid}`);

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
  await waitForExpression(client, `document.readyState === 'complete' && Boolean(window.__MUSE95__)`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function waitForProcessExit(child, timeout = 3_000) {
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
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt === 5) return;
      await sleep(250 * (attempt + 1));
    }
  }
}

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
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `Boolean(window.__MUSE95__) && document.querySelectorAll('.art-card').length === 6 && document.querySelector('#heroImage').naturalWidth > 0`);

    const initial = await evaluate(client, `(() => ({
      title: document.title,
      cards: document.querySelectorAll('.art-card').length,
      featured: document.querySelector('.art-card.featured')?.dataset.artworkId,
      heroSource: document.querySelector('#heroImage').getAttribute('src'),
      current: window.__MUSE95__.getCurrent()
    }))()`);
    assert.match(initial.title, /MUSE\/95/);
    assert.equal(initial.cards, 6);
    assert.equal(initial.featured, 'exhibit-library');
    assert.equal(initial.heroSource, 'assets/floating-library.png');
    assert.equal(initial.current.source, 'ai');

    await evaluate(client, `(() => {
      document.querySelector('[data-style="poster"]').click();
      document.querySelector('[data-ratio="landscape"]').click();
      const prompt = document.querySelector('#promptInput');
      prompt.value = '雨后的未来夜市，紫色屋顶和橙色灯牌倒映在街面';
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#seedInput').value = '4242';
      document.querySelector('#promptForm').requestSubmit();
    })()`);
    await waitForExpression(client, `window.__MUSE95__.getState().artworks.length === 1 && document.querySelector('#generationStatus').textContent.includes('已生成并收藏')`);
    const generated = await evaluate(client, `(() => ({
      state: window.__MUSE95__.getState(),
      current: window.__MUSE95__.getCurrent(),
      signature: document.querySelector('#heroCanvas').dataset.signature,
      canvas: { width: document.querySelector('#heroCanvas').width, height: document.querySelector('#heroCanvas').height },
      cards: document.querySelectorAll('.art-card').length,
      stored: JSON.parse(localStorage.getItem(window.__MUSE95__.storageKey)).artworks.length
    }))()`);
    assert.equal(generated.current.prompt, '雨后的未来夜市，紫色屋顶和橙色灯牌倒映在街面');
    assert.equal(generated.current.style, 'poster');
    assert.equal(generated.current.ratio, 'landscape');
    assert.equal(generated.current.seed, 4242);
    assert.match(generated.signature, /4242:poster:landscape$/);
    assert.deepEqual(generated.canvas, { width: 1080, height: 720 });
    assert.equal(generated.cards, 7);
    assert.equal(generated.stored, 1);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `Boolean(window.__MUSE95__) && window.__MUSE95__.getState().artworks.length === 1 && document.querySelectorAll('.art-card').length === 7`);
    const userId = await evaluate(client, `window.__MUSE95__.getState().artworks[0].id`);
    await evaluate(client, `document.querySelector('[data-artwork-id^="user-"] [data-action="like"]').click()`);
    await waitForExpression(client, `window.__MUSE95__.getState().likedIds.includes('${userId}')`);
    assert.equal(await evaluate(client, `document.querySelector('#likedCount').textContent`), '01');

    await evaluate(client, `document.querySelector('[data-filter="liked"]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.art-card').length === 1`);
    assert.equal(await evaluate(client, `document.querySelector('.art-card').dataset.artworkId`), userId);
    await evaluate(client, `(() => { const search=document.querySelector('#gallerySearch'); search.value='不存在的颜色'; search.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitForExpression(client, `!document.querySelector('#galleryEmpty').hidden`);
    await evaluate(client, `document.querySelector('#clearFiltersButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.art-card').length === 7`);

    await evaluate(client, `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__copiedRecipe = text; } } }); document.querySelector('[data-artwork-id^="user-"] [data-action="share"]').click()`);
    await waitForExpression(client, `Boolean(window.__copiedRecipe)`);
    assert.match(await evaluate(client, `window.__copiedRecipe`), /Seed 4242/);

    await evaluate(client, `HTMLAnchorElement.prototype.click = function(){ window.__museDownload = { filename: this.download, href: this.href }; }; document.querySelector('[data-artwork-id^="user-"] [data-action="download"]').click()`);
    await waitForExpression(client, `Boolean(window.__museDownload)`);
    const download = await evaluate(client, `window.__museDownload`);
    assert.match(download.filename, /^muse-95-poster-4242\.png$/);
    assert.match(download.href, /^blob:/);

    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `Boolean(window.__MUSE95__) && document.querySelectorAll('.art-card').length === 6 && document.querySelector('#heroImage').naturalWidth > 0`);
    await evaluate(client, `document.querySelector('#promptInput').focus(); document.querySelector('#toast').classList.remove('show'); window.scrollTo({ top: 0, behavior: 'instant' })`);
    const desktop = await evaluate(client, `(() => {
      const studio = document.querySelector('#studio').getBoundingClientRect();
      const stage = document.querySelector('#artStage').getBoundingClientRect();
      const promptField = getComputedStyle(document.querySelector('.prompt-field'));
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        studioColumns: getComputedStyle(document.querySelector('#studio')).gridTemplateColumns.split(' ').length,
        studioWidth: Math.round(studio.width),
        stageWidth: Math.round(stage.width),
        focusShadow: promptField.boxShadow,
        featuredLoaded: document.querySelector('#heroImage').naturalWidth > 0
      };
    })()`);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.studioColumns, 2);
    assert.equal(desktop.studioWidth, 1440);
    assert.ok(desktop.stageWidth > 600);
    assert.notEqual(desktop.focusShadow, 'none');
    assert.equal(desktop.featuredLoaded, true);
    await sleep(180);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await waitForExpression(client, `Boolean(window.__MUSE95__) && document.querySelector('#heroImage').naturalWidth > 0`);
    const mobile = await evaluate(client, `(() => {
      const selectors = '.brand,.prompt-suggestions button,.style-options button,.ratio-options button,#randomSeedButton,#generateButton,.stage-actions button,.filter-buttons button';
      const controls = [...document.querySelectorAll(selectors)].map((element) => { const box=element.getBoundingClientRect(); return { tag:element.tagName,width:box.width,height:box.height,left:box.left,right:box.right }; });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        studioColumns: getComputedStyle(document.querySelector('#studio')).gridTemplateColumns.split(' ').length,
        galleryColumns: getComputedStyle(document.querySelector('#galleryGrid')).gridTemplateColumns.split(' ').length,
        overflow: [...document.querySelectorAll('body *')].map((element) => { const box=element.getBoundingClientRect(); return { node:element.tagName + '.' + element.className, left:Math.round(box.left), right:Math.round(box.right), width:Math.round(box.width) }; }).filter((box) => box.left < -1 || box.right > 391).slice(0, 15),
        controls
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390, JSON.stringify(mobile.overflow));
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.studioColumns, 1);
    assert.equal(mobile.galleryColumns, 1);
    mobile.controls.forEach((box) => assert.ok(box.width >= 44 && box.height >= 44, `Touch target failed: ${JSON.stringify(box)}`));
    await evaluate(client, `document.querySelector('.studio-stage-column').scrollIntoView({ block: 'start', behavior: 'instant' }); document.querySelector('#toast').classList.remove('show')`);
    await sleep(180);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({
      initial,
      generated: { current: generated.current, canvas: generated.canvas, cards: generated.cards },
      desktop,
      mobile: {
        scrollWidth: mobile.scrollWidth,
        clientWidth: mobile.clientWidth,
        studioColumns: mobile.studioColumns,
        galleryColumns: mobile.galleryColumns,
        controls: `${mobile.controls.length} checked`
      },
      runtimeErrors,
      outputDir
    }, null, 2));
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
