const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseJson,
  positionToLineColumn,
  getErrorContext,
  formatJson,
  minifyJson,
  analyzeJson,
  joinPath,
  searchJson,
  getValueType,
  previewValue,
} = require('./json-core.js');

test('parseJson accepts objects, arrays, and scalar roots', () => {
  const objectResult = parseJson('{"name":"SPEC","ready":true}');
  assert.equal(objectResult.ok, true);
  assert.deepEqual(objectResult.value, { name: 'SPEC', ready: true });
  assert.deepEqual(parseJson('[1,null,"x"]').value, [1, null, 'x']);
  assert.equal(parseJson('42').value, 42);
});

test('parseJson distinguishes empty input and locates malformed JSON', () => {
  const empty = parseJson('   \n ');
  assert.equal(empty.ok, false);
  assert.equal(empty.empty, true);
  assert.equal(empty.error.line, 1);

  const malformed = parseJson('{"a": 1,}');
  assert.equal(malformed.ok, false);
  assert.equal(malformed.empty, false);
  assert.equal(malformed.error.line, 1);
  assert.equal(malformed.error.column, 9);
  assert.equal(malformed.error.lineText, '{"a": 1,}');
  assert.match(malformed.error.pointer, /\^/);
});

test('positionToLineColumn and getErrorContext handle CRLF offsets', () => {
  const source = '{\r\n  "name": "SPEC",\r\n  "open": true\r\n}';
  const position = source.indexOf('true');
  assert.deepEqual(positionToLineColumn(source, position), {
    position,
    line: 3,
    column: 11,
  });

  const context = getErrorContext(source, position);
  assert.equal(context.lineText, '  "open": true');
  assert.equal(context.pointer, '          ^');
  assert.deepEqual(context.lines.map((line) => line.number), [2, 3, 4]);
});

test('formatJson and minifyJson serialize without changing values', () => {
  const value = { station: 55, values: [true, null, 'x'] };
  assert.equal(formatJson(value, 2), [
    '{',
    '  "station": 55,',
    '  "values": [',
    '    true,',
    '    null,',
    '    "x"',
    '  ]',
    '}',
  ].join('\n'));
  assert.match(formatJson(value, 4), /^\{\n {4}"station"/);
  assert.equal(minifyJson(value), '{"station":55,"values":[true,null,"x"]}');
  assert.equal(formatJson(value, 12), formatJson(value, 4));
});

test('analyzeJson counts structure, leaves, depth, keys, arrays, and bytes', () => {
  const value = {
    meta: { version: 1 },
    items: [true, null, 'x'],
  };
  assert.deepEqual(analyzeJson(value), {
    nodes: 7,
    leaves: 4,
    objectKeys: 3,
    arrayItems: 3,
    maxDepth: 2,
    bytes: Buffer.byteLength(JSON.stringify(value), 'utf8'),
    truncated: false,
  });
});

test('analyzeJson stops at the depth guard rather than overflowing', () => {
  const root = {};
  let cursor = root;
  for (let index = 0; index < 160; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  const stats = analyzeJson(root, { maxDepth: 32 });
  assert.equal(stats.maxDepth, 32);
  assert.equal(stats.truncated, true);
  assert.equal(stats.nodes, 33);
});

test('joinPath emits readable dot paths and safely quoted bracket paths', () => {
  assert.equal(joinPath('$', 'profile'), '$.profile');
  assert.equal(joinPath('$.items', 2, true), '$.items[2]');
  assert.equal(joinPath('$', 'user-name'), "$['user-name']");
  assert.equal(joinPath('$', "O'Reilly"), "$['O\\'Reilly']");
  assert.equal(joinPath('$', 'a\\b'), "$['a\\\\b']");
});

test('searchJson matches keys and primitive values case-insensitively', () => {
  const value = {
    profile: { displayName: 'Ada Lovelace', role: 'Engineer' },
    tags: ['JSON', 'Workbench'],
    active: true,
  };
  const nameMatches = searchJson(value, 'ada');
  assert.equal(nameMatches.length, 1);
  assert.equal(nameMatches[0].path, '$.profile.displayName');
  assert.deepEqual(nameMatches[0].matches, ['value']);

  const keyMatches = searchJson(value, 'profile');
  assert.equal(keyMatches[0].path, '$.profile');
  assert.ok(keyMatches[0].matches.includes('key'));

  const caseMatches = searchJson(value, 'json');
  assert.equal(caseMatches[0].path, '$.tags[0]');
});

test('searchJson caps results and handles empty queries', () => {
  const value = Array.from({ length: 20 }, (_, index) => `match-${index}`);
  assert.equal(searchJson(value, 'match', { limit: 5 }).length, 5);
  assert.deepEqual(searchJson(value, '   '), []);
  assert.deepEqual(searchJson(null, 'null').map((item) => item.path), ['$']);
});

test('type and preview helpers keep user strings as inert text', () => {
  assert.equal(getValueType(null), 'null');
  assert.equal(getValueType([]), 'array');
  assert.equal(getValueType({}), 'object');
  assert.equal(previewValue('<img src=x onerror=alert(1)>'), '"<img src=x onerror=alert(1)>"');
  assert.equal(previewValue('x'.repeat(120), 18), `"${'x'.repeat(15)}…"`);
  assert.equal(previewValue({ a: 1 }), '{1 项}');
  assert.equal(previewValue([1, 2]), '[2 项]');
});
