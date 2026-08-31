import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
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

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
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
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (payload) => {
      const message = JSON.parse(payload.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
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

  send(method, params = {}, timeout = 10_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, timeout);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
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

async function preparePage(client, url, runtimeErrors, expectedConnection = '跨设备在线') {
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') runtimeErrors.push(args.map((argument) => argument.value || argument.description).join(' '));
  });
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
  await waitForExpression(client, `document.querySelector('#connectionText').textContent.includes(${JSON.stringify(expectedConnection)})`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    optimizeForSpeed: true,
  }, 30_000);
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function createPage(debugPortValue, url, runtimeErrors, expectedConnection) {
  const target = await fetch(`http://127.0.0.1:${debugPortValue}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((response) => response.json());
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await preparePage(client, url, runtimeErrors, expectedConnection);
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
  const debugPort = await reservePort();
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
    console.log('[smoke] first editor connected');

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
    console.log('[smoke] initial layout verified');

    await evaluate(first, `(() => {
      const title = document.querySelector('#documentTitle');
      const editor = document.querySelector('#editor');
      title.value = '八月发布检查清单';
      editor.innerHTML = '<h1>交稿前最后一轮</h1><p>林星负责核对链接，陈晨负责校对发布日期。</p><ul><li>确认标题</li><li>确认部署地址</li></ul>';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `Number(document.querySelector('#drawerRevision').textContent) >= 1 && document.querySelector('#saveState').textContent.includes('已同步')`);
    console.log('[smoke] first revision saved');

    const second = await createPage(debugPort, baseUrl, runtimeErrors);
    clients.push(second);
    await waitForExpression(first, `document.querySelector('#memberCount').textContent.includes('2')`);
    assert.equal(await evaluate(second, `document.querySelector('#documentTitle').value`), '八月发布检查清单');
    assert.match(await evaluate(second, `document.querySelector('#editor').textContent`), /林星负责核对链接/);
    console.log('[smoke] second editor synchronized');

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
    console.log('[smoke] comment synchronized');

    await evaluate(second, `(() => {
      const title = document.querySelector('#documentTitle');
      title.value = '八月发布清单 · 协同终稿';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `document.querySelector('#documentTitle').value.includes('协同终稿')`);
    await waitForExpression(first, `Number(document.querySelector('#versionCount').textContent) >= 2`);
    console.log('[smoke] remote title and versions synchronized');

    await evaluate(first, `document.querySelector('#exportJsonButton').click(); document.querySelector('#exportHtmlButton').click()`);
    const jsonFile = await waitFor(() => readdirSync(downloadDir).find((name) => name.endsWith('.json')), 5000, 'JSON export');
    const htmlFile = await waitFor(() => readdirSync(downloadDir).find((name) => name.endsWith('.html')), 5000, 'HTML export');
    const backup = JSON.parse(readFileSync(path.join(downloadDir, jsonFile), 'utf8'));
    assert.equal(backup.title, '八月发布清单 · 协同终稿');
    assert.equal(backup.comments.length, 1);
    assert.match(readFileSync(path.join(downloadDir, htmlFile), 'utf8'), /交稿前最后一轮/);
    console.log('[smoke] JSON and HTML exports verified');

    await evaluate(first, `document.querySelector('#commentsTab').click()`);
    await sleep(300);
    if (persistScreenshots) {
      await screenshot(first, 'screenshot-desktop.png');
      console.log('[smoke] desktop layout captured');
    } else console.log('[smoke] desktop layout verified');

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
    if (persistScreenshots) {
      await screenshot(first, 'screenshot-mobile.png');
      console.log('[smoke] mobile layout captured');
    } else console.log('[smoke] mobile layout verified');

    await first.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(first, `(() => {
      const button = document.querySelector('[data-restore-revision="0"]');
      if (!button) throw new Error('Missing revision zero restore button');
      button.click();
      document.querySelector('#restoreForm').requestSubmit();
    })()`);
    await waitForExpression(second, `document.querySelector('#documentTitle').value === '协作发布稿'`);
    assert.match(await evaluate(second, `document.querySelector('#editor').textContent`), /一起编辑/);
    console.log('[smoke] version restore verified');

    const deleteGuard = await evaluate(first, `(() => {
      document.querySelector('#deleteDocumentButton').click();
      const input = document.querySelector('#deleteConfirmInput');
      const confirm = document.querySelector('#deleteConfirmButton');
      const initiallyDisabled = confirm.disabled;
      input.value = 'WRONG-ROOM';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const wrongRoomDisabled = confirm.disabled;
      input.value = '${room}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        open: document.querySelector('#deleteDialog').open,
        initiallyDisabled,
        wrongRoomDisabled,
        ready: !confirm.disabled,
        scope: document.querySelector('#deleteScopeText').textContent
      };
    })()`);
    assert.deepEqual(deleteGuard, {
      open: true,
      initiallyDisabled: true,
      wrongRoomDisabled: true,
      ready: true,
      scope: `所有在线成员的正文、批注和全部版本都会被清空，房间 ${room} 仍会保留。`,
    });
    await evaluate(second, `(() => {
      const title = document.querySelector('#documentTitle');
      title.value = '删除前收到的同伴更新';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `!document.querySelector('#deleteDialog').open && document.querySelector('#documentTitle').value === '删除前收到的同伴更新'`);
    assert.match(await evaluate(first, `document.querySelector('#toast').textContent`), /重新确认删除/);
    await evaluate(first, `(() => {
      document.querySelector('#deleteDocumentButton').click();
      const input = document.querySelector('#deleteConfirmInput');
      input.value = '${room}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#deleteForm').requestSubmit();
    })()`);
    await waitForExpression(second, `document.querySelector('#documentTitle').value === '未命名文档' && document.querySelector('#editor').textContent.trim() === ''`);
    await waitForExpression(first, `document.querySelector('#saveState').textContent.includes('删除已同步')`);
    const deleted = await evaluate(second, `(() => ({
      title: document.querySelector('#documentTitle').value,
      body: document.querySelector('#editor').textContent.trim(),
      comments: document.querySelector('#openCommentCount').textContent,
      versions: document.querySelector('#versionCount').textContent,
      revision: document.querySelector('#drawerRevision').textContent
    }))()`);
    assert.equal(deleted.title, '未命名文档');
    assert.equal(deleted.body, '');
    assert.equal(deleted.comments, '0');
    assert.equal(deleted.versions, '0');
    console.log('[smoke] online guarded deletion synchronized');

    const defaultRestoreGuard = await evaluate(first, `(() => {
      document.querySelector('#restoreDefaultButton').click();
      return {
        open: document.querySelector('#restoreDialog').open,
        title: document.querySelector('#restoreDialogTitle').textContent,
        copy: document.querySelector('#restoreDialogText').textContent,
        confirm: document.querySelector('#restoreConfirmButton').textContent,
        ready: !document.querySelector('#restoreConfirmButton').disabled
      };
    })()`);
    assert.deepEqual(defaultRestoreGuard, {
      open: true,
      title: '恢复默认发布稿？',
      copy: '当前内容会保留在版本记录中，再恢复 GALLEY/74 的默认标题与正文。',
      confirm: '恢复默认稿',
      ready: true,
    });
    await evaluate(second, `(() => {
      const title = document.querySelector('#documentTitle');
      const editor = document.querySelector('#editor');
      title.value = '恢复前收到的同伴稿';
      editor.innerHTML = '<p>同伴已经开始填写新一轮发布内容。</p>';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(first, `!document.querySelector('#restoreDialog').open && document.querySelector('#documentTitle').value === '恢复前收到的同伴稿'`);
    assert.match(await evaluate(first, `document.querySelector('#toast').textContent`), /重新确认恢复/);
    await evaluate(first, `(() => {
      document.querySelector('#restoreDefaultButton').click();
      document.querySelector('#restoreForm').requestSubmit();
    })()`);
    await waitForExpression(second, `document.querySelector('#documentTitle').value === '协作发布稿' && document.querySelector('#editor').textContent.includes('一起编辑这份校样')`);
    await waitForExpression(first, `document.querySelector('#saveState').textContent.includes('默认稿已恢复')`);
    const defaultRestored = await evaluate(second, `(() => ({
      title: document.querySelector('#documentTitle').value,
      body: document.querySelector('#editor').textContent,
      versions: document.querySelector('#versionCount').textContent,
      versionText: document.querySelector('#versionList').textContent,
      revision: document.querySelector('#drawerRevision').textContent
    }))()`);
    assert.equal(defaultRestored.title, '协作发布稿');
    assert.match(defaultRestored.body, /一起编辑这份校样/);
    assert.ok(Number(defaultRestored.versions) >= 2);
    assert.match(defaultRestored.versionText, /恢复前收到的同伴稿/);
    console.log('[smoke] online default draft restored with concurrent update guard');

    const localRoom = `LOCAL-${process.pid}`;
    const localUrl = `http://127.0.0.1:${address.port}/?room=${localRoom}&ws=local`;
    const localFirst = await createPage(debugPort, localUrl, runtimeErrors, '本机协作');
    const localSecond = await createPage(debugPort, localUrl, runtimeErrors, '本机协作');
    clients.push(localFirst, localSecond);
    await evaluate(localFirst, `(() => {
      const title = document.querySelector('#documentTitle');
      const editor = document.querySelector('#editor');
      title.value = '本机待删除协作稿';
      editor.innerHTML = '<p>只保存在本浏览器的协作内容。</p>';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(localSecond, `document.querySelector('#documentTitle').value === '本机待删除协作稿'`);
    await evaluate(localFirst, `(() => {
      document.querySelector('#deleteDocumentButton').click();
      const input = document.querySelector('#deleteConfirmInput');
      input.value = '${localRoom}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#deleteForm').requestSubmit();
    })()`);
    await waitForExpression(localSecond, `document.querySelector('#documentTitle').value === '未命名文档' && document.querySelector('#editor').textContent.trim() === ''`);
    const localDeleted = await evaluate(localSecond, `(() => ({
      connection: document.querySelector('#connectionText').textContent,
      comments: document.querySelector('#openCommentCount').textContent,
      versions: document.querySelector('#versionCount').textContent
    }))()`);
    assert.match(localDeleted.connection, /本机协作/);
    assert.equal(localDeleted.comments, '0');
    assert.equal(localDeleted.versions, '0');
    await evaluate(localFirst, `(() => {
      document.querySelector('#restoreDefaultButton').click();
      document.querySelector('#restoreForm').requestSubmit();
    })()`);
    await waitForExpression(localSecond, `document.querySelector('#documentTitle').value === '协作发布稿' && document.querySelector('#editor').textContent.includes('一起编辑这份校样')`);
    const localRestored = await evaluate(localSecond, `(() => ({
      title: document.querySelector('#documentTitle').value,
      versions: document.querySelector('#versionCount').textContent,
      body: document.querySelector('#editor').textContent
    }))()`);
    assert.equal(localRestored.title, '协作发布稿');
    assert.match(localRestored.body, /一起编辑这份校样/);
    assert.ok(Number(localRestored.versions) >= 1);
    assert.deepEqual(runtimeErrors, []);
    console.log('[smoke] local deletion and default restoration synchronized without runtime errors');

    const result = {
      initial,
      sync: {
        members: await evaluate(first, `document.querySelector('#memberCount').textContent`),
        secondTitle: await evaluate(second, `document.querySelector('#documentTitle').value`),
        deletedRevision: deleted.revision,
        restoredRevision: defaultRestored.revision,
      },
      exports: [jsonFile, htmlFile],
      mobile,
      localDeleted,
      localRestored,
      runtimeErrors,
      outputDir,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (clients[0]) {
      try { await Promise.race([clients[0].send('Browser.close'), sleep(800)]); } catch {}
    }
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
