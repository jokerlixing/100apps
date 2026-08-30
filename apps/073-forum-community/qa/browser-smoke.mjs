import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4580 + (process.pid % 250);
const debugPort = 9880 + (process.pid % 100);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const tempRoot = path.resolve(os.tmpdir());
const profile = path.resolve(tempRoot, `codex-app73-smoke-${process.pid}`);
const storeDir = path.resolve(tempRoot, `codex-app73-store-${process.pid}`);
const storePath = path.join(storeDir, 'forum.json');
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
    try { const value = await check(); if (value) return value; } catch {}
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1; this.pending = new Map(); this.listeners = new Map(); this.socket = new WebSocket(webSocketUrl);
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return;
      }
      (this.listeners.get(message.method) || []).forEach((listener) => listener(message.params));
    });
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) || []), listener]); }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  close() { if (this.socket.readyState < 2) this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  return result.result.value;
}
async function waitForExpression(client, expression, timeout = 12_000) { return waitFor(() => evaluate(client, `Boolean(${expression})`), timeout, expression); }
async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  await waitForExpression(client, `document.readyState === 'complete' && document.body.classList.contains('ready')`, 15_000);
}
async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${tempRoot}${path.sep}`), 'Browser profile must be in the temp directory');
  assert.ok(storeDir.startsWith(`${tempRoot}${path.sep}`), 'Forum store must be in the temp directory');
  mkdirSync(outputDir, { recursive: true }); mkdirSync(storeDir, { recursive: true });

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: appDir, windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(appPort), FORUM_STORE_PATH: storePath },
  });
  if (appServer) await waitFor(async () => (await fetch(baseUrl)).ok, 10_000, 'THREADLINE/73 server');

  const browser = spawn(chrome, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  try {
    const targets = await waitFor(async () => {
      const items = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); return items.length ? items : null;
    }, 10_000, 'Chrome DevTools');
    const pageTarget = targets.find((target) => target.type === 'page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl); await client.connect();
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception'));
    client.on('Runtime.consoleAPICalled', ({ type, args }) => { if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' ')); });
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, `${baseUrl}?offline=1`);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('#modeLabel').textContent.includes('本地')`);

    await evaluate(client, `document.querySelector('#profileActionButton').click()`);
    await waitForExpression(client, `document.querySelector('#authDialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#authUsername').value='browser_maker';
      document.querySelector('#authDisplayName').value='浏览器造物者';
      document.querySelector('#authBio').value='在本地工作台检查真实交互。';
      document.querySelector('#authForm').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelector('#profileName').textContent === '浏览器造物者' && !document.querySelector('#authDialog').open`);

    await evaluate(client, `document.querySelector('#publishButton').click()`);
    await waitForExpression(client, `document.querySelector('#publishDialog').open`);
    await evaluate(client, `(() => {
      document.querySelector('#postTitle').value='这张封面的标题在远处还能被看见吗？';
      document.querySelector('#postStage').value='prototype';
      document.querySelector('#postFocus').value='三米外的标题辨识度';
      document.querySelector('#postBody').value='我把标题压在低对比度的摄影图上，近看有层次，但担心书店陈列时无法快速识别。希望大家只看缩略图判断。';
      document.querySelector('#postTagPicker input[value="平面"]').checked=true;
      document.querySelector('#postTagPicker input[value="摄影"]').checked=true;
      document.querySelector('#publishForm').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelector('#threadDialog').open && document.querySelector('.thread-detail-main h2').textContent.includes('封面')`);
    await evaluate(client, `document.querySelector('#threadCloseButton').click()`);

    await evaluate(client, `(() => { const input=document.querySelector('#searchInput'); input.value='封面'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.thread-card').length`), 1);
    await evaluate(client, `document.querySelector('#clearFiltersButton').click(); document.querySelector('[data-post-id="post_wayfinding"] [data-action="open"]').click()`);
    await waitForExpression(client, `document.querySelector('#threadDialog').open && document.querySelectorAll('.comment-card').length === 2`);
    await evaluate(client, `document.querySelector('[data-detail-action="like"]').click()`);
    await waitForExpression(client, `document.querySelector('[data-detail-action="like"]').getAttribute('aria-pressed') === 'true'`);
    await evaluate(client, `document.querySelector('[data-detail-action="bookmark"]').click()`);
    await waitForExpression(client, `document.querySelector('[data-detail-action="bookmark"]').getAttribute('aria-pressed') === 'true'`);
    await evaluate(client, `document.querySelector('[data-detail-action="quote"]').click(); document.querySelector('#replyBody').value='水平基线这个观察很具体，我也会先把日期与地点作为同一阅读单元测试。'; document.querySelector('#replyForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelectorAll('.comment-card').length === 3 && document.querySelector('#quotePreview').hidden`);
    await evaluate(client, `document.querySelector('#threadCloseButton').click(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('#profileName').textContent === '浏览器造物者'`);
    const restored = await evaluate(client, `(() => { const saved=JSON.parse(localStorage.getItem('threadline73_forum_v1')); return { users:saved.users.length, posts:saved.posts.length, quotedReplies:saved.posts.find(post=>post.id==='post_wayfinding').comments.length }; })()`);
    assert.deepEqual(restored, { users: 5, posts: 6, quotedReplies: 3 });

    await evaluate(client, `document.querySelector('#searchInput').focus(); document.querySelector('#toast').classList.remove('show'); window.scrollTo({top:120,behavior:'instant'});`);
    await sleep(450);
    const desktop = await evaluate(client, `(() => { const focus=getComputedStyle(document.querySelector('#searchInput')); return { mode:document.querySelector('#modeLabel').textContent.trim(), cards:document.querySelectorAll('.thread-card').length, h1:document.querySelectorAll('h1').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, focusOutline:focus.outlineWidth, profile:document.querySelector('#profileName').textContent }; })()`);
    assert.match(desktop.mode, /本地/); assert.equal(desktop.cards, 6); assert.equal(desktop.h1, 1); assert.equal(desktop.scrollWidth, desktop.clientWidth); assert.notEqual(desktop.focusOutline, '0px');
    await screenshot(client, 'screenshot-desktop.png');

    await navigate(client, baseUrl);
    await waitForExpression(client, `document.querySelector('#modeLabel').textContent.includes('共享') && document.querySelector('#profileName').textContent.includes('尚未')`);
    await evaluate(client, `document.querySelector('#profileActionButton').click(); document.querySelector('[data-auth-mode="register"]').click()`);
    await evaluate(client, `(() => {
      document.querySelector('#authUsername').value='server_maker';
      document.querySelector('#authDisplayName').value='服务端造物者';
      document.querySelector('#authBio').value='检查共享社区注册与会话。';
      document.querySelector('#authPassword').value='thread73pass';
      document.querySelector('#authForm').requestSubmit();
    })()`);
    try {
      await waitForExpression(client, `document.querySelector('#profileName').textContent === '服务端造物者' && !document.querySelector('#authDialog').open`, 15_000);
    } catch (error) {
      const authState = await evaluate(client, `(async()=>{ const token=localStorage.getItem('threadline73_session_v1')||''; const response=await fetch('api/bootstrap',{headers:token?{Authorization:'Bearer '+token}:{}}); const payload=await response.json(); return { message:document.querySelector('#authMessage').textContent, name:document.querySelector('#profileName').textContent, open:document.querySelector('#authDialog').open, mode:document.querySelector('#modeLabel').textContent, invalid:[...document.querySelectorAll('#authForm :invalid')].map(node=>node.id), tokenLength:token.length, bootstrapUser:payload.currentUser, users:payload.users.map(user=>user.username) }; })()`);
      throw new Error(`${error.message}; auth state: ${JSON.stringify(authState)}`);
    }
    await evaluate(client, `document.querySelector('#publishButton').click(); document.querySelector('#postTitle').value='服务端主题会在刷新后保留吗？'; document.querySelector('#postStage').value='idea'; document.querySelector('#postFocus').value='共享数据持久化边界'; document.querySelector('#postBody').value='这条主题通过浏览器连接 Node API 发布，用来确认作者由会话决定，并且刷新后仍能从 JSON 仓库恢复。'; document.querySelector('#postTagPicker input[value="写作"]').checked=true; document.querySelector('#publishForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('#threadDialog').open && document.querySelector('.thread-detail-main h2').textContent.includes('服务端主题')`, 15_000);
    await evaluate(client, `document.querySelector('#threadCloseButton').click(); location.reload()`);
    await waitForExpression(client, `document.body.classList.contains('ready') && document.querySelector('#profileName').textContent === '服务端造物者' && [...document.querySelectorAll('.thread-card h2')].some(node=>node.textContent.includes('服务端主题'))`, 15_000);
    await evaluate(client, `document.querySelector('#profileActionButton').click(); document.querySelector('#authForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('#profileName').textContent.includes('尚未')`);
    await evaluate(client, `document.querySelector('#profileActionButton').click(); document.querySelector('[data-auth-mode="login"]').click(); document.querySelector('#authUsername').value='server_maker'; document.querySelector('#authPassword').value='thread73pass'; document.querySelector('#authForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('#profileName').textContent === '服务端造物者'`, 15_000);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
    await navigate(client, `${baseUrl}?offline=1`);
    await evaluate(client, `document.querySelector('#toast').classList.remove('show'); document.querySelector('.feed').scrollIntoView({block:'start',behavior:'instant'});`);
    await sleep(450);
    const mobile = await evaluate(client, `(() => {
      const controls=[...document.querySelectorAll('.identity-button,.publish-button,.text-action,.tag-filter button,.segmented button')].filter(el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect();return s.display!=='none'&&b.bottom>0&&b.top<innerHeight;}).map(el=>{const b=el.getBoundingClientRect();return {height:b.height,left:b.left,right:b.right};});
      return { mode:document.querySelector('#modeLabel').textContent.trim(), cards:document.querySelectorAll('.thread-card').length, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, controls };
    })()`);
    assert.match(mobile.mode, /本地/); assert.equal(mobile.cards, 6); assert.equal(mobile.scrollWidth, 390); assert.equal(mobile.clientWidth, 390);
    mobile.controls.forEach((box) => assert.ok(box.height >= 44 && box.left >= 0 && box.right <= 390, `Mobile control failed: ${JSON.stringify(box)}`));
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ desktop, mobile: { ...mobile, controls: `${mobile.controls.length} checked` }, restored, serverAccount: 'register/login/publish/reload passed', runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close(); if (!browser.killed) browser.kill(); if (appServer && !appServer.killed) appServer.kill();
    await sleep(400);
    if (profile.startsWith(`${tempRoot}${path.sep}`)) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
    if (storeDir.startsWith(`${tempRoot}${path.sep}`)) { try { rmSync(storeDir, { recursive: true, force: true }); } catch {} }
  }
}

run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
