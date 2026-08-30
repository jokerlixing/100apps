const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./workflow-core.js');

function workflow(overrides = {}) {
  return {
    id: 'wf-test',
    name: '测试线路',
    description: '用于验证执行顺序',
    enabled: true,
    trigger: { type: 'manual', config: {} },
    conditionMode: 'all',
    conditions: [],
    actions: [{ id: 'action-log', type: 'log', config: { message: '订单 {{order.id}}' } }],
    stats: { runs: 0, passed: 0, failed: 0, lastRunAt: '' },
    ...overrides,
  };
}

test('reads safe nested values without traversing prototype keys', () => {
  const input = { order: { customer: { name: '林晓' } } };
  assert.equal(Core.getPath(input, 'order.customer.name'), '林晓');
  assert.equal(Core.getPath(input, 'order.missing'), undefined);
  assert.equal(Core.getPath(input, '__proto__.polluted'), undefined);
  assert.equal(Core.getPath(input, 'constructor.name'), undefined);
});

test('evaluates numeric, text, collection and existence conditions', () => {
  const payload = { amount: 6800, tier: 'priority-lead', tags: ['new', 'vip'], owner: null };
  assert.equal(Core.evaluateCondition({ path: 'amount', operator: 'gte', value: '5000' }, payload), true);
  assert.equal(Core.evaluateCondition({ path: 'tier', operator: 'contains', value: 'priority' }, payload), true);
  assert.equal(Core.evaluateCondition({ path: 'tags', operator: 'contains', value: 'vip' }, payload), true);
  assert.equal(Core.evaluateCondition({ path: 'tier', operator: 'oneOf', value: 'cold, priority-lead' }, payload), true);
  assert.equal(Core.evaluateCondition({ path: 'owner', operator: 'exists', value: '' }, payload), false);
  assert.equal(Core.evaluateCondition({ path: 'missing', operator: 'notExists', value: '' }, payload), true);
});

test('matches manual, named event and interval triggers precisely', () => {
  assert.equal(Core.matchTrigger({ type: 'manual', config: {} }, { source: 'manual' }), true);
  assert.equal(Core.matchTrigger({ type: 'event', config: { event: 'lead.created' } }, { source: 'event', event: 'lead.created' }), true);
  assert.equal(Core.matchTrigger({ type: 'event', config: { event: 'lead.created' } }, { source: 'event', event: 'lead.updated' }), false);
  assert.equal(Core.matchTrigger({ type: 'interval', config: { seconds: 60 } }, { source: 'interval' }), true);
  assert.equal(Core.matchTrigger({ type: 'interval', config: { seconds: 60 } }, { source: 'manual' }), false);
});

test('executes actions in order and exposes set fields to later templates', () => {
  const subject = workflow({
    conditions: [{ id: 'c1', path: 'amount', operator: 'gte', value: '5000' }],
    actions: [
      { id: 'a1', type: 'setField', config: { path: 'route.priority', value: 'high' } },
      { id: 'a2', type: 'notification', config: { message: '线路 {{route.priority}} · ¥{{amount}}' } },
      { id: 'a3', type: 'webhookPreview', config: { url: 'https://example.com/hooks/intake', method: 'POST' } },
    ],
  });

  const run = Core.executeWorkflow(subject, { amount: 6800 }, { source: 'manual', now: '2026-08-31T00:00:00.000Z' });

  assert.equal(run.status, 'success');
  assert.equal(run.output.route.priority, 'high');
  assert.equal(run.actions[1].message, '线路 high · ¥6800');
  assert.deepEqual(run.actions[2].request, {
    url: 'https://example.com/hooks/intake',
    method: 'POST',
    body: { amount: 6800, route: { priority: 'high' } },
  });
});

test('skips actions when an all-condition route does not clear', () => {
  const subject = workflow({
    conditions: [
      { id: 'c1', path: 'amount', operator: 'gte', value: '5000' },
      { id: 'c2', path: 'country', operator: 'equals', value: 'CN' },
    ],
  });

  const run = Core.executeWorkflow(subject, { amount: 1200, country: 'CN' }, { source: 'manual' });
  assert.equal(run.status, 'skipped');
  assert.equal(run.actions.length, 0);
  assert.deepEqual(run.conditions.map((item) => item.passed), [false, true]);
});

test('supports any-condition routing and reports invalid actions as failed runs', () => {
  const anyRoute = workflow({
    conditionMode: 'any',
    conditions: [
      { id: 'c1', path: 'score', operator: 'gt', value: '90' },
      { id: 'c2', path: 'tag', operator: 'equals', value: 'urgent' },
    ],
  });
  assert.equal(Core.executeWorkflow(anyRoute, { score: 40, tag: 'urgent' }, { source: 'manual' }).status, 'success');

  const broken = workflow({ actions: [{ id: 'bad', type: 'setField', config: { path: '__proto__.unsafe', value: 'yes' } }] });
  const run = Core.executeWorkflow(broken, {}, { source: 'manual' });
  assert.equal(run.status, 'error');
  assert.match(run.message, /字段路径/);
});

test('normalizes imported workflows and discards unsupported shapes', () => {
  const normalized = Core.normalizeWorkflow({
    id: 'unsafe id!',
    name: '  新线索分流  ',
    enabled: 'yes',
    trigger: { type: 'unknown' },
    conditionMode: 'wrong',
    conditions: [{ path: 'lead.score', operator: 'unknown', value: 3 }, null],
    actions: [{ type: 'unknown' }, { type: 'log', config: { message: 'ok' } }],
  });

  assert.match(normalized.id, /^wf-/);
  assert.equal(normalized.name, '新线索分流');
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.trigger.type, 'manual');
  assert.equal(normalized.conditionMode, 'all');
  assert.equal(normalized.conditions.length, 1);
  assert.equal(normalized.conditions[0].operator, 'equals');
  assert.equal(normalized.actions.length, 1);
  assert.equal(normalized.actions[0].type, 'log');
});

test('validates versioned backups and keeps bounded newest-first history', () => {
  assert.throws(() => Core.normalizeBackup(null), /备份/);
  assert.throws(() => Core.normalizeBackup({ version: 99, workflows: [] }), /版本/);

  const backup = Core.normalizeBackup({
    version: 1,
    workflows: [workflow()],
    history: Array.from({ length: 80 }, (_, index) => ({ id: `run-${index}`, status: 'success' })),
  });
  assert.equal(backup.workflows.length, 1);
  assert.equal(backup.history.length, 60);

  const next = Core.appendHistory(backup.history, { id: 'run-new', status: 'skipped' }, 10);
  assert.equal(next.length, 10);
  assert.equal(next[0].id, 'run-new');
});
