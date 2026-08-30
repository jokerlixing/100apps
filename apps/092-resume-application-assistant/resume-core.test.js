const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./resume-core.js');

const NOW = '2026-08-31T02:50:00.000Z';

const rawProfile = {
  name: '  林星  ',
  headline: ' 产品经理 / 增长方向 ',
  email: ' star@example.com ',
  phone: ' 138 0000 0000 ',
  location: ' 上海 ',
  summary: '5 年 B2B 产品经验，习惯用数据分析定位增长机会。',
  skills: '产品策略，用户研究, 数据分析\nSQL，A/B 测试，SQL',
  education: '海岸大学 · 信息管理 · 本科 · 2017',
  experiences: [{
    id: ' exp-main ',
    role: ' 高级产品经理 ',
    company: ' 北斗科技 ',
    period: '2022 — 至今',
    bullets: '负责 B2B SaaS 产品策略与路线图\n通过用户研究重构激活流程，转化率提升 18%\n使用 SQL 和 A/B 测试验证增长假设',
  }],
  projects: [{
    id: 'project-growth',
    name: '增长实验台',
    role: '项目负责人',
    bullets: ['统一 6 条业务线的实验口径', '把复盘周期从两周缩短到三天'],
    tags: '数据分析, A/B 测试',
  }],
};

test('normalizes a master profile without trusting unknown fields', () => {
  const profile = Core.normalizeProfile({ ...rawProfile, unknown: '<script>alert(1)</script>' });

  assert.equal(profile.name, '林星');
  assert.equal(profile.email, 'star@example.com');
  assert.deepEqual(profile.skills, ['产品策略', '用户研究', '数据分析', 'SQL', 'A/B 测试']);
  assert.deepEqual(profile.experiences[0].bullets, [
    '负责 B2B SaaS 产品策略与路线图',
    '通过用户研究重构激活流程，转化率提升 18%',
    '使用 SQL 和 A/B 测试验证增长假设',
  ]);
  assert.equal(profile.experiences[0].id, 'exp-main');
  assert.equal('unknown' in profile, false);
});

test('extracts stable, unique job keywords from Chinese and Latin text', () => {
  const keywords = Core.extractKeywords(
    '寻找增长产品经理，负责 B2B SaaS 产品策略、用户研究、SQL 数据分析和 A/B 测试。SQL 是加分项。',
    ['产品策略', '用户研究', '数据分析', 'SQL', 'A/B 测试'],
  );

  assert.deepEqual(keywords.slice(0, 7), ['B2B', 'SaaS', 'SQL', 'A/B 测试', '产品策略', '用户研究', '数据分析']);
  assert.equal(new Set(keywords.map((keyword) => keyword.toLocaleLowerCase())).size, keywords.length);
});

test('scores only evidence that exists in the master profile', () => {
  const profile = Core.normalizeProfile(rawProfile);
  const result = Core.scoreProfile(profile, '岗位需要产品策略、用户研究、SQL、Python 和团队管理经验。');

  assert.deepEqual(result.matched, ['SQL', '产品策略', '用户研究']);
  assert.deepEqual(result.missing, ['Python', '团队管理']);
  assert.equal(result.score, 60);
  assert.equal(result.total, 5);
});

test('generates a deterministic snapshot and ranks relevant content first', () => {
  const profile = Core.normalizeProfile({
    ...rawProfile,
    experiences: [
      { id: 'exp-ops', role: '运营专员', company: '远山', period: '2018 — 2020', bullets: ['维护活动排期'] },
      ...rawProfile.experiences,
    ],
  });
  const version = Core.generateVersion(profile, {
    company: '星轨数据',
    role: '增长产品经理',
    jobText: '需要 B2B SaaS、产品策略、用户研究、SQL、Python 和团队管理能力。',
  }, { id: 'version-92', now: NOW });

  assert.equal(version.id, 'version-92');
  assert.equal(version.title, '星轨数据 · 增长产品经理');
  assert.equal(version.status, 'draft');
  assert.equal(version.score, 71);
  assert.equal(version.profile.experiences[0].id, 'exp-main');
  assert.deepEqual(version.profile.skills.slice(0, 3), ['产品策略', '用户研究', 'SQL']);
  assert.deepEqual(version.missingKeywords, ['Python', '团队管理']);
  assert.equal(version.createdAt, NOW);
  assert.equal(version.updatedAt, NOW);

  profile.name = '改名不会污染快照';
  assert.equal(version.profile.name, '林星');
});

test('recuts a version from the latest master while retaining identity and application state', () => {
  const profile = Core.normalizeProfile(rawProfile);
  const first = Core.generateVersion(profile, {
    company: '星轨数据', role: '增长产品经理', jobText: '需要 SQL 和 Python',
  }, { id: 'stable-id', now: NOW });
  const changed = Core.normalizeProfile({ ...rawProfile, skills: [...profile.skills, 'Python'] });
  const recut = Core.recutVersion(
    { ...first, title: 'A 轮重点版本', status: 'interview' },
    changed,
    { now: '2026-08-31T03:00:00.000Z' },
  );

  assert.equal(recut.id, 'stable-id');
  assert.equal(recut.title, 'A 轮重点版本');
  assert.equal(recut.status, 'interview');
  assert.equal(recut.createdAt, NOW);
  assert.equal(recut.updatedAt, '2026-08-31T03:00:00.000Z');
  assert.equal(recut.score, 100);
  assert.deepEqual(recut.missingKeywords, []);
});

test('renders a plain-text resume without internal metadata', () => {
  const version = Core.generateVersion(Core.normalizeProfile(rawProfile), {
    company: '星轨数据', role: '增长产品经理', jobText: 'SQL 用户研究',
  }, { id: 'copy-me', now: NOW });
  const text = Core.resumeToText(version);

  assert.match(text, /^林星\n产品经理 \/ 增长方向/m);
  assert.match(text, /工作经历\n高级产品经理 · 北斗科技/);
  assert.match(text, /增长实验台/);
  assert.doesNotMatch(text, /copy-me|draft|星轨数据/);
});

test('exports and imports a versioned workspace through an allowlist', () => {
  const profile = Core.normalizeProfile(rawProfile);
  const version = Core.generateVersion(profile, {
    company: '星轨数据', role: '增长产品经理', jobText: 'SQL 用户研究',
  }, { id: 'kept', now: NOW });
  const json = Core.exportWorkspace({ profile, versions: [version], activeVersionId: 'kept' }, NOW);
  const parsed = JSON.parse(json);
  parsed.profile.injection = '<img src=x onerror=alert(1)>';
  parsed.versions[0].profile.injection = 'nope';
  const restored = Core.importWorkspace(JSON.stringify(parsed));

  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.activeVersionId, 'kept');
  assert.equal(restored.versions.length, 1);
  assert.equal('injection' in restored.profile, false);
  assert.equal('injection' in restored.versions[0].profile, false);
});

test('rejects malformed or unsupported workspace backups', () => {
  assert.throws(() => Core.importWorkspace('{broken'), /备份文件/);
  assert.throws(() => Core.importWorkspace(JSON.stringify({ schemaVersion: 99, profile: {} })), /版本/);
  assert.throws(() => Core.importWorkspace(JSON.stringify({ schemaVersion: 1, profile: {}, versions: 'wrong' })), /备份文件/);
  assert.throws(() => Core.generateVersion(Core.normalizeProfile({}), { role: '', jobText: '' }), /岗位名称/);
});
