import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const appPort = 4589 + (process.pid % 240);
const debugPort = 9889 + (process.pid % 240);
const baseUrl = `http://127.0.0.1:${appPort}/apps/089-knowledge-wiki/`;
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app89-smoke-${process.pid}`);
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
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

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

function createStaticServer() {
  return http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const decoded = decodeURIComponent(requestUrl.pathname);
      let filePath = path.resolve(repoRoot, `.${decoded}`);
      if (!filePath.startsWith(`${repoRoot}${path.sep}`) && filePath !== repoRoot) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(readFileSync(filePath));
    } catch {
      response.writeHead(500).end('Server error');
    }
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
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url, runtimeErrors) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  try {
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
  } catch (error) {
    const page = await evaluate(client, `({ title: document.title, text: document.body ? document.body.innerText.slice(0, 800) : '' })`);
    throw new Error(`${error.message}\nRuntime errors: ${JSON.stringify(runtimeErrors)}\nPage: ${JSON.stringify(page)}`);
  }
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(appPort, '127.0.0.1', resolve);
  });

  const browser = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const page = targets.find((target) => target.type === 'page');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception');
    });
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);

    const initial = await evaluate(client, `(() => ({
      h1: document.querySelectorAll('.topbar h1').length,
      notes: document.querySelectorAll('.note-card').length,
      title: document.querySelector('#titleInput').value,
      links: document.querySelectorAll('#outgoingList button').length,
      graphNodes: document.querySelectorAll('#miniGraph .graph-node').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(initial.h1, 1);
    assert.equal(initial.notes, 5);
    assert.equal(initial.title, '欢迎来到 LOOM');
    assert.ok(initial.links >= 4);
    assert.ok(initial.graphNodes >= 4);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await evaluate(client, `document.querySelector('#newNoteButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.note-card').length === 6`);
    await evaluate(client, `(() => {
      const title = document.querySelector('#titleInput');
      title.value = '研究日志';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      title.dispatchEvent(new Event('change', { bubbles: true }));
      const content = document.querySelector('#contentInput');
      content.value = '# 研究日志\\n\\n今天验证一个假设，并连接到 [[项目复盘]]。\\n\\n下一步创建 [[未整理线索]]。';
      content.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelector('#pathTitle').textContent === '研究日志'`);
    await sleep(650);

    await evaluate(client, `document.querySelector('#previewModeButton').click()`);
    await waitForExpression(client, `!document.querySelector('#preview').hidden && document.querySelectorAll('#preview .wiki-link').length === 2`);
    await evaluate(client, `[...document.querySelectorAll('#preview .wiki-link')].find((link) => link.dataset.noteTitle === '项目复盘').click()`);
    await waitForExpression(client, `document.querySelector('#titleInput').value === '项目复盘'`);

    await evaluate(client, `(() => {
      const search = document.querySelector('#searchInput');
      search.value = '研究日志';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.note-card').length === 1`);
    const search = await evaluate(client, `({
      result: document.querySelector('#resultCount').textContent,
      title: document.querySelector('.note-card strong').textContent
    })`);
    assert.match(search.result, /1/);
    assert.equal(search.title, '研究日志');
    await evaluate(client, `document.querySelector('.note-card').click(); document.querySelector('#openGraphButton').click()`);
    await waitForExpression(client, `document.querySelector('#graphDialog').open`);
    const graph = await evaluate(client, `({
      nodes: document.querySelectorAll('#graphCanvas .graph-node').length,
      edges: document.querySelectorAll('#graphCanvas .graph-edge').length,
      missing: document.querySelectorAll('#graphCanvas .graph-node.missing').length,
      summary: document.querySelector('#graphSummary').textContent
    })`);
    assert.ok(graph.nodes >= 7);
    assert.ok(graph.edges >= 10);
    assert.ok(graph.missing >= 1);
    assert.match(graph.summary, /6 则笔记/);
    await evaluate(client, `document.querySelector('#closeGraphButton').click(); document.querySelector('#clearSearchButton').click()`);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    const persisted = await evaluate(client, `(() => {
      const state = window.__LOOM89__.getState();
      const research = state.notes.find((note) => note.title === '研究日志');
      return {
        total: state.notes.length,
        researchContent: research && research.content,
        selected: state.notes.find((note) => note.id === state.selectedId)?.title,
        stored: localStorage.getItem('loom89.notes.v1')?.length || 0
      };
    })()`);
    assert.equal(persisted.total, 6);
    assert.match(persisted.researchContent, /\[\[项目复盘\]\]/);
    assert.ok(persisted.stored > 500);

    await evaluate(client, `(() => {
      const welcome = window.__LOOM89__.getState().notes.find((note) => note.title === '欢迎来到 LOOM');
      window.__LOOM89__.openNote(welcome.id);
      document.querySelector('#previewModeButton').click();
      document.body.tabIndex = -1;
      document.body.focus();
    })()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focus = await evaluate(client, `getComputedStyle(document.activeElement).outlineStyle`);
    assert.notEqual(focus, 'none');
    await evaluate(client, `document.activeElement.blur(); window.scrollTo(0, 0)`);
    await sleep(350);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl, runtimeErrors);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `(() => {
      const research = window.__LOOM89__.getState().notes.find((note) => note.title === '研究日志');
      window.__LOOM89__.openNote(research.id);
      document.querySelector('#editModeButton').click();
      document.querySelector('#workspace').scrollIntoView({ block: 'start' });
    })()`);
    await sleep(350);

    const mobile = await evaluate(client, `(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      };
      return {
        total: window.__LOOM89__.getState().notes.length,
        title: document.querySelector('#titleInput').value,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        newButton: rect('#newNoteButton'),
        editor: rect('#contentInput'),
        editButton: rect('#editModeButton')
      };
    })()`);
    assert.equal(mobile.total, 6);
    assert.equal(mobile.title, '研究日志');
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.newButton.left >= 0 && mobile.newButton.right <= 390 && mobile.newButton.height >= 44);
    assert.ok(mobile.editor.left >= 0 && mobile.editor.right <= 390);
    assert.ok(mobile.editButton.height >= 38);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, search, graph, persisted, focus, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(300);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
