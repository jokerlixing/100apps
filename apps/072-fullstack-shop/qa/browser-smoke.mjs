import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4470 + (process.pid % 300);
const debugPort = 9770 + (process.pid % 200);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app72-smoke-${process.pid}`);
const storeDir = path.resolve(os.tmpdir(), `codex-app72-store-${process.pid}`);
const storePath = path.join(storeDir, 'orders.json');
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe')
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 12_000, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await sleep(120);
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
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  assert.ok(storeDir.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(storeDir, { recursive: true });

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort), ORDER_STORE_PATH: storePath }
  });
  if (appServer) await waitFor(async () => (await fetch(baseUrl)).ok, 10_000, 'COUNTER/72 server');

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
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
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('#modeChip').textContent.includes('服务端')`);

    await evaluate(client, `(() => { const input=document.querySelector('#searchInput'); input.value='陶'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.product-card').length`), 3);
    await evaluate(client, `(() => { const input=document.querySelector('#searchInput'); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-add="mk-01"]').click(); document.querySelector('[data-add="mk-01"]').click(); document.querySelector('[data-add="mk-04"]').click(); })()`);
    assert.equal(await evaluate(client, `document.querySelector('#ticketCount').textContent`), '03');
    assert.equal(await evaluate(client, `document.querySelector('#mobileTicketTotal').textContent`), '¥264');

    await evaluate(client, `document.querySelector('#checkoutButton').click(); document.querySelector('#checkoutForm').requestSubmit()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('[aria-invalid="true"]').length`), 3);
    await evaluate(client, `(() => { document.querySelector('#nicknameInput').value='阿岚'; document.querySelector('#phoneSuffixInput').value='0831'; document.querySelector('#pickupSlotInput').value='sat-am'; document.querySelector('#checkoutForm').requestSubmit(); })()`);
    await waitForExpression(client, `document.querySelectorAll('.order-card').length === 1 && !document.querySelector('#checkoutDialog').open`);
    const receipt = await evaluate(client, `({ code:document.querySelector('.pickup-code strong').textContent.trim(), status:document.querySelector('.status-tag').textContent.trim() })`);
    assert.match(receipt.code, /^\d{6}$/);
    assert.equal(receipt.status, '待备货');

    await evaluate(client, `document.querySelector('[data-next-status="ready"]').click()`);
    await waitForExpression(client, `document.querySelector('.status-tag').textContent.includes('可取货')`);
    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('.status-tag')?.textContent.includes('可取货')`);
    await evaluate(client, `document.querySelector('[data-next-status="completed"]').click()`);
    await waitForExpression(client, `document.querySelector('.status-tag').textContent.includes('已完成')`);

    await evaluate(client, `document.querySelector('[data-add="mk-03"]').click(); document.querySelector('[data-add="mk-07"]').click(); document.querySelector('#toast').classList.remove('show'); document.querySelector('#searchInput').focus(); window.scrollTo({top:590,behavior:'instant'});`);
    await sleep(500);
    const desktop = await evaluate(client, `(() => { const input=getComputedStyle(document.querySelector('#searchInput')); return { mode:document.querySelector('#modeChip').textContent.trim(), products:document.querySelectorAll('.product-card').length, ticketCount:document.querySelector('#ticketCount').textContent, orders:document.querySelectorAll('.order-card').length, orderStatus:document.querySelector('.status-tag').textContent.trim(), h1:document.querySelectorAll('h1').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, focusOutline:input.outlineWidth }; })()`);
    assert.match(desktop.mode, /服务端/);
    assert.equal(desktop.ticketCount, '02');
    assert.equal(desktop.orders, 1);
    assert.equal(desktop.orderStatus, '已完成');
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.notEqual(desktop.focusOutline, '0px');
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `document.querySelector('#orders').scrollIntoView({block:'start',behavior:'instant'}); document.querySelector('#clearCompletedButton').click()`);
    await waitForExpression(client, `document.querySelector('#clearCompletedButton').classList.contains('armed')`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.order-card').length`), 1);
    assert.match(await evaluate(client, `document.querySelector('#clearCompletedButton').textContent`), /再次点击确认清空 1 条/);
    await sleep(350);
    await screenshot(client, 'screenshot-clear-completed.png');
    await evaluate(client, `document.querySelector('#clearCompletedButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.order-card').length === 0 && document.querySelector('#clearCompletedButton').disabled`);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, `${baseUrl}?offline=1`);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('#modeChip').classList.contains('local')`);
    await evaluate(client, `document.querySelector('[data-add="mk-02"]').click(); document.querySelector('#mobileTicketButton').click()`);
    await waitForExpression(client, `document.querySelector('#ticketPanel').classList.contains('open')`);
    const mobile = await evaluate(client, `(() => { const panel=document.querySelector('#ticketPanel').getBoundingClientRect(); const controls=[...document.querySelectorAll('.ticket-close,.qty-buttons button,.mobile-ticket-button')].map(el=>{const b=el.getBoundingClientRect();return {w:b.width,h:b.height,left:b.left,right:b.right}}); return { mode:document.querySelector('#modeChip').className, ticketCount:document.querySelector('#ticketCount').textContent, panelLeft:panel.left, panelRight:panel.right, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, controls }; })()`);
    assert.match(mobile.mode, /local/);
    assert.equal(mobile.ticketCount, '01');
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.panelLeft >= 0 && mobile.panelRight <= 390);
    mobile.controls.forEach((box) => assert.ok(box.w >= 44 && box.h >= 44 && box.left >= 0 && box.right <= 390, `Touch target failed: ${JSON.stringify(box)}`));
    await evaluate(client, `document.querySelector('#toast').classList.remove('show')`);
    await sleep(400);
    await screenshot(client, 'screenshot-mobile.png');

    await evaluate(client, `document.querySelector('#ticketClose').click(); document.querySelector('#checkoutButton').click(); document.querySelector('#nicknameInput').value='木木'; document.querySelector('#phoneSuffixInput').value='6628'; document.querySelector('#pickupSlotInput').value='sun-pm'; document.querySelector('#checkoutForm').requestSubmit();`);
    await waitForExpression(client, `document.querySelector('.order-card')?.textContent.includes('本地订单')`);
    await evaluate(client, `document.querySelector('[data-next-status="ready"]').click()`);
    await waitForExpression(client, `document.querySelector('.status-tag').textContent.includes('可取货')`);
    await evaluate(client, `document.querySelector('[data-next-status="completed"]').click()`);
    await waitForExpression(client, `document.querySelector('.status-tag').textContent.includes('已完成')`);
    const clearButtonSize = await evaluate(client, `(() => { const box=document.querySelector('#clearCompletedButton').getBoundingClientRect(); return {width:box.width,height:box.height}; })()`);
    assert.ok(clearButtonSize.width >= 44 && clearButtonSize.height >= 44);
    await evaluate(client, `document.querySelector('#clearCompletedButton').click(); document.querySelector('#clearCompletedButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.order-card').length === 0 && document.querySelector('#clearCompletedButton').disabled`);
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop: { ...desktop, completedOrderCleared: true }, mobile: { ...mobile, controls: `${mobile.controls.length} checked`, localCompletedOrderCleared: true }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (appServer && !appServer.killed) appServer.kill();
    await sleep(400);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    try { rmSync(storeDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
