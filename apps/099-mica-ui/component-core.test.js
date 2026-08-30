const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('./component-core.js');

test('catalog exposes twelve unique custom elements with runnable snippets', () => {
  assert.equal(core.COMPONENTS.length, 12);
  assert.equal(new Set(core.COMPONENTS.map((item) => item.id)).size, 12);

  for (const component of core.COMPONENTS) {
    assert.match(component.tag, /^mica-[a-z-]+$/);
    assert.match(component.snippet, new RegExp(`<${component.tag}`));
    assert.ok(component.description.length > 20);
  }
});

test('catalog search is case-insensitive and includes tags and descriptions', () => {
  assert.deepEqual(core.filterComponents('DIALOG').map((item) => item.id), ['dialog']);
  assert.deepEqual(core.filterComponents('feedback').map((item) => item.id), ['alert', 'progress', 'toast']);
  assert.equal(core.filterComponents('not-a-component').length, 0);
  assert.equal(core.filterComponents('  ').length, 12);
});

test('token normalization accepts supported values and repairs invalid input', () => {
  assert.deepEqual(core.normalizeTokens({
    theme: 'dark',
    accent: '#d9734d',
    radius: '999px',
    scale: '1.1',
  }), {
    theme: 'dark',
    accent: '#D9734D',
    radius: '999px',
    scale: '1.1',
  });

  assert.deepEqual(core.normalizeTokens({
    theme: 'sepia',
    accent: 'red',
    radius: '10rem',
    scale: '3',
  }), core.DEFAULT_TOKENS);
});

test('progress values are clamped and non-numeric input falls back to zero', () => {
  assert.equal(core.clampProgress(-1), 0);
  assert.equal(core.clampProgress('42.5'), 42.5);
  assert.equal(core.clampProgress(140), 100);
  assert.equal(core.clampProgress('unknown'), 0);
});

test('snippet lookup returns a copyable example or an empty string', () => {
  assert.match(core.getSnippet('switch'), /<mica-switch/);
  assert.equal(core.getSnippet('missing'), '');
});
