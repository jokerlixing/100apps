(function () {
  'use strict';

  const Core = window.SubscriptionCore;
  const STORAGE_KEY = 'due76.subscriptions.v1';
  const CATEGORY_LABELS = {
    entertainment: '影音娱乐',
    productivity: '效率工具',
    cloud: '云服务',
    learning: '学习成长',
    lifestyle: '生活会员',
    other: '其他',
  };
  const CYCLE_LABELS = { weekly: '每周', monthly: '每月', quarterly: '每季', yearly: '每年' };
  const STATE_PRIORITY = { overdue: 0, due: 1, upcoming: 2, later: 3, paused: 4 };

  const elements = Object.fromEntries([
    'todayLabel', 'activeCount', 'monthlyTotal', 'dueCount', 'renewalCount', 'annualTotal', 'foreignTotals',
    'categoryBars', 'addButton', 'sampleButton', 'exportButton', 'importButton', 'clearButton', 'importFile',
    'timelineSummary', 'nextCallout', 'timelineTickets', 'timelineEmpty', 'resultCount', 'searchInput',
    'categoryFilter', 'statusFilter', 'subscriptionList', 'ledgerEmpty', 'editorDialog', 'editorTitle',
    'subscriptionForm', 'subscriptionId', 'nameInput', 'amountInput', 'currencyInput', 'cycleInput',
    'renewalInput', 'categoryInput', 'reminderInput', 'paymentInput', 'notesInput', 'notesCount', 'formError',
    'deleteDialog', 'deleteMessage', 'confirmDelete', 'importDialog', 'importMessage', 'mergeImport',
    'replaceImport', 'clearDialog', 'confirmClear', 'liveRegion',
  ].map((id) => [id, document.getElementById(id)]));

  let subscriptions = loadSubscriptions();
  let deleteTargetId = '';
  let pendingImport = '';

  function loadSubscriptions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Core.normalizeSubscriptions(raw ? JSON.parse(raw) : []);
    } catch (error) {
      return [];
    }
  }

  function saveSubscriptions(message) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
      if (message) announce(message);
      return true;
    } catch (error) {
      announce('浏览器无法保存数据，请检查隐私或存储设置。');
      return false;
    }
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    window.requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
  }

  function money(amount, currency, digits = 2) {
    try {
      return new Intl.NumberFormat('zh-CN', {
        style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
      }).format(amount || 0);
    } catch (error) {
      return `${currency} ${Number(amount || 0).toFixed(digits)}`;
    }
  }

  function readableDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return '日期无效';
    return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(year, month - 1, day, 12));
  }

  function dateOffset(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderSummary() {
    const today = Core.todayString();
    const summary = Core.summarizeSubscriptions(subscriptions, today);
    const cny = summary.totals.CNY || { monthly: 0, annual: 0 };
    elements.activeCount.textContent = `${summary.activeCount} 项生效`;
    elements.monthlyTotal.textContent = money(cny.monthly, 'CNY');
    elements.dueCount.textContent = String(summary.dueCount);
    elements.renewalCount.textContent = String(summary.renewal30Count);
    elements.annualTotal.textContent = money(cny.annual, 'CNY', 0);

    elements.foreignTotals.replaceChildren();
    Object.entries(summary.totals).filter(([currency]) => currency !== 'CNY').forEach(([currency, total]) => {
      elements.foreignTotals.append(createElement('span', '', `${currency} 月均 ${money(total.monthly, currency)}`));
    });

    const categories = Core.groupByCategory(subscriptions, 'CNY');
    elements.categoryBars.replaceChildren();
    if (!categories.length) {
      elements.categoryBars.append(createElement('p', 'category-empty', '登记人民币订阅后，这里会按分类显示月度构成。'));
    } else {
      const max = Math.max(...categories.map((item) => item.monthly), 1);
      categories.forEach((item) => {
        const row = createElement('div', 'category-row');
        row.append(createElement('span', '', CATEGORY_LABELS[item.category]));
        const track = createElement('span', 'bar-track');
        const fill = createElement('i');
        fill.style.setProperty('--width', `${Math.max(4, (item.monthly / max) * 100)}%`);
        track.append(fill);
        row.append(track, createElement('strong', '', money(item.monthly, 'CNY', 0)));
        elements.categoryBars.append(row);
      });
    }
    return summary;
  }

  function renderTimeline(summary) {
    const timeline = Core.buildTimeline(subscriptions, Core.todayString(), 30);
    elements.timelineTickets.replaceChildren();
    elements.timelineEmpty.hidden = timeline.length > 0;
    document.querySelector('.tape-scroll').hidden = timeline.length === 0;
    elements.timelineSummary.textContent = timeline.length ? `${timeline.length} 笔进入视野` : '暂无 30 天内续费';

    if (summary.next) {
      elements.nextCallout.hidden = false;
      const state = Core.renewalState(summary.next, Core.todayString());
      elements.nextCallout.replaceChildren(
        createElement('span', '', `下一笔 · ${summary.next.name} · ${readableDate(summary.next.nextRenewal)}`),
        createElement('strong', '', `${money(summary.next.amount, summary.next.currency)} · ${state.label}`),
      );
    } else {
      elements.nextCallout.hidden = true;
      elements.nextCallout.replaceChildren();
    }

    timeline.forEach((item, index) => {
      const ticket = createElement('article', 'timeline-ticket');
      const state = Core.renewalState(item, Core.todayString());
      const position = 6 + (Math.max(0, Math.min(30, item.days)) / 30) * 88;
      ticket.dataset.state = state.key;
      ticket.style.setProperty('--position', `${position}%`);
      ticket.style.setProperty('--lane', `${index % 2 === 0 ? 13 : 139}px`);
      ticket.style.setProperty('--tilt', `${index % 3 === 0 ? -1.2 : index % 3 === 1 ? .8 : -.3}deg`);
      ticket.style.setProperty('--order', String(index));
      const button = createElement('button');
      button.type = 'button';
      button.dataset.action = 'edit';
      button.dataset.id = item.id;
      button.setAttribute('aria-label', `编辑 ${item.name}，${state.label}，金额 ${money(item.amount, item.currency)}`);
      const dateRow = createElement('span', 'ticket-date');
      dateRow.append(createElement('span', '', readableDate(item.nextRenewal)), createElement('span', '', state.label));
      button.append(dateRow, createElement('strong', '', item.name), createElement('b', '', money(item.amount, item.currency)));
      ticket.append(button);
      elements.timelineTickets.append(ticket);
    });
  }

  function filteredSubscriptions() {
    const query = elements.searchInput.value.trim().toLocaleLowerCase('zh-CN');
    const category = elements.categoryFilter.value;
    const status = elements.statusFilter.value;
    return subscriptions.filter((item) => {
      const state = Core.renewalState(item, Core.todayString());
      const haystack = `${item.name} ${item.payment} ${item.notes}`.toLocaleLowerCase('zh-CN');
      const queryMatch = !query || haystack.includes(query);
      const categoryMatch = category === 'all' || item.category === category;
      const statusMatch = status === 'all'
        || (status === 'attention' && ['overdue', 'due'].includes(state.key))
        || (status === 'active' && item.status === 'active')
        || (status === 'paused' && item.status === 'paused');
      return queryMatch && categoryMatch && statusMatch;
    }).sort((a, b) => {
      const aState = Core.renewalState(a, Core.todayString());
      const bState = Core.renewalState(b, Core.todayString());
      return STATE_PRIORITY[aState.key] - STATE_PRIORITY[bState.key]
        || (aState.days ?? 99999) - (bState.days ?? 99999)
        || a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function renderLedger() {
    const items = filteredSubscriptions();
    elements.subscriptionList.replaceChildren();
    elements.resultCount.textContent = `${items.length} 项`;
    elements.ledgerEmpty.hidden = subscriptions.length > 0 || items.length > 0;

    if (subscriptions.length > 0 && items.length === 0) {
      const noResults = createElement('div', 'ledger-empty');
      noResults.append(createElement('p', 'empty-code', 'NO MATCHING SLIPS'), createElement('h3', '', '没有符合筛选的订阅'), createElement('p', '', '调整搜索词或筛选条件即可看到完整台账。'));
      elements.subscriptionList.append(noResults);
    }

    items.forEach((item, index) => {
      const state = Core.renewalState(item, Core.todayString());
      const card = createElement('article', 'subscription-card');
      card.dataset.index = String(index + 1).padStart(2, '0');
      card.dataset.id = item.id;

      const main = createElement('div', 'card-main');
      main.append(createElement('span', 'card-category', CATEGORY_LABELS[item.category]), createElement('h3', '', item.name));
      main.append(createElement('p', 'card-note', item.notes || item.payment || '没有备注'));

      const amount = createElement('div', 'card-money');
      amount.append(createElement('strong', '', money(item.amount, item.currency)), createElement('span', '', `${CYCLE_LABELS[item.cycle]} · 月均 ${money(Core.monthlyEquivalent(item), item.currency)}`));

      const renewal = createElement('div', 'card-renewal');
      renewal.append(createElement('strong', '', readableDate(item.nextRenewal)));
      renewal.append(createElement('span', `status-badge status-${state.key}`, state.label));

      const actions = createElement('div', 'card-actions');
      if (['overdue', 'due'].includes(state.key) && item.status === 'active') actions.append(actionButton('renew', item.id, '已续费'));
      actions.append(actionButton('edit', item.id, '编辑'));
      actions.append(actionButton('toggle', item.id, item.status === 'paused' ? '恢复' : '暂停'));
      actions.append(actionButton('delete', item.id, '删除'));
      card.append(main, amount, renewal, actions);
      elements.subscriptionList.append(card);
    });
  }

  function actionButton(action, id, label) {
    const button = createElement('button', '', label);
    button.type = 'button';
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  function render() {
    const summary = renderSummary();
    renderTimeline(summary);
    renderLedger();
    elements.sampleButton.hidden = subscriptions.length > 0;
  }

  function showDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function openEditor(item) {
    elements.subscriptionForm.reset();
    elements.formError.textContent = '';
    const isEditing = Boolean(item);
    elements.editorTitle.textContent = isEditing ? '编辑订阅' : '登记新订阅';
    elements.subscriptionId.value = item ? item.id : '';
    elements.nameInput.value = item ? item.name : '';
    elements.amountInput.value = item ? item.amount : '';
    elements.currencyInput.value = item ? item.currency : 'CNY';
    elements.cycleInput.value = item ? item.cycle : 'monthly';
    elements.renewalInput.value = item ? item.nextRenewal : dateOffset(7);
    elements.categoryInput.value = item ? item.category : 'entertainment';
    elements.reminderInput.value = item ? String(item.reminderDays) : '7';
    elements.paymentInput.value = item ? item.payment : '';
    elements.notesInput.value = item ? item.notes : '';
    elements.notesCount.textContent = String(elements.notesInput.value.length);
    showDialog(elements.editorDialog);
    window.setTimeout(() => elements.nameInput.focus(), 0);
  }

  function handleSubscriptionSubmit(event) {
    event.preventDefault();
    const existing = subscriptions.find((item) => item.id === elements.subscriptionId.value);
    const now = new Date().toISOString();
    const data = new FormData(elements.subscriptionForm);
    const candidate = Core.normalizeSubscription({
      id: existing ? existing.id : `sub_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`,
      name: data.get('name'), amount: data.get('amount'), currency: data.get('currency'), cycle: data.get('cycle'),
      nextRenewal: data.get('nextRenewal'), category: data.get('category'), reminderDays: data.get('reminderDays'),
      payment: data.get('payment'), notes: data.get('notes'), status: existing ? existing.status : 'active',
      createdAt: existing ? existing.createdAt : now, updatedAt: now,
    }, now);
    if (!candidate) {
      elements.formError.textContent = '请填写名称、有效金额和下次续费日。';
      return;
    }
    subscriptions = existing ? subscriptions.map((item) => item.id === existing.id ? candidate : item) : [...subscriptions, candidate];
    if (saveSubscriptions(existing ? `已更新 ${candidate.name}。` : `已登记 ${candidate.name}。`)) {
      closeDialog(elements.editorDialog);
      render();
    }
  }

  function handleLedgerAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const item = subscriptions.find((candidate) => candidate.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'edit') openEditor(item);
    if (button.dataset.action === 'toggle') {
      subscriptions = subscriptions.map((candidate) => candidate.id === item.id ? { ...candidate, status: candidate.status === 'paused' ? 'active' : 'paused', updatedAt: new Date().toISOString() } : candidate);
      saveSubscriptions(item.status === 'paused' ? `已恢复 ${item.name}。` : `已暂停 ${item.name}。`);
      render();
    }
    if (button.dataset.action === 'renew') {
      const advanced = Core.advanceRenewal(item, Core.todayString());
      if (advanced) {
        subscriptions = subscriptions.map((candidate) => candidate.id === item.id ? advanced : candidate);
        saveSubscriptions(`${item.name} 的下次续费日已推进。`);
        render();
      }
    }
    if (button.dataset.action === 'delete') {
      deleteTargetId = item.id;
      elements.deleteMessage.textContent = `“${item.name}”将从本地账本删除。删除后只能通过先前导出的备份恢复。`;
      showDialog(elements.deleteDialog);
    }
  }

  function sampleSubscriptions() {
    const now = new Date().toISOString();
    return [
      ['stream', '幕布影院家庭版', 58, 'CNY', 'monthly', 2, 'entertainment', 'Visa · 2048', 7, '家庭共享，续费前确认成员使用情况'],
      ['cloud', 'Nimbus 云盘 2TB', 68, 'CNY', 'monthly', 6, 'cloud', '支付宝', 7, '工作素材与照片备份'],
      ['design', 'FrameForge Pro', 168, 'USD', 'yearly', 12, 'productivity', 'Visa · 2048', 14, '年度方案，下次评估团队席位'],
      ['learn', '字句写作课', 198, 'CNY', 'quarterly', 24, 'learning', '微信支付', 7, '每季度更新课程包'],
      ['music', '回声音乐', 18, 'CNY', 'monthly', -2, 'entertainment', '运营商代扣', 3, '检查是否已实际扣款'],
      ['gym', '城市运动月卡', 199, 'CNY', 'monthly', 18, 'lifestyle', '微信支付', 7, '出差期间暂停', 'paused'],
    ].map(([suffix, name, amount, currency, cycle, offset, category, payment, reminderDays, notes, status = 'active']) => Core.normalizeSubscription({
      id: `sample_${suffix}`, name, amount, currency, cycle, nextRenewal: dateOffset(offset), category, payment, reminderDays, notes, status, createdAt: now, updatedAt: now,
    }, now));
  }

  function loadSamples() {
    const current = new Map(subscriptions.map((item) => [item.id, item]));
    sampleSubscriptions().forEach((item) => current.set(item.id, item));
    subscriptions = [...current.values()];
    saveSubscriptions('已装入 6 项示例订阅，可自由编辑或删除。');
    render();
  }

  function exportBackup() {
    if (!subscriptions.length) {
      announce('账本为空，暂无可导出的订阅。');
      return;
    }
    const blob = new Blob([JSON.stringify(Core.createBackup(subscriptions), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `due76-backup-${Core.todayString()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    announce(`已导出 ${subscriptions.length} 项订阅。`);
  }

  async function readImportFile(file) {
    if (!file) return;
    if (file.size > 1_000_000) {
      announce('备份文件超过 1 MB，未读取。');
      return;
    }
    try {
      pendingImport = await file.text();
      const preview = Core.importBackup(pendingImport, [], 'replace');
      if (!preview.ok) {
        pendingImport = '';
        announce(preview.error);
        return;
      }
      elements.importMessage.textContent = `备份包含 ${preview.accepted} 项有效订阅，${preview.rejected} 项未通过校验。请选择合并或替换。`;
      showDialog(elements.importDialog);
    } catch (error) {
      pendingImport = '';
      announce('无法读取所选备份文件。');
    } finally {
      elements.importFile.value = '';
    }
  }

  function applyImport(mode) {
    if (!pendingImport) return;
    const result = Core.importBackup(pendingImport, subscriptions, mode);
    pendingImport = '';
    if (!result.ok) {
      announce(result.error);
      return;
    }
    subscriptions = result.subscriptions;
    saveSubscriptions(`已${mode === 'replace' ? '替换' : '合并'}账本：接收 ${result.accepted} 项，跳过 ${result.rejected} 项。`);
    render();
  }

  elements.addButton.addEventListener('click', () => openEditor());
  document.querySelector('[data-empty-add]').addEventListener('click', () => openEditor());
  elements.sampleButton.addEventListener('click', loadSamples);
  elements.subscriptionForm.addEventListener('submit', handleSubscriptionSubmit);
  elements.notesInput.addEventListener('input', () => { elements.notesCount.textContent = String(elements.notesInput.value.length); });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(elements.editorDialog)));
  elements.subscriptionList.addEventListener('click', handleLedgerAction);
  elements.timelineTickets.addEventListener('click', handleLedgerAction);
  [elements.searchInput, elements.categoryFilter, elements.statusFilter].forEach((control) => control.addEventListener('input', renderLedger));
  elements.confirmDelete.addEventListener('click', () => {
    const item = subscriptions.find((candidate) => candidate.id === deleteTargetId);
    if (!item) return;
    subscriptions = subscriptions.filter((candidate) => candidate.id !== deleteTargetId);
    deleteTargetId = '';
    saveSubscriptions(`已删除 ${item.name}。`);
    render();
  });
  elements.exportButton.addEventListener('click', exportBackup);
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => readImportFile(elements.importFile.files[0]));
  elements.mergeImport.addEventListener('click', () => applyImport('merge'));
  elements.replaceImport.addEventListener('click', () => applyImport('replace'));
  elements.clearButton.addEventListener('click', () => showDialog(elements.clearDialog));
  elements.confirmClear.addEventListener('click', () => {
    subscriptions = [];
    saveSubscriptions('已清空此浏览器中的订阅数据。');
    render();
  });
  [elements.editorDialog, elements.deleteDialog, elements.importDialog, elements.clearDialog].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  elements.todayLabel.textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  render();

  window.DUE76 = Object.freeze({
    version: 1,
    getSubscriptions: () => subscriptions.map((item) => ({ ...item })),
    storageKey: STORAGE_KEY,
  });
})();
