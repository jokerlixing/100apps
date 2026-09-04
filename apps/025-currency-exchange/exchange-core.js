(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CurrencyExchangeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCES = {
    frankfurter: {
      id: 'frankfurter',
      name: 'Frankfurter',
      url: 'https://frankfurter.dev/',
    },
    exchangeRateApi: {
      id: 'exchange-rate-api',
      name: 'ExchangeRate-API',
      url: 'https://www.exchangerate-api.com/',
    },
  };

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function ensureRates(rates, requiredCodes) {
    for (const code of requiredCodes) {
      if (positiveNumber(rates[code]) === null) {
        throw new Error(`汇率数据缺少 ${code}`);
      }
    }
    return rates;
  }

  function normalizeFrankfurter(rows, requiredCodes) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Frankfurter 返回为空');

    const rates = { CNY: 1 };
    const dates = new Set();
    for (const row of rows) {
      if (!row || row.base !== 'CNY' || typeof row.quote !== 'string') continue;
      const rate = positiveNumber(row.rate);
      if (rate === null) continue;
      rates[row.quote] = rate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) dates.add(row.date);
    }

    ensureRates(rates, requiredCodes);
    if (dates.size === 0) throw new Error('Frankfurter 未提供数据日期');
    const sortedDates = [...dates].sort();
    return {
      rates,
      dataDate: sortedDates.length === 1 ? sortedDates[0] : `${sortedDates[0]} 至 ${sortedDates.at(-1)}`,
      dataAt: `${sortedDates.at(-1)}T00:00:00Z`,
      precision: 'date',
      source: SOURCES.frankfurter,
    };
  }

  function normalizeExchangeRateApi(payload, requiredCodes) {
    if (!payload || payload.result !== 'success' || payload.base_code !== 'CNY') {
      throw new Error(payload?.['error-type'] || 'ExchangeRate-API 返回异常');
    }
    const rates = {};
    for (const [code, value] of Object.entries(payload.rates || {})) {
      const rate = positiveNumber(value);
      if (rate !== null) rates[code] = rate;
    }
    ensureRates(rates, requiredCodes);

    const timestamp = positiveNumber(payload.time_last_update_unix);
    if (timestamp === null) throw new Error('ExchangeRate-API 未提供更新时间');
    const dataAt = new Date(timestamp * 1000).toISOString();
    return {
      rates,
      dataDate: dataAt.slice(0, 10),
      dataAt,
      precision: 'datetime',
      source: SOURCES.exchangeRateApi,
    };
  }

  function isUsableSnapshot(snapshot, requiredCodes = []) {
    if (!snapshot || !Number.isFinite(snapshot.savedAt)) return false;
    try {
      ensureRates(snapshot.rates || {}, requiredCodes);
      return typeof snapshot.dataAt === 'string' && Boolean(snapshot.source?.name);
    } catch (_) {
      return false;
    }
  }

  function isFreshSnapshot(snapshot, maxAgeMs, now = Date.now(), requiredCodes = []) {
    if (!isUsableSnapshot(snapshot, requiredCodes)) return false;
    if (now - snapshot.savedAt < 0 || now - snapshot.savedAt >= maxAgeMs) return false;
    return true;
  }

  function convertAmount(rates, from, to, amount) {
    const fromRate = positiveNumber(rates?.[from]);
    const toRate = positiveNumber(rates?.[to]);
    const value = Number(amount);
    if (fromRate === null || toRate === null || !Number.isFinite(value)) return NaN;
    return value / fromRate * toRate;
  }

  return {
    SOURCES,
    normalizeFrankfurter,
    normalizeExchangeRateApi,
    isUsableSnapshot,
    isFreshSnapshot,
    convertAmount,
  };
});
