(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TallyStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'tally96-ledger-v1';
  const MAX_BYTES = 1_000_000;

  function createStore(adapter, core) {
    if (!adapter || !core) throw new Error('Storage adapter and TallyCore are required.');

    function clear() {
      try {
        adapter.removeItem(KEY);
        return true;
      } catch {
        return false;
      }
    }

    function load() {
      try {
        const raw = adapter.getItem(KEY);
        if (!raw) return [];
        if (raw.length > MAX_BYTES) {
          clear();
          return [];
        }
        const payload = JSON.parse(raw);
        if (!payload || payload.version !== 1 || !Array.isArray(payload.transactions)) throw new Error('Invalid ledger');
        return core.normalizeTransactions(payload.transactions);
      } catch {
        clear();
        return [];
      }
    }

    function save(transactions) {
      try {
        const payload = JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          transactions: core.normalizeTransactions(transactions),
        });
        if (payload.length > MAX_BYTES) return false;
        adapter.setItem(KEY, payload);
        return true;
      } catch {
        return false;
      }
    }

    return Object.freeze({ load, save, clear });
  }

  return Object.freeze({ KEY, createStore });
});
