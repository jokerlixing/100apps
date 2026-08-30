(function () {
  'use strict';

  const Core = window.TallyCore;
  const Storage = window.TallyStorage;
  const store = Storage.createStore(window.localStorage, Core);
  const INITIALIZED_KEY = 'tally96-initialized-v1';
  const categoryColors = ['#e34a32', '#55bdb3', '#f3c64d', '#5d8190', '#d4765f', '#7aa06f'];
  const fieldLabels = Object.freeze({ amount: '金额', type: '收支', category: '分类', account: '账户', date: '日期' });
  const elements = {};
  let transactions = [];
  let currentDraft = null;
  let editingId = null;
  let recognition = null;
  let listening = false;
  let toastTimer = null;

  function $(id) { return document.getElementById(id); }
  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function money(value) {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format(Number(value) || 0);
  }
  function uid() {
    return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function option(select, value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    select.append(node);
  }
  function showToast(message, type = 'success') {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast show${type === 'error' ? ' error' : ''}`;
    toastTimer = setTimeout(() => { elements.toast.className = 'toast'; }, 2800);
  }

  function demoTransactions() {
    const now = new Date();
    const dateAt = (offset) => {
      const date = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() + offset), 12);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const createdAt = new Date().toISOString();
    return [
      { id: 'demo_salary', type: 'income', amount: 12000, category: 'salary', account: 'bank', date: dateAt(-7), note: '演示 · 本月工资', transcript: '工资到账一万两千元，银行卡' },
      { id: 'demo_food', type: 'expense', amount: 32.5, category: 'food', account: 'wechat', date: dateAt(-2), note: '演示 · 午饭', transcript: '午饭花了32.5元，微信付的' },
      { id: 'demo_ride', type: 'expense', amount: 28, category: 'transport', account: 'alipay', date: dateAt(-3), note: '演示 · 下班打车', transcript: '昨天打车28块，支付宝' },
      { id: 'demo_market', type: 'expense', amount: 86.4, category: 'shopping', account: 'wechat', date: dateAt(-5), note: '演示 · 超市补货', transcript: '超市买日用品86.4元微信' },
      { id: 'demo_refund', type: 'income', amount: 45, category: 'refund', account: 'alipay', date: dateAt(-1), note: '演示 · 退货退款', transcript: '今天退款45元到支付宝' },
    ].map((item) => Core.normalizeTransaction({ ...item, createdAt, updatedAt: createdAt }));
  }

  function persist() {
    if (!store.save(transactions)) {
      showToast('浏览器没有保存这次修改，请检查存储空间或隐私设置。', 'error');
      return false;
    }
    return true;
  }

  function populateOptions() {
    for (const category of Core.CATEGORIES) {
      option(elements.categoryInput, category, Core.CATEGORY_LABELS[category]);
      option(elements.categoryFilter, category, Core.CATEGORY_LABELS[category]);
    }
    for (const account of Core.ACCOUNTS) option(elements.accountInput, account, Core.ACCOUNT_LABELS[account]);
  }

  function setEditorEnabled(enabled) {
    elements.typeSwitch.disabled = !enabled;
    [elements.amountInput, elements.dateInput, elements.categoryInput, elements.accountInput, elements.noteInput].forEach((control) => { control.disabled = !enabled; });
    elements.saveTransaction.disabled = !enabled;
  }

  function resetReceipt() {
    currentDraft = null;
    editingId = null;
    elements.receiptForm.reset();
    setEditorEnabled(false);
    elements.receiptMode.textContent = '等待原话';
    elements.receiptNumber.textContent = '096-000';
    elements.confidenceBadge.textContent = '尚未解析';
    elements.receiptMessage.textContent = '先在左侧说一句或输入文字。只有你点击“确认入账”后，数据才会保存。';
    elements.receiptMessage.className = 'receipt-message';
    elements.receiptSource.textContent = '—';
    elements.matchTape.replaceChildren();
    elements.cancelEdit.hidden = true;
    elements.saveTransaction.textContent = '确认入账';
  }

  function fillReceipt(transaction, meta = {}) {
    currentDraft = transaction;
    setEditorEnabled(true);
    elements.receiptMode.textContent = editingId ? '正在编辑已入账记录' : '本地规则解析完成';
    elements.receiptNumber.textContent = editingId ? editingId.slice(-7).toUpperCase() : `096-${String(transactions.length + 1).padStart(3, '0')}`;
    elements.amountInput.value = transaction.amount ?? '';
    elements.dateInput.value = transaction.date || today();
    elements.categoryInput.value = transaction.category || 'other';
    elements.accountInput.value = transaction.account || 'other';
    elements.noteInput.value = transaction.note || '';
    const typeInput = elements.receiptForm.querySelector(`input[name="type"][value="${transaction.type || 'expense'}"]`);
    if (typeInput) typeInput.checked = true;
    elements.receiptSource.textContent = transaction.transcript || '手动编辑';
    elements.confidenceBadge.textContent = editingId ? '人工校对中' : `识别把握 ${Math.round((meta.confidence || 0) * 100)}%`;
    const messages = [...(meta.errors || []), ...(meta.warnings || [])];
    elements.receiptMessage.textContent = messages.length ? messages.join(' ') : '金额、方向、分类和账户均已识别。入账前仍请核对。';
    elements.receiptMessage.className = `receipt-message${meta.errors?.length ? ' error' : ''}`;
    elements.matchTape.replaceChildren();
    for (const field of meta.matchedFields || []) {
      const tag = document.createElement('span');
      tag.textContent = `✓ ${fieldLabels[field] || field}`;
      elements.matchTape.append(tag);
    }
    if (!meta.matchedFields?.length) {
      const tag = document.createElement('span');
      tag.textContent = editingId ? '已载入原记录' : '请人工补齐';
      elements.matchTape.append(tag);
    }
    elements.cancelEdit.hidden = !editingId;
    elements.saveTransaction.textContent = editingId ? '保存修改' : '确认入账';
  }

  function parseCurrentInput() {
    const transcript = elements.transcriptInput.value.trim();
    if (!transcript) {
      showToast('先说一句，或输入一笔账。', 'error');
      elements.transcriptInput.focus();
      return;
    }
    editingId = null;
    const result = Core.parseTranscript(transcript, { baseDate: today() });
    fillReceipt(result.transaction, result);
    elements.receiptForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!result.ok) elements.amountInput.focus();
  }

  function readReceipt() {
    const type = elements.receiptForm.querySelector('input[name="type"]:checked')?.value || 'expense';
    const existing = editingId ? transactions.find((item) => item.id === editingId) : null;
    return Core.normalizeTransaction({
      id: existing?.id || uid(),
      type,
      amount: elements.amountInput.value,
      category: elements.categoryInput.value,
      account: elements.accountInput.value,
      date: elements.dateInput.value,
      note: elements.noteInput.value,
      transcript: currentDraft?.transcript || elements.transcriptInput.value,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function saveReceipt(event) {
    event.preventDefault();
    if (!currentDraft) return;
    const normalized = readReceipt();
    if (!normalized) {
      elements.receiptMessage.textContent = '金额必须大于 0，日期和字段也要有效。请检查小票后再保存。';
      elements.receiptMessage.className = 'receipt-message error';
      showToast('小票还有无效字段，尚未入账。', 'error');
      return;
    }
    const wasEditing = Boolean(editingId);
    if (wasEditing) transactions = transactions.map((item) => item.id === editingId ? normalized : item);
    else transactions = [normalized, ...transactions];
    if (!persist()) return;
    elements.transcriptInput.value = '';
    resetReceipt();
    render();
    showToast(wasEditing ? '这笔账已更新。' : '已确认入账。');
  }

  function editTransaction(id) {
    const item = transactions.find((transaction) => transaction.id === id);
    if (!item) return;
    editingId = id;
    elements.transcriptInput.value = item.transcript;
    fillReceipt({ ...item }, { matchedFields: [] });
    elements.receiptForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function deleteTransaction(id) {
    const item = transactions.find((transaction) => transaction.id === id);
    if (!item || !window.confirm(`删除“${item.note || Core.CATEGORY_LABELS[item.category]}”这笔账？此操作不可撤销。`)) return;
    transactions = transactions.filter((transaction) => transaction.id !== id);
    if (!persist()) return;
    if (editingId === id) resetReceipt();
    render();
    showToast('这笔账已删除。');
  }

  function renderSummary() {
    const summary = Core.summarizeMonth(transactions, elements.monthFilter.value);
    elements.summaryIncome.textContent = money(summary.income);
    elements.summaryExpense.textContent = money(summary.expense);
    elements.summaryBalance.textContent = money(summary.balance);
    elements.summaryCount.textContent = String(summary.count);
    elements.categoryBars.replaceChildren();
    elements.categoryEmpty.hidden = summary.categories.length > 0;
    summary.categories.slice(0, 6).forEach((item, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'category-bar';
      const label = document.createElement('div');
      label.className = 'bar-label';
      const name = document.createElement('span');
      name.textContent = Core.CATEGORY_LABELS[item.category];
      const value = document.createElement('span');
      value.textContent = `${money(item.amount)} · ${item.ratio.toFixed(0)}%`;
      label.append(name, value);
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.setProperty('--ratio', `${Math.max(2, item.ratio)}%`);
      fill.style.setProperty('--color', categoryColors[index % categoryColors.length]);
      track.append(fill);
      wrapper.append(label, track);
      elements.categoryBars.append(wrapper);
    });
  }

  function buildEntry(item) {
    const article = document.createElement('article');
    article.className = 'entry-card';
    article.dataset.id = item.id;
    const date = document.createElement('time');
    date.className = 'entry-date';
    date.dateTime = item.date;
    const [year, month, day] = item.date.split('-');
    const dateStrong = document.createElement('strong');
    dateStrong.textContent = `${month}.${day}`;
    date.append(dateStrong, document.createTextNode(year));
    const copy = document.createElement('div');
    copy.className = 'entry-copy';
    const title = document.createElement('strong');
    title.textContent = item.note || Core.CATEGORY_LABELS[item.category];
    const meta = document.createElement('span');
    meta.textContent = `${Core.CATEGORY_LABELS[item.category]} · ${Core.ACCOUNT_LABELS[item.account]} · ${item.transcript || '手动记录'}`;
    copy.append(title, meta);
    const amount = document.createElement('div');
    amount.className = `entry-amount ${item.type}`;
    amount.textContent = `${item.type === 'income' ? '+' : '−'}${money(item.amount)}`;
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.action = 'edit';
    edit.textContent = '编辑';
    edit.setAttribute('aria-label', `编辑 ${title.textContent}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.action = 'delete';
    remove.textContent = '删除';
    remove.setAttribute('aria-label', `删除 ${title.textContent}`);
    actions.append(edit, remove);
    article.append(date, copy, amount, actions);
    return article;
  }

  function renderEntries() {
    const filtered = Core.filterTransactions(transactions, {
      month: elements.monthFilter.value,
      type: elements.typeFilter.value,
      category: elements.categoryFilter.value,
      query: elements.searchFilter.value,
    });
    elements.entriesList.replaceChildren(...filtered.map(buildEntry));
    elements.ledgerEmpty.classList.toggle('show', filtered.length === 0);
  }

  function render() {
    renderSummary();
    renderEntries();
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCSV() {
    const filtered = Core.filterTransactions(transactions, { month: elements.monthFilter.value });
    download(`tally96-${elements.monthFilter.value}.csv`, `\ufeff${Core.toCSV(filtered)}`, 'text/csv;charset=utf-8');
    showToast(`已导出 ${filtered.length} 笔账目。`);
  }

  async function importJSON(file) {
    if (!file) return;
    try {
      const result = Core.importBackup(await file.text(), transactions, 'merge');
      if (!result.ok) throw new Error(result.error);
      transactions = result.transactions;
      if (!persist()) return;
      render();
      showToast(`导入完成；${transactions.length} 笔可用，跳过 ${result.rejected} 笔。`);
    } catch (error) {
      showToast(error.message || '无法导入这个文件。', 'error');
    } finally {
      elements.importFile.value = '';
    }
  }

  function configureSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      elements.recognitionStatus.textContent = '当前浏览器不支持语音；键盘与示例仍可完整记账';
      elements.voiceButton.disabled = true;
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    elements.recognitionStatus.textContent = '麦克风就绪；按下后说一笔账';
    recognition.onstart = () => {
      listening = true;
      document.body.classList.add('listening');
      elements.recognitionStatus.textContent = '正在听…说完后会自动生成小票';
      elements.voiceButton.querySelector('strong').textContent = '正在听，按下停止';
    };
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += text;
        else interimText += text;
      }
      elements.transcriptInput.value = finalText || interimText;
      if (finalText) parseCurrentInput();
    };
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': '麦克风权限未开启；可以直接输入或点示例。',
        'no-speech': '没有听到内容；请靠近麦克风再试，或直接输入。',
        network: '浏览器语音服务暂时不可用；键盘记账不受影响。',
      };
      elements.recognitionStatus.textContent = messages[event.error] || '这次没有识别成功；可以直接输入。';
      showToast(elements.recognitionStatus.textContent, 'error');
    };
    recognition.onend = () => {
      listening = false;
      document.body.classList.remove('listening');
      elements.voiceButton.querySelector('strong').textContent = '按下说一笔';
      if (!elements.transcriptInput.value.trim()) elements.recognitionStatus.textContent = '麦克风就绪；按下后说一笔账';
    };
  }

  function bindEvents() {
    elements.parseButton.addEventListener('click', parseCurrentInput);
    elements.transcriptInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') parseCurrentInput();
    });
    elements.voiceButton.addEventListener('click', () => {
      if (!recognition) return;
      if (listening) recognition.stop();
      else {
        elements.transcriptInput.value = '';
        try { recognition.start(); } catch { showToast('语音识别正在启动，请稍后再试。', 'error'); }
      }
    });
    document.querySelectorAll('[data-example]').forEach((button) => button.addEventListener('click', () => {
      elements.transcriptInput.value = button.dataset.example;
      parseCurrentInput();
    }));
    elements.receiptForm.addEventListener('submit', saveReceipt);
    elements.cancelEdit.addEventListener('click', resetReceipt);
    elements.entriesList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      const card = button?.closest('.entry-card');
      if (!button || !card) return;
      if (button.dataset.action === 'edit') editTransaction(card.dataset.id);
      else deleteTransaction(card.dataset.id);
    });
    [elements.monthFilter, elements.typeFilter, elements.categoryFilter].forEach((control) => control.addEventListener('change', render));
    elements.searchFilter.addEventListener('input', renderEntries);
    elements.resetFilters.addEventListener('click', () => {
      elements.searchFilter.value = '';
      elements.typeFilter.value = 'all';
      elements.categoryFilter.value = 'all';
      renderEntries();
    });
    elements.exportCsv.addEventListener('click', exportCSV);
    elements.exportJson.addEventListener('click', () => {
      download(`tally96-backup-${today()}.json`, Core.exportBackup(transactions), 'application/json;charset=utf-8');
      showToast('JSON 备份已导出。');
    });
    elements.importTrigger.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', () => importJSON(elements.importFile.files[0]));
    elements.resetDemo.addEventListener('click', () => {
      if (!window.confirm('恢复演示账本会替换当前全部账目。继续吗？')) return;
      transactions = demoTransactions();
      persist();
      resetReceipt();
      render();
      showToast('已恢复 5 条演示账目。');
    });
    elements.clearLedger.addEventListener('click', () => {
      if (!window.confirm('清空全部账目？请先导出备份；此操作不可撤销。')) return;
      transactions = [];
      persist();
      resetReceipt();
      render();
      showToast('账本已清空。');
    });
  }

  function cacheElements() {
    const ids = [
      'recognition-status', 'voice-button', 'transcript-input', 'parse-button', 'receipt-form', 'receipt-number',
      'receipt-mode', 'confidence-badge', 'receipt-message', 'type-switch', 'amount-input', 'date-input',
      'category-input', 'account-input', 'note-input', 'receipt-source', 'match-tape', 'cancel-edit',
      'save-transaction', 'month-filter', 'summary-income', 'summary-expense', 'summary-balance', 'summary-count',
      'category-bars', 'category-empty', 'search-filter', 'type-filter', 'category-filter', 'reset-filters',
      'entries-list', 'ledger-empty', 'export-csv', 'export-json', 'import-trigger', 'import-file', 'reset-demo',
      'clear-ledger', 'toast',
    ];
    ids.forEach((id) => { elements[id.replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = $(id); });
  }

  function init() {
    cacheElements();
    populateOptions();
    elements.monthFilter.value = today().slice(0, 7);
    transactions = store.load();
    if (!localStorage.getItem(INITIALIZED_KEY)) {
      transactions = demoTransactions();
      persist();
      localStorage.setItem(INITIALIZED_KEY, 'yes');
    }
    resetReceipt();
    configureSpeech();
    bindEvents();
    render();
    document.body.classList.add('ready');
  }

  init();
})();
