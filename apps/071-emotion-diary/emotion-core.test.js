const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./emotion-core.js');

const NOW = new Date('2026-08-31T20:00:00+08:00');

function entry(overrides = {}) {
  return {
    id: 'entry-1',
    date: '2026-08-31T08:00:00.000Z',
    mood: 4,
    energy: 3,
    emotions: ['平静', '感激'],
    factors: ['睡眠', '家人'],
    note: '今天完成了一个小目标。',
    ...overrides,
  };
}

test('normalizeEntry validates dates and bounds every user-controlled field', () => {
  const result = Core.normalizeEntry(entry({
    id: '../<bad-id>',
    mood: 4.8,
    energy: 0,
    emotions: ['平静', '平静', '未知', '焦虑', '感激', '愉快', '疲惫', '期待'],
    factors: ['睡眠', '睡眠', '未知因素', '工作', '运动', '天气', '家人', '休闲'],
    note: `<b>${'记'.repeat(2100)}</b>\u0000`,
  }), NOW);

  assert.equal(result, null, 'invalid energy should reject the record instead of inventing a value');

  const valid = Core.normalizeEntry(entry({
    id: '../<bad-id>',
    mood: '5',
    energy: '2',
    emotions: ['平静', '平静', '未知', '焦虑', '感激', '愉快', '疲惫', '期待'],
    factors: ['睡眠', '睡眠', '未知因素', '工作', '运动', '天气', '家人', '休闲'],
    note: `<b>${'记'.repeat(2100)}</b>`,
  }), NOW);

  assert.match(valid.id, /^entry-/);
  assert.equal(valid.mood, 5);
  assert.equal(valid.energy, 2);
  assert.deepEqual(valid.emotions, ['平静', '焦虑', '感激', '愉快', '疲惫']);
  assert.deepEqual(valid.factors, ['睡眠', '工作', '运动', '天气', '家人']);
  assert.equal(valid.note.includes('<b>'), false);
  assert.equal(valid.note.length, 2000);
  assert.equal(Object.getPrototypeOf(valid), Object.prototype);
});

test('normalizeEntry rejects invalid or future dates', () => {
  assert.equal(Core.normalizeEntry(entry({ date: 'not-a-date' }), NOW), null);
  assert.equal(Core.normalizeEntry(entry({ date: '2026-09-01T12:01:00+08:00' }), NOW), null);
  assert.ok(Core.normalizeEntry(entry({ date: '2026-08-31T11:00:00+08:00' }), NOW));
});

test('normalizeEntries deduplicates IDs, sorts newest first and caps history', () => {
  const many = Array.from({ length: 370 }, (_, index) => entry({
    id: `e-${index}`,
    date: new Date(NOW.getTime() - index * 60_000).toISOString(),
  }));
  many.splice(1, 0, entry({ id: 'e-0', date: '2026-08-01T00:00:00.000Z' }));

  const normalized = Core.normalizeEntries(many, NOW);
  assert.equal(normalized.length, 365);
  assert.equal(normalized[0].id, 'e-0');
  assert.equal(normalized.filter((item) => item.id === 'e-0').length, 1);
  assert.ok(Date.parse(normalized[0].date) >= Date.parse(normalized.at(-1).date));
});

test('filterEntriesByRange uses inclusive calendar-day boundaries', () => {
  const records = [
    entry({ id: 'today', date: '2026-08-31T01:00:00+08:00' }),
    entry({ id: 'day-7', date: '2026-08-25T00:00:00+08:00' }),
    entry({ id: 'too-old', date: '2026-08-24T23:59:59+08:00' }),
  ];

  assert.deepEqual(Core.filterEntriesByRange(records, 7, NOW).map((item) => item.id), ['today', 'day-7']);
  assert.equal(Core.filterEntriesByRange(records, 14, NOW).length, 3);
  assert.equal(Core.filterEntriesByRange(records, 99, NOW).length, 3, 'unsupported ranges normalize to 14 days');
});

test('summarizeEntries returns transparent samples, averages, variability and direction', () => {
  const summary = Core.summarizeEntries([
    entry({ id: 'a', date: '2026-08-28T08:00:00.000Z', mood: 2, energy: 2 }),
    entry({ id: 'b', date: '2026-08-29T08:00:00.000Z', mood: 3, energy: 4 }),
    entry({ id: 'c', date: '2026-08-30T08:00:00.000Z', mood: 4, energy: 3 }),
    entry({ id: 'd', date: '2026-08-31T08:00:00.000Z', mood: 5, energy: 5 }),
  ], 14, NOW);

  assert.equal(summary.count, 4);
  assert.equal(summary.daysWithEntries, 4);
  assert.equal(summary.averageMood, 3.5);
  assert.equal(summary.averageEnergy, 3.5);
  assert.equal(summary.variability, 1.1);
  assert.equal(summary.direction, 'up');
  assert.equal(summary.directionDelta, 2);
});

test('calculateFactorPatterns hides small samples and describes association, not causation', () => {
  const records = [
    entry({ id: '1', mood: 5, factors: ['运动'] }),
    entry({ id: '2', mood: 4, factors: ['运动'] }),
    entry({ id: '3', mood: 5, factors: ['运动'] }),
    entry({ id: '4', mood: 2, factors: ['工作'] }),
    entry({ id: '5', mood: 3, factors: ['工作'] }),
  ];
  const patterns = Core.calculateFactorPatterns(records);

  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].factor, '运动');
  assert.equal(patterns[0].count, 3);
  assert.equal(patterns[0].direction, 'higher');
  assert.match(patterns[0].description, /同时出现/);
  assert.doesNotMatch(patterns[0].description, /导致|因为/);
});

test('buildLocalInsights remains useful for empty, small and sufficient samples', () => {
  assert.match(Core.buildLocalInsights([], 14, NOW)[0].text, /记录/);
  assert.match(Core.buildLocalInsights([entry()], 14, NOW)[0].text, /1 条/);
  const result = Core.buildLocalInsights([
    entry({ id: '1', mood: 2, date: '2026-08-28T08:00:00.000Z' }),
    entry({ id: '2', mood: 3, date: '2026-08-29T08:00:00.000Z' }),
    entry({ id: '3', mood: 4, date: '2026-08-30T08:00:00.000Z' }),
    entry({ id: '4', mood: 5, date: '2026-08-31T08:00:00.000Z' }),
  ], 14, NOW);
  assert.ok(result.length >= 2);
  assert.ok(result.every((item) => item.evidence && !/诊断|治疗/.test(item.text)));
});

test('buildAIPayload excludes notes by default and bounds opted-in excerpts', () => {
  const records = [entry({ note: '私密'.repeat(300) })];
  const defaultPayload = Core.buildAIPayload(records, { rangeDays: 14, now: NOW });
  assert.equal(defaultPayload.includeNotes, false);
  assert.equal('noteExcerpt' in defaultPayload.records[0], false);

  const excerptPayload = Core.buildAIPayload(records, { rangeDays: 14, includeNotes: true, now: NOW });
  assert.equal(excerptPayload.includeNotes, true);
  assert.equal(excerptPayload.records[0].noteExcerpt.length, 240);
  assert.equal(excerptPayload.records.length, 1);
});

test('sanitizeAIInsights strips markup, bounds arrays and removes medical claims', () => {
  const safe = Core.sanitizeAIInsights({
    observations: ['<b>近三次记录中的精力更稳定。</b>', '你患有抑郁症，需要治疗。', ...Array(5).fill('额外观察')],
    questions: ['<script>alert(1)</script>什么让今天不同？'],
    actions: ['散步十分钟。'],
  });

  assert.deepEqual(safe.observations, ['近三次记录中的精力更稳定。', '额外观察']);
  assert.equal(safe.questions[0].includes('<script>'), false);
  assert.equal(safe.actions.length, 1);
  assert.match(safe.disclaimer, /不能替代/);
  assert.equal(Core.sanitizeAIInsights({ observations: ['诊断为焦虑症'] }), null);
});

test('importBackup validates version, strips hostile fields and reports rejected rows', () => {
  const backup = JSON.stringify({
    version: 1,
    entries: [
      entry(),
      { __proto__: { polluted: true }, id: 'bad', date: 'never', mood: 4, energy: 4 },
      entry({ id: 'future', date: '2030-01-01T00:00:00.000Z' }),
    ],
  });
  const imported = Core.importBackup(backup, NOW);

  assert.equal(imported.entries.length, 1);
  assert.equal(imported.rejectedCount, 2);
  assert.equal(imported.totalCount, 3);
  assert.equal({}.polluted, undefined);
  assert.throws(() => Core.importBackup('{"version":2,"entries":[]}', NOW), /版本/);
  assert.throws(() => Core.importBackup('not json', NOW), /JSON/);
});
