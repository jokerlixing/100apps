const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./knowledge-core.js');

const notes = [
  {
    id: 'garden',
    title: '知识花园',
    content: '从 [[渐进式总结]] 开始，也别忘了 [[项目复盘]]。再次提到 [[渐进式总结]]。',
    tags: ['方法', '写作'],
    createdAt: '2026-08-29T09:00:00.000Z',
    updatedAt: '2026-08-31T01:00:00.000Z',
  },
  {
    id: 'summary',
    title: '渐进式总结',
    content: '每次重访都压缩信息，并链接回 [[知识花园]]。',
    tags: ['方法'],
    createdAt: '2026-08-29T10:00:00.000Z',
    updatedAt: '2026-08-30T01:00:00.000Z',
  },
  {
    id: 'meeting',
    title: '周会记录',
    content: '把决定沉淀到 [[项目复盘]]。',
    tags: ['工作'],
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-29T01:00:00.000Z',
  },
];

test('extractWikiLinks trims and de-duplicates links without changing display text', () => {
  assert.deepEqual(
    Core.extractWikiLinks('[[ 知识花园 ]] / [[项目复盘]] / [[知识花园]] / [[]]'),
    ['知识花园', '项目复盘'],
  );
});

test('renderMarkdown escapes HTML and renders safe wiki and web links', () => {
  const html = Core.renderMarkdown('# 标题\n<script>alert(1)</script>\n访问 [[知识花园]] 与 [官网](https://example.com?a=1&b=2)。');

  assert.match(html, /<h1>标题<\/h1>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /class="wiki-link"/);
  assert.match(html, /data-note-title="知识花园"/);
  assert.match(html, /href="https:\/\/example\.com\?a=1&amp;b=2"/);
});

test('renderMarkdown refuses executable markdown URLs', () => {
  const html = Core.renderMarkdown('[危险](javascript:alert(1))');
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /危险/);
});

test('searchNotes ranks title matches above body matches and filters tags', () => {
  const result = Core.searchNotes(notes, '知识', '方法');
  assert.deepEqual(result.map((note) => note.id), ['garden', 'summary']);
  assert.deepEqual(Core.searchNotes(notes, '', '工作').map((note) => note.id), ['meeting']);
});

test('getBacklinks finds notes that point to the selected title', () => {
  assert.deepEqual(Core.getBacklinks(notes, notes[0]).map((note) => note.id), ['summary']);
  assert.deepEqual(Core.getBacklinks(notes, { title: '项目复盘' }).map((note) => note.id), ['garden', 'meeting']);
});

test('buildGraph includes resolved edges and one reusable unresolved node', () => {
  const graph = Core.buildGraph(notes);
  const missing = graph.nodes.filter((node) => node.missing);

  assert.deepEqual(missing.map((node) => node.label), ['项目复盘']);
  assert.equal(graph.links.length, 4);
  assert.ok(graph.links.some((link) => link.source === 'garden' && link.target === 'summary'));
  assert.equal(graph.links.filter((link) => link.target === missing[0].id).length, 2);
});

test('renameNote returns new notes and updates exact wiki links everywhere', () => {
  const renamed = Core.renameNote(notes, 'garden', '第二大脑', '2026-08-31T02:00:00.000Z');

  assert.equal(renamed.find((note) => note.id === 'garden').title, '第二大脑');
  assert.match(renamed.find((note) => note.id === 'summary').content, /\[\[第二大脑\]\]/);
  assert.equal(notes[0].title, '知识花园', 'caller-owned notes stay untouched');
});

test('backup round-trip normalizes data and rejects invalid payloads', () => {
  const exported = Core.exportBackup(notes, '2026-08-31T02:00:00.000Z');
  const imported = Core.importBackup(exported);

  assert.equal(imported.notes.length, 3);
  assert.equal(imported.notes[0].title, '知识花园');
  assert.deepEqual(imported.notes[0].tags, ['方法', '写作']);
  assert.throws(() => Core.importBackup('{oops'), /无法解析/);
  assert.throws(() => Core.importBackup(JSON.stringify({ version: 1, notes: [] })), /至少包含一则笔记/);
  assert.throws(
    () => Core.importBackup(JSON.stringify({ version: 1, notes: [{ id: 'x', title: '', content: '' }] })),
    /标题/,
  );
});

test('createNote produces a normalized note with injectable identity and time', () => {
  const note = Core.createNote(
    { title: '  新想法  ', content: '正文', tags: '灵感, 方法, 灵感' },
    { id: 'idea-1', now: '2026-08-31T02:30:00.000Z' },
  );

  assert.deepEqual(note, {
    id: 'idea-1',
    title: '新想法',
    content: '正文',
    tags: ['灵感', '方法'],
    createdAt: '2026-08-31T02:30:00.000Z',
    updatedAt: '2026-08-31T02:30:00.000Z',
  });
});
