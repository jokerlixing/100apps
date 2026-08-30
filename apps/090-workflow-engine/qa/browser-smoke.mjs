import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const appPort = 5890 + (process.pid % 400);
const debugPort = 9690 + (process.pid % 200);
const baseUrl = `http://127.0.0.1:${appPort}/`;
const profile = path.resolve(os.tmpdir(), `codex-app90-smoke-${process.pid}`);
const downloadDir = path.join(profile, 'downloads');
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
  await waitForExpression(client, `document.readyState === 'complete' && document.querySelectorAll('.workflow-card').length >= 3`);
}

async function screenshot(client, name) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, name), Buffer.from(result.data, 'base64'));
}

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const safe = ['index.html', 'styles.css', 'workflow-core.js', 'app.js'];
    if (!safe.includes(relative)) {
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
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(downloadDir, { recursive: true });

  const server = createStaticServer();
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    assert.match(await evaluate(client, `document.querySelector('.workflow-name').value`), /高价值线索分流/);

    await evaluate(client, `(() => {
      const input=document.querySelector('#payload-input');
      input.value=JSON.stringify({lead:{name:'北岸设计',budget:6800,source:'QA'},route:{}},null,2);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#run-workflow').click();
    })()`);
    await waitForExpression(client, `document.querySelector('#latest-run .status-success') && document.querySelector('#metric-runs').textContent === '1'`);

    await evaluate(client, `(() => {
      const input=document.querySelector('#payload-input');
      input.value=JSON.stringify({lead:{name:'小额线索',budget:1200},route:{}},null,2);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#run-workflow').click();
    })()`);
    await waitForExpression(client, `document.querySelector('#latest-run .status-skipped') && document.querySelector('#metric-runs').textContent === '2'`);

    await evaluate(client, `(() => {
      document.querySelector('#new-workflow').click();
      const name=document.querySelector('.workflow-name');
      name.value='QA 调度线路';
      name.dispatchEvent(new Event('input',{bubbles:true}));
      name.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('.enable-button').click();
    })()`);
    await waitForExpression(client, `[...document.querySelectorAll('.workflow-card')].some(card => card.textContent.includes('QA 调度线路'))`);
    assert.equal(await evaluate(client, `document.querySelector('.enable-button').classList.contains('is-on')`), true);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.querySelector('.workflow-name')?.value === 'QA 调度线路'`);
    assert.equal(await evaluate(client, `document.querySelector('.enable-button').classList.contains('is-on')`), true);

    await evaluate(client, `document.querySelector('#export-button').click()`);
    const downloaded = await waitFor(() => readdirSync(downloadDir).find((name) => name.startsWith('switchyard-90-') && name.endsWith('.json')), 8_000, 'backup download');
    assert.ok(downloaded);

    await evaluate(client, `(() => {
      document.querySelector('.workflow-tools .button:last-child').click();
      document.querySelector('#confirm-accept').click();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.workflow-card').length === 3`);

    await evaluate(client, `(() => {
      const card=[...document.querySelectorAll('.workflow-main')].find(item=>item.textContent.includes('高价值线索分流'));
      card.click();
      const input=document.querySelector('#payload-input');
      input.value=JSON.stringify({lead:{name:'远山科技',budget:9200,source:'复验'},route:{}},null,2);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#run-workflow').click();
      window.scrollTo({top:0,behavior:'instant'});
    })()`);
    await waitForExpression(client, `document.querySelector('#latest-run .status-success')`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    await evaluate(client, `document.querySelector('.workflow-name').focus()`);
    await sleep(300);
    const desktop = await evaluate(client, `(() => {
      const focus=getComputedStyle(document.querySelector('.workflow-name'));
      const saved=JSON.parse(localStorage.getItem('switchyard-90-state-v1'));
      return {
        workflows:saved.workflows.length,
        history:saved.history.length,
        selected:document.querySelector('.workflow-name').value,
        result:document.querySelector('#latest-run strong').textContent,
        h1:document.querySelectorAll('h1').length,
        scrollWidth:document.documentElement.scrollWidth,
        clientWidth:document.documentElement.clientWidth,
        activeClass:document.activeElement.className,
        focusOutline:focus.outlineWidth,
      };
    })()`);
    assert.equal(desktop.workflows, 3);
    assert.ok(desktop.history >= 3);
    assert.equal(desktop.selected, '高价值线索分流');
    assert.equal(desktop.result, '执行成功');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.match(desktop.activeClass, /workflow-name/);
    assert.match(readFileSync(path.join(appDir, 'styles.css'), 'utf8'), /:focus-visible\s*\{/);
    await evaluate(client, `(() => {
      document.querySelector('#console-clock').textContent='09:30:00';
      document.querySelectorAll('#latest-run time').forEach(item=>{item.textContent='09:30:00'});
      document.querySelectorAll('#history-list time').forEach(item=>{item.textContent='08/31 09:30:00'});
    })()`);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('.rail-map').scrollIntoView({block:'start'}); document.querySelector('#toast').classList.remove('show')`);
    await sleep(350);
    const mobile = await evaluate(client, `(() => {
      const rail=document.querySelector('.rail-map').getBoundingClientRect();
      const buttons=[...document.querySelectorAll('.rail-map button')].map(element=>{const box=element.getBoundingClientRect();return {width:box.width,height:box.height,left:box.left,right:box.right};});
      return {scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,railLeft:rail.left,railRight:rail.right,buttons};
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.railLeft >= 0 && mobile.railRight <= 390);
    mobile.buttons.forEach((box) => assert.ok(box.height >= 27 && box.left >= 0 && box.right <= 390, `Mobile route control failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile: { ...mobile, buttons: `${mobile.buttons.length} checked` }, download: downloaded, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(350);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
