(function startExplorer() {
  'use strict';

  const core = globalThis.ExplorerCore;
  const data = globalThis.ChainData;
  if (!core || !data) throw new Error('Trace/98 dependencies failed to load');

  const {
    buildIndex,
    lookupEntity,
    getAddressActivity,
    shortenHash,
    formatAmount,
    formatGasFee,
    formatTimestamp
  } = core;
  const { CHAIN_SNAPSHOT: snapshot, SAMPLE_QUERIES } = data;
  const index = buildIndex(snapshot);
  const symbol = snapshot.network.symbol;

  const dom = {
    searchForm: document.querySelector('#searchForm'),
    queryInput: document.querySelector('#queryInput'),
    searchMessage: document.querySelector('#searchMessage'),
    resultPanel: document.querySelector('#resultPanel'),
    blockTape: document.querySelector('#blockTape'),
    transactionRows: document.querySelector('#transactionRows'),
    networkStats: document.querySelector('#networkStats'),
    networkName: document.querySelector('#networkName'),
    heroHead: document.querySelector('#heroHead'),
    heroTransactions: document.querySelector('#heroTransactions'),
    heroValidators: document.querySelector('#heroValidators'),
    headClock: document.querySelector('#headClock'),
    headPulse: document.querySelector('#headPulse'),
    toast: document.querySelector('#toast')
  };

  let currentResult = null;
  let toastTimer = 0;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function number(value) {
    return Number(value).toLocaleString('en-US');
  }

  function percent(value, maximum) {
    if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return '—';
    return `${(value / maximum * 100).toFixed(1)}%`;
  }

  function addressRecord(address) {
    return index.addresses.get(String(address).toLowerCase());
  }

  function addressLabel(address) {
    return addressRecord(address)?.label || shortenHash(address);
  }

  function statusLabel(status) {
    return ({ success: '成功', failed: '失败', pending: '等待确认' })[status] || status;
  }

  function typeLabel(type) {
    return ({ block: '区块', transaction: '交易', address: '地址' })[type] || '记录';
  }

  function queryButton(query, label, className = '') {
    const button = node('button', className, label);
    button.type = 'button';
    button.dataset.query = String(query);
    button.setAttribute('aria-label', `查询 ${label}`);
    return button;
  }

  function copyButton(value, label = '复制') {
    const button = node('button', 'copy-button', label);
    button.type = 'button';
    button.dataset.copy = String(value);
    button.setAttribute('aria-label', `复制 ${shortenHash(value)}`);
    return button;
  }

  function badge(text, status = '') {
    return node('span', `status-badge ${status}`.trim(), text);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), 2200);
  }

  async function copyText(value) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = node('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('copy command rejected');
      }
      showToast('已复制到剪贴板');
    } catch {
      showToast('浏览器未允许复制，请手动选择文本');
    }
  }

  function makeEntityHeader({ type, eyebrow, title, description, identity, status, statusClass }) {
    const header = node('header', 'entity-header');
    const kicker = node('div', 'entity-kicker');
    kicker.append(node('span', 'type-badge', typeLabel(type).toUpperCase()), node('span', '', eyebrow));
    if (status) kicker.append(badge(status, statusClass));
    header.append(kicker, node('h2', '', title), node('p', '', description));
    if (identity) {
      const line = node('div', 'identity-line');
      line.append(node('code', '', identity), copyButton(identity));
      header.append(line);
    }
    return header;
  }

  function field(label, value, options = {}) {
    const item = node('dl', 'field');
    item.append(node('dt', '', label));
    const content = node('dd');
    if (options.query) content.append(queryButton(options.query, options.display || value, 'field-action'));
    else if (options.strong) content.append(node('strong', '', value));
    else content.textContent = String(value);
    item.append(content);
    return item;
  }

  function makeFieldGrid(items) {
    const grid = node('div', 'field-grid');
    for (const item of items) grid.append(field(item.label, item.value, item));
    return grid;
  }

  function relatedSection(title, items, counterLabel) {
    const section = node('section', 'related-section');
    const heading = node('div', 'related-heading');
    heading.append(node('h3', '', title), node('span', '', counterLabel || `${items.length} RECORDS`));
    const list = node('div', 'related-list');
    for (const item of items) {
      const row = node('div', 'related-row');
      row.append(queryButton(item.query, item.primary), node('span', '', item.secondary), node('strong', '', item.trailing));
      list.append(row);
    }
    section.append(heading, list);
    return section;
  }

  function renderBlock(block) {
    const validator = addressRecord(block.validator);
    const transactions = block.transactionHashes.map((hash) => index.transactions.get(hash.toLowerCase())).filter(Boolean);
    dom.resultPanel.replaceChildren(
      makeEntityHeader({
        type: 'block',
        eyebrow: `CANONICAL / EPOCH ${number(snapshot.network.epoch)}`,
        title: `区块 #${number(block.number)}`,
        description: `${transactions.length} 笔交易已经写入这个区块，并由 ${validator?.label || '未知验证者'} 提议。`,
        identity: block.hash,
        status: '已最终确认'
      }),
      makeFieldGrid([
        { label: '时间', value: formatTimestamp(block.timestamp) },
        { label: '父区块', value: shortenHash(block.parentHash), query: block.number > snapshot.blocks.at(-1).number ? String(block.number - 1) : null },
        { label: '验证者', value: addressLabel(block.validator), query: block.validator, display: addressLabel(block.validator) },
        { label: '区块奖励', value: formatAmount(block.reward, 4, symbol), strong: true },
        { label: 'Gas 使用', value: `${number(block.gasUsed)} / ${number(block.gasLimit)} · ${percent(block.gasUsed, block.gasLimit)}` },
        { label: '基础费', value: `${block.baseFeeGwei.toFixed(2)} Gwei` }
      ]),
      relatedSection('区块内交易', transactions.map((transaction) => ({
        query: transaction.hash,
        primary: shortenHash(transaction.hash),
        secondary: `${transaction.method} · ${addressLabel(transaction.from)} → ${addressLabel(transaction.to)}`,
        trailing: formatAmount(transaction.value, 4, symbol)
      })), `${transactions.length} TRANSACTIONS`)
    );
  }

  function renderTransaction(transaction) {
    const isPending = transaction.status === 'pending';
    const blockDisplay = isPending ? '等待打包' : `#${number(transaction.blockNumber)}`;
    const content = [
      makeEntityHeader({
        type: 'transaction',
        eyebrow: isPending ? 'MEMPOOL / OBSERVED' : `BLOCK ${number(transaction.blockNumber)} / INDEX ${transaction.transactionIndex}`,
        title: `交易 ${shortenHash(transaction.hash, 12, 8)}`,
        description: isPending ? '这笔交易仍在内存池中等待验证者打包。' : `从 ${addressLabel(transaction.from)} 发往 ${addressLabel(transaction.to)}，执行方法 ${transaction.method}。`,
        identity: transaction.hash,
        status: statusLabel(transaction.status),
        statusClass: transaction.status
      }),
      makeFieldGrid([
        { label: '区块', value: blockDisplay, query: isPending ? null : String(transaction.blockNumber), display: blockDisplay },
        { label: '确认数', value: isPending ? '0 · UNCONFIRMED' : `${number(transaction.confirmations)} confirmations` },
        { label: '发送方', value: addressLabel(transaction.from), query: transaction.from, display: addressLabel(transaction.from) },
        { label: '接收方', value: addressLabel(transaction.to), query: transaction.to, display: addressLabel(transaction.to) },
        { label: '金额', value: formatAmount(transaction.value, 4, symbol), strong: true },
        { label: '交易费用', value: formatGasFee(transaction.gasUsed, transaction.gasPriceGwei, symbol) },
        { label: '方法', value: transaction.method },
        { label: 'Nonce / Gas 价格', value: `${number(transaction.nonce)} / ${transaction.gasPriceGwei.toFixed(2)} Gwei` },
        { label: '首次观察', value: formatTimestamp(transaction.timestamp) },
        { label: '输入数据', value: transaction.input === '0x' ? '0x · plain transfer' : shortenHash(transaction.input, 18, 10) }
      ])
    ];
    if (transaction.error) content.push(node('div', 'failure-note', transaction.error));
    content.push(relatedSection('资金路径', [
      { query: transaction.from, primary: addressLabel(transaction.from), secondary: 'FROM / 发起账户', trailing: shortenHash(transaction.from) },
      { query: transaction.to, primary: addressLabel(transaction.to), secondary: 'TO / 接收账户', trailing: shortenHash(transaction.to) }
    ], '2 ADDRESSES'));
    dom.resultPanel.replaceChildren(...content);
  }

  function renderAddress(address) {
    const activity = getAddressActivity(snapshot, address.address);
    const kind = ({ wallet: '外部账户', contract: '智能合约', validator: '验证者' })[address.type] || address.type;
    dom.resultPanel.replaceChildren(
      makeEntityHeader({
        type: 'address',
        eyebrow: `${String(address.type).toUpperCase()} / OBSERVED ACCOUNT`,
        title: address.label,
        description: address.note,
        identity: address.address,
        status: kind
      }),
      makeFieldGrid([
        { label: '余额', value: formatAmount(address.balance, 4, symbol), strong: true },
        { label: '账户类型', value: kind },
        { label: '快照内交易', value: `${activity.total} 笔` },
        { label: '发送 / 接收', value: `${activity.sent} / ${activity.received}` },
        { label: '快照净流量', value: `${activity.netValue >= 0 ? '+' : ''}${formatAmount(activity.netValue, 4, symbol)}` },
        { label: '地址标签', value: 'TRACE LABEL / VERIFIED' }
      ]),
      relatedSection('地址活动', activity.transactions.map((transaction) => ({
        query: transaction.hash,
        primary: shortenHash(transaction.hash),
        secondary: `${transaction.direction === 'in' ? '接收' : transaction.direction === 'out' ? '发送' : '自转'} · ${transaction.method} · ${statusLabel(transaction.status)}`,
        trailing: `${transaction.direction === 'out' ? '−' : transaction.direction === 'in' ? '+' : ''}${formatAmount(transaction.value, 4, symbol)}`
      })), `${activity.total} TRANSACTIONS`)
    );
  }

  function renderError(error, query) {
    const validButMissing = error && error.code === 'NOT_FOUND';
    const wrapper = node('div', 'empty-state');
    wrapper.append(
      node('div', 'empty-code', validButMissing ? '404' : '400'),
      node('h2', '', validButMissing ? '快照里没有这条记录' : '无法识别这次查询'),
      node('p', '', validButMissing
        ? `“${shortenHash(query, 18, 10)}” 格式有效，但不在当前演示快照内。可以换用下面的已知记录。`
        : '请输入十进制区块高度、0x 开头的 40 位地址，或 0x 开头的 64 位交易哈希。')
    );
    const actions = node('div', 'empty-actions');
    actions.append(
      queryButton(SAMPLE_QUERIES.address, '查看示例地址'),
      queryButton(SAMPLE_QUERIES.transaction, '查看示例交易'),
      queryButton(SAMPLE_QUERIES.block, '查看最新区块')
    );
    wrapper.append(actions);
    dom.resultPanel.replaceChildren(wrapper);
  }

  function updateSelectedBlock() {
    const selectedNumber = currentResult?.type === 'block' ? currentResult.entity.number : currentResult?.type === 'transaction' ? currentResult.entity.blockNumber : null;
    dom.blockTape.querySelectorAll('.block-card').forEach((card) => {
      const selected = Number(card.dataset.blockNumber) === selectedNumber;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function updateUrl(value, mode) {
    if (!mode) return;
    const url = new URL(window.location.href);
    url.searchParams.set('q', String(value).trim());
    history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
  }

  function renderQuery(value, options = {}) {
    const query = String(value ?? '').trim();
    dom.queryInput.value = query;
    dom.searchMessage.textContent = '';
    try {
      currentResult = lookupEntity(snapshot, query);
      if (currentResult.type === 'block') renderBlock(currentResult.entity);
      else if (currentResult.type === 'transaction') renderTransaction(currentResult.entity);
      else renderAddress(currentResult.entity);
      document.body.dataset.view = currentResult.type;
      updateUrl(currentResult.query.normalized, options.historyMode);
    } catch (error) {
      currentResult = null;
      document.body.dataset.view = 'empty';
      renderError(error, query);
      dom.searchMessage.textContent = error?.message || '查询失败，请检查输入。';
      updateUrl(query || 'invalid', options.historyMode);
    }
    updateSelectedBlock();
    if (options.focus) dom.resultPanel.focus({ preventScroll: true });
    if (options.scroll) dom.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderBlockTape() {
    dom.blockTape.replaceChildren();
    for (const block of snapshot.blocks) {
      const button = node('button', 'block-card');
      button.type = 'button';
      button.dataset.query = String(block.number);
      button.dataset.blockNumber = String(block.number);
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `查看区块 ${block.number}`);
      const top = node('span', 'block-top');
      top.append(node('span', '', block.number === snapshot.network.head ? 'CHAIN HEAD' : 'FINALIZED'), node('span', '', `${block.transactionHashes.length} TX`));
      const foot = node('span', 'block-foot');
      foot.append(node('span', '', shortenHash(block.hash, 8, 4)), node('span', '', `${percent(block.gasUsed, block.gasLimit)} GAS`));
      button.append(top, node('strong', '', `#${number(block.number)}`), node('code', '', formatTimestamp(block.timestamp)), foot);
      dom.blockTape.append(button);
    }
  }

  function renderNetworkStats() {
    const averageGas = snapshot.blocks.reduce((sum, block) => sum + block.gasUsed / block.gasLimit, 0) / snapshot.blocks.length * 100;
    const pending = snapshot.transactions.filter((transaction) => transaction.status === 'pending').length;
    const rows = [
      ['平均出块时间', `${snapshot.network.blockTimeSeconds}s`, 'LAST 5 BLOCKS'],
      ['纪元', number(snapshot.network.epoch), 'FINALIZED'],
      ['平均 Gas 使用', `${averageGas.toFixed(1)}%`, 'CAPACITY'],
      ['等待确认', `${pending} 笔`, 'MEMPOOL'],
      ['快照地址', `${snapshot.addresses.length} 个`, 'LABELED']
    ];
    dom.networkStats.replaceChildren(...rows.map(([label, value, note]) => {
      const row = node('div', 'stat-row');
      const strong = node('strong', '', value);
      strong.append(node('small', '', note));
      row.append(node('span', '', label), strong);
      return row;
    }));
  }

  function renderTransactions() {
    const transactions = [...snapshot.transactions].sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
    dom.transactionRows.replaceChildren(...transactions.map((transaction) => {
      const row = node('div', 'transaction-row');
      row.setAttribute('role', 'row');

      const primary = node('div', 'tx-primary');
      primary.append(queryButton(transaction.hash, shortenHash(transaction.hash, 10, 6)), node('small', '', transaction.method));

      const block = transaction.blockNumber === null
        ? node('span', 'tx-block', 'MEMPOOL')
        : queryButton(String(transaction.blockNumber), `#${String(transaction.blockNumber).slice(-6)}`, 'tx-block');

      const party = node('div', 'tx-party');
      const from = node('div');
      from.append(queryButton(transaction.from, addressLabel(transaction.from)), node('small', '', 'FROM'));
      const to = node('div');
      to.append(queryButton(transaction.to, addressLabel(transaction.to)), node('small', '', 'TO'));
      party.append(from, node('span', '', '→'), to);

      row.append(primary, block, party, node('strong', 'tx-amount', formatAmount(transaction.value, 2, symbol)), badge(statusLabel(transaction.status), transaction.status));
      return row;
    }));
  }

  function hydrateSamples() {
    document.querySelectorAll('[data-sample]').forEach((button) => {
      const query = SAMPLE_QUERIES[button.dataset.sample];
      button.dataset.query = query;
      button.title = query;
    });
  }

  function hydrateHeader() {
    dom.networkName.textContent = snapshot.network.name;
    dom.heroHead.textContent = `#${number(snapshot.network.head)}`;
    dom.heroTransactions.textContent = number(snapshot.network.totalTransactions);
    dom.heroValidators.textContent = number(snapshot.network.activeValidators);
  }

  function startHeadClock() {
    let remaining = snapshot.network.blockTimeSeconds;
    dom.headClock.textContent = `下一块 ~${remaining}s`;
    window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = snapshot.network.blockTimeSeconds;
        dom.headPulse.classList.remove('pulse');
        window.requestAnimationFrame(() => dom.headPulse.classList.add('pulse'));
      }
      dom.headClock.textContent = `下一块 ~${remaining}s`;
    }, 1000);
  }

  dom.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    renderQuery(dom.queryInput.value, { historyMode: 'push', focus: true, scroll: true });
  });

  document.addEventListener('click', (event) => {
    const copyTarget = event.target.closest('[data-copy]');
    if (copyTarget) {
      copyText(copyTarget.dataset.copy);
      return;
    }
    const queryTarget = event.target.closest('[data-query]');
    if (queryTarget) renderQuery(queryTarget.dataset.query, { historyMode: 'push', focus: true, scroll: true });
  });

  window.addEventListener('popstate', () => {
    const query = new URL(window.location.href).searchParams.get('q');
    renderQuery(query || SAMPLE_QUERIES.block);
  });

  hydrateSamples();
  hydrateHeader();
  renderBlockTape();
  renderNetworkStats();
  renderTransactions();
  startHeadClock();

  const initialQuery = new URL(window.location.href).searchParams.get('q');
  renderQuery(initialQuery || SAMPLE_QUERIES.block);
  document.body.classList.add('ready');
})();
