(function attachChainData(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChainData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChainData() {
  'use strict';

  const makeHash = (seed) => {
    const clean = String(seed).replace(/[^0-9a-f]/gi, '').toLowerCase() || '0';
    return `0x${clean.repeat(Math.ceil(64 / clean.length)).slice(0, 64)}`;
  };

  const ADDRESSES = Object.freeze({
    atlas: '0x7a90e11f8af292abe1072779f89cdd021da35aa4',
    builder: '0x2c84bf0aa779da5ca5e71991c57d188ad1ba512e',
    pool: '0x91fcd2d51b40e982e55f69d1998ed59488f2c22a',
    bridge: '0xf3616c33d2dbbb71f32cc115210958018022125b',
    creator: '0x4af2b802ca9fe4887969035d952720961c528342',
    contract: '0x6e174926ccd359f13ff316e69a6f78753ea1b22a'
  });

  const HASHES = Object.freeze({
    block938: makeHash('a1b2'),
    block937: makeHash('b2c3'),
    block936: makeHash('c3d4'),
    block935: makeHash('d4e5'),
    block934: makeHash('e5f6'),
    parent933: makeHash('f607'),
    txBridge: makeHash('9f1c'),
    txSwap: makeHash('72ae'),
    txStake: makeHash('84d0'),
    txFailed: makeHash('cc31'),
    txReward: makeHash('50ba'),
    txCollect: makeHash('1d77'),
    txMint: makeHash('3ee8'),
    txPending: makeHash('af09'),
    txContractPending: makeHash('bd64')
  });

  const addresses = [
    { address: ADDRESSES.atlas, label: 'Atlas 验证者', note: '当前纪元活跃验证者', balance: 128.7642, type: 'validator' },
    { address: ADDRESSES.builder, label: 'Builder Lab', note: '区块构建与研究钱包', balance: 34.2058, type: 'wallet' },
    { address: ADDRESSES.pool, label: 'Harbor 流动池', note: 'ETH / USDC 流动性池', balance: 8021.4431, type: 'contract' },
    { address: ADDRESSES.bridge, label: 'East Gate 跨链桥', note: '跨链资产托管合约', balance: 460.8804, type: 'contract' },
    { address: ADDRESSES.creator, label: 'Studio 0x4A', note: '创作者版税钱包', balance: 16.9137, type: 'wallet' },
    { address: ADDRESSES.contract, label: 'Trace Registry', note: '链上凭证登记合约', balance: 5.6201, type: 'contract' }
  ];

  const transactions = [
    {
      hash: HASHES.txBridge, blockNumber: 21450938, transactionIndex: 0,
      from: ADDRESSES.atlas, to: ADDRESSES.builder, value: 4.28,
      gasUsed: 21000, gasPriceGwei: 17.4, status: 'success',
      timestamp: '2026-08-31T01:58:22.000Z', method: 'transfer', nonce: 1842,
      input: '0x', confirmations: 64
    },
    {
      hash: HASHES.txSwap, blockNumber: 21450938, transactionIndex: 1,
      from: ADDRESSES.builder, to: ADDRESSES.pool, value: 12.5,
      gasUsed: 143822, gasPriceGwei: 19.2, status: 'success',
      timestamp: '2026-08-31T01:58:19.000Z', method: 'swapExactETHForTokens', nonce: 731,
      input: '0x7ff36ab5000000000000000000000000', confirmations: 64
    },
    {
      hash: HASHES.txStake, blockNumber: 21450937, transactionIndex: 0,
      from: ADDRESSES.bridge, to: ADDRESSES.contract, value: 0,
      gasUsed: 98444, gasPriceGwei: 15.8, status: 'success',
      timestamp: '2026-08-31T01:58:07.000Z', method: 'register(bytes32)', nonce: 426,
      input: '0x4420e486d88953b0f4d71576e87f65ab', confirmations: 65
    },
    {
      hash: HASHES.txFailed, blockNumber: 21450937, transactionIndex: 1,
      from: ADDRESSES.creator, to: ADDRESSES.contract, value: 0.8,
      gasUsed: 77218, gasPriceGwei: 21.1, status: 'failed',
      timestamp: '2026-08-31T01:58:04.000Z', method: 'mintProof', nonce: 94,
      input: '0xa0712d68000000000000000000000000', confirmations: 65,
      error: 'Execution reverted: proof already registered'
    },
    {
      hash: HASHES.txReward, blockNumber: 21450936, transactionIndex: 0,
      from: ADDRESSES.pool, to: ADDRESSES.atlas, value: 2.75,
      gasUsed: 42120, gasPriceGwei: 14.9, status: 'success',
      timestamp: '2026-08-31T01:57:53.000Z', method: 'claimRewards', nonce: 22518,
      input: '0x4e71d92d', confirmations: 66
    },
    {
      hash: HASHES.txCollect, blockNumber: 21450935, transactionIndex: 0,
      from: ADDRESSES.builder, to: ADDRESSES.creator, value: 0.42,
      gasUsed: 21000, gasPriceGwei: 13.6, status: 'success',
      timestamp: '2026-08-31T01:57:41.000Z', method: 'transfer', nonce: 730,
      input: '0x', confirmations: 67
    },
    {
      hash: HASHES.txMint, blockNumber: 21450934, transactionIndex: 0,
      from: ADDRESSES.creator, to: ADDRESSES.contract, value: 0.16,
      gasUsed: 118607, gasPriceGwei: 16.25, status: 'success',
      timestamp: '2026-08-31T01:57:29.000Z', method: 'mintProof', nonce: 93,
      input: '0xa0712d68f06a12fc58c9978e1c3a003d', confirmations: 68
    },
    {
      hash: HASHES.txPending, blockNumber: null, transactionIndex: null,
      from: ADDRESSES.atlas, to: ADDRESSES.bridge, value: 1.1,
      gasUsed: 21000, gasPriceGwei: 24.7, status: 'pending',
      timestamp: '2026-08-31T01:58:31.000Z', method: 'transfer', nonce: 1843,
      input: '0x', confirmations: 0
    },
    {
      hash: HASHES.txContractPending, blockNumber: null, transactionIndex: null,
      from: ADDRESSES.contract, to: ADDRESSES.pool, value: 0,
      gasUsed: 132000, gasPriceGwei: 22.3, status: 'pending',
      timestamp: '2026-08-31T01:58:34.000Z', method: 'settleEpoch', nonce: 208,
      input: '0xf4967b4b000000000000000000000000', confirmations: 0
    }
  ];

  const blocks = [
    {
      number: 21450938, hash: HASHES.block938, parentHash: HASHES.block937,
      timestamp: '2026-08-31T01:58:22.000Z', validator: ADDRESSES.atlas,
      gasUsed: 1842822, gasLimit: 30000000, baseFeeGwei: 13.2, reward: 0.0318,
      transactionHashes: [HASHES.txBridge, HASHES.txSwap]
    },
    {
      number: 21450937, hash: HASHES.block937, parentHash: HASHES.block936,
      timestamp: '2026-08-31T01:58:10.000Z', validator: ADDRESSES.builder,
      gasUsed: 2190388, gasLimit: 30000000, baseFeeGwei: 13.6, reward: 0.0341,
      transactionHashes: [HASHES.txStake, HASHES.txFailed]
    },
    {
      number: 21450936, hash: HASHES.block936, parentHash: HASHES.block935,
      timestamp: '2026-08-31T01:57:58.000Z', validator: ADDRESSES.atlas,
      gasUsed: 1675541, gasLimit: 30000000, baseFeeGwei: 13.1, reward: 0.0297,
      transactionHashes: [HASHES.txReward]
    },
    {
      number: 21450935, hash: HASHES.block935, parentHash: HASHES.block934,
      timestamp: '2026-08-31T01:57:46.000Z', validator: ADDRESSES.builder,
      gasUsed: 2017443, gasLimit: 30000000, baseFeeGwei: 13.4, reward: 0.0322,
      transactionHashes: [HASHES.txCollect]
    },
    {
      number: 21450934, hash: HASHES.block934, parentHash: HASHES.parent933,
      timestamp: '2026-08-31T01:57:34.000Z', validator: ADDRESSES.atlas,
      gasUsed: 1940671, gasLimit: 30000000, baseFeeGwei: 13.3, reward: 0.0309,
      transactionHashes: [HASHES.txMint]
    }
  ];

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const CHAIN_SNAPSHOT = deepFreeze({
    network: {
      name: 'Trace Mainnet', chainId: 98, symbol: 'ETH', head: 21450938,
      epoch: 28419, finality: 'finalized', blockTimeSeconds: 12,
      totalTransactions: 428710304, activeValidators: 1832
    },
    addresses,
    transactions,
    blocks
  });

  const SAMPLE_QUERIES = Object.freeze({
    address: ADDRESSES.atlas,
    transaction: HASHES.txBridge,
    block: String(CHAIN_SNAPSHOT.network.head)
  });

  return Object.freeze({ CHAIN_SNAPSHOT, SAMPLE_QUERIES, ADDRESSES, HASHES });
});
