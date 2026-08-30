import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const externalBaseUrl = process.argv[2] || '';
const appPort = 4482 + (process.pid % 250);
const debugPort = 9682 + (process.pid % 250);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${appPort}/`;
const outputDir = path.resolve(process.argv[3] || path.join(appDir, 'assets'));
const profile = path.resolve(os.tmpdir(), `codex-app82-smoke-${process.pid}`);
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
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(path.join(outputDir, filename), Buffer.from(result.data, 'base64'));
}

async function run() {
  const chrome = chromeCandidates.find((candidate) => candidate && existsSync(candidate));
  assert.ok(chrome, 'Chrome or Edge was not found');
  assert.ok(profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`), 'Browser profile must stay in the temp directory');
  mkdirSync(outputDir, { recursive: true });

  const appServer = externalBaseUrl ? null : spawn(process.execPath, [path.join(appDir, 'server.js')], {
    cwd: appDir,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(appPort) },
  });
  if (appServer) {
    await waitFor(async () => {
      const response = await fetch(baseUrl);
      return response.ok;
    }, 10_000, '云岫山货铺 server');
  }

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
      runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || 'Runtime exception');
    });
    client.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error') runtimeErrors.push(args.map((arg) => arg.value || arg.description).join(' '));
    });
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
      client.send('DOM.enable'),
    ]);

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.removeItem('yunxiu_shop_v1'); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);

    const initial = await evaluate(client, `({
      title: document.title,
      products: document.querySelectorAll('.product-card').length,
      cartCount: document.querySelector('#headerCartCount').textContent,
      ordersEmpty: !document.querySelector('#ordersEmpty').hidden,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })`);
    assert.equal(initial.title, '云岫山货铺 · App 082');
    assert.equal(initial.products, 8);
    assert.equal(initial.cartCount, '0');
    assert.equal(initial.ordersEmpty, true);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await evaluate(client, `(() => {
      const input = document.querySelector('#searchInput');
      input.value = '蜂蜜';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelectorAll('.product-card').length === 1`);
    assert.match(await evaluate(client, `document.querySelector('.product-card').innerText`), /百花蜂蜜/);
    await evaluate(client, `document.querySelector('#clearSearchButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.product-card').length === 8`);

    await evaluate(client, `document.querySelector('[data-action="add"][data-product-id="tea"]').click()`);
    await waitForExpression(client, `document.querySelector('#headerCartCount').textContent === '1'`);
    await evaluate(client, `document.querySelector('[data-action="add"][data-product-id="tea"]').click()`);
    await waitForExpression(client, `document.querySelector('#headerCartCount').textContent === '2'`);
    await evaluate(client, `document.querySelector('#headerCartButton').click()`);
    await waitForExpression(client, `document.querySelector('#cartDialog').open`);
    await evaluate(client, `document.querySelector('#cartCheckoutButton').click()`);
    await waitForExpression(client, `document.querySelector('#checkoutDialog').open`);

    await evaluate(client, `document.querySelector('#checkoutForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('[data-error-for="receiver"]').textContent.length > 0`);
    const errors = await evaluate(client, `({
      receiver: document.querySelector('[data-error-for="receiver"]').textContent,
      phone: document.querySelector('[data-error-for="phone"]').textContent,
      region: document.querySelector('[data-error-for="region"]').textContent,
      detail: document.querySelector('[data-error-for="detail"]').textContent
    })`);
    assert.match(errors.receiver, /收货人/);
    assert.match(errors.phone, /11 位手机号/);
    assert.match(errors.region, /所在地区/);
    assert.match(errors.detail, /详细地址/);

    await evaluate(client, `(() => {
      document.querySelector('#receiverInput').value = '林小满';
      document.querySelector('#phoneInput').value = '13800138000';
      document.querySelector('#regionInput').value = '浙江省 杭州市';
      document.querySelector('#detailInput').value = '青山路 18 号 3 单元';
      document.querySelector('#couponInput').value = 'WELCOME12';
      document.querySelector('#applyCouponButton').click();
    })()`);
    await waitForExpression(client, `document.querySelector('#couponFeedback').textContent.includes('已减')`);
    assert.equal(await evaluate(client, `document.querySelector('#checkoutTotal').textContent`), '¥86.00');
    await evaluate(client, `document.querySelector('#checkoutForm').requestSubmit()`);
    try {
      await waitForExpression(client, `document.querySelector('#successDialog').open`, 15_000);
    } catch (error) {
      const paymentState = await evaluate(client, `({
        checkoutOpen: document.querySelector('#checkoutDialog').open,
        successOpen: document.querySelector('#successDialog').open,
        payDisabled: document.querySelector('#payButton').disabled,
        payText: document.querySelector('#payButton').innerText,
        toast: document.querySelector('#toast').textContent,
        fieldErrors: [...document.querySelectorAll('[data-error-for]')].map((node) => node.textContent).filter(Boolean),
        saved: localStorage.getItem('yunxiu_shop_v1')
      })`);
      throw new Error(`${error.message}\nPayment state: ${JSON.stringify(paymentState)}\nRuntime errors: ${JSON.stringify(runtimeErrors)}`);
    }
    assert.match(await evaluate(client, `document.querySelector('#successReceipt').innerText`), /¥86\.00/);

    const completed = await evaluate(client, `(() => {
      const saved = JSON.parse(localStorage.getItem('yunxiu_shop_v1'));
      return { orders: saved.orders.length, cart: saved.cart.length, receiver: saved.address.receiver, count: document.querySelector('#headerCartCount').textContent };
    })()`);
    assert.deepEqual(completed, { orders: 1, cart: 0, receiver: '林小满', count: '0' });

    await evaluate(client, `document.querySelector('#viewOrderButton').click()`);
    await waitForExpression(client, `document.querySelector('#ordersDialog').open`);
    assert.equal(await evaluate(client, `document.querySelectorAll('.order-card').length`), 1);
    assert.match(await evaluate(client, `document.querySelector('.order-card').innerText`), /云雾绿茶 × 2/);
    await evaluate(client, `document.querySelector('[data-close-dialog="ordersDialog"]').click(); location.reload()`);
    await waitForExpression(client, `document.body && document.body.classList.contains('ready')`);
    assert.equal(await evaluate(client, `JSON.parse(localStorage.getItem('yunxiu_shop_v1')).orders.length`), 1);

    await evaluate(client, `document.querySelector('[data-action="add"][data-product-id="mushroom"]').click()`);
    await waitForExpression(client, `document.querySelector('#headerCartCount').textContent === '1'`);
    await evaluate(client, `document.querySelector('[data-action="add"][data-product-id="honey"]').click()`);
    await waitForExpression(client, `document.querySelector('#headerCartCount').textContent === '2'`);

    await evaluate(client, `document.activeElement && document.activeElement.blur()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const keyboard = await evaluate(client, `({
      tag: document.activeElement && document.activeElement.tagName,
      outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : 'none'
    })`);
    assert.ok(keyboard.tag);
    assert.notEqual(keyboard.outline, 'none');

    await evaluate(client, `(() => {
      document.activeElement && document.activeElement.blur();
      document.querySelector('#toast').classList.remove('is-visible');
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, document.querySelector('#market').offsetTop - 72));
    })()`);
    await sleep(500);
    await screenshot(client, 'screenshot-desktop.png');

    const desktop = await evaluate(client, `({
      products: document.querySelectorAll('.product-card').length,
      cartCount: document.querySelector('#headerCartCount').textContent,
      receiptLines: document.querySelectorAll('#railCartItems .receipt-line').length,
      orders: JSON.parse(localStorage.getItem('yunxiu_shop_v1')).orders.length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })`);
    assert.deepEqual(desktop, { products: 8, cartCount: '2', receiptLines: 2, orders: 1, scrollWidth: 1440, clientWidth: 1440 });

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    const mobile = await evaluate(client, `(() => {
      const grid = document.querySelector('#productGrid').getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.mobile-tabs button, .mobile-tabs a')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, height: box.height };
      });
      return {
        products: document.querySelectorAll('.product-card').length,
        cartCount: document.querySelector('#mobileCartCount').textContent,
        orders: JSON.parse(localStorage.getItem('yunxiu_shop_v1')).orders.length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        gridLeft: grid.left,
        gridRight: grid.right,
        tabs
      };
    })()`);
    assert.equal(mobile.products, 8);
    assert.equal(mobile.cartCount, '2');
    assert.equal(mobile.orders, 1);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.ok(mobile.gridLeft >= 0 && mobile.gridRight <= 390);
    mobile.tabs.forEach((box) => {
      assert.ok(box.left >= 0 && box.right <= 390 && box.height >= 44, `Mobile tab outside touch-safe viewport: ${JSON.stringify(box)}`);
    });
    await evaluate(client, `document.querySelector('#mobileCartButton').click()`);
    await waitForExpression(client, `document.querySelector('#cartDialog').open`);
    assert.equal(await evaluate(client, `document.querySelectorAll('#cartDialogItems .cart-line').length`), 2);
    await evaluate(client, `document.querySelector('[data-close-dialog="cartDialog"]').click(); document.querySelector('#toast').classList.remove('is-visible'); document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, Math.max(0, document.querySelector('#market').offsetTop - 62))`);
    await sleep(500);
    await screenshot(client, 'screenshot-mobile.png');

    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ initial, errors, completed, keyboard, desktop, mobile, runtimeErrors, outputDir }, null, 2));
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
