const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDir = __dirname;
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(appDir, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const readme = fs.readFileSync(path.join(appDir, 'README.md'), 'utf8');

test('ships only local runtime resources in dependency order', () => {
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/workflow-core\.js"[\s\S]*src="\.\/app\.js"/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:js|css)/i);
  for (const file of ['styles.css', 'workflow-core.js', 'app.js']) {
    assert.equal(fs.existsSync(path.join(appDir, file)), true, `${file} should exist`);
  }
});

test('provides semantic landmarks, labelled controls and accessible dialogs', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<main[^>]+id="dispatch-main"/);
  assert.match(html, /<label[^>]+for="payload-input"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<dialog[^>]+id="template-dialog"[^>]+aria-labelledby="template-title"/);
  assert.match(html, /<dialog[^>]+id="confirm-dialog"[^>]+aria-labelledby="confirm-title"/);
  assert.match(css, /:focus-visible\s*\{/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('renders user data without HTML string injection sinks', () => {
  assert.doesNotMatch(app, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(/);
  assert.match(app, /textContent\s*=|createTextNode/);
  assert.match(app, /Core\.normalizeBackup/);
});

test('documents the deployment URL and honest local scheduling boundary', () => {
  assert.match(readme, /https:\/\/jokerlixing\.github\.io\/100apps\/apps\/090-workflow-engine\//);
  assert.match(readme, /间隔触发器仅在页面打开时运行/);
  assert.match(readme, /不会自动把数据发送给第三方/);
  assert.match(html, /关闭页面后定时器会停止/);
  assert.match(html, /Webhook 仅生成请求预览/);
});
