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
const appPort = 4380 + (process.pid % 250);
const debugPort = 9580 + (process.pid % 250);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app68-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, timeout = 15_000, label = 'condition') {
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 15_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url, runtimeErrors) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  try {
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
  } catch (error) {
    const page = await evaluate(client, `({ url: location.href, title: document.title, text: document.body ? document.body.innerText.slice(0, 700) : '' })`);
    throw new Error(`${error.message}\nRuntime errors: ${JSON.stringify(runtimeErrors)}\nPage: ${JSON.stringify(page)}`);
  }
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function sendQuestion(client, question) {
  const before = await evaluate(client, `document.querySelectorAll('.message').length`);
  await evaluate(client, `(() => {
    const input = document.querySelector('#message-input');
    input.value = ${JSON.stringify(question)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#composer-form').requestSubmit();
  })()`);
  await waitForExpression(client, `document.querySelectorAll('.message').length >= ${before + 2}`);
  await waitForExpression(client, `document.querySelector('#route-state').textContent !== '正在查线'`);
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: repoRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort), AI_API_KEY: '', AI_MODEL: '' },
  });
  if (appServer) {
    await waitFor(async () => {
      const response = await fetch(baseUrl);
      return response.ok;
    }, 10_000, 'RELAY/68 server');
  }

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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception');
    });
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await sendQuestion(client, '我的订单已经发货，在哪里查询快递物流？');
    await waitForExpression(client, `document.querySelector('#source-status').textContent.includes('本地路由')`);

    const desktop = await evaluate(client, `(() => ({
      source: document.body.dataset.source,
      messages: document.querySelectorAll('.message').length,
      intent: document.querySelector('#route-intent').textContent.trim(),
      sourceId: document.querySelector('#route-source').textContent.trim(),
      confidence: Number(document.querySelector('#confidence-meter').getAttribute('aria-valuenow')),
      citedQuestion: document.querySelector('#source-card-question').textContent.trim(),
      routeConnected: document.querySelector('#route-trace').classList.contains('is-routed'),
      h1: document.querySelectorAll('h1').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      activeElementAfterFocus: (() => { document.querySelector('#message-input').focus(); return document.activeElement.id; })()
    }))()`);
    assert.equal(desktop.source, 'local');
    assert.equal(desktop.messages, 2);
    assert.equal(desktop.intent, '物流配送');
    assert.equal(desktop.sourceId, 'shipping-progress');
    assert.ok(desktop.confidence >= 60);
    assert.match(desktop.citedQuestion, /物流/);
    assert.equal(desktop.routeConnected, true);
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.activeElementAfterFocus, 'message-input');

    await evaluate(client, `document.querySelector('[data-feedback="helpful"]').click()`);
    await waitForExpression(client, `document.querySelector('#helpful-count').textContent === '1'`);

    await evaluate(client, `document.querySelector('#manage-knowledge').click()`);
    await waitForExpression(client, `document.querySelector('#knowledge-dialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#faq-question').value = '你们支持礼品包装吗？';
      document.querySelector('#faq-answer').value = '支持礼品包装的商品会在结算页显示包装选项；未显示时请转人工确认。';
      document.querySelector('#faq-intent').value = 'product';
      document.querySelector('#faq-keywords').value = '礼品包装, 包装选项';
      document.querySelector('#faq-aliases').value = '可以帮我包装礼物吗';
      document.querySelector('#faq-form').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelector('#manager-faq-list').textContent.includes('礼品包装')`);
    await evaluate(client, `document.querySelector('#close-knowledge').click()`);
    await sendQuestion(client, '你们有礼品包装吗？');
    assert.match(await evaluate(client, `document.querySelector('#route-source').textContent`), /^custom-/);
    assert.match(await evaluate(client, `document.querySelector('#source-card-answer').textContent`), /结算页/);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `document.querySelector('#manage-knowledge').click()`);
    await waitForExpression(client, `document.querySelector('#knowledge-dialog').open && document.querySelector('#manager-faq-list').textContent.includes('礼品包装')`);
    await evaluate(client, `document.querySelector('#close-knowledge').click(); document.querySelector('#clear-conversation').click()`);
    await sendQuestion(client, '发货后的运单轨迹在哪里看？');
    await sleep(2800);
    await screenshot(client, 'screenshot-desktop.png');

    await sendQuestion(client, '你们办公室的窗帘是什么颜色？');
    await waitForExpression(client, `document.querySelector('#route-source').textContent === '转人工'`);
    assert.match(await evaluate(client, `document.querySelector('#source-status').textContent`), /人工接管/);
    await evaluate(client, `document.querySelector('#handoff-button').click()`);
    await waitForExpression(client, `document.querySelector('#handoff-dialog').open`);
    assert.match(await evaluate(client, `document.querySelector('#handoff-summary').textContent`), /窗帘|无可靠知识卡/);
    assert.equal(await evaluate(client, `document.querySelector('#handoff-count').textContent`), '1');
    await evaluate(client, `document.querySelector('#close-handoff').click()`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, `${baseUrl}?offline=1`, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `(() => {
      const input = document.querySelector('#message-input');
      input.value = '退款审核通过后多久能到账？';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.message').length === 2`);
    await waitForExpression(client, `document.querySelector('#route-source').textContent === 'refund-arrival'`);

    const mobile = await evaluate(client, `(() => {
      const route = document.querySelector('.routing-bay').getBoundingClientRect();
      const send = document.querySelector('#send-message').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.header-actions button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, left: box.left, right: box.right };
      });
      return {
        source: document.body.dataset.source,
        messages: document.querySelectorAll('.message').length,
        intent: document.querySelector('#route-intent').textContent.trim(),
        sourceId: document.querySelector('#route-source').textContent.trim(),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        routeLeft: route.left,
        routeRight: route.right,
        sendHeight: send.height,
        buttons
      };
    })()`);
    assert.equal(mobile.source, 'local');
    assert.equal(mobile.messages, 2);
    assert.equal(mobile.intent, '退款进度');
    assert.equal(mobile.sourceId, 'refund-arrival');
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.routeLeft >= 0 && mobile.routeRight <= 390);
    assert.ok(mobile.sendHeight >= 44);
    mobile.buttons.forEach((box) => assert.ok(box.width >= 44 && box.left >= 0 && box.right <= 390, `Button outside viewport: ${JSON.stringify(box)}`));

    await evaluate(client, `document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('.routing-bay').scrollIntoView({ block: 'start' })`);
    await sleep(500);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (appServer && !appServer.killed) appServer.kill();
    await sleep(400);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
