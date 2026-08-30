import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const appPort = 4481 + (process.pid % 180);
const debugPort = 9781 + (process.pid % 180);
const baseUrl = `http://127.0.0.1:${appPort}/apps/081-live-danmaku/`;
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-wave81-smoke-${process.pid}`);
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

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function attachClient(target, errors) {
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') errors.push(args.map((arg) => arg.value || arg.description).join(' '));
  });
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
  return client;
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

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  let peer;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const items = await response.json();
      return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    client = await attachClient(targets.find((target) => target.type === 'page'), runtimeErrors);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready')`);

    const initial = await evaluate(client, `(() => ({
      title: document.title,
      h1: document.querySelectorAll('h1').length,
      messages: document.querySelectorAll('.chat-message').length,
      connection: document.querySelector('#connectionState').textContent,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      state: window.__wave81.getState()
    }))()`);
    assert.match(initial.title, /WAVE\/81/);
    assert.equal(initial.h1, 1);
    assert.equal(initial.messages, 6);
    assert.match(initial.connection, /跨标签实时信号|本页实时模拟/);
    assert.equal(initial.scrollWidth, initial.clientWidth);
    assert.equal(initial.state.playing, true);

    const messages = [
      ['scroll', '滚动弹幕验收：晚风刚刚好'],
      ['top', '顶部弹幕验收：CH81 收到'],
      ['bottom', '底部弹幕验收：一起听到返场'],
    ];
    for (const [mode, text] of messages) {
      await evaluate(client, `(() => {
        document.querySelector('[data-mode="${mode}"]').click();
        document.querySelector('#messageInput').value = ${JSON.stringify(text)};
        document.querySelector('#messageForm').requestSubmit();
      })()`);
      await waitForExpression(client, `Array.from(document.querySelectorAll('.chat-message p')).some((node) => node.textContent === ${JSON.stringify(text)})`);
      await sleep(930);
    }
    const modes = await evaluate(client, `Array.from(document.querySelectorAll('.danmaku-item')).map((node) => node.dataset.mode)`);
    assert.ok(modes.includes('scroll'));
    assert.ok(modes.includes('top'));
    assert.ok(modes.includes('bottom'));

    const beforeLikes = await evaluate(client, `window.__wave81.getState().likes`);
    await evaluate(client, `document.querySelector('[data-reaction="👏"]').click()`);
    assert.equal(await evaluate(client, `window.__wave81.getState().likes`), beforeLikes + 1);
    assert.equal(await evaluate(client, `document.querySelectorAll('.reaction-particle').length > 0`), true);

    await evaluate(client, `document.querySelector('#playToggle').click()`);
    assert.equal(await evaluate(client, `window.__wave81.getState().playing`), false);
    assert.equal(await evaluate(client, `document.querySelector('#liveStage').classList.contains('is-paused')`), true);
    await evaluate(client, `document.querySelector('#playToggle').click()`);

    await evaluate(client, `(() => {
      document.querySelector('#danmakuToggle').click();
      document.querySelector('#muteToggle').click();
      document.querySelector('#densitySelect').value = 'high';
      document.querySelector('#densitySelect').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#opacityRange').value = '0.72';
      document.querySelector('#opacityRange').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#speedRange').value = '1.3';
      document.querySelector('#speedRange').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#theaterToggle').click();
    })()`);
    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready')`);
    const persisted = await evaluate(client, `window.__wave81.getState().preferences`);
    assert.deepEqual(persisted, {
      mode: 'bottom', color: '#f3f0e7', opacity: 0.72, speed: 1.3, density: 'high',
      danmakuVisible: false, muted: true, volume: 0.55, theater: true,
    });
    await evaluate(client, `document.querySelector('#danmakuToggle').click(); document.querySelector('#muteToggle').click(); document.querySelector('#theaterToggle').click()`);

    const { targetId: peerTargetId } = await client.send('Target.createTarget', { url: `${baseUrl}?peer=1` });
    const peerTarget = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return (await response.json()).find((target) => target.id === peerTargetId || target.url.includes('peer=1'));
    }, 10_000, 'peer tab');
    peer = await attachClient(peerTarget, runtimeErrors);
    await waitForExpression(peer, `document.body && document.body.classList.contains('ready')`);
    await sleep(950);
    const crossTabText = '跨标签同步验收：另一端已收到';
    await evaluate(client, `(() => {
      document.querySelector('[data-mode="scroll"]').click();
      document.querySelector('#messageInput').value = ${JSON.stringify(crossTabText)};
      document.querySelector('#messageForm').requestSubmit();
    })()`);
    await waitForExpression(peer, `Array.from(document.querySelectorAll('.chat-message p')).some((node) => node.textContent === ${JSON.stringify(crossTabText)})`);

    await evaluate(client, `(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      document.querySelector('#chatFeed').scrollTop = 0;
      document.activeElement && document.activeElement.blur();
    })()`);
    await sleep(750);
    await screenshot(client, 'screenshot-desktop.png');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `(() => {
      document.querySelector('#densitySelect').value = 'balanced';
      document.querySelector('#densitySelect').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#opacityRange').value = '0.88';
      document.querySelector('#opacityRange').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#speedRange').value = '1';
      document.querySelector('#speedRange').dispatchEvent(new Event('input', { bubbles: true }));
      window.scrollTo(0, document.querySelector('#broadcastShell').offsetTop - 8);
    })()`);
    await sleep(700);
    const mobile = await evaluate(client, `(() => {
      const shell = document.querySelector('#broadcastShell').getBoundingClientRect();
      const input = document.querySelector('#messageInput').getBoundingClientRect();
      const controls = Array.from(document.querySelectorAll('.composer-tools button'))
        .filter((button) => button.offsetParent !== null)
        .map((button) => {
          const box = button.getBoundingClientRect();
          return { left: box.left, right: box.right, height: box.height };
        });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        shellLeft: shell.left,
        shellRight: shell.right,
        inputLeft: input.left,
        inputRight: input.right,
        controls
      };
    })()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.shellLeft >= 0 && mobile.shellRight <= 390);
    assert.ok(mobile.inputLeft >= 0 && mobile.inputRight <= 390);
    mobile.controls.forEach((control) => {
      assert.ok(control.left >= 0 && control.right <= 390, `Mobile control outside viewport: ${JSON.stringify(control)}`);
      assert.ok(control.height >= 30, `Mobile control too short: ${JSON.stringify(control)}`);
    });
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({
      initial: { ...initial, state: '[initial state verified]' },
      sentModes: modes,
      persisted,
      crossTab: true,
      mobile: { ...mobile, controls: mobile.controls.length },
      runtimeErrors,
      outputDir,
    }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (peer) peer.close();
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
