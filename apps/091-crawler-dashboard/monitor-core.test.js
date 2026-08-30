const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LIMITS,
  normalizeSource,
  extractAtPath,
  canonicalize,
  fingerprint,
  compareSnapshots,
  nextRunAt,
  isDue,
  sanitizeImport
} = require('./monitor-core');

test('normalizes a safe monitor source without keeping unknown fields', () => {
  assert.deepEqual(normalizeSource({
    id: '  status-api  ',
    name: '  城市服务状态  ',
    url: 'https://status.example.com/api.json',
    format: 'json',
    path: ' data.current ',
    intervalMinutes: '8',
    enabled: true,
    notify: 1,
    secret: 'must not survive'
  }), {
    id: 'status-api',
    name: '城市服务状态',
    url: 'https://status.example.com/api.json',
    format: 'json',
    path: 'data.current',
    intervalMinutes: 8,
    enabled: true,
    notify: true
  });

  assert.throws(() => normalizeSource({ id: 'x', name: '', url: 'javascript:alert(1)' }), { code: 'INVALID_SOURCE' });
  assert.throws(() => normalizeSource({ id: 'source-one', name: '测试', url: 'file:///secret' }), { code: 'INVALID_URL' });
});

test('extracts dotted JSON paths including array indexes and rejects unsafe paths', () => {
  const payload = { data: { services: [{ name: 'api', status: 'up' }] } };
  assert.deepEqual(extractAtPath(payload, ''), payload);
  assert.equal(extractAtPath(payload, 'data.services.0.status'), 'up');
  assert.throws(() => extractAtPath(payload, 'data.services.2.status'), { code: 'PATH_NOT_FOUND' });
  assert.throws(() => extractAtPath(payload, '__proto__.polluted'), { code: 'INVALID_PATH' });
});

test('canonical serialization and fingerprints are stable across object key order', () => {
  const first = { ok: true, count: 3, nested: { b: 2, a: 1 } };
  const second = { nested: { a: 1, b: 2 }, count: 3, ok: true };
  assert.equal(canonicalize(first), canonicalize(second));
  assert.equal(fingerprint(first), fingerprint(second));
  assert.match(fingerprint(first), /^fnv1a-[0-9a-f]{8}$/);
  assert.notEqual(fingerprint(first), fingerprint({ ...first, count: 4 }));
});

test('reports nested JSON additions, removals and modifications', () => {
  const result = compareSnapshots(
    { status: 'up', metrics: { latency: 82, region: 'cn-east' }, notices: ['维护中'] },
    { status: 'degraded', metrics: { latency: 146 }, notices: ['维护中', '晚高峰'] },
    'json'
  );

  assert.equal(result.changed, true);
  assert.equal(result.kind, 'changed');
  assert.match(result.summary, /4 个字段/);
  assert.deepEqual(result.changes.map((change) => [change.type, change.path]), [
    ['modified', 'metrics.latency'],
    ['removed', 'metrics.region'],
    ['added', 'notices[1]'],
    ['modified', 'status']
  ]);

  const stable = compareSnapshots({ a: 1, b: 2 }, { b: 2, a: 1 }, 'json');
  assert.equal(stable.changed, false);
  assert.equal(stable.kind, 'stable');
  assert.deepEqual(stable.changes, []);
});

test('reports useful line changes for text snapshots', () => {
  const result = compareSnapshots('第一行\r\n旧公告\n末行', '第一行\n新公告\n末行\n追加通知', 'text');
  assert.equal(result.changed, true);
  assert.match(result.summary, /新增 2 行/);
  assert.match(result.summary, /移除 1 行/);
  assert.deepEqual(result.changes.slice(0, 3).map(({ type, after, before }) => ({ type, after, before })), [
    { type: 'removed', after: '', before: '旧公告' },
    { type: 'added', after: '新公告', before: '' },
    { type: 'added', after: '追加通知', before: '' }
  ]);
});

test('treats the first snapshot as an initial observation', () => {
  const result = compareSnapshots(undefined, { status: 'up' }, 'json');
  assert.equal(result.changed, false);
  assert.equal(result.kind, 'initial');
  assert.equal(result.changes.length, 0);
});

test('calculates due times and never schedules disabled sources', () => {
  assert.equal(nextRunAt('2026-08-31T01:00:00.000Z', 5, true), '2026-08-31T01:05:00.000Z');
  assert.equal(nextRunAt('2026-08-31T01:00:00.000Z', 5, false), null);
  assert.equal(nextRunAt(null, 5, true), null);
  assert.equal(isDue({ enabled: true, intervalMinutes: 5, lastRunAt: null }, '2026-08-31T01:00:00.000Z'), true);
  assert.equal(isDue({ enabled: false, intervalMinutes: 5, lastRunAt: null }, '2026-08-31T01:00:00.000Z'), false);
  assert.equal(isDue({ enabled: true, intervalMinutes: 5, lastRunAt: '2026-08-31T01:00:00.000Z' }, '2026-08-31T01:04:59.000Z'), false);
  assert.equal(isDue({ enabled: true, intervalMinutes: 5, lastRunAt: '2026-08-31T01:00:00.000Z' }, '2026-08-31T01:05:00.000Z'), true);
});

test('sanitizes imported state, removes duplicates and enforces history caps', () => {
  const raw = {
    schemaVersion: 1,
    settings: { selectedId: 'source-a', filter: 'changed', unsafe: '<script>' },
    sources: [
      {
        id: 'source-a', name: 'A', url: 'demo://alpha', format: 'json', intervalMinutes: 1,
        lastRunAt: '2026-08-31T01:00:00.000Z', lastStatus: 'changed',
        lastSnapshot: { value: 2 }, lastFingerprint: 'fnv1a-12345678',
        samples: Array.from({ length: LIMITS.samples + 10 }, (_, index) => ({ at: `2026-08-31T01:${String(index).padStart(2, '0')}:00.000Z`, status: index % 2 ? 'stable' : 'changed' }))
      },
      { id: 'source-a', name: 'Duplicate', url: 'demo://duplicate' },
      { id: 'source-b', name: 'B', url: 'https://example.com/status.txt', format: 'text', enabled: false }
    ],
    events: Array.from({ length: LIMITS.events + 15 }, (_, index) => ({
      id: `event-${index}`, sourceId: 'source-a', at: '2026-08-31T01:00:00.000Z', type: 'stable', summary: `event ${index}`
    }))
  };

  const clean = sanitizeImport(JSON.stringify(raw));
  assert.equal(clean.schemaVersion, 1);
  assert.equal(clean.sources.length, 2);
  assert.equal(clean.sources[0].samples.length, LIMITS.samples);
  assert.equal(clean.events.length, LIMITS.events);
  assert.deepEqual(clean.settings, { selectedId: 'source-a', filter: 'changed' });
  assert.equal(clean.sources[1].enabled, false);
  assert.throws(() => sanitizeImport({ schemaVersion: 2, sources: [] }), { code: 'INVALID_IMPORT' });
});
