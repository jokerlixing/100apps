const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./route-core.js');

const fixedNow = () => Date.parse('2026-08-31T02:00:00.000Z');

test('normalizes public HTTP URLs and rejects unsafe protocols or credentials', () => {
  assert.equal(core.normalizeUrl('example.com/path'), 'https://example.com/path');
  assert.equal(core.normalizeUrl('http://example.com/a?b=1'), 'http://example.com/a?b=1');
  assert.throws(() => core.normalizeUrl('javascript:alert(1)'), /http/);
  assert.throws(() => core.normalizeUrl('https://user:secret@example.com'), /账号或密码/);
});

test('validates aliases and protects reserved routes', () => {
  assert.equal(core.validateSlug('Autumn Route'), 'autumn-route');
  assert.equal(core.validateSlug('-broken-'), 'broken');
  assert.throws(() => core.validateSlug('xy'), /至少/);
  assert.throws(() => core.validateSlug('api'), /保留/);
  assert.throws(() => core.validateSlug('---'), /至少/);
});

test('creates deterministic unique links and detects collisions', () => {
  const random = () => 0;
  const first = core.createLink({ target: 'example.com/path', label: '', campaign: '' }, [], { now: fixedNow, random });
  assert.equal(first.slug, 'example-2222');
  assert.equal(first.label, 'example.com');
  assert.equal(first.active, true);

  const custom = core.createLink({ target: 'https://example.com', slug: 'launch-day', label: '发布日' }, [first], { now: fixedNow, random });
  assert.equal(custom.slug, 'launch-day');
  assert.throws(
    () => core.createLink({ target: 'https://example.org', slug: 'launch-day' }, [custom], { now: fixedNow, random }),
    /占用/,
  );
});

test('records visits without mutating the original route', () => {
  const link = core.createLink({ target: 'https://example.com', slug: 'safe-route' }, [], { now: fixedNow, random: () => 0 });
  const updated = core.recordVisit(link, { source: '微信', device: '手机' }, fixedNow);
  assert.equal(link.visits.length, 0);
  assert.equal(updated.visits.length, 1);
  assert.equal(updated.visits[0].source, '微信');
});

test('aggregates seven-day traffic, sources and devices', () => {
  const link = {
    id: 'route_1', slug: 'weekly-route', target: 'https://example.com/', label: 'Weekly',
    campaign: 'test', active: true, createdAt: '2026-08-01T00:00:00.000Z',
    visits: [
      { at: '2026-08-31T01:00:00.000Z', source: '微信', device: '手机' },
      { at: '2026-08-30T01:00:00.000Z', source: '微信', device: '桌面' },
      { at: '2026-08-20T01:00:00.000Z', source: '邮件', device: '桌面' },
    ],
  };
  const result = core.aggregateLink(link, fixedNow());
  assert.equal(result.total, 3);
  assert.equal(result.last7, 2);
  assert.equal(result.today, 1);
  assert.deepEqual(result.sources[0], { name: '微信', count: 2 });
  assert.equal(result.days.at(-1).count, 1);
});

test('classifies common sources and device families', () => {
  assert.equal(core.classifySource({ source: 'wechat' }), '微信');
  assert.equal(core.classifySource({ referer: 'https://www.xiaohongshu.com/explore' }), '小红书');
  assert.equal(core.classifySource({}), '直接访问');
  assert.equal(core.classifyDevice('Mozilla/5.0 (iPhone; Mobile)'), '手机');
  assert.equal(core.classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), '桌面');
});

test('repairs invalid workspaces and removes duplicate aliases', () => {
  const workspace = core.seedWorkspace(fixedNow());
  const duplicate = { ...workspace.links[0], id: 'duplicate' };
  const normalized = core.normalizeWorkspace({ links: [...workspace.links, duplicate, { broken: true }] });
  assert.equal(normalized.version, core.STORAGE_VERSION);
  assert.equal(normalized.links.length, workspace.links.length);
});
