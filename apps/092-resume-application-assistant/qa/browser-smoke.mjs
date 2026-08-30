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
const appPort = 4692 + (process.pid % 220);
const debugPort = 9892 + (process.pid % 80);
const store = `smoke-${process.pid}`;
const baseUrl = `http://127.0.0.1:${appPort}/?store=${store}`;
const profileDir = path.resolve(os.tmpdir(), `codex-fitroom92-${process.pid}`);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
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
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
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
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready') && Boolean(window.__FITROOM92__)`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  const safeFiles = new Set(['index.html', 'styles.css', 'resume-core.js', 'app.js']);
  return createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!safeFiles.has(relative)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const file = path.join(appDir, relative);
    response.writeHead(200, { 'content-type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profileDir.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'temporary profile must stay under the OS temp directory');
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));
  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
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
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await waitForExpression(client, `window.__FITROOM92__.getState().versions.length === 2`);

    await evaluate(client, `(() => {
      const set=(selector,value,type='input')=>{const field=document.querySelector(selector);field.value=value;field.dispatchEvent(new Event(type,{bubbles:true}));};
      set('#target-company','星轨数据');
      set('#target-role','增长产品经理');
      set('#target-job','负责 B2B SaaS 产品策略；需要用户研究、SQL、Python 与团队管理能力。');
      document.querySelector('#target-form').requestSubmit();
    })()`);
    await waitForExpression(client, `window.__FITROOM92__.getState().versions.length === 3 && window.__FITROOM92__.getState().versions[0].role === '增长产品经理'`);
    const generated = await evaluate(client, `window.__FITROOM92__.getState().versions[0]`);
    assert.equal(generated.score, 71);
    assert.deepEqual(generated.missingKeywords, ['Python', '团队管理']);
    assert.equal(generated.profile.experiences[0].id, 'experience-northstar');

    await evaluate(client, `(() => {
      const title=document.querySelector('#version-title');title.value='星轨 · A 轮重点版本';title.dispatchEvent(new Event('change',{bubbles:true}));
      const status=document.querySelector('#version-status');status.value='interview';status.dispatchEvent(new Event('change',{bubbles:true}));
      const skills=document.querySelector('#profile-skills');skills.value += '，Python';skills.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#recut-button').click();
    })()`);
    await waitForExpression(client, `window.__FITROOM92__.getState().versions[0].score === 86 && window.__FITROOM92__.getState().versions[0].status === 'interview'`);
    const recut = await evaluate(client, `window.__FITROOM92__.getState().versions[0]`);
    assert.equal(recut.title, '星轨 · A 轮重点版本');
    assert.deepEqual(recut.missingKeywords, ['团队管理']);

    await evaluate(client, `document.querySelector('#copy-button').click()`);
    await waitForExpression(client, `document.querySelector('#toast').textContent.includes('已复制为纯文本')`);
    await evaluate(client, `document.querySelector('#export-button').click()`);
    await waitForExpression(client, `window.__FITROOM92__.getLastExport().length > 1000`);
    const exported = JSON.parse(await evaluate(client, `window.__FITROOM92__.getLastExport()`));
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.versions.length, 3);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && window.__FITROOM92__.getState().versions.length === 3`);
    const persisted = await evaluate(client, `window.__FITROOM92__.getState().versions[0]`);
    assert.equal(persisted.title, '星轨 · A 轮重点版本');
    assert.equal(persisted.status, 'interview');
    assert.equal(persisted.score, 86);

    await evaluate(client, `(() => {const role=document.querySelector('#target-role');role.value='';document.querySelector('#target-form').requestSubmit();})()`);
    await waitForExpression(client, `!document.querySelector('#target-error').hidden && document.querySelector('#target-error').textContent.includes('岗位名称')`);
    assert.equal(await evaluate(client, `window.__FITROOM92__.getState().versions.length`), 3);

    await client.send('Page.bringToFront');
    await evaluate(client, `(() => {
      const role=document.querySelector('#target-role');role.value='增长产品经理';
      document.querySelector('#target-error').hidden=true;
      const workspace=document.querySelector('#workspace');
      window.scrollTo({top:workspace.offsetTop-document.querySelector('.masthead').offsetHeight,behavior:'instant'});
      role.focus();
      document.querySelector('#toast').classList.remove('is-visible');
    })()`);
    await sleep(300);
    const desktop = await evaluate(client, `(() => {
      const focus=getComputedStyle(document.querySelector('#target-role'));
      const state=window.__FITROOM92__.getState();
      return {
        versions:state.versions.length,
        activeTitle:state.versions[0].title,
        score:Number(document.querySelector('#fit-score').textContent),
        resumeName:document.querySelector('#resume-name').textContent,
        h1:document.querySelectorAll('h1').length,
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        activeElement:document.activeElement?.id,
        matchesFocus:document.querySelector('#target-role').matches('.field input:focus'),
        focusOutline:focus.outlineWidth,
        focusShadow:focus.boxShadow,
        workspaceColumns:getComputedStyle(document.querySelector('#workspace')).gridTemplateColumns,
      };
    })()`);
    assert.equal(desktop.versions, 3);
    assert.equal(desktop.activeTitle, '星轨 · A 轮重点版本');
    assert.equal(desktop.score, 86);
    assert.equal(desktop.resumeName, '林星');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.activeElement, 'target-role');
    assert.equal(desktop.matchesFocus, true);
    assert.ok(desktop.focusOutline !== '0px' || desktop.focusShadow !== 'none', `Focus indicator missing: ${JSON.stringify(desktop)}`);
    assert.equal(desktop.workspaceColumns.split(' ').length, 3);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await waitForExpression(client, `window.__FITROOM92__.getState().versions.length === 3`);
    await evaluate(client, `(() => { const panel=document.querySelector('.preview-panel'); window.scrollTo({top:panel.offsetTop,behavior:'instant'}); document.querySelector('#toast').classList.remove('is-visible'); })()`);
    await sleep(300);
    const mobile = await evaluate(client, `(() => {
      const controls=[...document.querySelectorAll('.preview-actions button:not([disabled]), .status-control select, .add-button, .utility-actions button')]
        .filter(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return box.width>0&&box.height>0&&style.display!=='none';})
        .map(element=>{const box=element.getBoundingClientRect();return {id:element.id||element.textContent.trim(),width:box.width,height:box.height,left:box.left,right:box.right};});
      return {
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        resumeName:document.querySelector('#resume-name').textContent,
        rulerWidth:document.querySelector('.fit-ruler').getBoundingClientRect().width,
        sheetWidth:document.querySelector('.resume-sheet').getBoundingClientRect().width,
        controls,
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.resumeName, '林星');
    assert.ok(mobile.rulerWidth <= 366 && mobile.sheetWidth <= 366);
    mobile.controls.forEach((box) => {
      assert.ok(box.height >= 44 && box.width >= 44, `Touch target failed: ${JSON.stringify(box)}`);
      assert.ok(box.left >= 0 && box.right <= 390, `Control escaped viewport: ${JSON.stringify(box)}`);
    });
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({
      generated: { score: generated.score, missing: generated.missingKeywords },
      recut: { score: recut.score, missing: recut.missingKeywords, status: recut.status },
      desktop,
      mobile: { ...mobile, controls: `${mobile.controls.length} checked` },
      persistence: { title: persisted.title, versions: 3 },
      runtimeErrors,
      outputDir,
    }, null, 2));
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await sleep(350);
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
