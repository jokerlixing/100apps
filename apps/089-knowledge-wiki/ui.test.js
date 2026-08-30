const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDir = __dirname;

function read(name) {
  return fs.readFileSync(path.join(appDir, name), 'utf8');
}

test('workspace exposes the complete linked-note interface', () => {
  const html = read('index.html');

  assert.match(html, /<meta[^>]+name="viewport"/);
  assert.match(html, /<h1[^>]*>\s*LOOM\/89/);
  assert.match(html, /id="searchInput"[^>]+aria-label="全文搜索"/);
  assert.match(html, /id="noteList"[^>]+aria-label="笔记列表"/);
  assert.match(html, /id="titleInput"[^>]+aria-label="笔记标题"/);
  assert.match(html, /id="contentInput"[^>]+aria-label="Markdown 正文"/);
  assert.match(html, /id="preview"/);
  assert.match(html, /id="contextRail"/);
  assert.match(html, /<dialog[^>]+id="graphDialog"/);
  assert.match(html, /id="graphCanvas"[^>]+aria-label="知识关系图"/);
  assert.match(html, /id="importInput"[^>]+accept="application\/json,.json"/);
  assert.match(html, /id="toast"[^>]+aria-live="polite"/);
  assert.match(html, /<script src="knowledge-core\.js"><\/script>\s*<script src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//);
});

test('visual system is responsive, keyboard-visible, and motion-aware', () => {
  const css = read('styles.css');

  for (const token of ['--blueprint', '--paper', '--coral', '--teal', '--ink', '--grid']) {
    assert.match(css, new RegExp(`${token}:`));
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*620px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*44px/);
});

test('browser layer uses the tested core and versioned local persistence', () => {
  const source = read('app.js');

  assert.match(source, /KnowledgeCore/);
  assert.match(source, /loom89\.notes\.v1/);
  assert.match(source, /Core\.renderMarkdown/);
  assert.match(source, /Core\.buildGraph/);
  assert.match(source, /Core\.getBacklinks/);
  assert.match(source, /Core\.exportBackup/);
  assert.match(source, /Core\.importBackup/);
  assert.match(source, /document\.body\.classList\.add\('ready'\)/);
});
