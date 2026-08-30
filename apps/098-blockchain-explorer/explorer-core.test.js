const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ExplorerError,
  classifyQuery,
  shortenHash,
  formatAmount,
  formatGasFee,
  validateSnapshot,
  lookupEntity,
  getAddressActivity
} = require('./explorer-core');
const { CHAIN_SNAPSHOT, SAMPLE_QUERIES } = require('./chain-data');

const ADDRESS_A = '0x7a90e11f8af292abe1072779f89cdd021da35aa4';
const ADDRESS_B = '0x2c84bf0aa779da5ca5e71991c57d188ad1ba512e';
const TX_HASH = `0x${'9f1c'.repeat(16)}`;
const BLOCK_HASH = `0x${'a1b2'.repeat(16)}`;

function makeSnapshot() {
  return {
    network: { name: 'Trace Mainnet', symbol: 'ETH', head: 21450938 },
    addresses: [
      { address: ADDRESS_A, label: 'Atlas Validator', balance: 42.75, type: 'validator' },
      { address: ADDRESS_B, label: 'Builder Lab', balance: 8.25, type: 'wallet' }
    ],
    transactions: [
      {
        hash: TX_HASH,
        blockNumber: 21450938,
        transactionIndex: 0,
        from: ADDRESS_A,
        to: ADDRESS_B,
        value: 4.25,
        gasUsed: 21000,
        gasPriceGwei: 18,
        status: 'success',
        timestamp: '2026-08-31T01:58:22.000Z'
      }
    ],
    blocks: [
      {
        number: 21450938,
        hash: BLOCK_HASH,
        parentHash: `0x${'c3d4'.repeat(16)}`,
        timestamp: '2026-08-31T01:58:22.000Z',
        validator: ADDRESS_A,
        gasUsed: 21000,
        gasLimit: 30000000,
        transactionHashes: [TX_HASH]
      }
    ]
  };
}

test('classifies block heights, transaction hashes and addresses', () => {
  assert.deepEqual(classifyQuery(' 21450938 '), { type: 'block', normalized: '21450938', value: 21450938 });
  assert.deepEqual(classifyQuery(TX_HASH.toUpperCase()), { type: 'transaction', normalized: TX_HASH, value: TX_HASH });
  assert.deepEqual(classifyQuery(ADDRESS_A.toUpperCase()), { type: 'address', normalized: ADDRESS_A, value: ADDRESS_A });
});

test('rejects empty, malformed and unsafe queries with a stable error code', () => {
  for (const input of ['', 'hello chain', '-1', '0x1234', '<script>alert(1)</script>']) {
    assert.throws(() => classifyQuery(input), (error) => error instanceof ExplorerError && error.code === 'INVALID_QUERY');
  }
});

test('formats identifiers and currency without losing useful precision', () => {
  assert.equal(shortenHash(TX_HASH), '0x9f1c9f1c…1c9f1c');
  assert.equal(shortenHash('short'), 'short');
  assert.equal(formatAmount(4.25), '4.2500 ETH');
  assert.equal(formatAmount(0, 6, 'TRACE'), '0.000000 TRACE');
  assert.equal(formatGasFee(21000, 18), '0.000378 ETH');
});

test('validates a coherent snapshot and looks up every supported entity', () => {
  const snapshot = makeSnapshot();
  assert.equal(validateSnapshot(snapshot), true);
  assert.equal(lookupEntity(snapshot, '21450938').entity.hash, BLOCK_HASH);
  assert.equal(lookupEntity(snapshot, TX_HASH).entity.blockNumber, 21450938);
  assert.equal(lookupEntity(snapshot, ADDRESS_A).entity.label, 'Atlas Validator');
});

test('distinguishes a valid but unknown identifier from malformed input', () => {
  const unknown = `0x${'0'.repeat(64)}`;
  assert.throws(
    () => lookupEntity(makeSnapshot(), unknown),
    (error) => error instanceof ExplorerError && error.code === 'NOT_FOUND' && error.queryType === 'transaction'
  );
});

test('aggregates address direction, counts and net transferred value', () => {
  const activity = getAddressActivity(makeSnapshot(), ADDRESS_A);
  assert.equal(activity.total, 1);
  assert.equal(activity.sent, 1);
  assert.equal(activity.received, 0);
  assert.equal(activity.netValue, -4.25);
  assert.equal(activity.transactions[0].direction, 'out');

  const receiver = getAddressActivity(makeSnapshot(), ADDRESS_B);
  assert.equal(receiver.netValue, 4.25);
  assert.equal(receiver.transactions[0].direction, 'in');
});

test('rejects duplicate identifiers and broken block references', () => {
  const duplicate = makeSnapshot();
  duplicate.transactions.push({ ...duplicate.transactions[0] });
  assert.throws(() => validateSnapshot(duplicate), { code: 'INVALID_SNAPSHOT' });

  const broken = makeSnapshot();
  broken.blocks[0].transactionHashes = [`0x${'f'.repeat(64)}`];
  assert.throws(() => validateSnapshot(broken), { code: 'INVALID_SNAPSHOT' });
});

test('ships a coherent multi-block snapshot with working samples', () => {
  assert.equal(validateSnapshot(CHAIN_SNAPSHOT), true);
  assert.ok(CHAIN_SNAPSHOT.blocks.length >= 5);
  assert.ok(CHAIN_SNAPSHOT.transactions.length >= 8);
  assert.ok(CHAIN_SNAPSHOT.addresses.length >= 6);
  assert.equal(lookupEntity(CHAIN_SNAPSHOT, SAMPLE_QUERIES.block).type, 'block');
  assert.equal(lookupEntity(CHAIN_SNAPSHOT, SAMPLE_QUERIES.transaction).type, 'transaction');
  assert.equal(lookupEntity(CHAIN_SNAPSHOT, SAMPLE_QUERIES.address).type, 'address');
});
