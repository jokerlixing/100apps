'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./subscription-core.js');

const TODAY = '2026-08-31';

function sample(overrides = {}) {
  return {
    id: 'sub_streambox',
    name: 'StreamBox 家庭版',
    amount: 58,
    currency: 'CNY',
    cycle: 'monthly',
    nextRenewal: '2026-09-03',
    category: 'entertainment',
    payment: 'Visa · 2048',
    reminderDays: 7,
    status: 'active',
    notes: '家庭共享',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  };
}

test('normalizeSubscription bounds fields and rejects invalid required values', () => {
  const normalized = Core.normalizeSubscription(sample({
    name: `  StreamBox ${'x'.repeat(100)}  `,
    amount: '58.126',
    reminderDays: 9,
    notes: `<b>家庭</b>${'n'.repeat(600)}`,
  }));

  assert.equal(normalized.name.length, 80);
  assert.equal(normalized.amount, 58.13);
  assert.equal(normalized.reminderDays, 7);
  assert.doesNotMatch(normalized.notes, /[<>]/);
  assert.equal(normalized.notes.length, 500);
  assert.equal(Core.normalizeSubscription(sample({ name: ' ' })), null);
  assert.equal(Core.normalizeSubscription(sample({ amount: 0 })), null);
  assert.equal(Core.normalizeSubscription(sample({ nextRenewal: '2026-02-30' })), null);
});

test('monthlyEquivalent converts supported billing cycles consistently', () => {
  assert.equal(Core.monthlyEquivalent(sample({ amount: 12, cycle: 'monthly' })), 12);
  assert.equal(Core.monthlyEquivalent(sample({ amount: 30, cycle: 'quarterly' })), 10);
  assert.equal(Core.monthlyEquivalent(sample({ amount: 120, cycle: 'yearly' })), 10);
  assert.equal(Core.monthlyEquivalent(sample({ amount: 12, cycle: 'weekly' })), 52);
});

test('daysUntil uses calendar days across month boundaries', () => {
  assert.equal(Core.daysUntil('2026-09-01', TODAY), 1);
  assert.equal(Core.daysUntil('2026-08-30', TODAY), -1);
  assert.equal(Core.daysUntil('invalid', TODAY), null);
});

test('renewalState distinguishes paused, overdue, reminder, upcoming and later', () => {
  assert.equal(Core.renewalState(sample({ status: 'paused' }), TODAY).key, 'paused');
  assert.equal(Core.renewalState(sample({ nextRenewal: '2026-08-30' }), TODAY).key, 'overdue');
  assert.equal(Core.renewalState(sample({ nextRenewal: '2026-09-03', reminderDays: 3 }), TODAY).key, 'due');
  assert.equal(Core.renewalState(sample({ nextRenewal: '2026-09-20', reminderDays: 7 }), TODAY).key, 'upcoming');
  assert.equal(Core.renewalState(sample({ nextRenewal: '2026-10-15' }), TODAY).key, 'later');
});

test('summarizeSubscriptions excludes paused items and keeps currencies separate', () => {
  const result = Core.summarizeSubscriptions([
    sample(),
    sample({ id: 'sub_year', name: 'Design Pro', amount: 120, cycle: 'yearly', nextRenewal: '2026-10-10' }),
    sample({ id: 'sub_usd', name: 'Cloud USD', amount: 12, currency: 'USD', nextRenewal: '2026-09-05' }),
    sample({ id: 'sub_paused', name: 'Paused', amount: 999, status: 'paused' }),
  ], TODAY);

  assert.equal(result.activeCount, 3);
  assert.equal(result.pausedCount, 1);
  assert.equal(result.dueCount, 2);
  assert.deepEqual(result.totals.CNY, { monthly: 68, annual: 816 });
  assert.deepEqual(result.totals.USD, { monthly: 12, annual: 144 });
  assert.equal(result.next.id, 'sub_streambox');
});

test('buildTimeline sorts overdue and upcoming renewals without paused entries', () => {
  const result = Core.buildTimeline([
    sample({ id: 'later', name: 'Later', nextRenewal: '2026-09-29' }),
    sample({ id: 'overdue', name: 'Overdue', nextRenewal: '2026-08-30' }),
    sample({ id: 'outside', name: 'Outside', nextRenewal: '2026-10-15' }),
    sample({ id: 'paused', name: 'Paused', status: 'paused' }),
  ], TODAY, 30);

  assert.deepEqual(result.map((item) => item.id), ['overdue', 'later']);
  assert.deepEqual(result.map((item) => item.days), [-1, 29]);
});

test('advanceRenewal always moves one cycle and catches overdue dates up', () => {
  assert.equal(Core.advanceRenewal(sample({ nextRenewal: '2026-09-02' }), TODAY).nextRenewal, '2026-10-02');
  assert.equal(Core.advanceRenewal(sample({ nextRenewal: '2026-01-31', cycle: 'monthly' }), TODAY).nextRenewal, '2026-09-28');
  assert.equal(Core.advanceRenewal(sample({ nextRenewal: '2026-08-28', cycle: 'weekly' }), TODAY).nextRenewal, '2026-09-04');
});

test('groupByCategory returns monthly CNY totals in descending order', () => {
  const result = Core.groupByCategory([
    sample({ id: 'a', amount: 30, category: 'entertainment' }),
    sample({ id: 'b', amount: 120, cycle: 'yearly', category: 'productivity' }),
    sample({ id: 'c', amount: 60, category: 'entertainment' }),
    sample({ id: 'd', amount: 200, category: 'cloud', currency: 'USD' }),
  ], 'CNY');

  assert.deepEqual(result, [
    { category: 'entertainment', monthly: 90, count: 2 },
    { category: 'productivity', monthly: 10, count: 1 },
  ]);
});

test('importBackup validates, deduplicates and supports merge or replace', () => {
  const existing = [sample({ id: 'keep', name: 'Keep' })];
  const payload = JSON.stringify({
    version: 1,
    subscriptions: [
      sample({ id: 'new', name: 'New' }),
      sample({ id: 'new', name: 'New duplicate' }),
      sample({ id: 'bad', name: ' ' }),
    ],
  });

  const merged = Core.importBackup(payload, existing, 'merge');
  assert.equal(merged.ok, true);
  assert.equal(merged.subscriptions.length, 2);
  assert.equal(merged.rejected, 2);
  assert.equal(Core.importBackup(payload, existing, 'replace').subscriptions.length, 1);
  assert.equal(Core.importBackup('{bad json', existing, 'merge').ok, false);
});

test('importBackup ignores prototype-shaped and oversized input', () => {
  const shaped = JSON.parse('{"version":1,"subscriptions":[{"__proto__":{"polluted":true},"id":"safe","name":"Safe","amount":9,"currency":"CNY","cycle":"monthly","nextRenewal":"2026-09-01"}]}');
  const result = Core.importBackup(shaped, [], 'replace');
  assert.equal(result.ok, true);
  assert.equal(result.subscriptions[0].name, 'Safe');
  assert.equal({}.polluted, undefined);
  assert.equal(Core.importBackup('x'.repeat(1_000_001), [], 'replace').ok, false);
});
