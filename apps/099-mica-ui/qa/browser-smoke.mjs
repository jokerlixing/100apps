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
const debugPort = 9780 + (process.pid % 180);
const baseUrl = `http://127.0.0.1:${port}/`;
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app99-smoke-${process.pid}`);
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

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.dataset.ready === 'true'`, 15_000);
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
      await sleep(220 * (attempt + 1));
    }
  }
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
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.dataset.ready === 'true' && document.querySelectorAll('[data-component-card]').length === 12`);

    const registration = await evaluate(client, `({
      registered: window.MicaUI.elements.length,
      catalog: window.MicaCore.COMPONENTS.length,
      cards: document.querySelectorAll('[data-component-card]').length,
      customTags: [...document.querySelectorAll('mica-button,mica-input,mica-select,mica-checkbox,mica-switch,mica-badge,mica-alert,mica-progress,mica-tabs,mica-accordion,mica-dialog,mica-toast')].filter((node) => Boolean(customElements.get(node.localName))).length
    })`);
    assert.equal(registration.registered, 12);
    assert.equal(registration.catalog, 12);
    assert.equal(registration.cards, 12);
    assert.ok(registration.customTags >= 12);

    await evaluate(client, `document.querySelector('[data-accent="#D9734D"]').click(); document.querySelector('[data-radius="0px"]').click(); document.querySelector('[data-scale="1.1"]').click(); document.querySelector('[data-theme-toggle]').click()`);
    const changedTokens = await evaluate(client, `({
      theme: document.documentElement.dataset.micaTheme,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--mica-accent').trim(),
      radius: getComputedStyle(document.documentElement).getPropertyValue('--mica-radius').trim(),
      scale: getComputedStyle(document.documentElement).getPropertyValue('--mica-scale').trim()
    })`);
    assert.deepEqual(changedTokens, { theme: 'dark', accent: '#D9734D', radius: '0px', scale: '1.1' });
    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.dataset.ready === 'true' && document.documentElement.dataset.micaTheme === 'dark'`);
    assert.match(await evaluate(client, `localStorage.getItem('mica-ui-docs-v1')`), /D9734D/);

    await evaluate(client, `(() => { const search=document.querySelector('[data-component-search]'); search.value='feedback'; search.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    const filtered = await evaluate(client, `({ visible:[...document.querySelectorAll('[data-component-card]')].filter((card)=>!card.hidden).map((card)=>card.dataset.componentCard), count:document.querySelector('[data-result-count]').textContent })`);
    assert.deepEqual(filtered, { visible: ['alert', 'progress', 'toast'], count: '03' });
    await evaluate(client, `document.querySelector('[data-clear-search]').click()`);

    await evaluate(client, `document.querySelector('#component-tabs mica-tabs').shadowRoot.querySelectorAll('[role="tab"]')[1].click()`);
    assert.equal(await evaluate(client, `document.querySelector('#component-tabs mica-tabs').shadowRoot.querySelector('[role="tabpanel"]').textContent`), 'Attributes, methods, and events');

    await evaluate(client, `document.querySelector('[data-open-dialog]').click()`);
    await waitForExpression(client, `document.querySelector('#docsDialog').shadowRoot.querySelector('dialog').open`);
    await evaluate(client, `document.querySelector('#docsDialog').shadowRoot.querySelector('[data-close]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#docsDialog').shadowRoot.querySelector('dialog').open`), false);

    await evaluate(client, `document.querySelector('[data-show-toast]').click()`);
    await waitForExpression(client, `document.querySelector('#docsToast').shadowRoot.querySelector('div').classList.contains('show')`);
    assert.match(await evaluate(client, `document.querySelector('#docsToast').shadowRoot.querySelector('div').textContent`), /delivered/);

    await evaluate(client, `(() => { const control=document.querySelector('[data-progress-control]'); control.value='91'; control.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelector('#catalogProgress').shadowRoot.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')`), '91');

    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.dataset.ready === 'true' && document.documentElement.dataset.micaTheme === 'light'`);
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'}); document.querySelector('[data-component-search]').focus()`);
    await sleep(260);
    const desktop = await evaluate(client, `(() => {
      const focus=getComputedStyle(document.querySelector('[data-component-search]'));
      return { title:document.querySelector('h1').textContent.trim(), cards:document.querySelectorAll('[data-component-card]').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, focusOutline:focus.outlineWidth, theme:document.documentElement.dataset.micaTheme };
    })()`);
    assert.match(desktop.title, /material memory/i);
    assert.equal(desktop.cards, 12);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.notEqual(desktop.focusOutline, '0px');
    assert.equal(desktop.theme, 'light');
    await evaluate(client, `document.querySelector('[data-component-search]').blur(); window.scrollTo({top:document.querySelector('#catalog').offsetTop-76,behavior:'instant'})`);
    await sleep(180);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await evaluate(client, `window.scrollTo({top:0,behavior:'instant'})`);
    await sleep(260);
    const mobile = await evaluate(client, `(() => {
      const controls=[...document.querySelectorAll('.theme-toggle,.package-command button,.swatch,.segmented button')].filter((node)=>{const box=node.getBoundingClientRect();return box.top<innerHeight&&box.bottom>0;}).map((node)=>{const box=node.getBoundingClientRect();return {width:box.width,height:box.height,left:box.left,right:box.right};});
      return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, heroColumns:getComputedStyle(document.querySelector('.hero')).gridTemplateColumns, controls };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.heroColumns.split(' ').length, 1);
    mobile.controls.forEach((box) => assert.ok(box.width >= 40 && box.height >= 40 && box.left >= 0 && box.right <= 390, `Touch target failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ registration, changedTokens, filtered, desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    server.close();
    if (browser.exitCode === null) browser.kill();
    await sleep(350);
    await removeProfile();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
