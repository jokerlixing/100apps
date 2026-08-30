const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('live room exposes the complete semantic interaction surface', () => {
  const html = read('index.html');

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>WAVE\/81/);
  assert.match(html, /id="liveStage"/);
  assert.match(html, /id="danmakuLayer"[^>]*aria-live="off"/);
  assert.match(html, /id="chatFeed"[^>]*aria-live="polite"/);
  assert.match(html, /id="messageForm"/);
  assert.match(html, /for="messageInput"/);
  assert.match(html, /id="messageInput"[^>]*maxlength="48"/);
  assert.match(html, /id="messageError"[^>]*role="status"/);
  assert.match(html, /data-mode="scroll"/);
  assert.match(html, /data-mode="top"/);
  assert.match(html, /data-mode="bottom"/);
  assert.match(html, /data-reaction="👏"/);
  assert.match(html, /id="playToggle"/);
  assert.match(html, /id="danmakuToggle"/);
  assert.match(html, /id="muteToggle"/);
  assert.match(html, /id="theaterToggle"/);
  assert.match(html, /id="densitySelect"/);
  assert.match(html, /id="opacityRange"/);
  assert.match(html, /id="speedRange"/);
  assert.match(html, /id="connectionState"/);
  assert.match(html, /danmaku-core\.js[\s\S]*app\.js/);
});
test('styles encode the broadcast console identity and responsive safeguards', () => {
  const css = read('styles.css');

  assert.match(css, /--console-bone:\s*#d8d4c5/);
  assert.match(css, /--oxide-red:\s*#d54832/);
  assert.match(css, /\.signal-scan/);
  assert.match(css, /\.danmaku-item/);
  assert.match(css, /@media\s*\(max-width:\s*860px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /:focus-visible/);
});

test('application script wires validation, persistence, realtime transport and keyboard controls', () => {
  const app = read('app.js');

  assert.match(app, /WaveCore/);
  assert.match(app, /BroadcastChannel/);
  assert.match(app, /localStorage/);
  assert.match(app, /normalizeMessage/);
  assert.match(app, /chooseLane/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /keydown/);
});
