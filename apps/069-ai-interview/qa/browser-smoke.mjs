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
const appPort = 4390 + (process.pid % 250);
const debugPort = 9690 + (process.pid % 250);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app69-smoke-${process.pid}`);
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

async function navigate(client, url, runtimeErrors = []) {
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
    }, 10_000, 'PANEL/69 server');
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
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await navigate(client, `${baseUrl}?offline=1`, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `(() => {
      document.querySelector('#question-count').value = '3';
      document.querySelector('#focus').value = '性能优化、跨团队沟通';
      document.querySelector('#job-description').value = '负责复杂前端应用、性能与工程质量。';
      document.querySelector('#setup-form').requestSubmit();
    })()`);
    await waitForExpression(client, `!document.querySelector('#interview-screen').hidden`);
    assert.equal(await evaluate(client, `document.querySelectorAll('h1').length`), 1);

    await evaluate(client, `(() => {
      const answer = document.querySelector('#answer-input');
      answer.value = '我有 5 年前端经历，目前希望承担复杂应用的性能与工程质量岗位。最能代表我能力的项目是活动首页改造：背景是 LCP 达到 4.2 秒，我的角色是性能负责人，目标是在两周内降到 2.5 秒。我先用性能面板和网络瀑布定位渲染阻塞，再拆分首屏脚本、压缩图片并调整缓存。最终 LCP 降到 1.9 秒，跳出率降低 18%。这个成果和持续解决用户性能问题，是我申请该岗位的动机。';
      answer.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#submit-answer').click();
    })()`);
    await waitForExpression(client, `!document.querySelector('#feedback-sheet').hidden`);
    await waitForExpression(client, `document.querySelectorAll('.tape-segment').length === 1`);

    await evaluate(client, `document.body.tabIndex = -1; document.body.focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const desktop = await evaluate(client, `(() => {
      const focusTarget = document.activeElement;
      const focusStyle = getComputedStyle(focusTarget);
      return {
        h1: document.querySelectorAll('h1').length,
        score: Number(document.querySelector('#answer-score').textContent),
        tapes: document.querySelectorAll('.tape-segment').length,
        dimensions: document.querySelectorAll('.dimension-item').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        focusOutline: focusStyle.outlineStyle,
        status: document.querySelector('#session-status').textContent,
      };
    })()`);
    assert.ok(desktop.score >= 70);
    assert.equal(desktop.tapes, 1);
    assert.equal(desktop.dimensions, 4);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.notEqual(desktop.focusOutline, 'none');
    assert.match(desktop.status, /本地/);
    await evaluate(client, `document.activeElement.blur(); document.body.removeAttribute('tabindex')`);
    await sleep(500);
    await screenshot(client, 'screenshot-desktop.png');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `document.querySelector('#resume-notice').hidden`), false);
    await evaluate(client, `document.querySelector('#resume-session').click()`);
    await waitForExpression(client, `!document.querySelector('#feedback-sheet').hidden`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.tape-segment').length`), 1);

    await evaluate(client, `document.querySelector('#next-question').click()`);
    await waitForExpression(client, `document.querySelector('#question-progress').textContent.includes('2 / 3')`);
    await evaluate(client, `(() => {
      const answer = document.querySelector('#answer-input');
      answer.value = '我会先沟通，然后尽快解决问题。';
      answer.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#submit-answer').click();
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.tape-segment').length === 2`);
    await evaluate(client, `document.querySelector('#next-question').click()`);
    await waitForExpression(client, `document.querySelector('#question-progress').textContent.includes('3 / 3')`);
    await evaluate(client, `document.querySelector('#skip-question').click()`);
    await waitForExpression(client, `document.querySelectorAll('.tape-segment').length === 3`);
    await evaluate(client, `document.querySelector('#next-question').click()`);
    await waitForExpression(client, `!document.querySelector('#review-screen').hidden`);

    const review = await evaluate(client, `(() => ({
      score: Number(document.querySelector('#summary-score').textContent),
      dimensions: document.querySelectorAll('.summary-dimension').length,
      transcripts: document.querySelectorAll('.transcript-item').length,
      history: document.querySelector('#history-count').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.ok(review.score > 0 && review.score < desktop.score);
    assert.equal(review.dimensions, 4);
    assert.equal(review.transcripts, 3);
    assert.equal(review.history, '1');
    assert.equal(review.scrollWidth, review.clientWidth);
    await evaluate(client, `document.querySelector('#copy-report').click()`);
    await waitForExpression(client, `document.querySelector('#toast').textContent.length > 0`);
    await evaluate(client, `document.querySelector('#open-history').click()`);
    await waitForExpression(client, `document.querySelector('#history-dialog').open`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.history-item').length`), 1);
    await evaluate(client, `document.querySelector('#done-history').click()`);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, `${baseUrl}?offline=1`, runtimeErrors);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    await evaluate(client, `document.querySelector('#question-count').value = '3'; document.querySelector('#setup-form').requestSubmit()`);
    await waitForExpression(client, `!document.querySelector('#interview-screen').hidden`);

    const mobile = await evaluate(client, `(() => {
      const answer = document.querySelector('#answer-input').getBoundingClientRect();
      const submit = document.querySelector('#submit-answer').getBoundingClientRect();
      const question = document.querySelector('#question-title').getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        answer: { left: answer.left, right: answer.right, width: answer.width },
        submit: { left: submit.left, right: submit.right, width: submit.width, height: submit.height },
        question: { left: question.left, right: question.right },
        status: document.querySelector('#session-status').textContent,
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.answer.left >= 0 && mobile.answer.right <= 390);
    assert.ok(mobile.submit.left >= 0 && mobile.submit.right <= 390 && mobile.submit.height >= 44);
    assert.ok(mobile.question.left >= 0 && mobile.question.right <= 390);
    assert.match(mobile.status, /本地/);
    await sleep(500);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, review, mobile, runtimeErrors, outputDir }, null, 2));
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
