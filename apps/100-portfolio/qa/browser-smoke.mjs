import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(appDir, '..', '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const appPort = 5100 + (process.pid % 300);
const debugPort = 9300 + (process.pid % 300);
const baseUrl = `http://127.0.0.1:${appPort}/apps/100-portfolio/`;
const profile = path.resolve(os.tmpdir(), `codex-index100-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};
const allowedFiles = new Set([
  'index.html',
  'apps/100-portfolio/index.html',
  'apps/100-portfolio/styles.css',
  'apps/100-portfolio/portfolio-core.js',
  'apps/100-portfolio/app.js',
]);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 12_000, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const result = await check();
      if (result) return result;
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
      } else {
        (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
      }
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
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
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

function staticServer() {
  return createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    relative = relative.replace(/\\/g, '/');
    if (!allowedFiles.has(relative)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const file = path.resolve(repoDir, relative);
    if (!file.startsWith(`${repoDir}${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  const server = staticServer();
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((argument) => argument.value || argument.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Browser.setDownloadBehavior', { behavior: 'deny' });

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await waitForExpression(client, `window.__INDEX100__.getState().source === 'tracker' && window.__INDEX100__.getState().projects.length === 100`);

    const initial = await evaluate(client, `(() => ({
      projects: window.__INDEX100__.getState().projects.length,
      cells: document.querySelectorAll('.project-cell').length,
      selected: document.querySelector('#readout-code').textContent,
      h1: document.querySelectorAll('h1').length,
      status: document.querySelector('#data-status').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(initial.projects, 100);
    assert.equal(initial.cells, 100);
    assert.match(initial.selected, /100/);
    assert.equal(initial.h1, 1);
    assert.match(initial.status, /根追踪器/);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    const focusResult = await evaluate(client, `(() => {
      const cell=document.querySelector('.project-cell[data-project-id="62"]');
      cell.blur();
      cell.focus();
      cell.click();
      return {active:document.activeElement===cell,readout:document.querySelector('#readout-code').textContent};
    })()`);
    assert.equal(focusResult.active, true);
    assert.match(focusResult.readout, /062/);
    const focusOutline = await evaluate(client, `getComputedStyle(document.querySelector('.project-cell[data-project-id="62"]')).outlineWidth`);
    assert.notEqual(focusOutline, '0px');

    await evaluate(client, `(() => {
      const input=document.querySelector('#search-input');
      input.value='作品集'; input.dispatchEvent(new Event('input',{bubbles:true}));
      const level=document.querySelector('#level-filter');
      level.value='5'; level.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await waitForExpression(client, `window.__INDEX100__.getState().filteredProjects.some(project => project.id === 100)`);
    const filtered = await evaluate(client, `window.__INDEX100__.getState().filteredProjects.map(project => project.id)`);
    assert.ok(filtered.includes(100));
    assert.ok(filtered.every((id) => Number.isInteger(id)));

    await evaluate(client, `document.querySelector('[data-project-id="100"].archive-item-button').click()`);
    await waitForExpression(client, `document.querySelector('#project-dialog').open && document.querySelector('#dialog-code').textContent.includes('100')`);
    assert.match(await evaluate(client, `document.querySelector('#dialog-title').textContent`), /作品集/);
    await evaluate(client, `document.querySelector('#dialog-close').click()`);
    await waitForExpression(client, `!document.querySelector('#project-dialog').open`);

    await evaluate(client, `window.__INDEX100__.exportCatalog()`);
    await waitForExpression(client, `Boolean(window.__INDEX100__.getState().lastExport)`);
    const exportedCount = await evaluate(client, `JSON.parse(window.__INDEX100__.getState().lastExport).projects.length`);
    assert.equal(exportedCount, 100);

    await evaluate(client, `window.__INDEX100__.clearFilters({focus:false}); window.scrollTo({top:0,behavior:'instant'})`);
    await sleep(250);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `document.querySelector('#archive').scrollIntoView({behavior:'instant'}); document.querySelector('#search-input').focus()`);
    await sleep(250);
    await screenshot(client, 'screenshot-archive.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, `${baseUrl}?mobile=1`);
    await waitForExpression(client, `window.__INDEX100__.getState().projects.length === 100`);
    const mobile = await evaluate(client, `(() => {
      const cells=[...document.querySelectorAll('.project-cell')].slice(0,10).map(element=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height};});
      const controls=[document.querySelector('#tone-button'),...document.querySelectorAll('.hero-actions a')].map(element=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height,left:box.left,right:box.right};});
      return {
        source:window.__INDEX100__.getState().source,
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        boardScrolls:document.querySelector('#punchboard').scrollWidth>document.querySelector('#punchboard').clientWidth,
        cells,controls
      };
    })()`);
    assert.equal(mobile.source, 'tracker');
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.boardScrolls, true);
    mobile.cells.forEach((box) => assert.ok(box.width >= 44 && box.height >= 44, `Small project cell: ${JSON.stringify(box)}`));
    mobile.controls.forEach((box) => assert.ok(box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= 390, `Touch control failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, filtered, exportedCount, mobile: { ...mobile, cells: `${mobile.cells.length} checked`, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => {
      server.close(resolve);
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
