const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const requiredFiles = ['index.html', 'styles.css', 'model.js', 'app.js', 'README.md'];
requiredFiles.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`));

const html = read('index.html');
const css = read('styles.css');
const app = read('app.js');

assert.equal((html.match(/<h1\b/gi) || []).length, 1, 'page must contain one h1');
assert.equal((html.match(/<main\b/gi) || []).length, 1, 'page must contain one main');
assert.match(html, /<html[^>]+lang="zh-CN"/i);
assert.match(html, /<meta[^>]+name="viewport"/i);
assert.match(html, /<link[^>]+href="styles\.css"/i);
assert.match(html, /<script[^>]+src="model\.js"/i);
assert.match(html, /<script[^>]+src="app\.js"/i);

[
  'partsBin', 'assemblyList', 'emptyAssembly', 'fieldCount', 'inspector',
  'formTitle', 'formDescription', 'submitLabel', 'previewDialog', 'previewForm',
  'importInput', 'toast', 'liveRegion', 'undoButton', 'redoButton',
].forEach((id) => assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`));

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'static ids must be unique');
assert.doesNotMatch(html, /\son(?:click|change|input|submit|dragstart|drop)=/i, 'inline event handlers are not allowed');
assert.doesNotMatch(`${html}\n${css}\n${app}`, /https?:\/\//i, 'runtime assets must remain local');

const labelFors = new Set([...html.matchAll(/<label[^>]+for="([^"]+)"/gi)].map((match) => match[1]));
for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
  const attrs = match[2];
  if (/type="hidden"/i.test(attrs)) continue;
  const id = attrs.match(/\bid="([^"]+)"/i)?.[1];
  const labelled = /aria-label(?:ledby)?="[^"]+"/i.test(attrs) || (id && labelFors.has(id));
  assert.ok(labelled, `unlabelled control: ${match[0]}`);
}

assert.match(css, /@media\s*\([^)]*max-width:\s*980px/i);
assert.match(css, /@media\s*\([^)]*max-width:\s*680px/i);
assert.match(css, /prefers-reduced-motion:\s*reduce/i);
assert.match(css, /:focus-visible/);
assert.match(css, /min-(?:height|width):\s*44px/);

assert.match(app, /localStorage\.(?:getItem|setItem)/);
assert.match(app, /dragstart/);
assert.match(app, /drop/);
assert.match(app, /generateStandaloneHtml/);
assert.match(app, /deserializeSchema/);
assert.match(app, /validateSubmission/);

console.log('App 087 static checks passed.');
