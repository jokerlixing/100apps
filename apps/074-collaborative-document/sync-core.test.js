const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LIMITS,
  normalizeRoom,
  normalizeName,
  createInitialState,
  validateDocumentInput,
  applyDocumentUpdate,
  restoreVersion,
  toClientState,
} = require('./sync-core');

test('room and member names are normalized to bounded public identifiers', () => {
  assert.equal(normalizeRoom('  launch notes / 74  '), 'LAUNCH-NOTES-74');
  assert.equal(normalizeRoom('***'), 'GALLEY-74');
  assert.equal(normalizeRoom('a'.repeat(80)).length, LIMITS.room);
  assert.equal(normalizeName('  林 星  '), '林 星');
  assert.equal(normalizeName(''), '匿名校对员');
  assert.equal(normalizeName('a'.repeat(80)).length, LIMITS.name);
});

test('initial room state contains a safe welcome draft and no history', () => {
  const state = createInitialState('launch-74', '2026-08-31T00:00:00.000Z');
  assert.equal(state.room, 'LAUNCH-74');
  assert.equal(state.revision, 0);
  assert.match(state.title, /协作/);
  assert.match(state.content, /^<h1>/);
  assert.deepEqual(state.comments, []);
  assert.deepEqual(state.history, []);
});

test('document input trims fields and rejects executable markup', () => {
  const valid = validateDocumentInput({
    title: '  发布说明  ',
    content: '<h1>发布说明</h1><p>第一版正文</p>',
    comments: [{ id: 'note-1', text: '  补充日期 ', quote: '第一版', author: ' 林星 ', createdAt: '2026-08-31T00:01:00.000Z', resolved: false }],
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.value.title, '发布说明');
  assert.equal(valid.value.comments[0].text, '补充日期');
  assert.equal(valid.value.comments[0].author, '林星');

  const proseWithProtocolWord = validateDocumentInput({
    title: '数据说明',
    content: '<p>原始记录写作 data: 42，不应被当成 URL。</p>',
    comments: [],
  });
  assert.equal(proseWithProtocolWord.ok, true);

  for (const content of [
    '<script>alert(1)</script>',
    '<p onclick="alert(1)">正文</p>',
    '<a href="javascript:alert(1)">链接</a>',
    '<img src=data:text/html;base64,PHNjcmlwdD4+>',
  ]) {
    const result = validateDocumentInput({ title: '危险稿件', content, comments: [] });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unsafe_content');
  }
});

test('accepted updates increment revision and preserve a bounded history', () => {
  let state = createInitialState('ROOM-74', '2026-08-31T00:00:00.000Z');
  for (let index = 0; index < LIMITS.history + 3; index += 1) {
    const result = applyDocumentUpdate(state, {
      baseRevision: state.revision,
      title: `稿件 ${index + 1}`,
      content: `<p>版本 ${index + 1}</p>`,
      comments: [],
    }, { id: 'member-1', name: '林星' }, `2026-08-31T00:${String(index + 1).padStart(2, '0')}:00.000Z`);
    assert.equal(result.ok, true);
    state = result.state;
  }

  assert.equal(state.revision, LIMITS.history + 3);
  assert.equal(state.updatedBy, '林星');
  assert.equal(state.history.length, LIMITS.history);
  assert.equal(state.history.at(-1).revision, state.revision - 1);
});

test('stale updates are rejected with the authoritative client snapshot', () => {
  const state = createInitialState('ROOM-74', '2026-08-31T00:00:00.000Z');
  const result = applyDocumentUpdate(state, {
    baseRevision: 9,
    title: '旧稿',
    content: '<p>旧内容</p>',
    comments: [],
  }, { id: 'member-2', name: '陈晨' }, '2026-08-31T00:02:00.000Z');

  assert.equal(result.ok, false);
  assert.equal(result.code, 'revision_conflict');
  assert.equal(result.state.revision, 0);
});

test('a stored version can be restored as a new revision', () => {
  let state = createInitialState('ROOM-74', '2026-08-31T00:00:00.000Z');
  state = applyDocumentUpdate(state, {
    baseRevision: 0,
    title: '第二版',
    content: '<p>第二版正文</p>',
    comments: [],
  }, { id: 'member-1', name: '林星' }, '2026-08-31T00:01:00.000Z').state;

  const result = restoreVersion(state, {
    baseRevision: 1,
    targetRevision: 0,
  }, { id: 'member-2', name: '陈晨' }, '2026-08-31T00:02:00.000Z');

  assert.equal(result.ok, true);
  assert.equal(result.state.revision, 2);
  assert.match(result.state.content, /一起编辑/);
  assert.equal(result.state.updatedBy, '陈晨');
});

test('client snapshots expose version metadata without historical document bodies', () => {
  let state = createInitialState('ROOM-74', '2026-08-31T00:00:00.000Z');
  state = applyDocumentUpdate(state, {
    baseRevision: 0,
    title: '第二版',
    content: '<p>第二版正文</p>',
    comments: [],
  }, { id: 'member-1', name: '林星' }, '2026-08-31T00:01:00.000Z').state;

  const snapshot = toClientState(state);
  assert.equal(snapshot.versions.length, 1);
  assert.equal(snapshot.versions[0].revision, 0);
  assert.equal(Object.hasOwn(snapshot.versions[0], 'content'), false);
  assert.equal(Object.hasOwn(snapshot, 'history'), false);
});
