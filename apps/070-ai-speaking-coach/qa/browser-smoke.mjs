import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const appPort = 4370 + (process.pid % 300);
const debugPort = 9670 + (process.pid % 300);
const baseUrl = `http://127.0.0.1:${appPort}/apps/070-ai-speaking-coach/`;
const failingAiEndpoint = `http://127.0.0.1:${appPort + 1000}/v1`;
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app70-smoke-${process.pid}`);
const sentinelKey = 'talkback-secret-must-not-persist';
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
  '.svg': 'image/svg+xml',
};

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
    const page = await evaluate(client, `({ title: document.title, text: document.body ? document.body.innerText.slice(0, 500) : '' })`);
    throw new Error(`${error.message}\nRuntime errors: ${JSON.stringify(runtimeErrors)}\nPage: ${JSON.stringify(page)}`);
  }
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function submitDemoTurn(client, expectedCount) {
  await evaluate(client, `document.querySelector('#load-demo-answer').click(); document.querySelector('#submit-answer').click()`);
  await waitForExpression(client, `document.querySelectorAll('.turn-card').length === ${expectedCount}`);
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(appPort, '127.0.0.1', resolve);
  });

  const browser = await import('node:child_process').then(({ spawn }) => spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' }));

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
    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `if (document.querySelector('#auto-speak').checked) document.querySelector('#auto-speak').click()`);

    const initial = await evaluate(client, `(() => ({
      h1: document.querySelectorAll('h1').length,
      scenarios: document.querySelectorAll('.scenario-card').length,
      speechFallback: document.querySelector('#recognition-status').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(initial.h1, 1);
    assert.equal(initial.scenarios, 6);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await submitDemoTurn(client, 1);
    const firstTurn = await evaluate(client, `(() => ({
      score: Number(document.querySelector('#metric-score').textContent),
      wpm: document.querySelector('#metric-wpm').textContent,
      source: document.querySelector('#feedback-source').textContent,
      targetCount: document.querySelector('#target-count').textContent,
      confidence: document.querySelector('#confidence-note').textContent
    }))()`);
    assert.ok(firstTurn.score > 0);
    assert.equal(firstTurn.wpm, '未测');
    assert.match(firstTurn.source, /本地分析/);
    assert.match(firstTurn.confidence, /演示回答/);

    for (let count = 2; count <= 5; count += 1) await submitDemoTurn(client, count);
    const completed = await evaluate(client, `(() => ({
      turns: document.querySelectorAll('.turn-card').length,
      completed: document.querySelector('#step-readout').textContent,
      reportEnabled: !document.querySelector('#open-report').disabled,
      answerDisabled: document.querySelector('#answer-input').disabled,
      storage: Object.values(localStorage).join('')
    }))()`);
    assert.equal(completed.turns, 5);
    assert.match(completed.completed, /COMPLETE/);
    assert.equal(completed.reportEnabled, true);
    assert.equal(completed.answerDisabled, true);
    assert.equal(completed.storage.includes(sentinelKey), false);

    await evaluate(client, `document.querySelector('#open-report').click()`);
    await waitForExpression(client, `document.querySelector('#report-dialog').open`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.report-summary > div').length`), 4);
    assert.match(await evaluate(client, `document.querySelector('#report-content').textContent`), /下一轮训练目标/);
    await evaluate(client, `document.querySelector('#download-report').click()`);
    const reportFile = await waitFor(() => readdirSync(outputDir).find((name) => /^talkback70-.*\.txt$/.test(name)), 5000, 'report download');
    const reportText = readFileSync(path.join(outputDir, reportFile), 'utf8');
    assert.match(reportText, /TALKBACK\/70 口语训练报告/);
    assert.doesNotMatch(reportText, /API|密钥/);
    rmSync(path.join(outputDir, reportFile), { force: true });
    await evaluate(client, `document.querySelector('#close-report').click()`);

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.turn-card').length`), 5);
    assert.equal(await evaluate(client, `document.querySelector('#open-report').disabled`), false);
    await evaluate(client, `document.querySelector('#booth-heading').scrollIntoView({ block: 'start' })`);
    await sleep(500);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `document.querySelector('#open-report').click()`);
    await waitForExpression(client, `document.querySelector('#report-dialog').open`);
    await evaluate(client, `document.querySelector('#practice-again').click()`);
    await waitForExpression(client, `document.querySelectorAll('.turn-card').length === 0`);
    await evaluate(client, `document.querySelector('#open-ai-settings').click()`);
    await waitForExpression(client, `document.querySelector('#ai-settings-dialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#ai-endpoint').value = ${JSON.stringify(failingAiEndpoint)};
      document.querySelector('#ai-model').value = 'test-coach-model';
      document.querySelector('#ai-key').value = ${JSON.stringify(sentinelKey)};
      document.querySelector('#ai-settings-form').requestSubmit();
    })()`);
    await waitForExpression(client, `!document.querySelector('#ai-settings-dialog').open`);
    assert.equal(await evaluate(client, `Object.values(localStorage).join('').includes(${JSON.stringify(sentinelKey)})`), false);
    assert.match(await evaluate(client, `document.querySelector('#coach-mode-status').textContent`), /test-coach-model/);
    await submitDemoTurn(client, 1);
    await waitForExpression(client, `document.querySelector('#toast').textContent.includes('AI 增强未完成')`, 8000);
    assert.equal(await evaluate(client, `document.querySelectorAll('.turn-card').length`), 1);
    assert.match(await evaluate(client, `document.querySelector('#feedback-source').textContent`), /本地分析/);
    assert.equal(await evaluate(client, `Object.values(localStorage).join('').includes(${JSON.stringify(sentinelKey)})`), false);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, baseUrl, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `if (document.querySelector('#auto-speak').checked) document.querySelector('#auto-speak').click()`);
    await submitDemoTurn(client, 1);
    await evaluate(client, `document.querySelector('#booth-heading').scrollIntoView({ block: 'start' })`);
    await sleep(500);

    const mobile = await evaluate(client, `(() => {
      const controls = [...document.querySelectorAll('button')]
        .filter((button) => button.offsetParent !== null)
        .map((button) => {
          const box = button.getBoundingClientRect();
          return { name: button.textContent.trim().slice(0, 22), height: box.height, left: box.left, right: box.right };
        });
      return {
        turns: document.querySelectorAll('.turn-card').length,
        scenarios: document.querySelectorAll('.scenario-card').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        controls
      };
    })()`);
    assert.equal(mobile.turns, 1);
    assert.equal(mobile.scenarios, 6);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    mobile.controls.forEach((box) => {
      assert.ok(box.left >= -1 && box.right <= 391, `Control outside viewport: ${JSON.stringify(box)}`);
      assert.ok(box.height >= 43, `Control too short: ${JSON.stringify(box)}`);
    });
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, firstTurn, completed: { ...completed, storage: '[bounded local state]' }, mobile: { ...mobile, controls: mobile.controls.length }, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(350);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
