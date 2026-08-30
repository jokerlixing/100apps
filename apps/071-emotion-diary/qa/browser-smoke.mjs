import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4310 + (process.pid % 300);
const debugPort = 9510 + (process.pid % 300);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app71-smoke-${process.pid}`);
const invalidBackupPath = path.resolve(os.tmpdir(), `codex-app71-invalid-${process.pid}.json`);
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

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay inside the temp directory');
  assert.ok(invalidBackupPath.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Temporary backup must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(invalidBackupPath, 'not valid json', 'utf8');

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: appDir,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort), AI_API_KEY: '', AI_MODEL: '' },
  });
  if (appServer) {
    await waitFor(async () => {
      const response = await fetch(baseUrl);
      return response.ok;
    }, 10_000, 'TIDE/71 server');
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable'), client.send('DOM.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);

    const emptyState = await evaluate(client, `({
      h1: document.querySelectorAll('h1').length,
      ledgerEmpty: !document.querySelector('#ledger-empty').hidden,
      chartEmpty: !document.querySelector('#chart-empty').hidden,
      aiDisabled: document.querySelector('#open-ai').disabled,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })`);
    assert.deepEqual(emptyState, { h1: 1, ledgerEmpty: true, chartEmpty: true, aiDisabled: true, scrollWidth: 1440, clientWidth: 1440 });

    await evaluate(client, `(() => {
      const samples = [
        { days: 20, mood: 2, energy: 2, emotion: '疲惫', factor: '工作', note: '项目推进很慢，身体也有些疲惫。' },
        { days: 10, mood: 3, energy: 3, emotion: '平静', factor: '独处', note: '安静整理了房间和思绪。' },
        { days: 2, mood: 3, energy: 2, emotion: '压力', factor: '工作', note: '任务很多，先完成了最小的一步。' },
        { days: 1, mood: 4, energy: 4, emotion: '愉快', factor: '运动', note: '傍晚散步后呼吸变得轻松。' },
        { days: 0, mood: 5, energy: 4, emotion: '感激', factor: '家人', note: '和家人吃饭，记住了一个很小的笑话。' }
      ];
      const toLocal = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      for (const sample of samples) {
        const date = new Date();
        if (sample.days === 0) date.setTime(Date.now() - 5 * 60 * 1000);
        else {
          date.setDate(date.getDate() - sample.days);
          date.setHours(9 + (sample.days % 5), 15, 0, 0);
        }
        document.querySelector('#entry-date').value = toLocal(date);
        document.querySelector('input[name="mood"][value="' + sample.mood + '"]').checked = true;
        document.querySelector('input[name="energy"][value="' + sample.energy + '"]').checked = true;
        document.querySelector('input[name="emotions"][value="' + sample.emotion + '"]').click();
        document.querySelector('input[name="factors"][value="' + sample.factor + '"]').click();
        document.querySelector('#entry-note').value = sample.note;
        document.querySelector('#entry-form').requestSubmit();
      }
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.ledger-entry').length === 5`);
    assert.equal(await evaluate(client, `document.querySelector('#metric-count').textContent`), '4');

    await evaluate(client, `document.querySelector('[data-range="7"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#metric-count').textContent`), '3');
    await evaluate(client, `document.querySelector('[data-range="30"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#metric-count').textContent`), '5');
    await evaluate(client, `document.querySelector('[data-range="14"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#metric-count').textContent`), '4');

    await evaluate(client, `document.querySelector('.entry-actions button[data-action="edit"]').click()`);
    await waitForExpression(client, `document.querySelector('#cancel-edit').hidden === false`);
    await evaluate(client, `document.querySelector('#entry-note').value = '更新后的记录：晚餐后仍然感到轻松。'; document.querySelector('#entry-form').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('.ledger-entry .entry-context p').textContent.includes('更新后的记录')`);

    await evaluate(client, `document.querySelector('#export-data').click()`);
    await waitForExpression(client, `document.querySelector('#toast').textContent.includes('已导出')`);

    const documentNode = await client.send('DOM.getDocument', { depth: 1 });
    const inputNode = await client.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#import-file' });
    await client.send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [invalidBackupPath] });
    await waitForExpression(client, `document.querySelector('#toast').textContent.includes('JSON')`);

    await evaluate(client, `document.querySelector('#open-ai').click()`);
    await waitForExpression(client, `document.querySelector('#ai-dialog').open`);
    assert.match(await evaluate(client, `document.querySelector('#ai-send-preview').innerText`), /不发送：日记正文/);
    await evaluate(client, `document.querySelector('#include-notes').click()`);
    assert.match(await evaluate(client, `document.querySelector('#ai-send-preview').innerText`), /240/);
    await evaluate(client, `document.querySelector('#ai-consent').click(); document.querySelector('#ai-form').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('#ai-status').textContent.includes('尚未配置')`);
    await evaluate(client, `document.querySelector('#ai-dialog [data-close-dialog]').click()`);

    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const keyboardFocus = await evaluate(client, `({
      tag: document.activeElement && document.activeElement.tagName,
      outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : 'none'
    })`);
    const desktop = await evaluate(client, `(() => ({
        records: document.querySelectorAll('.ledger-entry').length,
        nodes: document.querySelectorAll('.tide-node').length,
        insights: document.querySelectorAll('.insight-row').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        localStorageEntries: JSON.parse(localStorage.getItem('tide71.entries.v1')).length
      }))()`);
    assert.equal(desktop.records, 5);
    assert.equal(desktop.nodes, 4);
    assert.ok(desktop.insights >= 2);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.ok(keyboardFocus.tag, 'Tab should move focus to an interactive element');
    assert.notEqual(keyboardFocus.outline, 'none');
    assert.equal(desktop.localStorageEntries, 5);

    await evaluate(client, `(() => {
      document.activeElement && document.activeElement.blur();
      document.querySelector('#toast').hidden = true;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, document.querySelector('.observation-grid').offsetTop - 16));
    })()`);
    await sleep(600);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `document.querySelectorAll('.entry-actions button[data-action="delete"]')[4].click()`);
    await waitForExpression(client, `document.querySelector('#delete-dialog').open`);
    await evaluate(client, `document.querySelector('#confirm-delete').click()`);
    await waitForExpression(client, `document.querySelectorAll('.ledger-entry').length === 4`);
    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.ledger-entry').length`), 4);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, baseUrl, runtimeErrors);
    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('.form-actions button, .ledger-actions button')].filter((button) => !button.hidden).map((button) => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right };
      });
      const panel = document.querySelector('.checkin-panel').getBoundingClientRect();
      return {
        records: document.querySelectorAll('.ledger-entry').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        panelLeft: panel.left,
        panelRight: panel.right,
        controls
      };
    })()`);
    assert.equal(mobile.records, 4);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.panelLeft >= 0 && mobile.panelRight <= 390);
    mobile.controls.forEach((box) => {
      assert.ok(box.height >= 44 && box.left >= 0 && box.right <= 390, `Control outside viewport: ${JSON.stringify(box)}`);
    });
    await evaluate(client, `(() => {
      document.activeElement && document.activeElement.blur();
      document.querySelector('#toast').hidden = true;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, document.querySelector('.observation-grid').offsetTop - 10));
    })()`);
    await sleep(600);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    if (appServer && !appServer.killed) appServer.kill();
    await sleep(400);
    try { rmSync(invalidBackupPath, { force: true }); } catch {}
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
