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
const port = 4894 + (process.pid % 250);
const debugPort = 9594 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${port}/`;
const livePython = process.env.BENCH94_LIVE_PYTHON === '1';
const pythonCode = 'print("python")\n{"samples": 5, "average": 15.4}';
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app94-smoke-${process.pid}`);
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
  ['.mjs', 'text/javascript; charset=utf-8'],
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
      this.socket.send(JSON.stringify({ id, params, method }));
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
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(timeout)]);
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

const pythonWorkerStub = String.raw`
(() => {
  const NativeWorker = window.Worker;
  class PythonWorkerStub extends EventTarget {
    constructor() { super(); this.timers = []; this.terminated = false; }
    emit(data, delay) {
      const timer = setTimeout(() => {
        if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data }));
      }, delay);
      this.timers.push(timer);
    }
    postMessage(message) {
      const id = message.id;
      this.emit({ type: 'stage', id, stage: 'check' }, 5);
      this.emit({ type: 'stage', id, stage: 'loading', detail: '正在加载 Python 314.0.6' }, 15);
      this.emit({ type: 'stage', id, stage: 'run', detail: 'Python 314.0.6' }, 35);
      this.emit({ type: 'log', id, level: 'log', text: 'python mock ready' }, 50);
      this.emit({ type: 'done', id, status: 'success', result: "{'samples': 5, 'average': 15.4}", duration: 64 }, 70);
    }
    terminate() { this.terminated = true; this.timers.forEach(clearTimeout); }
  }
  function WorkerProxy(url, options) {
    if (String(url).includes('python-worker.mjs')) return new PythonWorkerStub();
    return new NativeWorker(url, options);
  }
  WorkerProxy.prototype = NativeWorker.prototype;
  window.Worker = WorkerProxy;
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
    if (!livePython) await client.send('Page.addScriptToEvaluateOnNewDocument', { source: pythonWorkerStub });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelectorAll('.file-button').length === 3`);

    assert.equal(await evaluate(client, `document.querySelector('#previewFrame').getAttribute('sandbox')`), 'allow-scripts');
    await evaluate(client, `document.querySelector('#runButton').click()`);
    await waitForExpression(client, `document.querySelector('#resultStamp').textContent === 'PASS'`);
    const web = await evaluate(client, `(() => ({
      frameVisible: document.querySelector('#previewFrame').classList.contains('visible'),
      previewText: document.querySelector('#previewFrame').srcdoc,
      logs: document.querySelector('#consoleLog').innerText,
      history: document.querySelectorAll('.history-item').length
    }))()`);
    assert.equal(web.frameVisible, true);
    assert.match(web.previewText, /把想法放进浏览器/);
    assert.match(web.logs, /Web 实验台已就绪/);
    assert.equal(web.history, 1);

    await evaluate(client, `document.querySelector('[data-mode="javascript"]').click()`);
    await waitForExpression(client, `document.querySelector('#editorHeading').textContent === 'main.js'`);
    await evaluate(client, `(() => { const editor=document.querySelector('#codeEditor'); editor.value='console.log("worker-ok", { value: 42 });\\nreturn 6 * 7;'; editor.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#runButton').click(); })()`);
    await waitForExpression(client, `document.querySelector('#resultStamp').textContent === 'PASS'`);
    const javascript = await evaluate(client, `document.querySelector('#consoleLog').innerText`);
    assert.match(javascript, /worker-ok/);
    assert.match(javascript, /42/);

    await evaluate(client, `document.querySelector('[data-mode="python"]').click()`);
    await evaluate(client, `(() => { const editor=document.querySelector('#codeEditor'); editor.value=${JSON.stringify(pythonCode)}; editor.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#runButton').click(); })()`);
    await waitForExpression(client, `document.querySelector('#resultStamp').textContent === 'PASS'`, livePython ? 35_000 : 10_000);
    const python = await evaluate(client, `document.querySelector('#consoleLog').innerText`);
    assert.match(python, livePython ? /python/ : /python mock ready/);
    assert.match(python, /samples/);

    await evaluate(client, `document.querySelector('[data-mode="javascript"]').click()`);
    await evaluate(client, `(() => { const editor=document.querySelector('#codeEditor'); editor.value='while (true) {}'; editor.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#runButton').click(); })()`);
    await waitForExpression(client, `document.body.classList.contains('running')`);
    await evaluate(client, `document.querySelector('#stopButton').click()`);
    await waitForExpression(client, `document.querySelector('#resultStamp').textContent === 'STOP'`);
    assert.match(await evaluate(client, `document.querySelector('.history-item').className`), /stopped/);

    await evaluate(client, `document.querySelector('#resetButton').click()`);
    await waitForExpression(client, `document.querySelector('#resetDialog').open`);
    await evaluate(client, `document.querySelector('#confirmResetButton').click()`);
    await waitForExpression(client, `document.querySelector('#codeEditor').value.includes('const readings')`);
    await evaluate(client, `document.querySelector('#codeEditor').focus()`);
    await sleep(180);

    const desktop = await evaluate(client, `(() => {
      const workbench=getComputedStyle(document.querySelector('#main')).gridTemplateColumns;
      const editor=document.querySelector('#codeEditor').getBoundingClientRect();
      const output=document.querySelector('.output-panel').getBoundingClientRect();
      const focus=getComputedStyle(document.querySelector('#codeEditor'));
      return {
        title:document.querySelector('h1').textContent.trim(),
        modes:document.querySelectorAll('.mode-button').length,
        history:document.querySelectorAll('.history-item').length,
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        columns:workbench.split(' ').length,
        editorWidth:Math.round(editor.width),
        outputWidth:Math.round(output.width),
        focusOutline:focus.outlineWidth,
        persisted:JSON.parse(localStorage.getItem('bench94_workspace_v1')).workspaces.python['main.py']
      };
    })()`);
    assert.equal(desktop.title, '浏览器代码实验台');
    assert.equal(desktop.modes, 3);
    assert.equal(desktop.history, 4);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.columns, 3);
    assert.ok(desktop.editorWidth > 500);
    assert.ok(desktop.outputWidth > 350);
    assert.notEqual(desktop.focusOutline, '0px');
    assert.equal(desktop.persisted, pythonCode);
    await evaluate(client, `window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('#toast').classList.remove('show')`);
    await sleep(160);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await waitForExpression(client, `document.body.classList.contains('ready')`);
    const mobile = await evaluate(client, `(() => {
      const editor=document.querySelector('.editor-panel').getBoundingClientRect();
      const output=document.querySelector('.output-panel').getBoundingClientRect();
      const controls=[...document.querySelectorAll('.mode-button,#runButton,#stopButton,.file-button,.text-button')].map((element)=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height,left:box.left,right:box.right};});
      return {
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        editorTop:Math.round(editor.top),
        outputTop:Math.round(output.top),
        controls
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.outputTop > mobile.editorTop);
    mobile.controls.forEach((box) => assert.ok(box.width >= 44 && box.height >= 43 && box.left >= 0 && box.right <= 390, `Touch target failed: ${JSON.stringify(box)}`));
    await evaluate(client, `window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('#toast').classList.remove('show')`);
    await sleep(160);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ web, javascript: 'worker output verified', python: livePython ? 'live Pyodide verified' : 'mock lifecycle verified', desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, runtimeErrors, outputDir }, null, 2));
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
