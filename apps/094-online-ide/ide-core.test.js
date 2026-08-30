const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODES,
  MODE_IDS,
  cloneTemplates,
  normalizeModeId,
  normalizeFileId,
  countCode,
  makeLineNumbers,
  serializeConsoleValue,
  normalizeRunRecord,
  normalizeHistory,
  normalizeWorkspace
} = require('./ide-core');

test('defines three executable modes and their official files', () => {
  assert.deepEqual(MODE_IDS, ['web', 'javascript', 'python']);
  assert.deepEqual(MODES.web.files, ['index.html', 'styles.css', 'script.js']);
  assert.deepEqual(MODES.javascript.files, ['main.js']);
  assert.deepEqual(MODES.python.files, ['main.py']);
  assert.match(MODES.web.templates['index.html'], /<main/);
  assert.match(MODES.javascript.templates['main.js'], /console\.log/);
  assert.match(MODES.python.templates['main.py'], /print\(/);
});

test('clones templates without leaking mutations into the official defaults', () => {
  const first = cloneTemplates('web');
  first['index.html'] = 'changed';
  first.extra = 'ignored';
  const second = cloneTemplates('web');

  assert.notEqual(second['index.html'], 'changed');
  assert.equal(second.extra, undefined);
  assert.deepEqual(cloneTemplates('missing'), cloneTemplates('web'));
});

test('falls back to valid modes and files', () => {
  assert.equal(normalizeModeId('python'), 'python');
  assert.equal(normalizeModeId('PYTHON'), 'web');
  assert.equal(normalizeModeId(null), 'web');
  assert.equal(normalizeFileId('web', 'styles.css'), 'styles.css');
  assert.equal(normalizeFileId('web', '../app.js'), 'index.html');
  assert.equal(normalizeFileId('javascript', 'styles.css'), 'main.js');
});

test('counts visible code and produces stable line-number text', () => {
  assert.deepEqual(countCode('const x = 1;\n\nconsole.log(x);'), {
    lines: 3,
    characters: 29,
    bytes: 29
  });
  assert.deepEqual(countCode('你好\n'), { lines: 2, characters: 3, bytes: 7 });
  assert.deepEqual(countCode(null), { lines: 1, characters: 0, bytes: 0 });
  assert.equal(makeLineNumbers('one\ntwo\nthree'), '1\n2\n3');
  assert.equal(makeLineNumbers(''), '1');
});

test('serializes console values safely, including errors and circular objects', () => {
  const circular = { name: 'loop', nested: { ok: true } };
  circular.self = circular;

  assert.equal(serializeConsoleValue('hello'), 'hello');
  assert.equal(serializeConsoleValue(undefined), 'undefined');
  assert.equal(serializeConsoleValue(12n), '12n');
  assert.match(serializeConsoleValue(new Error('boom')), /^Error: boom/);
  assert.equal(
    serializeConsoleValue(circular),
    '{\n  "name": "loop",\n  "nested": {\n    "ok": true\n  },\n  "self": "[Circular]"\n}'
  );
  assert.equal(serializeConsoleValue('x'.repeat(5000)).length, 2001);
});

test('normalizes run records and caps history to the newest valid entries', () => {
  const valid = normalizeRunRecord({
    id: 'run_42',
    mode: 'python',
    status: 'success',
    startedAt: 1788120000000,
    duration: 32.8,
    summary: '  3 行输出\n完成  '
  });

  assert.deepEqual(valid, {
    id: 'run_42',
    mode: 'python',
    status: 'success',
    startedAt: 1788120000000,
    duration: 33,
    summary: '3 行输出 完成'
  });
  assert.equal(normalizeRunRecord({ id: 'bad id', mode: 'web' }), null);
  assert.equal(normalizeRunRecord({ id: 'run_1', mode: 'ruby' }), null);

  const history = normalizeHistory([
    { id: 'run_1', mode: 'web', status: 'success', startedAt: 1, duration: 3, summary: 'ok' },
    { id: 'run_2', mode: 'javascript', status: 'error', startedAt: 2, duration: 5, summary: 'bad' },
    { id: 'broken', mode: 'nope' }
  ], 1);
  assert.deepEqual(history.map((entry) => entry.id), ['run_2']);
});

test('migrates persisted workspaces while removing unknown files and oversized code', () => {
  const huge = 'x'.repeat(210_000);
  const state = normalizeWorkspace({
    version: 99,
    mode: 'python',
    activeFiles: { web: 'styles.css', python: '../bad.py' },
    workspaces: {
      web: { 'index.html': '<h1>Saved</h1>', 'styles.css': huge, 'script.js': 7, 'evil.js': 'nope' },
      javascript: { 'main.js': 'console.log("saved")' },
      ruby: { 'main.rb': 'puts 1' }
    },
    history: [{ id: 'run_saved', mode: 'web', status: 'success', startedAt: 7, duration: 9, summary: 'saved' }]
  });

  assert.equal(state.version, 1);
  assert.equal(state.mode, 'python');
  assert.equal(state.activeFiles.web, 'styles.css');
  assert.equal(state.activeFiles.python, 'main.py');
  assert.equal(state.workspaces.web['index.html'], '<h1>Saved</h1>');
  assert.equal(state.workspaces.web['styles.css'].length, 200_000);
  assert.equal(state.workspaces.web['script.js'], MODES.web.templates['script.js']);
  assert.equal(state.workspaces.web['evil.js'], undefined);
  assert.equal(state.workspaces.python['main.py'], MODES.python.templates['main.py']);
  assert.equal(state.history[0].id, 'run_saved');
});

