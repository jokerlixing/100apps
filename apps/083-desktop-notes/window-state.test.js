const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_WINDOW_STATE, normalizeWindowState } = require('./window-state.js');

test('uses safe defaults for an absent window state', () => {
  assert.deepEqual(normalizeWindowState(null), DEFAULT_WINDOW_STATE);
});

test('clamps dimensions and drops invalid coordinates', () => {
  const state = normalizeWindowState({ width: 200, height: 9000, x: 'bad', y: 42.7 });
  assert.equal(state.width, 860);
  assert.equal(state.height, 1400);
  assert.equal(state.x, null);
  assert.equal(state.y, 43);
});

test('only accepts strict booleans for privileged window modes', () => {
  assert.equal(normalizeWindowState({ compact: 'true', alwaysOnTop: 1 }).compact, false);
  assert.equal(normalizeWindowState({ compact: true, alwaysOnTop: true }).alwaysOnTop, true);
});
