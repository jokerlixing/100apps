'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./bookkeeping-core.js');
const Storage = require('./storage.js');

const BASE_DATE = '2026-08-31';

function record(overrides = {}) {
  return {
    id: 'txn_demo',
    type: 'expense',
    amount: 32.5,
    category: 'food',
    account: 'wechat',
    date: BASE_DATE,
    note: '午饭',
    transcript: '午饭花了32.5微信',
    createdAt: '2026-08-31T01:00:00.000Z',
    updatedAt: '2026-08-31T01:00:00.000Z',
    ...overrides,
  };
}

test('parseChineseNumber handles common spoken money forms', () => {
  assert.equal(Core.parseChineseNumber('三十二块五'), 32.5);
  assert.equal(Core.parseChineseNumber('一百零五点六'), 105.6);
  assert.equal(Core.parseChineseNumber('两千三百元'), 2300);
  assert.equal(Core.parseChineseNumber('十二块八毛'), 12.8);
});

test('parseTranscript extracts an everyday expense with explainable fields', () => {
  const result = Core.parseTranscript('午饭花了32.5元，微信付的', { baseDate: BASE_DATE });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.amount, 32.5);
  assert.equal(result.transaction.type, 'expense');
  assert.equal(result.transaction.category, 'food');
  assert.equal(result.transaction.account, 'wechat');
  assert.equal(result.transaction.date, BASE_DATE);
  assert.ok(result.matchedFields.includes('amount'));
  assert.ok(result.confidence >= 0.8);
});

test('parseTranscript recognizes income, relative date and Chinese amount', () => {
  const result = Core.parseTranscript('昨天工资到账一万两千元，银行卡', { baseDate: BASE_DATE });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.type, 'income');
  assert.equal(result.transaction.amount, 12000);
  assert.equal(result.transaction.category, 'salary');
  assert.equal(result.transaction.account, 'bank');
  assert.equal(result.transaction.date, '2026-08-30');
});

test('parseTranscript recognizes explicit month/day and account fallback', () => {
  const result = Core.parseTranscript('8月28日打车28块', { baseDate: BASE_DATE });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.amount, 28);
  assert.equal(result.transaction.category, 'transport');
  assert.equal(result.transaction.account, 'other');
  assert.equal(result.transaction.date, '2026-08-28');
  assert.match(result.warnings.join(''), /账户/);
});

test('parseTranscript refuses to invent a missing amount', () => {
  const result = Core.parseTranscript('今天买了一杯咖啡', { baseDate: BASE_DATE });

  assert.equal(result.ok, false);
  assert.equal(result.transaction.amount, null);
  assert.match(result.errors.join(''), /金额/);
});

test('normalizeTransaction validates enums, dates, money and text limits', () => {
  const normalized = Core.normalizeTransaction(record({
    amount: '32.567',
    note: `<b>午饭</b>${'x'.repeat(160)}`,
    transcript: `原话${'y'.repeat(400)}`,
  }));

  assert.equal(normalized.amount, 32.57);
  assert.doesNotMatch(normalized.note, /[<>]/);
  assert.equal(normalized.note.length, 120);
  assert.equal(normalized.transcript.length, 300);
  assert.equal(Core.normalizeTransaction(record({ amount: 0 })), null);
  assert.equal(Core.normalizeTransaction(record({ type: 'transfer' })), null);
  assert.equal(Core.normalizeTransaction(record({ date: '2026-02-30' })), null);
});

test('summarizeMonth totals income, expense, balance and categories', () => {
  const summary = Core.summarizeMonth([
    record(),
    record({ id: 'coffee', amount: 18, category: 'food' }),
    record({ id: 'ride', amount: 28, category: 'transport' }),
    record({ id: 'salary', type: 'income', amount: 12000, category: 'salary' }),
    record({ id: 'old', amount: 99, date: '2026-07-31' }),
  ], '2026-08');

  assert.deepEqual(summary, {
    month: '2026-08',
    income: 12000,
    expense: 78.5,
    balance: 11921.5,
    count: 4,
    categories: [
      { category: 'food', amount: 50.5, count: 2, ratio: 64.33 },
      { category: 'transport', amount: 28, count: 1, ratio: 35.67 },
    ],
  });
});

test('filterTransactions combines query, type, category and month', () => {
  const records = [
    record(),
    record({ id: 'salary', type: 'income', amount: 12000, category: 'salary', note: '八月工资', transcript: '工资到账12000' }),
    record({ id: 'old', date: '2026-07-30', note: '午饭' }),
  ];

  assert.deepEqual(Core.filterTransactions(records, { month: '2026-08', type: 'income', query: '工资' }).map((item) => item.id), ['salary']);
  assert.deepEqual(Core.filterTransactions(records, { month: '2026-08', category: 'food' }).map((item) => item.id), ['txn_demo']);
});

test('toCSV safely escapes spreadsheet formulas, quotes and commas', () => {
  const csv = Core.toCSV([record({ note: '=HYPERLINK("bad")，午饭' })]);

  assert.match(csv, /^日期,类型,金额,分类,账户,备注,原始输入/m);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)，午饭"/);
  assert.match(csv, /32\.50/);
});

test('importBackup validates size, shape and duplicate ids', () => {
  const payload = JSON.stringify({
    version: 1,
    transactions: [record(), record({ note: 'duplicate' }), record({ id: 'bad', amount: -1 })],
  });
  const result = Core.importBackup(payload, [record({ id: 'keep' })], 'merge');

  assert.equal(result.ok, true);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.rejected, 2);
  assert.equal(Core.importBackup('{bad', [], 'replace').ok, false);
  assert.equal(Core.importBackup('x'.repeat(1_000_001), [], 'replace').ok, false);
});

test('storage adapter recovers from malformed data and saves normalized records', () => {
  const memory = new Map([[Storage.KEY, '{bad json']]);
  const adapter = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const store = Storage.createStore(adapter, Core);

  assert.deepEqual(store.load(), []);
  assert.equal(memory.has(Storage.KEY), false);
  assert.equal(store.save([record(), record({ id: 'bad', amount: -2 })]), true);
  assert.equal(store.load().length, 1);
  assert.equal(store.clear(), true);
  assert.equal(memory.has(Storage.KEY), false);
});
