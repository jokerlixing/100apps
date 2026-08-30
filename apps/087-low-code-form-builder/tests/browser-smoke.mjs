import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] || 'http://127.0.0.1:8087/apps/087-low-code-form-builder/';
const outputDir = path.resolve(process.argv[3] || path.join(import.meta.dirname, '..', 'assets'));
const port = 9300 + (process.pid % 500);
const profile = path.resolve(os.tmpdir(), `codex-app87-smoke-${process.pid}`);
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
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
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
  await waitForExpression(client, `document.readyState === 'complete' && window.FormModel && document.querySelector('#partsBin')`);
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
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
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let client;
  const runtimeErrors = [];
  const downloads = [];
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
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
    client.on('Page.downloadWillBegin', ({ suggestedFilename }) => downloads.push(suggestedFilename));
    await Promise.all([client.send('Page.enable'), client.send('Runtime.enable'), client.send('Network.enable')]);
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outputDir, eventsEnabled: true });

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await navigate(client, baseUrl);
    await evaluate(client, `localStorage.clear(); location.reload()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 6`);

    const initial = await evaluate(client, `(() => ({
      title: document.querySelector('#formTitle').value,
      fields: document.querySelectorAll('.field-card').length,
      h1: document.querySelectorAll('h1').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }))()`);
    assert.equal(initial.fields, 6);
    assert.equal(initial.h1, 1);
    assert.equal(initial.scrollWidth, initial.clientWidth);

    await evaluate(client, `document.querySelector('[data-field-type="date"]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 7`);

    const dragged = await evaluate(client, `(() => {
      const cards=[...document.querySelectorAll('.field-card')];
      const card=cards[cards.length-1];
      const slot=document.querySelector('[data-drop-index="0"]');
      const transfer=new DataTransfer();
      card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
      slot.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      slot.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      return document.querySelector('.field-card')?.dataset.fieldType;
    })()`);
    assert.equal(dragged, 'date');

    await evaluate(client, `(() => {
      const first=document.querySelector('.field-card');
      first.click();
      const input=document.querySelector('#inspector-label');
      input.value='到访日期';
      input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await waitForExpression(client, `document.querySelector('.field-label').textContent === '到访日期'`);

    await evaluate(client, `document.querySelector('[data-inspector-action="duplicate"]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 8`);
    await evaluate(client, `document.querySelector('[data-inspector-action="delete"]').click()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 7`);
    await evaluate(client, `document.querySelector('#undoButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 8`);
    await evaluate(client, `document.querySelector('#redoButton').click()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 7`);

    await evaluate(client, `document.querySelector('#openPreviewButton').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#previewDialog').open`), true);
    await evaluate(client, `document.querySelector('#previewForm').requestSubmit()`);
    await waitForExpression(client, `document.querySelector('#previewSummary').textContent.length > 0`);

    const requiredIds = await evaluate(client, `(() => {
      const schema=JSON.parse(localStorage.getItem('jig87_schema_v1'));
      return {
        text:schema.fields.find((field)=>field.type==='text'&&field.required).id,
        email:schema.fields.find((field)=>field.type==='email'&&field.required).id,
        radio:schema.fields.find((field)=>field.type==='radio'&&field.required).id
      };
    })()`);
    await evaluate(client, `(() => {
      const ids=${JSON.stringify(requiredIds)};
      document.querySelector('#preview-'+ids.text).value='林晓';
      document.querySelector('#preview-'+ids.email).value='lin@example.com';
      document.querySelector('#preview-'+ids.radio+'-0').checked=true;
      document.querySelector('#previewForm').requestSubmit();
    })()`);
    await waitForExpression(client, `document.querySelector('#previewReceipt').hidden === false`);
    assert.match(await evaluate(client, `document.querySelector('#previewReceipt').textContent`), /试填通过/);
    await evaluate(client, `document.querySelector('#closePreviewButton').click()`);

    await evaluate(client, `document.querySelector('#exportJsonButton').click(); document.querySelector('#exportHtmlButton').click()`);
    await waitFor(() => downloads.length >= 2, 8_000, 'two downloads');
    assert.ok(downloads.some((name) => name.endsWith('.json')));
    assert.ok(downloads.some((name) => name.endsWith('.html')));

    await evaluate(client, `window.scrollTo(0,0); document.querySelector('#toast').classList.remove('show')`);
    await sleep(250);
    await screenshot(client, 'jig-87-desktop.png');

    await evaluate(client, `location.reload()`);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 7`);
    assert.equal(await evaluate(client, `document.querySelector('.field-label').textContent`), '到访日期');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await navigate(client, baseUrl);
    await waitForExpression(client, `document.querySelectorAll('.field-card').length === 7`);
    const mobile = await evaluate(client, `(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      topActions: [...document.querySelectorAll('.tool-button')].every((node)=>{const box=node.getBoundingClientRect();return box.left>=0&&box.right<=390&&box.height>=44}),
      parts: [...document.querySelectorAll('.part-item')].every((node)=>{const box=node.getBoundingClientRect();return box.left>=0&&box.right<=390&&box.height>=44}),
      fieldActions: [...document.querySelectorAll('.field-action')].every((node)=>node.getBoundingClientRect().height>=38)
    }))()`);
    assert.equal(mobile.scrollWidth, 390);
    assert.equal(mobile.clientWidth, 390);
    assert.equal(mobile.topActions, true);
    assert.equal(mobile.parts, true);
    assert.equal(mobile.fieldActions, true);
    await evaluate(client, `document.querySelector('.assembly-panel').scrollIntoView({block:'start'})`);
    await sleep(250);
    await screenshot(client, 'jig-87-mobile.png');

    const imported = await evaluate(client, `(() => new Promise((resolve) => {
      const input=document.querySelector('#importInput');
      const schema={version:1,title:'导入验收表',description:'文件导入路径',submitLabel:'确认',fields:[{id:'answer',type:'text',label:'验收结果',required:true,width:'full'}]};
      const transfer=new DataTransfer();
      transfer.items.add(new File([JSON.stringify(schema)],'acceptance.json',{type:'application/json'}));
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(()=>resolve(document.querySelector('#formTitle').value),200);
    }))()`);
    assert.equal(imported, '导入验收表');
    assert.deepEqual(runtimeErrors, []);

    console.log(JSON.stringify({ initial, mobile, downloads, runtimeErrors, outputDir }, null, 2));
    await client.send('Browser.close');
  } finally {
    if (client) client.close();
    if (browser.exitCode === null) {
      browser.kill();
      await Promise.race([
        new Promise((resolve) => browser.once('exit', resolve)),
        sleep(3_000),
      ]);
    }
    if (profile.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
      } catch (error) {
        if (error.code !== 'EPERM') throw error;
        console.warn(`Temporary browser profile is still locked and can be removed later: ${profile}`);
      }
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
