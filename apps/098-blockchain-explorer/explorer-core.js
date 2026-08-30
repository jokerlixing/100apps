(function attachExplorerCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExplorerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExplorerCore() {
  'use strict';

  const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
  const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
  const BLOCK_PATTERN = /^\d{1,12}$/;

  class ExplorerError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = 'ExplorerError';
      this.code = code;
      Object.assign(this, details);
    }
  }

  function fail(code, message, details) {
    throw new ExplorerError(code, message, details);
  }

  function normalizeHex(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return text.startsWith('0x') ? text : `0x${text}`;
  }

  function classifyQuery(value) {
    const raw = String(value ?? '').trim();
    if (BLOCK_PATTERN.test(raw)) {
      const blockNumber = Number(raw);
      if (Number.isSafeInteger(blockNumber) && blockNumber >= 0) {
        return { type: 'block', normalized: String(blockNumber), value: blockNumber };
      }
    }

    const hex = normalizeHex(raw);
    if (HASH_PATTERN.test(hex)) return { type: 'transaction', normalized: hex, value: hex };
    if (ADDRESS_PATTERN.test(hex)) return { type: 'address', normalized: hex, value: hex };
    return fail('INVALID_QUERY', '请输入区块高度、64 位交易哈希或 40 位地址。');
  }

  function shortenHash(value, head = 10, tail = 6) {
    const text = String(value ?? '');
    const start = Math.max(2, Math.floor(Number(head) || 10));
    const end = Math.max(2, Math.floor(Number(tail) || 6));
    return text.length > start + end + 1 ? `${text.slice(0, start)}…${text.slice(-end)}` : text;
  }

  function finiteNumber(value, label) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) fail('INVALID_VALUE', `${label} 必须是有效数字。`);
    return number;
  }

  function formatAmount(value, decimals = 4, symbol = 'ETH') {
    const amount = finiteNumber(value, '金额');
    const precision = Math.min(12, Math.max(0, Math.floor(Number(decimals) || 0)));
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })} ${String(symbol || 'ETH')}`;
  }

  function formatGasFee(gasUsed, gasPriceGwei, symbol = 'ETH') {
    const fee = finiteNumber(gasUsed, 'Gas') * finiteNumber(gasPriceGwei, 'Gas 价格') / 1_000_000_000;
    return `${fee.toFixed(6)} ${String(symbol || 'ETH')}`;
  }

  function assertArray(value, name) {
    if (!Array.isArray(value)) fail('INVALID_SNAPSHOT', `${name} 必须是数组。`);
  }

  function assertUnique(values, label) {
    if (new Set(values).size !== values.length) fail('INVALID_SNAPSHOT', `${label} 不能重复。`);
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') fail('INVALID_SNAPSHOT', '链快照不存在。');
    assertArray(snapshot.addresses, 'addresses');
    assertArray(snapshot.transactions, 'transactions');
    assertArray(snapshot.blocks, 'blocks');

    const addresses = snapshot.addresses.map((item) => normalizeHex(item && item.address));
    const transactionHashes = snapshot.transactions.map((item) => normalizeHex(item && item.hash));
    const blockHashes = snapshot.blocks.map((item) => normalizeHex(item && item.hash));
    const blockNumbers = snapshot.blocks.map((item) => item && item.number);

    if (addresses.some((address) => !ADDRESS_PATTERN.test(address))) fail('INVALID_SNAPSHOT', '地址格式不正确。');
    if (transactionHashes.some((hash) => !HASH_PATTERN.test(hash))) fail('INVALID_SNAPSHOT', '交易哈希格式不正确。');
    if (blockHashes.some((hash) => !HASH_PATTERN.test(hash))) fail('INVALID_SNAPSHOT', '区块哈希格式不正确。');
    if (blockNumbers.some((number) => !Number.isSafeInteger(number) || number < 0)) fail('INVALID_SNAPSHOT', '区块高度格式不正确。');
    assertUnique(addresses, '地址');
    assertUnique(transactionHashes, '交易哈希');
    assertUnique(blockHashes, '区块哈希');
    assertUnique(blockNumbers, '区块高度');

    const addressSet = new Set(addresses);
    const transactionSet = new Set(transactionHashes);
    const blockSet = new Set(blockNumbers);
    for (const transaction of snapshot.transactions) {
      if (!addressSet.has(normalizeHex(transaction.from)) || !addressSet.has(normalizeHex(transaction.to))) {
        fail('INVALID_SNAPSHOT', '交易引用了不存在的地址。');
      }
      if (transaction.blockNumber !== null && transaction.blockNumber !== undefined && !blockSet.has(transaction.blockNumber)) {
        fail('INVALID_SNAPSHOT', '交易引用了不存在的区块。');
      }
      if (!['success', 'failed', 'pending'].includes(transaction.status)) fail('INVALID_SNAPSHOT', '交易状态不受支持。');
    }

    for (const block of snapshot.blocks) {
      if (!addressSet.has(normalizeHex(block.validator))) fail('INVALID_SNAPSHOT', '区块引用了不存在的验证者。');
      assertArray(block.transactionHashes, 'transactionHashes');
      for (const hash of block.transactionHashes) {
        const normalized = normalizeHex(hash);
        if (!transactionSet.has(normalized)) fail('INVALID_SNAPSHOT', '区块引用了不存在的交易。');
        const transaction = snapshot.transactions.find((item) => normalizeHex(item.hash) === normalized);
        if (transaction.blockNumber !== block.number) fail('INVALID_SNAPSHOT', '交易所属区块不一致。');
      }
    }

    if (snapshot.network && snapshot.network.head !== undefined && !blockSet.has(snapshot.network.head)) {
      fail('INVALID_SNAPSHOT', '网络头部区块不存在。');
    }
    return true;
  }

  function buildIndex(snapshot) {
    validateSnapshot(snapshot);
    return {
      addresses: new Map(snapshot.addresses.map((item) => [normalizeHex(item.address), item])),
      transactions: new Map(snapshot.transactions.map((item) => [normalizeHex(item.hash), item])),
      blocks: new Map(snapshot.blocks.map((item) => [item.number, item]))
    };
  }

  function lookupEntity(snapshot, value) {
    const query = classifyQuery(value);
    const index = buildIndex(snapshot);
    const collection = query.type === 'block' ? index.blocks : query.type === 'transaction' ? index.transactions : index.addresses;
    const entity = collection.get(query.value);
    if (!entity) fail('NOT_FOUND', '当前快照中没有找到这个链上对象。', { queryType: query.type, normalized: query.normalized });
    return { type: query.type, query, entity };
  }

  function getAddressActivity(snapshot, value) {
    const query = classifyQuery(value);
    if (query.type !== 'address') fail('INVALID_QUERY', '地址活动只接受钱包或合约地址。');
    const index = buildIndex(snapshot);
    if (!index.addresses.has(query.value)) fail('NOT_FOUND', '当前快照中没有找到这个地址。', { queryType: 'address', normalized: query.normalized });

    let sent = 0;
    let received = 0;
    let netValue = 0;
    const transactions = snapshot.transactions
      .filter((transaction) => normalizeHex(transaction.from) === query.value || normalizeHex(transaction.to) === query.value)
      .map((transaction) => {
        const fromSelf = normalizeHex(transaction.from) === query.value;
        const toSelf = normalizeHex(transaction.to) === query.value;
        const direction = fromSelf && toSelf ? 'self' : fromSelf ? 'out' : 'in';
        if (direction === 'out') {
          sent += 1;
          netValue -= finiteNumber(transaction.value, '交易金额');
        } else if (direction === 'in') {
          received += 1;
          netValue += finiteNumber(transaction.value, '交易金额');
        }
        return { ...transaction, direction };
      })
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));

    return { total: transactions.length, sent, received, netValue, transactions };
  }

  function formatTimestamp(value, locale = 'zh-CN') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(date);
  }

  return Object.freeze({
    ADDRESS_PATTERN,
    HASH_PATTERN,
    ExplorerError,
    classifyQuery,
    shortenHash,
    formatAmount,
    formatGasFee,
    formatTimestamp,
    validateSnapshot,
    buildIndex,
    lookupEntity,
    getAddressActivity
  });
});
