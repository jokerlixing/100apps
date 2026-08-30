(function attachMarketCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MarketCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMarketCore() {
  'use strict';

  const RANGE_CONFIGS = Object.freeze({
    '1m': Object.freeze({ key: '1m', label: '1月', requestCount: 30 }),
    '3m': Object.freeze({ key: '3m', label: '3月', requestCount: 75 }),
    '6m': Object.freeze({ key: '6m', label: '6月', requestCount: 150 }),
    '1y': Object.freeze({ key: '1y', label: '1年', requestCount: 260 }),
  });

  function finiteNumber(value) {
    const number = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeSymbol(input) {
    if (typeof input !== 'string') return null;
    const symbol = input.trim().toUpperCase();
    if (!symbol || /\s/.test(symbol)) return null;

    let match = symbol.match(/^HK(\d{5})$/) || symbol.match(/^(\d{5})\.HK$/);
    if (match) {
      return {
        providerId: `hk${match[1]}`,
        display: `${match[1]}.HK`,
        market: 'HK',
        code: match[1],
      };
    }

    match = symbol.match(/^(?:SH)?(\d{6})(?:\.(?:SH|SS|SHH))?$/);
    if (match && /^(?:5|6|9)/.test(match[1])) {
      return {
        providerId: `sh${match[1]}`,
        display: `${match[1]}.SH`,
        market: 'CN',
        code: match[1],
      };
    }

    match = symbol.match(/^(?:SZ)?(\d{6})(?:\.(?:SZ|SHZ))?$/);
    if (match && /^(?:0|3)/.test(match[1])) {
      return {
        providerId: `sz${match[1]}`,
        display: `${match[1]}.SZ`,
        market: 'CN',
        code: match[1],
      };
    }

    if (/^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/.test(symbol)) {
      return {
        providerId: `us${symbol}`,
        display: symbol,
        market: 'US',
        code: symbol,
      };
    }

    return null;
  }

  function calculateChange(current, previousClose) {
    const currentNumber = finiteNumber(current);
    const previousNumber = finiteNumber(previousClose);
    if (currentNumber === null || previousNumber === null || previousNumber === 0) {
      return { amount: 0, percent: 0 };
    }
    const amount = currentNumber - previousNumber;
    return {
      amount,
      percent: (amount / previousNumber) * 100,
    };
  }

  function parseQuotePayload(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const quotes = [];
    const expression = /v_([A-Za-z0-9._-]+)="([^"]*)"/g;
    let match;

    while ((match = expression.exec(text))) {
      const providerId = match[1];
      const fields = match[2].split('~');
      const price = finiteNumber(fields[3]);
      const previousClose = finiteNumber(fields[4]);
      const open = finiteNumber(fields[5]);
      if (price === null || price <= 0 || previousClose === null || previousClose <= 0) continue;

      const calculated = calculateChange(price, previousClose);
      const change = finiteNumber(fields[31]);
      const changePercent = finiteNumber(fields[32]);
      const high = finiteNumber(fields[33]);
      const low = finiteNumber(fields[34]);
      const volume = finiteNumber(fields[36]) ?? finiteNumber(fields[6]) ?? 0;
      const amount = finiteNumber(fields[37]) ?? 0;

      quotes.push({
        providerId,
        name: (fields[1] || fields[2] || providerId).trim(),
        code: (fields[2] || '').trim(),
        price,
        previousClose,
        open: open && open > 0 ? open : previousClose,
        high: high && high > 0 ? high : Math.max(price, previousClose, open || previousClose),
        low: low && low > 0 ? low : Math.min(price, previousClose, open || previousClose),
        change: change ?? calculated.amount,
        changePercent: changePercent ?? calculated.percent,
        volume,
        amount,
        timestamp: (fields[30] || '').trim(),
      });
    }

    return quotes;
  }

  function parseKlineResponse(response, providerId) {
    if (!response || response.code !== 0 || typeof providerId !== 'string') return [];
    const series = response.data && response.data[providerId];
    if (!series || typeof series !== 'object') return [];
    const rows = series.qfqday || series.day || series.hfqday;
    if (!Array.isArray(rows)) return [];

    return rows
      .map((row) => {
        if (!Array.isArray(row) || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) return null;
        const open = finiteNumber(row[1]);
        const close = finiteNumber(row[2]);
        const high = finiteNumber(row[3]);
        const low = finiteNumber(row[4]);
        const volume = finiteNumber(row[5]);
        if (
          [open, close, high, low, volume].some((value) => value === null) ||
          open <= 0 || close <= 0 || high <= 0 || low <= 0 || volume < 0 ||
          high < Math.max(open, close) || low > Math.min(open, close)
        ) {
          return null;
        }
        return { date: row[0], open, close, high, low, volume };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getRangeConfig(key) {
    return RANGE_CONFIGS[key] || RANGE_CONFIGS['3m'];
  }

  function calculateChartBounds(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return null;
    const lows = candles.map((item) => finiteNumber(item.low)).filter((item) => item !== null);
    const highs = candles.map((item) => finiteNumber(item.high)).filter((item) => item !== null);
    const volumes = candles.map((item) => finiteNumber(item.volume)).filter((item) => item !== null);
    if (!lows.length || !highs.length) return null;

    const low = Math.min(...lows);
    const high = Math.max(...highs);
    const span = high - low;
    const padding = span > 0 ? span * 0.06 : Math.max(Math.abs(high) * 0.02, 1);
    return {
      priceMin: low - padding,
      priceMax: high + padding,
      volumeMax: Math.max(...volumes, 0),
    };
  }

  function formatCompactNumber(value) {
    const number = finiteNumber(value);
    if (number === null) return '—';
    const absolute = Math.abs(number);
    if (absolute >= 100000000) return `${(number / 100000000).toFixed(2).replace(/\.00$/, '')}亿`;
    if (absolute >= 10000) return `${(number / 10000).toFixed(2).replace(/\.00$/, '')}万`;
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(number);
  }

  function findCandleIndex(pointerX, left, width, candleCount) {
    if (![pointerX, left, width, candleCount].every(Number.isFinite) || width <= 0 || candleCount <= 0) {
      return -1;
    }
    const ratio = Math.max(0, Math.min(0.999999, (pointerX - left) / width));
    return Math.floor(ratio * candleCount);
  }

  return {
    RANGE_CONFIGS,
    normalizeSymbol,
    parseQuotePayload,
    parseKlineResponse,
    getRangeConfig,
    calculateChartBounds,
    calculateChange,
    formatCompactNumber,
    findCandleIndex,
  };
});
