import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createGalleyServer } = require('../server.js');
const { WebSocket } = require('ws');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const persistScreenshots = process.env.UPDATE_SCREENSHOTS === '1' || Boolean(process.argv[2]);
const outputDir = path.resolve(process.argv[2] || (persistScreenshots ? path.join(appDir, 'assets') : path.join(os.tmpdir(), `codex-app74-output-${process.pid}`)));
const profile = path.resolve(os.tmpdir(), `codex-app74-profile-${process.pid}`);
const downloadDir = path.resolve(os.tmpdir(), `codex-app74-downloads-${process.pid}`);
const debugPort = 9874 + (process.pid % 300);
const room = `SMOKE-${process.pid}`;
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
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (payload) => {
      const message = JSON.parse(payload.toString());
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
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
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

async function preparePage(client, url, runtimeErrors) {
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') runtimeErrors.push(args.map((argument) => argument.value || argument.description).join(' '));
  });
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
  await waitForExpression(client, `document.querySelector('#connectionText').textContent.includes('跨设备在线')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function createPage(debugPortValue, url, runtimeErrors) {
  const target = await fetch(`http://127.0.0.1:${debugPortValue}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((response) => response.json());
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await preparePage(client, url, runtimeErrors);
  return client;
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(profile.startsWith(tempRoot), 'Browser profile must stay in the temp directory');
  assert.ok(downloadDir.startsWith(tempRoot), 'Download directory must stay in the temp directory');
  if (!persistScreenshots) assert.ok(outputDir.startsWith(tempRoot), 'Temporary screenshots must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(downloadDir, { recursive: true });

  const service = createGalleyServer({ roomIdleMs: 5000 });
  const address = await service.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${address.port}/?room=${room}`;
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  const clients = [];
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const firstTarget = targets.find((target) => target.type === 'page');
    const first = new CdpClient(firstTarget.webSocketDebuggerUrl);
    clients.push(first);
    await first.connect();
    await first.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await preparePage(first, baseUrl, runtimeErrors);
    await first.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

    const initial = await evaluate(first, `(() => ({
      title: document.querySelector('#documentTitle').value,
      connection: document.querySelector('#connectionText').textContent,
      columns: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      editorText: document.querySelector('#editor').textContent.trim()
    }))()`);
    assert.equal(initial.title, '协作发布稿');
    assert.match(initial.connection, /跨设备在线/);
    assert.match(initial.columns, /px/);
    assert.equal(initial.scrollWidth, initial.clientWidth);
    assert.match(initial.editorText, /一起编辑/);

    await evaluate(first, `(() => {
      const title = document.querySelector('#documentTitle');
      const editor = document.querySelector('#editor');
      title.value = '八月发布检查清单';
      editor.innerHTML = '<h1>交稿前最后一轮</h1><p>林星负责核对链接，陈晨负责校对发布日期。</p><ul><li>确认标题</li><li>确认部署地址</li></ul>';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `Number(document.querySelector('#drawerRevision').textContent) >= 1 && document.querySelector('#saveState').textContent.includes('已同步')`);

    const second = await createPage(debugPort, baseUrl, runtimeErrors);
    clients.push(second);
    await waitForExpression(first, `document.querySelector('#memberCount').textContent.includes('2')`);
    assert.equal(await evaluate(second, `document.querySelector('#documentTitle').value`), '八月发布检查清单');
    assert.match(await evaluate(second, `document.querySelector('#editor').textContent`), /林星负责核对链接/);

    await evaluate(first, `(() => {
      const paragraph = document.querySelector('#editor p');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      const input = document.querySelector('#commentInput');
      input.value = '部署地址确认后，把这一句标成已处理。';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#addCommentButton').click();
    })()`);
    await waitForExpression(second, `document.querySelector('#openCommentCount').textContent === '1'`);
    assert.match(await evaluate(second, `document.querySelector('.comment-card').textContent`), /部署地址确认后/);

    await evaluate(second, `(() => {
      const title = document.querySelector('#documentTitle');
      title.value = '八月发布清单 · 协同终稿';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `document.querySelector('#documentTitle').value.includes('协同终稿')`);
    await waitForExpression(first, `Number(document.querySelector('#versionCount').textContent) >= 2`);

    await evaluate(first, `document.querySelector('#exportJsonButton').click(); document.querySelector('#exportHtmlButton').click()`);
    const jsonFile = await waitFor(() => readdirSync(downloadDir).find((name) => name.endsWith('.json')), 5000, 'JSON export');
    const htmlFile = await waitFor(() => readdirSync(downloadDir).find((name) => name.endsWith('.html')), 5000, 'HTML export');
    const backup = JSON.parse(readFileSync(path.join(downloadDir, jsonFile), 'utf8'));
    assert.equal(backup.title, '八月发布清单 · 协同终稿');
    assert.equal(backup.comments.length, 1);
    assert.match(readFileSync(path.join(downloadDir, htmlFile), 'utf8'), /交稿前最后一轮/);

    await evaluate(first, `document.querySelector('#commentsTab').click()`);
    await sleep(300);
    await screenshot(first, 'screenshot-desktop.png');

    await first.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await evaluate(first, `document.querySelector('.mobile-tabs [data-pane="margin"]').click()`);
    await sleep(250);
    const mobile = await evaluate(first, `(() => ({
      tabsDisplay: getComputedStyle(document.querySelector('.mobile-tabs')).display,
      activePane: document.querySelector('.workspace > .pane.active').dataset.pane,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      commentVisible: document.querySelector('.comment-card').offsetParent !== null
    }))()`);
    assert.equal(mobile.tabsDisplay, 'grid');
    assert.equal(mobile.activePane, 'margin');
    assert.equal(mobile.scrollWidth, mobile.clientWidth);
    assert.equal(mobile.commentVisible, true);
    await screenshot(first, 'screenshot-mobile.png');

    await first.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(first, `(() => {
      const button = document.querySelector('[data-restore-revision="0"]');
      if (!button) throw new Error('Missing revision zero restore button');
      button.click();
      document.querySelector('#restoreForm').requestSubmit();
    })()`);
    await waitForExpression(second, `document.querySelector('#documentTitle').value === '协作发布稿'`);
    assert.match(await evaluate(second, `document.querySelector('#editor').textContent`), /一起编辑/);
    assert.deepEqual(runtimeErrors, []);

    const result = {
      initial,
      sync: {
        members: await evaluate(first, `document.querySelector('#memberCount').textContent`),
        secondTitle: await evaluate(second, `document.querySelector('#documentTitle').value`),
        restoredRevision: await evaluate(second, `document.querySelector('#drawerRevision').textContent`),
      },
      exports: [jsonFile, htmlFile],
      mobile,
      runtimeErrors,
      outputDir,
    };
    console.log(JSON.stringify(result, null, 2));
    await first.send('Browser.close');
  } finally {
    for (const client of clients) client.close();
    if (!browser.killed) browser.kill();
    await service.close();
    await sleep(300);
    if (profile.startsWith(tempRoot)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
    if (downloadDir.startsWith(tempRoot)) {
      try { rmSync(downloadDir, { recursive: true, force: true }); } catch {}
    }
    if (!persistScreenshots && outputDir.startsWith(tempRoot)) {
      try { rmSync(outputDir, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
