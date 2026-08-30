const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_COLOR,
  createNote,
  updateNote,
  duplicateNote,
  filterNotes,
  exportNotebook,
  importNotebook,
} = require('./note-core.js');

const at = '2026-08-31T02:00:00.000Z';

test('creates a normalized note with deterministic metadata', () => {
  const note = createNote({ title: '  发布清单  ', body: '检查构建' }, { id: 'note-1', now: at });

  assert.deepEqual(note, {
    id: 'note-1',
    title: '发布清单',
    body: '检查构建',
    color: DEFAULT_COLOR,
    pinned: false,
    archived: false,
    createdAt: at,
    updatedAt: at,
  });
});

test('updates editable fields without replacing identity or creation time', () => {
  const original = createNote({ title: '旧标题' }, { id: 'note-2', now: at });
  const updated = updateNote(original, {
    title: '  新标题  ',
    body: '补充内容',
    color: 'coral',
    pinned: true,
  }, '2026-08-31T03:00:00.000Z');

  assert.equal(updated.id, original.id);
  assert.equal(updated.createdAt, at);
  assert.equal(updated.updatedAt, '2026-08-31T03:00:00.000Z');
  assert.equal(updated.title, '新标题');
  assert.equal(updated.color, 'coral');
  assert.equal(updated.pinned, true);
});

test('duplicates a note as an active unpinned copy', () => {
  const original = createNote({ title: '会议问题', body: '确认范围', pinned: true, archived: true }, { id: 'note-3', now: at });
  const copy = duplicateNote(original, { id: 'note-4', now: '2026-08-31T04:00:00.000Z' });

  assert.equal(copy.id, 'note-4');
  assert.equal(copy.title, '会议问题 · 副本');
  assert.equal(copy.body, original.body);
  assert.equal(copy.pinned, false);
  assert.equal(copy.archived, false);
});

test('filters active notes by title or body and sorts pinned notes first', () => {
  const notes = [
    createNote({ title: '部署', body: '更新 Pages' }, { id: 'a', now: '2026-08-31T01:00:00.000Z' }),
    createNote({ title: '复盘', body: '记录部署结果', pinned: true }, { id: 'b', now: '2026-08-31T00:00:00.000Z' }),
    createNote({ title: '旧部署', archived: true }, { id: 'c', now: '2026-08-31T05:00:00.000Z' }),
  ];

  assert.deepEqual(filterNotes(notes, { query: '部署', scope: 'active' }).map((note) => note.id), ['b', 'a']);
  assert.deepEqual(filterNotes(notes, { scope: 'pinned' }).map((note) => note.id), ['b']);
  assert.deepEqual(filterNotes(notes, { scope: 'archived' }).map((note) => note.id), ['c']);
});

test('exports and imports a versioned notebook without trusting unknown fields', () => {
  const notes = [createNote({ title: '备份', body: '只保存在本机' }, { id: 'safe', now: at })];
  const json = exportNotebook(notes, '2026-08-31T05:00:00.000Z');
  const parsed = JSON.parse(json);
  parsed.notes[0].unexpected = '<script>alert(1)</script>';

  const restored = importNotebook(JSON.stringify(parsed), { now: '2026-08-31T06:00:00.000Z' });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, '备份');
  assert.equal('unexpected' in restored[0], false);
});

test('rejects malformed or unsupported notebook backups', () => {
  assert.throws(() => importNotebook('{not json'), /备份文件/);
  assert.throws(() => importNotebook(JSON.stringify({ version: 99, notes: [] })), /版本/);
  assert.throws(() => importNotebook(JSON.stringify({ version: 1, notes: 'wrong' })), /备份文件/);
});
