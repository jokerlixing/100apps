import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const debugPort = 9362;
const profile = path.resolve(os.tmpdir(), `codex-app62-smoke-${process.pid}`);
const chromeCandidates = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function requestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Mock request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sseChunk(content, finishReason = null) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finishReason }] })}\n\n`;
}

async function startTestServer() {
  let requestCount = 0;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/mock/v1/chat/completions') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
        if (request.method !== 'POST') {
          response.writeHead(405);
          response.end();
          return;
        }
        if (request.headers.authorization !== 'Bearer smoke-secret') {
          response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: { message: 'mock key rejected' } }));
          return;
        }

        const payload = JSON.parse(await requestBody(request));
        assert.equal(payload.stream, true);
        assert.equal(payload.model, 'mock-model');
        assert.ok(Array.isArray(payload.messages));
        requestCount += 1;
        const lastUser = [...payload.messages].reverse().find((message) => message.role === 'user');
        const prompt = lastUser ? lastUser.content : '';
        const longResponse = prompt.includes('长回答');
        const text = longResponse
          ? '这是一段用于停止测试的长回答。'.repeat(18)
          : `收到：${prompt}。这是分段返回的测试回答。（第 ${requestCount} 次线路回报）`;

        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        });
        response.write('event: message\r\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\n');
        const parts = longResponse
          ? text.match(/.{1,12}/gu)
          : [text.slice(0, 4), text.slice(4, 11), text.slice(11)];
        for (const part of parts) {
          if (response.destroyed || response.writableEnded) return;
          const event = sseChunk(part);
          const pivot = Math.max(1, Math.floor(event.length / 2));
          response.write(event.slice(0, pivot));
          await sleep(longResponse ? 90 : 55);
          if (response.destroyed || response.writableEnded) return;
          response.write(event.slice(pivot));
          await sleep(longResponse ? 90 : 55);
        }
        if (!response.destroyed && !response.writableEnded) {
          response.end('data: [DONE]\n\n');
        }
        return;
      }

      let filePath = path.resolve(repoRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!filePath.startsWith(`${repoRoot}${path.sep}`) && filePath !== repoRoot) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(readFileSync(filePath));
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      if (!response.writableEnded) response.end(error.stack || error.message);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    requestCount: () => requestCount,
  };
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
    const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error(description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeout = 12_000) {
  return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete'`);
  await waitForExpression(client, `Boolean(window.__WIRE62_TEST__)`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function configure(client, origin) {
  await evaluate(client, `(() => {
    document.querySelector('#endpointInput').value = ${JSON.stringify(`${origin}/mock/v1`)};
    document.querySelector('#modelInput').value = 'mock-model';
    document.querySelector('#apiKeyInput').value = 'smoke-secret';
    document.querySelector('#settingsForm').requestSubmit();
  })()`);
  await waitForExpression(client, `window.__WIRE62_TEST__.snapshot().hasKey`);
  assert.equal(await evaluate(client, `document.querySelector('#apiKeyInput').value`), '');
  assert.equal(await evaluate(client, `localStorage.getItem(window.__WIRE62_TEST__.storageKey).includes('smoke-secret')`), false);
}

async function submitPrompt(client, text) {
  await evaluate(client, `(() => {
    const input = document.querySelector('#promptInput');
    input.value = ${JSON.stringify(text)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#composerForm').requestSubmit();
  })()`);
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Profile must stay inside the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const testServer = await startTestServer();
  const baseUrl = `${testServer.origin}/apps/062-ai-chat/`;
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
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      const description = exceptionDetails.exception && exceptionDetails.exception.description;
      runtimeErrors.push(description || exceptionDetails.text || 'Runtime exception');
    });
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
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `Boolean(window.__WIRE62_TEST__)`);
    await configure(client, testServer.origin);

    await submitPrompt(client, '请流式回答这个测试');
    await waitForExpression(client, `document.querySelector('.message.assistant.streaming .message-content')?.textContent.includes('收到')`);
    const progressive = await evaluate(client, `({
      streaming: window.__WIRE62_TEST__.snapshot().streaming,
      text: document.querySelector('.message.assistant.streaming .message-content').textContent
    })`);
    assert.equal(progressive.streaming, true);
    assert.ok(progressive.text.length > 0);
    await waitForExpression(client, `!window.__WIRE62_TEST__.snapshot().streaming`, 15_000);
    assert.match(await evaluate(client, `document.querySelector('.message.last-assistant .message-content').textContent`), /第 1 次线路回报/);

    await evaluate(client, `document.querySelector('.message.last-assistant [data-message-action="copy"]').click()`);
    await waitForExpression(client, `document.querySelector('#toast').classList.contains('show')`);
    await evaluate(client, `document.querySelector('.message.last-assistant [data-message-action="retry"]').click()`);
    await waitForExpression(client, `window.__WIRE62_TEST__.snapshot().streaming`);
    await waitForExpression(client, `!window.__WIRE62_TEST__.snapshot().streaming`, 15_000);
    assert.match(await evaluate(client, `document.querySelector('.message.last-assistant .message-content').textContent`), /第 2 次线路回报/);

    await evaluate(client, `document.querySelector('#newConversation').click()`);
    await submitPrompt(client, '请输出长回答用于停止测试');
    await waitForExpression(client, `document.querySelector('.message.assistant.streaming .message-content')?.textContent.length > 20`);
    await evaluate(client, `document.querySelector('#stopButton').click()`);
    await waitForExpression(client, `!window.__WIRE62_TEST__.snapshot().streaming`);
    assert.equal(await evaluate(client, `document.querySelector('.message.last-assistant').classList.contains('stopped')`), true);
    assert.ok((await evaluate(client, `document.querySelector('.message.last-assistant .message-content').textContent.length`)) > 20);

    const beforeCreate = await evaluate(client, `window.__WIRE62_TEST__.snapshot().state.conversations.length`);
    await evaluate(client, `document.querySelector('#newConversation').click(); document.querySelector('#manageConversation').click()`);
    await waitForExpression(client, `document.querySelector('#manageDialog').open`);
    await evaluate(client, `document.querySelector('#deleteConversation').click()`);
    assert.equal(await evaluate(client, `window.__WIRE62_TEST__.snapshot().state.conversations.length`), beforeCreate);

    const oldActive = await evaluate(client, `window.__WIRE62_TEST__.snapshot().state.activeId`);
    await evaluate(client, `document.querySelector('.session-item:not(.active) .session-select').click()`);
    assert.notEqual(await evaluate(client, `window.__WIRE62_TEST__.snapshot().state.activeId`), oldActive);

    const desktop = await evaluate(client, `(() => ({
      h1: document.querySelectorAll('h1').length,
      conversations: window.__WIRE62_TEST__.snapshot().state.conversations.length,
      messages: document.querySelectorAll('.message').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      secretStored: localStorage.getItem(window.__WIRE62_TEST__.storageKey).includes('smoke-secret'),
      requestCount: ${testServer.requestCount()}
    }))()`);
    assert.equal(desktop.h1, 1);
    assert.ok(desktop.conversations >= 2);
    assert.ok(desktop.messages >= 2);
    assert.equal(desktop.scrollWidth, desktop.clientWidth);
    assert.equal(desktop.secretStored, false);
    assert.ok(testServer.requestCount() >= 3);
    await screenshot(client, 'screenshot.png');

    await navigate(client, baseUrl);
    const restored = await evaluate(client, `({
      hasKey: window.__WIRE62_TEST__.snapshot().hasKey,
      conversations: window.__WIRE62_TEST__.snapshot().state.conversations.length,
      secretStored: localStorage.getItem(window.__WIRE62_TEST__.storageKey).includes('smoke-secret')
    })`);
    assert.equal(restored.hasKey, false);
    assert.ok(restored.conversations >= 2);
    assert.equal(restored.secretStored, false);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `document.querySelector('#openSessions').click()`);
    await waitForExpression(client, `Math.abs(document.querySelector('#sessionPanel').getBoundingClientRect().left) < 1`);
    const sessionDrawer = await evaluate(client, `(() => {
      const panel = document.querySelector('#sessionPanel');
      const box = panel.getBoundingClientRect();
      return { open: panel.classList.contains('open'), left: box.left, right: box.right };
    })()`);
    assert.equal(sessionDrawer.open, true);
    assert.ok(
      sessionDrawer.left >= 0 && sessionDrawer.right <= 390,
      `Session drawer outside viewport: ${JSON.stringify(sessionDrawer)}`
    );
    await evaluate(client, `document.querySelector('[data-close-drawer]').click(); document.querySelector('#openSettings').click()`);
    await waitForExpression(client, `document.querySelector('#connectionPanel').getBoundingClientRect().right <= 390.5`);
    const mobile = await evaluate(client, `(() => {
      const settings = document.querySelector('#connectionPanel').getBoundingClientRect();
      const composer = document.querySelector('#composerForm').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.mobile-tools button')].map((button) => button.getBoundingClientRect().height);
      return {
        settingsOpen: document.querySelector('#connectionPanel').classList.contains('open'),
        settingsLeft: settings.left,
        settingsRight: settings.right,
        composerTop: composer.top,
        composerBottom: composer.bottom,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        buttonHeights: buttons
      };
    })()`);
    assert.equal(mobile.settingsOpen, true);
    assert.ok(
      mobile.settingsLeft >= 0 && mobile.settingsRight <= 390,
      `Settings drawer outside viewport: ${JSON.stringify(mobile)}`
    );
    assert.ok(mobile.composerTop >= 0 && mobile.composerBottom <= 844);
    assert.equal(mobile.scrollWidth, mobile.clientWidth);
    mobile.buttonHeights.forEach((height) => assert.ok(height >= 44));
    await evaluate(client, `document.querySelector('#drawerBackdrop').click()`);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({
      progressive: { streaming: progressive.streaming, textLength: progressive.text.length },
      desktop,
      restored,
      mobile,
      runtimeErrors,
      screenshots: [
        path.join(outputDir, 'screenshot.png'),
        path.join(outputDir, 'screenshot-mobile.png'),
      ],
    }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await new Promise((resolve) => testServer.server.close(resolve));
    await sleep(200);
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      rmSync(profile, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
