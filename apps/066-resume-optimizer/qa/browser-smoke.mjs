import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/apps/066-resume-optimizer/';
const outputDir = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'proof66-smoke'));
const debugPort = 9666;
const profile = path.resolve(os.tmpdir(), `codex-app66-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
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
    const current = this.listeners.get(method) || [];
    current.push(listener);
    this.listeners.set(method, current);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
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
  await waitForExpression(client, `document.readyState === 'complete'`);
  await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Profile must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const browser = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
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
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outputDir });

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await screenshot(client, 'app66-desktop-hero-cdp.png');
    await evaluate(client, `document.querySelector('#empty-sample').click()`);
    await waitForExpression(client, `document.querySelector('#analysis').dataset.state === 'ready'`);
    await waitForExpression(client, `Number(document.querySelector('#total-score').textContent) > 0`);

    const desktop = await evaluate(client, `(() => ({
      score: Number(document.querySelector('#total-score').textContent),
      evidence: document.querySelectorAll('.evidence-item').length,
      matched: document.querySelectorAll('#matched-keywords .keyword-chip').length,
      missing: document.querySelectorAll('#missing-keywords .keyword-chip').length,
      h1: document.querySelectorAll('h1').length,
      selected: Boolean(document.querySelector('.evidence-item.is-selected')),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      storageKeys: Object.keys(localStorage),
      ready: document.body.classList.contains('ready')
    }))()`);
    assert.ok(desktop.score >= 50 && desktop.score <= 100);
    assert.ok(desktop.evidence >= 5);
    assert.ok(desktop.matched >= 4);
    assert.ok(desktop.missing >= 1);
    assert.equal(desktop.h1, 1);
    assert.equal(desktop.selected, true);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.deepEqual(desktop.storageKeys, []);
    assert.equal(desktop.ready, true);

    await evaluate(client, `document.querySelector('#open-settings').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#settings-dialog').open`), true);
    const closeButtons = await evaluate(client, `([...document.querySelectorAll('#settings-form button[value="cancel"]')].map((button) => ({
      type: button.type,
      formNoValidate: button.formNoValidate
    })))`);
    assert.deepEqual(closeButtons, [
      { type: 'submit', formNoValidate: true },
      { type: 'submit', formNoValidate: true },
    ]);
    await screenshot(client, 'app66-settings-dialog-cdp.png');
    await evaluate(client, `document.querySelector('.dialog-close').click()`);
    await waitForExpression(client, `!document.querySelector('#settings-dialog').open`);

    await evaluate(client, `document.querySelector('#open-settings').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#settings-dialog').open`), true);
    await evaluate(client, `document.querySelector('#key-input').value = 'discard-on-cancel'`);
    await evaluate(client, `document.querySelector('.dialog-actions .secondary-button').click()`);
    await waitForExpression(client, `!document.querySelector('#settings-dialog').open`);

    await evaluate(client, `document.querySelector('#open-settings').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#settings-dialog').open`), true);
    assert.equal(await evaluate(client, `document.querySelector('#key-input').value`), '');
    await client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await waitForExpression(client, `!document.querySelector('#settings-dialog').open`);

    await evaluate(client, `document.querySelector('#open-settings').click()`);
    await evaluate(client, `(() => {
      document.querySelector('#model-input').value = 'test-model';
      document.querySelector('#key-input').value = 'proof-secret-not-persisted';
      document.querySelector('#settings-form').requestSubmit(document.querySelector('#save-settings'));
    })()`);
    await waitForExpression(client, `!document.querySelector('#settings-dialog').open`);
    assert.equal(await evaluate(client, `JSON.stringify(localStorage).includes('proof-secret-not-persisted')`), false);
    assert.match(await evaluate(client, `document.querySelector('#ai-status').textContent`), /test-model/);

    const originalResume = await evaluate(client, `document.querySelector('#resume-input').value`);
    await evaluate(client, `document.querySelector('#apply-rewrite').click()`);
    await waitForExpression(client, `document.querySelector('#resume-input').value !== ${JSON.stringify(originalResume)}`);
    assert.match(await evaluate(client, `document.querySelector('#resume-input').value`), /围绕/);

    await evaluate(client, `document.querySelector('#download-report').click()`);
    await waitFor(() => existsSync(path.join(outputDir, 'proof-66-resume-report.txt')), 5000, 'report download');
    assert.match(readFileSync(path.join(outputDir, 'proof-66-resume-report.txt'), 'utf8'), /简历证据校样报告/);
    await evaluate(client, `document.querySelector('#analysis').scrollIntoView({block:'start'}); window.scrollBy(0, 120)`);
    await sleep(2800);
    await screenshot(client, 'app66-desktop-cdp.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await screenshot(client, 'app66-mobile-hero-cdp.png');
    await evaluate(client, `document.querySelector('#empty-sample').click()`);
    await waitForExpression(client, `document.querySelector('#analysis').dataset.state === 'ready'`);
    await evaluate(client, `document.querySelector('.evidence-workspace').scrollIntoView({block:'start'})`);
    await sleep(2800);

    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('button, label[for="resume-file"]')]
        .filter((item) => item.offsetParent !== null)
        .map((item) => { const box = item.getBoundingClientRect(); return { name: item.textContent.trim().slice(0, 20), width: box.width, height: box.height, left: box.left, right: box.right }; });
      return {
        score: Number(document.querySelector('#total-score').textContent),
        evidence: document.querySelectorAll('.evidence-item').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        controls,
        settingsOpen: document.querySelector('#settings-dialog').open
      };
    })()`);
    assert.ok(mobile.score > 0);
    assert.ok(mobile.evidence >= 5);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.settingsOpen, false);
    mobile.controls.forEach((box) => {
      assert.ok(box.left >= -1 && box.right <= 391, `Control outside viewport: ${JSON.stringify(box)}`);
      assert.ok(box.height >= 43, `Control too short: ${JSON.stringify(box)}`);
    });
    await screenshot(client, 'app66-mobile-cdp.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile: { ...mobile, controls: mobile.controls.length }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await sleep(250);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
