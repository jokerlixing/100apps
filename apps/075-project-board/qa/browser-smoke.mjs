import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const appPort = 4575 + (process.pid % 300);
const debugPort = 9875 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${appPort}/`;
const profile = path.resolve(os.tmpdir(), `codex-app75-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);

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

function startStaticServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, baseUrl).pathname;
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
      const file = path.resolve(appDir, relative);
      if (!file.startsWith(`${appDir}${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(readFileSync(file));
    });
    server.once('error', reject);
    server.listen(appPort, '127.0.0.1', () => resolve(server));
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

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.querySelectorAll('.task-card').length >= 9`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  const staticServer = await startStaticServer();
  const browser = (await import('node:child_process')).spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
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
    await waitForExpression(client, `document.querySelectorAll('.task-card').length === 9`);

    const initial = await evaluate(client, `({ cards:document.querySelectorAll('.task-card').length, columns:document.querySelectorAll('.board-column').length, title:document.querySelector('#projectTitle').textContent, done:document.querySelector('#doneStat').textContent })`);
    assert.deepEqual(initial, { cards: 9, columns: 4, title: '城市骑行路线发布', done: '2' });

    await evaluate(client, `(() => {
      document.querySelector('#newTaskButton').click();
      document.querySelector('#taskTitle').value='发布前检查清单';
      document.querySelector('#taskDescription').value='逐项确认路线、海报与移动端页面';
      document.querySelector('#taskMember').value='member-zhou';
      document.querySelector('#taskPriority').value='urgent';
      document.querySelector('#taskDueDate').value='2026-09-07';
      document.querySelector('#taskTags').value='发布, QA';
      document.querySelector('#taskForm').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.task-card').length === 10 && !document.querySelector('#taskDialog').open`);
    assert.equal(await evaluate(client, `JSON.parse(localStorage.getItem('rail75-board-v1')).tasks.length`), 10);

    await evaluate(client, `(() => { const input=document.querySelector('#searchInput'); input.value='发布前'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.task-card').length`), 1);
    assert.match(await evaluate(client, `document.querySelector('#filterResult').textContent`), /1 \/ 10/);
    await evaluate(client, `document.querySelector('#clearFiltersButton').click()`);

    const createdId = await evaluate(client, `JSON.parse(localStorage.getItem('rail75-board-v1')).tasks.find(task=>task.title==='发布前检查清单').id`);
    await evaluate(client, `(() => { const card=document.querySelector('.task-card[data-task-id="${createdId}"]'); card.click(); document.querySelector('#taskTitle').value='发布前总检查'; document.querySelector('#taskForm').requestSubmit(); })()`);
    await waitForExpression(client, `document.querySelector('.task-card[data-task-id="${createdId}"] h3').textContent === '发布前总检查'`);

    await evaluate(client, `document.querySelector('.task-card[data-task-id="${createdId}"] [data-action="next"]').click()`);
    await waitForExpression(client, `document.querySelector('.task-card[data-task-id="${createdId}"]').dataset.status === 'planned'`);
    await evaluate(client, `(() => {
      const card=document.querySelector('.task-card[data-task-id="${createdId}"]');
      const target=document.querySelector('.task-list[data-status="doing"]');
      const dataTransfer=new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
      target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientY:9999}));
      target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientY:9999}));
    })()`);
    await waitForExpression(client, `document.querySelector('.task-card[data-task-id="${createdId}"]').dataset.status === 'doing'`);
    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.querySelector('.task-card[data-task-id="${createdId}"]')?.dataset.status === 'doing'`);

    await evaluate(client, `document.querySelector('#activityButton').click()`);
    await waitForExpression(client, `!document.querySelector('#activityPanel').hidden`);
    assert.ok(await evaluate(client, `document.querySelectorAll('#activityList li').length >= 6`));
    await evaluate(client, `document.querySelector('#closeActivityButton').click(); document.querySelector('#searchInput').focus(); window.scrollTo({top:0,behavior:'instant'});`);
    await sleep(350);
    const desktop = await evaluate(client, `(() => {
      const focus=getComputedStyle(document.querySelector('.search-field'));
      const board=document.querySelector('.board-scroll');
      return {
        cards:document.querySelectorAll('.task-card').length,
        doing:document.querySelector('#doingStat').textContent,
        progress:document.querySelector('#completionLabel').textContent,
        h1:document.querySelectorAll('h1').length,
        pageWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        boardScrolls:board.scrollWidth>board.clientWidth,
        focusOutline:focus.outlineWidth
      };
    })()`);
    assert.equal(desktop.cards, 10);
    assert.equal(desktop.doing, '3');
    assert.equal(desktop.progress, '20%');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.pageWidth, desktop.clientWidth);
    assert.notEqual(desktop.focusOutline, '0px');
    await evaluate(client, `document.activeElement.blur()`);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('#board').scrollIntoView({block:'start',behavior:'instant'}); document.querySelector('.board-scroll').scrollLeft=630;`);
    await sleep(400);
    const mobile = await evaluate(client, `(() => {
      const board=document.querySelector('.board-scroll');
      const create=document.querySelector('#newTaskButton').getBoundingClientRect();
      return {
        pageWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        boardClientWidth:board.clientWidth,
        boardScrollWidth:board.scrollWidth,
        createWidth:create.width,
        createHeight:create.height,
        cardWidth:document.querySelector('.task-card').getBoundingClientRect().width
      };
    })()`);
    assert.equal(mobile.pageWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.boardScrollWidth > mobile.boardClientWidth);
    assert.ok(mobile.createWidth >= 100 && mobile.createHeight >= 40);
    assert.ok(mobile.cardWidth >= 260);
    await screenshot(client, 'screenshot-mobile.png');

    await evaluate(client, `document.querySelector('#activityButton')?.click?.()`);
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => staticServer.close(resolve));
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
