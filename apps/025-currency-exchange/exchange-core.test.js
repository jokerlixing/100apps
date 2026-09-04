const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('./exchange-core.js');

const required = ['CNY', 'USD', 'EUR'];

test('normalizes Frankfurter rows and preserves the reference date', () => {
  const snapshot = Core.normalizeFrankfurter([
    { date: '2026-09-04', base: 'CNY', quote: 'USD', rate: 0.14888 },
    { date: '2026-09-04', base: 'CNY', quote: 'EUR', rate: 0.12828 },
  ], required);

  assert.deepEqual(snapshot.rates, { CNY: 1, USD: 0.14888, EUR: 0.12828 });
  assert.equal(snapshot.dataDate, '2026-09-04');
  assert.equal(snapshot.precision, 'date');
  assert.equal(snapshot.source.name, 'Frankfurter');
});

test('rejects incomplete provider data instead of showing a partial table', () => {
  assert.throws(() => Core.normalizeFrankfurter([
    { date: '2026-09-04', base: 'CNY', quote: 'USD', rate: 0.14888 },
  ], required), /EUR/);
});

test('normalizes fallback data with the provider update timestamp', () => {
  const snapshot = Core.normalizeExchangeRateApi({
    result: 'success',
    base_code: 'CNY',
    time_last_update_unix: 1788480000,
    rates: { CNY: 1, USD: 0.148468, EUR: 0.127975 },
  }, required);

  assert.equal(snapshot.source.name, 'ExchangeRate-API');
  assert.equal(snapshot.precision, 'datetime');
  assert.match(snapshot.dataAt, /^2026-09-04T/);
});

test('cache freshness requires a recent save and every supported currency', () => {
  const snapshot = {
    savedAt: 1_000,
    dataAt: '2026-09-04T00:00:00Z',
    source: { name: 'Frankfurter' },
    rates: { CNY: 1, USD: 0.15, EUR: 0.13 },
  };

  assert.equal(Core.isFreshSnapshot(snapshot, 600, 1_500, required), true);
  assert.equal(Core.isFreshSnapshot(snapshot, 600, 1_600, required), false);
  assert.equal(Core.isFreshSnapshot({ ...snapshot, rates: { CNY: 1, USD: 0.15 } }, 600, 1_500, required), false);
});

test('cross-rate conversion uses the CNY-based rate table', () => {
  const rates = { CNY: 1, USD: 0.15, JPY: 23.5 };
  assert.equal(Core.convertAmount(rates, 'USD', 'JPY', 100), 100 / 0.15 * 23.5);
  assert.equal(Number.isNaN(Core.convertAmount(rates, 'USD', 'EUR', 100)), true);
});

test('homepage names reference rates and discloses both providers', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /最新参考汇率/);
  assert.match(html, /Frankfurter/);
  assert.match(html, /ExchangeRate-API/);
  assert.doesNotMatch(html, /实时汇率|🟢 实时/);
});
