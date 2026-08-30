import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4263/apps/063-ai-writer/';
const outputDir = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'margin63-smoke'));
const debuggingPort = 9363;
const profile = path.resolve(os.tmpdir(), `codex-app63-smoke-${process.pid}`);
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

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const browser = spawn(chrome, [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    assert.ok(pageTarget, 'Chrome page target was not found');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
    ]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear()`);
    await navigate(client, baseUrl);

    const desktopInitial = await evaluate(client, `(() => ({
      ready: document.body.classList.contains('ready'),
      provider: document.body.dataset.provider,
      state: document.body.dataset.state,
      modes: document.querySelectorAll('[data-mode]').length,
      activeModes: document.querySelectorAll('[data-mode].is-active').length,
      h1: document.querySelectorAll('h1').length,
      sourceLength: document.querySelector('#source-text').value.length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.deepEqual(desktopInitial, {
      ready: true,
      provider: 'demo',
      state: 'idle',
      modes: 4,
      activeModes: 1,
      h1: 1,
      sourceLength: 64,
      scrollWidth: 1440,
      clientWidth: 1440,
    });

    await evaluate(client, `document.querySelector('[data-mode="expand"]').click(); document.querySelector('#generate-button').click()`);
    await waitForExpression(client, `document.body.dataset.state === 'done'`, 12_000);
    const generated = await evaluate(client, `(() => ({
      output: document.querySelector('#revision-text').value,
      historyCount: Number(document.querySelector('#history-count').textContent),
      sourceUnchanged: document.querySelector('#source-text').value.includes('非常非常重要'),
      actionsEnabled: [...document.querySelectorAll('.output-actions button')].every((button) => !button.disabled)
    }))()`);
    assert.match(generated.output, /^【本地演示 · 扩写结构预览】/);
    assert.equal(generated.historyCount, 1);
    assert.equal(generated.sourceUnchanged, true);
    assert.equal(generated.actionsEnabled, true);

    await evaluate(client, `document.querySelector('[data-view="diff"]').click()`);
    const diff = await evaluate(client, `(() => ({
      visible: !document.querySelector('#diff-output').hidden,
      additions: document.querySelectorAll('#diff-output .diff-add').length,
      deletions: document.querySelectorAll('#diff-output .diff-delete').length
    }))()`);
    assert.equal(diff.visible, true);
    assert.ok(diff.additions > 0);
    assert.ok(diff.deletions > 0);
    await evaluate(client, `document.querySelector('[data-view="final"]').click()`);

    await evaluate(client, `(() => {
      document.querySelector('#open-settings').click();
      document.querySelector('input[name="provider"][value="remote"]').click();
      document.querySelector('#endpoint-input').value = 'https://gateway.example/v1/chat/completions';
      document.querySelector('#model-input').value = 'margin-writer';
      document.querySelector('#api-key-input').value = 'super-secret-smoke-key';
      document.querySelector('#save-settings').click();
    })()`);
    assert.equal(await evaluate(client, `document.body.dataset.provider`), 'remote');
    const persistedProvider = await evaluate(client, `localStorage.getItem('margin63.provider.v1')`);
    assert.doesNotMatch(persistedProvider, /super-secret-smoke-key|apiKey|authorization/i);

    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('#open-settings').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#api-key-input').value`), '');
    await evaluate(client, `document.querySelector('#close-settings').click(); document.querySelector('#open-history').click()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.history-item').length`), 1);
    await evaluate(client, `document.querySelector('.history-actions button').click()`);
    await waitForExpression(client, `document.querySelector('#revision-text').value.length > 20`);

    await evaluate(client, `(() => {
      document.querySelector('#open-settings').click();
      document.querySelector('input[name="provider"][value="demo"]').click();
      document.querySelector('#save-settings').click();
    })()`);
    assert.equal(await evaluate(client, `document.body.dataset.provider`), 'demo');
    await sleep(2600);
    await screenshot(client, 'screenshot.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('#open-history').click(); document.querySelector('.history-actions button').click()`);
    await waitForExpression(client, `document.querySelector('#revision-text').value.length > 20`);
    await evaluate(client, `document.querySelector('[data-mode="translate"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#language-control').hidden`), false);
    await evaluate(client, `document.querySelector('[data-mode="style"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#style-control').hidden`), false);

    const mobile = await evaluate(client, `(() => {
      const targets = [...document.querySelectorAll('.mode-button, .masthead-actions button, .output-actions button')].map((button) => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        sheetRight: Math.max(...[...document.querySelectorAll('.sheet')].map((sheet) => sheet.getBoundingClientRect().right)),
        targets,
        provider: document.body.dataset.provider,
        outputLength: document.querySelector('#revision-text').value.length
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.sheetRight <= 390);
    assert.equal(mobile.provider, 'demo');
    assert.ok(mobile.outputLength > 20);
    mobile.targets.forEach((target) => {
      assert.ok(target.left >= 0 && target.right <= 390, `Target outside viewport: ${JSON.stringify(target)}`);
      assert.ok(target.width >= 44 && target.height >= 44, `Target below 44px: ${JSON.stringify(target)}`);
    });
    await sleep(2600);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    const summary = { desktopInitial, generated: { ...generated, output: `${generated.output.slice(0, 48)}…` }, diff, mobile, runtimeErrors, outputDir };
    console.log(JSON.stringify(summary, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await sleep(200);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) rmSync(profile, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
