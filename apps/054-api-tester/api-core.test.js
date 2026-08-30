const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUrl,
  buildRequestUrl,
  sanitizeHeaderRows,
  maskSensitiveHeaders,
  prepareRequestBody,
  detectResponseKind,
  formatBytes,
  trimHistory,
} = require('./api-core.js');

test('normalizeUrl accepts HTTP(S) and supplies https for host-like input', () => {
  assert.equal(normalizeUrl('https://example.com/api?q=1'), 'https://example.com/api?q=1');
  assert.equal(normalizeUrl(' http://localhost:8080/health '), 'http://localhost:8080/health');
  assert.equal(normalizeUrl('jsonplaceholder.typicode.com/todos/1'), 'https://jsonplaceholder.typicode.com/todos/1');
});

test('normalizeUrl rejects empty, credentialed, and unsafe protocols', () => {
  for (const value of ['', '   ', 'ftp://example.com', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    assert.throws(() => normalizeUrl(value), /URL|HTTP|凭据/);
  }
});

test('buildRequestUrl merges enabled query rows without mutating inputs', () => {
  const rows = [
    { key: 'page', value: '2', enabled: true },
    { key: 'tag', value: '中文 空格', enabled: true },
    { key: 'skip', value: 'x', enabled: false },
    { key: '', value: 'ignored', enabled: true },
  ];
  const snapshot = structuredClone(rows);
  const result = new URL(buildRequestUrl('https://example.com/items?sort=new#top', rows));

  assert.equal(result.searchParams.get('sort'), 'new');
  assert.equal(result.searchParams.get('page'), '2');
  assert.equal(result.searchParams.get('tag'), '中文 空格');
  assert.equal(result.hash, '#top');
  assert.deepEqual(rows, snapshot);
});

test('sanitizeHeaderRows ignores disabled/invalid rows and resolves names case-insensitively', () => {
  const headers = sanitizeHeaderRows([
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: 'x-mode', value: 'one', enabled: true },
    { key: 'X-Mode', value: 'two', enabled: true },
    { key: 'Bad Header', value: 'x', enabled: true },
    { key: 'Disabled', value: 'x', enabled: false },
    { key: '', value: 'x', enabled: true },
  ]);

  assert.deepEqual(headers, { Accept: 'application/json', 'X-Mode': 'two' });
});

test('maskSensitiveHeaders clones rows and masks secret values', () => {
  const rows = [
    { key: 'Authorization', value: 'Bearer secret', enabled: true },
    { key: 'X-API-Key', value: 'abc', enabled: true },
    { key: 'Accept', value: 'application/json', enabled: true },
  ];
  const masked = maskSensitiveHeaders(rows);

  assert.equal(masked[0].value, '••••••••');
  assert.equal(masked[1].value, '••••••••');
  assert.equal(masked[2].value, 'application/json');
  assert.equal(rows[0].value, 'Bearer secret');
});

test('prepareRequestBody validates JSON and omits bodies for GET, HEAD, or empty input', () => {
  assert.equal(prepareRequestBody('GET', 'json', '{"a":1}'), null);
  assert.equal(prepareRequestBody('HEAD', 'text', 'hello'), null);
  assert.equal(prepareRequestBody('POST', 'none', 'ignored'), null);
  assert.equal(prepareRequestBody('POST', 'json', '  '), null);
  assert.deepEqual(prepareRequestBody('POST', 'json', '{"name":"PORT"}'), {
    body: '{\n  "name": "PORT"\n}',
    contentType: 'application/json;charset=UTF-8',
  });
  assert.deepEqual(prepareRequestBody('PATCH', 'text', 'raw=1'), {
    body: 'raw=1',
    contentType: 'text/plain;charset=UTF-8',
  });
  assert.throws(() => prepareRequestBody('POST', 'json', '{oops'), /JSON/);
});

test('detectResponseKind uses content type first and safely sniffs JSON', () => {
  assert.equal(detectResponseKind('application/problem+json', '<html>'), 'json');
  assert.equal(detectResponseKind('text/html;charset=utf-8', '{}'), 'html');
  assert.equal(detectResponseKind('application/xml', '<ok/>'), 'xml');
  assert.equal(detectResponseKind('text/plain', ' [1, 2] '), 'json');
  assert.equal(detectResponseKind('', 'plain response'), 'text');
});

test('formatBytes and trimHistory handle boundaries', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1,023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  assert.equal(formatBytes(Number.NaN), '—');

  const entries = Array.from({ length: 15 }, (_, id) => ({ id }));
  const result = trimHistory(entries);
  assert.equal(result.length, 12);
  assert.deepEqual(result.map((item) => item.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.notEqual(result, entries);
});
