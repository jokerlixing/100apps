const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSymbol,
  parseQuotePayload,
  parseKlineResponse,
  getRangeConfig,
  calculateChartBounds,
  calculateChange,
  formatCompactNumber,
  findCandleIndex,
} = require('./market-core.js');

test('normalizeSymbol accepts common A-share, Hong Kong, and US forms', () => {
  assert.deepEqual(normalizeSymbol('600519'), {
    providerId: 'sh600519',
    display: '600519.SH',
    market: 'CN',
    code: '600519',
  });
  assert.equal(normalizeSymbol('000001.sz').providerId, 'sz000001');
  assert.equal(normalizeSymbol('00700.HK').providerId, 'hk00700');
  assert.equal(normalizeSymbol('hk00700').display, '00700.HK');
  assert.equal(normalizeSymbol('aapl').providerId, 'usAAPL');
  assert.equal(normalizeSymbol('BRK-B').display, 'BRK-B');
});

test('normalizeSymbol rejects empty and unsafe symbols', () => {
  for (const value of ['', '12', '600519<script>', '00700.US', 'ABC DEF', null]) {
    assert.equal(normalizeSymbol(value), null);
  }
});

test('parseQuotePayload extracts safe numeric quote fields', () => {
  const makeRow = (providerId, values) => {
    const fields = Array(38).fill('');
    Object.entries(values).forEach(([index, value]) => { fields[Number(index)] = String(value); });
    return `v_${providerId}="${fields.join('~')}";`;
  };
  const text = [
    makeRow('sh600519', {
      0: 1, 1: '贵州茅台', 2: '600519', 3: 1297.4, 4: 1292.3, 5: 1289,
      6: 16126, 30: '20260828161500', 31: 5.1, 32: 0.39, 33: 1297.89,
      34: 1288, 36: 16126, 37: 208601,
    }),
    makeRow('usAAPL', {
      0: 200, 1: 'Apple', 2: 'AAPL', 3: 319.7, 4: 312.9, 5: 314.1,
      6: 100, 30: '20260828160000', 31: 6.8, 32: 2.17, 33: 321,
      34: 313.3, 36: 2000, 37: 640000,
    }),
  ].join('\n');
  const quotes = parseQuotePayload(text);

  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].providerId, 'sh600519');
  assert.equal(quotes[0].name, '贵州茅台');
  assert.equal(quotes[0].price, 1297.4);
  assert.equal(quotes[0].previousClose, 1292.3);
  assert.equal(quotes[0].changePercent, 0.39);
  assert.equal(quotes[0].high, 1297.89);
  assert.equal(quotes[0].low, 1288);
  assert.equal(quotes[0].volume, 16126);
});

test('parseQuotePayload ignores malformed and suspended rows', () => {
  const quotes = parseQuotePayload('v_sh600519="1~贵州茅台~600519~~~~";\nv_bad="oops";');
  assert.deepEqual(quotes, []);
});

test('parseKlineResponse parses qfq rows and drops invalid candles', () => {
  const response = {
    code: 0,
    data: {
      sh600519: {
        qfqday: [
          ['2026-08-27', '1280.00', '1292.30', '1298.00', '1278.00', '24000'],
          ['bad', '0', '0', '0', '0', '0'],
          ['2026-08-28', '1289.00', '1297.40', '1297.89', '1288.00', '16126'],
        ],
      },
    },
  };
  const candles = parseKlineResponse(response, 'sh600519');

  assert.deepEqual(candles, [
    { date: '2026-08-27', open: 1280, close: 1292.3, high: 1298, low: 1278, volume: 24000 },
    { date: '2026-08-28', open: 1289, close: 1297.4, high: 1297.89, low: 1288, volume: 16126 },
  ]);
  assert.deepEqual(parseKlineResponse({ code: 1 }, 'sh600519'), []);
});

test('range configuration maps UI keys to trading-day requests', () => {
  assert.deepEqual(getRangeConfig('1m'), { key: '1m', label: '1月', requestCount: 30 });
  assert.equal(getRangeConfig('1y').requestCount, 260);
  assert.equal(getRangeConfig('unknown').key, '3m');
});

test('chart bounds include price padding and maximum volume', () => {
  const bounds = calculateChartBounds([
    { low: 10, high: 14, volume: 100 },
    { low: 11, high: 16, volume: 250 },
  ]);
  assert.equal(bounds.volumeMax, 250);
  assert.ok(bounds.priceMin < 10);
  assert.ok(bounds.priceMax > 16);
  assert.equal(calculateChartBounds([]), null);
});

test('change calculation and compact volume formatting handle boundaries', () => {
  assert.deepEqual(calculateChange(102, 100), { amount: 2, percent: 2 });
  assert.deepEqual(calculateChange(1, 0), { amount: 0, percent: 0 });
  assert.equal(formatCompactNumber(9800), '9,800');
  assert.equal(formatCompactNumber(12340), '1.23万');
  assert.equal(formatCompactNumber(123400000), '1.23亿');
  assert.equal(formatCompactNumber(Number.NaN), '—');
});

test('findCandleIndex clamps pointer positions into the candle array', () => {
  assert.equal(findCandleIndex(50, 10, 100, 5), 2);
  assert.equal(findCandleIndex(-20, 10, 100, 5), 0);
  assert.equal(findCandleIndex(999, 10, 100, 5), 4);
  assert.equal(findCandleIndex(10, 10, 0, 5), -1);
});
