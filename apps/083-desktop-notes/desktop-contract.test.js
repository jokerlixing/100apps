const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

test('web shell is self-contained and labels native window controls', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /aria-label="始终置顶"/);
  assert.match(html, /aria-label="紧凑模式"/);
  assert.match(html, /<script src="note-core\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
});

test('electron renderer uses isolation, sandboxing, and no Node integration', () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
});

test('preload exposes only the three documented window operations', () => {
  const invokes = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(invokes, [
    'tack83:get-window-state',
    'tack83:set-always-on-top',
    'tack83:set-compact',
  ]);
  assert.doesNotMatch(preload, /require\(['"](?:node:)?(?:fs|path|child_process)/);
});

test('desktop smoke mode reaches ready-to-show without opening a visible window', () => {
  assert.match(main, /process\.argv\.includes\('--smoke-test'\)/);
  assert.match(main, /TACK83_SMOKE_READY/);
  assert.match(main, /show:\s*false/);
});
