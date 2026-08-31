const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('./portfolio-core.js');

const trackerPath = path.resolve(__dirname, '..', '..', 'index.html');

test('parses the root tracker as a safe first-100 project catalog', () => {
  const source = fs.readFileSync(trackerPath, 'utf8');
  const projects = Core.parseTrackerSource(source);

  assert.equal(projects.length, 100);
  assert.equal(projects[0].id, 1);
  assert.equal(projects[99].id, 100);
  assert.equal(projects[99].name, '个人作品集网站');
  assert.equal(projects.some((project) => project.id === 101), false);
  assert.equal(projects[61].status, 'done');
  assert.match(projects[61].link, /^https:\/\//);
  assert.equal(projects.every((project) => project.status === 'done'), true);
  assert.equal(projects.every((project) => project.link.startsWith('https://jokerlixing.github.io/100apps/')), true);
  assert.equal(new Set(projects.map((project) => project.link)).size, 100);
  assert.equal(projects[85].link, 'https://jokerlixing.github.io/100apps/apps/086-cli-weather/');

  projects.forEach((project) => {
    const url = new URL(project.link);
    const relative = decodeURIComponent(url.pathname.replace(/^\/100apps\/?/, '')).replace(/\/$/, '');
    const entry = path.resolve(__dirname, '..', '..', relative, 'index.html');
    assert.equal(fs.existsSync(entry), true, `App ${project.code} deployment must resolve to ${entry}`);
  });
});

test('normalizes text, levels, official state, and only safe public links', () => {
  const projects = Core.normalizeProjects([
    ['  项目 A  ', '  一段   说明  ', '8', 'javascript:alert(1)'],
    ['项目 B', '说明 B', '3', 'https://example.com/demo'],
  ], new Set([1, 2]));

  assert.deepEqual(projects.map(({ id, name, description, level, status, link }) => ({ id, name, description, level, status, link })), [
    { id: 1, name: '项目 A', description: '一段 说明', level: 5, status: 'done', link: '' },
    { id: 2, name: '项目 B', description: '说明 B', level: 3, status: 'done', link: 'https://example.com/demo' },
  ]);
});

test('parses numeric official IDs without evaluating tracker JavaScript', () => {
  const source = `
    const IDEAS=[["一号","说明","1","https://example.com/1"],["二号","说明","2"]];
    const INIT_DONE={1:1,900:false};
    INIT_DONE[2]="done";
  `;
  const projects = Core.parseTrackerSource(source);

  assert.equal(projects[0].status, 'done');
  assert.equal(projects[1].status, 'done');
});

test('filters by text, level, and official status together', () => {
  const projects = Core.normalizeProjects([
    ['天气工具', '命令行天气', 4, 'https://example.com/weather'],
    ['作品集', '全部项目索引', 5, 'https://example.com/work'],
    ['图片工具', '本地图片压缩', 3, ''],
  ], new Set([1, 2]));

  assert.deepEqual(Core.filterProjects(projects, { query: '002', level: '5', status: 'done' }).map((project) => project.id), [2]);
  assert.deepEqual(Core.filterProjects(projects, { query: '图片', level: 'all', status: 'todo' }).map((project) => project.id), [3]);
  assert.deepEqual(Core.filterProjects(projects, { query: '不存在', level: 'all', status: 'all' }), []);
});

test('summarizes the catalog and chooses linked completed evidence', () => {
  const projects = Core.normalizeProjects([
    ['项目 A', '说明', 1, 'https://example.com/a'],
    ['项目 B', '说明', 2, ''],
    ['项目 C', '说明', 3, 'https://example.com/c'],
    ['项目 D', '说明', 4, 'https://example.com/d'],
  ], new Set([1, 3, 4]));

  assert.deepEqual(Core.summarizeProjects(projects), {
    total: 4,
    done: 3,
    linked: 3,
    percent: 75,
    levels: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0 },
  });
  assert.deepEqual(Core.pickFeaturedProjects(projects, [4, 1], 2).map((project) => project.id), [4, 1]);
});

test('rejects malformed tracker payloads with useful errors', () => {
  assert.throws(() => Core.parseTrackerSource('const IDEAS=[];'), /official completion/i);
  assert.throws(() => Core.parseTrackerSource('const INIT_DONE={1:1};'), /project catalog/i);
});
