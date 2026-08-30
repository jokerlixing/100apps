const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./board-core.js');

const NOW = '2026-08-31T00:00:00.000Z';

function emptyState() {
  const state = Core.createDefaultState({ now: NOW });
  return { ...state, tasks: [], activity: [] };
}

test('default state contains a realistic four-stage project board', () => {
  const state = Core.createDefaultState({ now: NOW });

  assert.equal(state.version, 1);
  assert.equal(state.project.name, '城市骑行路线发布');
  assert.equal(state.members.length, 4);
  assert.ok(state.tasks.length >= 8);
  assert.deepEqual(new Set(state.tasks.map((task) => task.status)), new Set(Core.STATUSES));
  assert.equal(Core.getStats(state, { now: NOW }).total, state.tasks.length);
});

test('createTask validates input, assigns deterministic metadata, and does not mutate source', () => {
  const source = emptyState();
  const result = Core.createTask(source, {
    title: '  验证夜骑路线  ',
    description: '检查照明与补给点',
    status: 'planned',
    priority: 'high',
    memberId: 'member-lin',
    dueDate: '2026-09-02',
    tags: ['路线', ' QA ', '路线'],
  }, { id: 'task-new', now: NOW });

  assert.equal(source.tasks.length, 0);
  assert.equal(result.task.title, '验证夜骑路线');
  assert.equal(result.task.id, 'task-new');
  assert.deepEqual(result.task.tags, ['路线', 'QA']);
  assert.equal(result.task.order, 0);
  assert.equal(result.state.activity[0].taskId, 'task-new');
  assert.throws(() => Core.createTask(source, { title: '   ' }, { id: 'x', now: NOW }), /标题/);
  assert.throws(() => Core.createTask(source, { title: 'x'.repeat(81) }, { id: 'x', now: NOW }), /80/);
  assert.throws(() => Core.createTask(source, { title: 'x', memberId: 'ghost' }, { id: 'x', now: NOW }), /成员/);
});

test('updateTask cleans values and preserves id and creation time', () => {
  const created = Core.createTask(emptyState(), { title: '旧标题' }, { id: 'task-a', now: NOW });
  const updated = Core.updateTask(created.state, 'task-a', {
    title: '  新标题 ',
    description: '  具体说明 ',
    priority: 'urgent',
    memberId: 'member-qiao',
  }, { now: '2026-08-31T01:00:00.000Z' });

  assert.equal(updated.task.id, 'task-a');
  assert.equal(updated.task.createdAt, NOW);
  assert.equal(updated.task.updatedAt, '2026-08-31T01:00:00.000Z');
  assert.equal(updated.task.title, '新标题');
  assert.equal(updated.task.description, '具体说明');
  assert.equal(updated.state.activity.at(-1).type, 'updated');
});

test('moveTask supports cross-column and indexed reorder with completion timestamps', () => {
  let state = emptyState();
  state = Core.createTask(state, { title: 'A', status: 'inbox' }, { id: 'a', now: NOW }).state;
  state = Core.createTask(state, { title: 'B', status: 'planned' }, { id: 'b', now: NOW }).state;
  state = Core.createTask(state, { title: 'C', status: 'planned' }, { id: 'c', now: NOW }).state;

  state = Core.moveTask(state, 'a', 'planned', 1, { now: '2026-08-31T02:00:00.000Z' }).state;
  assert.deepEqual(state.tasks.filter((task) => task.status === 'planned').sort((a, b) => a.order - b.order).map((task) => task.id), ['b', 'a', 'c']);

  state = Core.moveTask(state, 'a', 'done', 0, { now: '2026-08-31T03:00:00.000Z' }).state;
  assert.equal(state.tasks.find((task) => task.id === 'a').completedAt, '2026-08-31T03:00:00.000Z');

  state = Core.moveTask(state, 'a', 'doing', 0, { now: '2026-08-31T04:00:00.000Z' }).state;
  assert.equal(state.tasks.find((task) => task.id === 'a').completedAt, '');
  assert.throws(() => Core.moveTask(state, 'a', 'missing', 0, { now: NOW }), /状态/);
});

test('deleteTask removes one card and records the event', () => {
  const created = Core.createTask(emptyState(), { title: '待删除' }, { id: 'task-delete', now: NOW });
  const deleted = Core.deleteTask(created.state, 'task-delete', { now: '2026-08-31T05:00:00.000Z' });

  assert.equal(deleted.state.tasks.length, 0);
  assert.equal(deleted.task.id, 'task-delete');
  assert.match(deleted.state.activity.at(-1).message, /待删除/);
  assert.throws(() => Core.deleteTask(deleted.state, 'task-delete', { now: NOW }), /不存在/);
});

test('filterTasks combines text, member and priority without changing board order', () => {
  const state = Core.createDefaultState({ now: NOW });
  const memberTask = state.tasks.find((task) => task.memberId);
  const query = memberTask.title.slice(0, 2);
  const result = Core.filterTasks(state, {
    query,
    memberId: memberTask.memberId,
    priority: memberTask.priority,
  });

  assert.ok(result.some((task) => task.id === memberTask.id));
  assert.ok(result.every((task) => task.memberId === memberTask.memberId));
  assert.ok(result.every((task) => task.priority === memberTask.priority));
  assert.deepEqual(result, [...result].sort((a, b) => Core.STATUSES.indexOf(a.status) - Core.STATUSES.indexOf(b.status) || a.order - b.order));
});

test('getStats reports completion and overdue work against an injected date', () => {
  const state = {
    ...emptyState(),
    tasks: [
      { id: 'a', title: 'done', status: 'done', priority: 'low', memberId: '', dueDate: '2026-08-01', tags: [], description: '', createdAt: NOW, updatedAt: NOW, completedAt: NOW, order: 0 },
      { id: 'b', title: 'late', status: 'doing', priority: 'high', memberId: '', dueDate: '2026-08-30', tags: [], description: '', createdAt: NOW, updatedAt: NOW, completedAt: '', order: 0 },
      { id: 'c', title: 'next', status: 'planned', priority: 'medium', memberId: '', dueDate: '2026-09-02', tags: [], description: '', createdAt: NOW, updatedAt: NOW, completedAt: '', order: 0 },
    ],
  };
  const stats = Core.getStats(state, { now: NOW });

  assert.deepEqual(stats, { total: 3, done: 1, doing: 1, overdue: 1, completionPercent: 33 });
});

test('sanitizeState rejects unusable roots and cleans imported members, tasks and activity', () => {
  assert.throws(() => Core.sanitizeState(null, { now: NOW }), /看板/);
  assert.throws(() => Core.sanitizeState({ members: [], tasks: [] }, { now: NOW }), /成员/);

  const imported = Core.sanitizeState({
    version: 99,
    project: { name: '<b>发布台</b>', sprint: '  Sprint 9 ' },
    members: [
      { id: 'm1', name: '  林青 ', role: '设计', color: '#123456' },
      { id: 'm1', name: '重复', role: '无效' },
    ],
    tasks: [
      { id: 't1', title: '  路线图 ', status: 'doing', priority: 'urgent', memberId: 'm1', dueDate: '2026-09-01', tags: ['图'] },
      { id: 't2', title: '', status: 'bad' },
    ],
    activity: Array.from({ length: 90 }, (_, index) => ({ id: `a${index}`, message: `记录 ${index}`, at: NOW })),
  }, { now: NOW });

  assert.equal(imported.version, 1);
  assert.equal(imported.project.name, '<b>发布台</b>');
  assert.equal(imported.members.length, 1);
  assert.equal(imported.members[0].initials, '林青');
  assert.equal(imported.tasks.length, 1);
  assert.equal(imported.tasks[0].memberId, 'm1');
  assert.equal(imported.activity.length, 80);
});

test('activity history is capped at eighty newest entries', () => {
  let state = emptyState();
  for (let index = 0; index < 85; index += 1) {
    state = Core.createTask(state, { title: `任务 ${index}` }, { id: `task-${index}`, now: `2026-08-31T00:${String(index % 60).padStart(2, '0')}:00.000Z` }).state;
  }

  assert.equal(state.activity.length, 80);
  assert.equal(state.activity[0].taskId, 'task-5');
  assert.equal(state.activity.at(-1).taskId, 'task-84');
});
