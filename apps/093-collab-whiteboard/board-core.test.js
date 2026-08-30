const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./board-core.js');

function ids() {
  let value = 0;
  return (prefix = 'item') => `${prefix}-${++value}`;
}

test('creates a versioned room and unique board objects', () => {
  const nextId = ids();
  const board = Core.createBoard({ roomId: 'ALPHA-93', title: '产品启动会', now: 10 });
  const first = Core.createObject('sticky', { x: 120, y: 90, text: '定义目标' }, nextId);
  const second = Core.createObject('sticky', { x: 360, y: 90, text: '确认范围' }, nextId);
  const updated = Core.addObject(Core.addObject(board, first, 20), second, 30);

  assert.equal(updated.version, 1);
  assert.equal(updated.roomId, 'ALPHA-93');
  assert.deepEqual(updated.objects.map((item) => item.id), ['sticky-1', 'sticky-2']);
  assert.equal(updated.revision, 2);
  assert.equal(board.objects.length, 0, 'state operations should not mutate prior boards');
});

test('updates, duplicates, and removes objects immutably', () => {
  const nextId = ids();
  const board = Core.addObject(
    Core.createBoard({ roomId: 'ROOM-1', now: 1 }),
    Core.createObject('note', { text: '旧标题', x: 20, y: 40 }, nextId),
    2,
  );

  const changed = Core.updateObject(board, 'note-1', { text: '新标题', x: 80 }, 3);
  const duplicated = Core.duplicateObject(changed, 'note-1', nextId, 4);
  const removed = Core.removeObject(duplicated, 'note-1', 5);

  assert.equal(board.objects[0].text, '旧标题');
  assert.equal(changed.objects[0].x, 80);
  assert.equal(duplicated.objects[1].id, 'note-2');
  assert.equal(duplicated.objects[1].x, 108);
  assert.deepEqual(removed.objects.map((item) => item.id), ['note-2']);
});

test('instantiates every named template with fresh IDs and valid content', () => {
  const nextId = ids();
  const templates = Core.listTemplates();

  assert.deepEqual(templates.map((item) => item.id), ['blank', 'kickoff', 'retro', 'journey']);

  const kickoff = Core.instantiateTemplate('kickoff', {
    roomId: 'KICK-93',
    now: 100,
    idFactory: nextId,
  });

  assert.equal(kickoff.templateId, 'kickoff');
  assert.equal(kickoff.objects.length >= 8, true);
  assert.equal(new Set(kickoff.objects.map((item) => item.id)).size, kickoff.objects.length);
  assert.equal(Core.validateBoard(kickoff).ok, true);
});

test('history supports undo, redo, branch replacement, and a bounded past', () => {
  let history = Core.createHistory(Core.createBoard({ roomId: 'HISTORY', now: 1 }), 2);
  history = Core.commitHistory(history, { ...history.present, title: 'A' });
  history = Core.commitHistory(history, { ...history.present, title: 'B' });
  history = Core.commitHistory(history, { ...history.present, title: 'C' });

  assert.equal(history.past.length, 2);
  history = Core.undoHistory(history);
  assert.equal(history.present.title, 'B');
  history = Core.redoHistory(history);
  assert.equal(history.present.title, 'C');
  history = Core.undoHistory(history);
  history = Core.commitHistory(history, { ...history.present, title: 'D' });
  assert.equal(history.future.length, 0);
  assert.equal(history.present.title, 'D');
});

test('parses valid imports and rejects malformed or unsafe board data', () => {
  const board = Core.instantiateTemplate('blank', { roomId: 'SAFE-93', now: 1, idFactory: ids() });
  const parsed = Core.parseBoardJson(JSON.stringify(board));
  assert.equal(parsed.roomId, 'SAFE-93');

  assert.throws(() => Core.parseBoardJson('{broken'), /有效的 JSON/);
  assert.throws(
    () => Core.parseBoardJson(JSON.stringify({ ...board, version: 99 })),
    /版本/,
  );
  assert.throws(
    () => Core.parseBoardJson(JSON.stringify({ ...board, objects: [{ id: 'x', type: 'iframe' }] })),
    /不支持的对象类型/,
  );
});

test('calculates padded board bounds while ignoring connectors', () => {
  const objects = [
    { id: 'a', type: 'sticky', x: 100, y: 60, width: 180, height: 140 },
    { id: 'b', type: 'shape', x: 420, y: 300, width: 220, height: 120 },
    { id: 'c', type: 'connector', from: 'a', to: 'b' },
  ];

  assert.deepEqual(Core.getContentBounds(objects, 40), {
    x: 60,
    y: 20,
    width: 620,
    height: 440,
  });
  assert.deepEqual(Core.getContentBounds([], 40), { x: 0, y: 0, width: 1200, height: 760 });
});

test('normalizes room codes for stable storage and channel names', () => {
  assert.equal(Core.normalizeRoomCode('  产品 room 93!  '), 'ROOM-93');
  assert.equal(Core.normalizeRoomCode('alpha_beta'), 'ALPHA-BETA');
  assert.equal(Core.normalizeRoomCode(''), 'ROOM-93');
});
