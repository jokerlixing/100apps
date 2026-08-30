(function () {
  'use strict';

  const Core = window.PulsewatchCore;
  if (!Core) throw new Error('PULSEWATCH core failed to load');

  const STORAGE_KEY = 'pulsewatch91_state_v1';
  const AUTO_CHECK_MS = 15000;
  const FETCH_TIMEOUT_MS = 10000;
  const MAX_RESPONSE_BYTES = 200000;
  const locks = new Set();
  let activeTab = 'diff';
  let editingSourceId = '';
  let confirmAction = null;
  let toastTimer = null;

  const ui = Object.fromEntries([
    'runnerState', 'nextRunLabel', 'addSourceButton', 'runAllButton', 'gaugeNumber', 'changedCount',
    'errorCount', 'sampleCount', 'sourceCount', 'sourceFilters', 'sourceList', 'signalWave', 'sourceDetail',
    'selectedStatus', 'selectedName', 'selectedUrl', 'editSourceButton', 'pauseSourceButton', 'runSourceButton',
    'lastRunValue', 'nextRunValue', 'fingerprintValue', 'changeSummary', 'copySummaryButton', 'diffTab',
    'snapshotTab', 'diffPanel', 'snapshotPanel', 'diffList', 'snapshotContent', 'eventList', 'clearEventsButton',
    'notificationButton', 'exportButton', 'importInput', 'resetButton', 'sourceDialog', 'sourceForm',
    'sourceDialogTitle', 'sourceDialogClose', 'cancelSourceButton', 'sourceNameInput', 'sourceUrlInput',
    'sourceFormatInput', 'sourceIntervalInput', 'pathField', 'sourcePathInput', 'sourceNotifyInput',
    'sourceFormError', 'deleteSourceButton', 'confirmDialog', 'confirmTitle', 'confirmMessage',
    'confirmCancelButton', 'confirmActionButton', 'toast'
  ].map((id) => [id, document.getElementById(id)]));

  const DEMO_CONFIGS = [
    { id: 'demo-harbor', name: '港区维护公告', url: 'demo://harbor-bulletin', format: 'text', path: '', intervalMinutes: 5, enabled: true, notify: false },
    { id: 'demo-price', name: '云杉工作灯价格', url: 'demo://store-price', format: 'json', path: '', intervalMinutes: 5, enabled: true, notify: false },
    { id: 'demo-jobs', name: '研发岗位数量', url: 'demo://job-board', format: 'json', path: 'summary', intervalMinutes: 15, enabled: true, notify: false },
    { id: 'demo-health', name: '公共接口健康度', url: 'demo://service-health', format: 'json', path: 'status', intervalMinutes: 5, enabled: true, notify: false }
  ];

  function demoPayload(url, tick) {
    const phase = tick % 4;
    if (url === 'demo://harbor-bulletin') {
      if (phase === 0) return '东闸步道：开放\n西闸步道：17:00 关闭\n潮位观测：正常';
      if (phase === 1 || phase === 2) return '东闸步道：开放\n西闸步道：延后至 18:30 关闭\n潮位观测：正常\n提示：请避让黄色施工线';
      return '东闸步道：临时关闭\n西闸步道：18:30 关闭\n潮位观测：正常';
    }
    if (url === 'demo://store-price') {
      if (phase === 0) return { sku: 'LAMP-SPRUCE', price: 329, stock: 7, status: '有货' };
      if (phase === 1 || phase === 2) return { sku: 'LAMP-SPRUCE', price: 299, stock: 5, status: '有货' };
      return { sku: 'LAMP-SPRUCE', price: 319, stock: 2, status: '库存紧张' };
    }
    if (url === 'demo://job-board') {
      if (phase === 0) return { summary: { openPositions: 12, teams: ['前端', '后端'] }, updatedBy: 'HR' };
      if (phase === 1 || phase === 2) return { summary: { openPositions: 14, teams: ['前端', '后端', '数据'] }, updatedBy: 'HR' };
      return { summary: { openPositions: 11, teams: ['后端', '数据'] }, updatedBy: 'HR' };
    }
    if (url === 'demo://service-health') {
      if (phase === 0 || phase === 1) return { status: { overall: '正常', api: '正常', cdn: '正常', latencyMs: 84 } };
      if (phase === 2) return { status: { overall: '波动', api: '正常', cdn: '降级', latencyMs: 168 } };
      return { status: { overall: '正常', api: '正常', cdn: '正常', latencyMs: 91 } };
    }
    throw new Error('未知演示来源');
  }

  function defaultState() {
    const now = Date.now();
    const sources = DEMO_CONFIGS.map((config, index) => {
      const clean = Core.normalizeSource(config);
      const payload = demoPayload(clean.url, 0);
      const snapshot = clean.format === 'json' ? Core.extractAtPath(payload, clean.path) : payload;
      const checkedAt = new Date(now - (index + 1) * 43000).toISOString();
      return {
        ...clean,
        lastRunAt: checkedAt,
        lastStatus: 'stable',
        lastSnapshot: snapshot,
        lastFingerprint: Core.fingerprint(snapshot),
        lastSummary: '演示基线已记录',
        lastDiff: [],
        samples: [{ at: checkedAt, status: 'initial', fingerprint: Core.fingerprint(snapshot) }],
        demoTick: 0,
        error: ''
      };
    });
    return {
      schemaVersion: 1,
      settings: { selectedId: sources[0].id, filter: 'all' },
      sources,
      events: [{
        id: `welcome-${now}`,
        sourceId: sources[0].id,
        at: new Date(now).toISOString(),
        type: 'info',
        summary: '四路演示探针已接通，点击“检查全部”观察第一次变化。',
        changes: []
      }]
    };
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const clean = Core.sanitizeImport(stored);
        if (clean.sources.length) return clean;
      }
    } catch {}
    const initial = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function selectedSource() {
    return state.sources.find((source) => source.id === state.settings.selectedId) || state.sources[0] || null;
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text !== 'undefined') node.textContent = text;
    return node;
  }

  function statusLabel(source) {
    if (!source) return '待命';
    if (!source.enabled) return '已暂停';
    return ({ idle: '待检查', initial: '已建基线', stable: '内容稳定', changed: '发现变化', error: '检查失败', running: '检查中' })[source.lastStatus] || '待检查';
  }

  function statusClass(source) {
    if (!source || !source.enabled) return source ? 'paused' : 'idle';
    return source.lastStatus || 'idle';
  }

  function formatClock(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function nextLabel(value) {
    if (!value) return '暂停调度';
    const delta = new Date(value).getTime() - Date.now();
    if (delta <= 0) return '已到检查时间';
    if (delta < 60000) return '不到 1 分钟';
    if (delta < 3600000) return `${Math.ceil(delta / 60000)} 分钟后`;
    return `${Math.ceil(delta / 3600000)} 小时后`;
  }

  function sourceDisplayUrl(source) {
    return source.url.startsWith('demo://') ? `内置演示 · ${source.url.slice(7)}` : source.url;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2800);
  }

  function renderStats() {
    const active = state.sources.filter((source) => source.enabled).length;
    const changed = state.sources.filter((source) => source.lastStatus === 'changed').length;
    const errors = state.sources.filter((source) => source.lastStatus === 'error').length;
    const samples = state.sources.reduce((total, source) => total + source.samples.length, 0);
    ui.gaugeNumber.textContent = String(active).padStart(2, '0');
    ui.changedCount.textContent = changed;
    ui.errorCount.textContent = errors;
    ui.sampleCount.textContent = samples;
    ui.sourceCount.textContent = `${state.sources.length} 路`;
  }

  function renderFilters() {
    ui.sourceFilters.querySelectorAll('[data-filter]').forEach((button) => {
      const active = button.dataset.filter === state.settings.filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function matchesFilter(source) {
    if (state.settings.filter === 'changed') return source.lastStatus === 'changed';
    if (state.settings.filter === 'errors') return source.lastStatus === 'error';
    if (state.settings.filter === 'paused') return !source.enabled;
    return true;
  }

  function renderSources() {
    const selected = selectedSource();
    const fragment = document.createDocumentFragment();
    const visible = state.sources.filter(matchesFilter);
    visible.forEach((source) => {
      const button = createElement('button', `source-item status-${statusClass(source)}`);
      button.type = 'button';
      button.dataset.sourceId = source.id;
      button.classList.toggle('active', Boolean(selected && selected.id === source.id));
      button.setAttribute('aria-pressed', String(Boolean(selected && selected.id === source.id)));
      const pin = createElement('span', 'source-pin');
      pin.setAttribute('aria-hidden', 'true');
      const copy = createElement('span', 'source-copy');
      copy.append(createElement('strong', '', source.name));
      copy.append(createElement('small', '', sourceDisplayUrl(source)));
      const meta = createElement('span', 'source-meta');
      meta.append(createElement('em', '', statusLabel(source)));
      meta.append(createElement('span', '', source.lastRunAt ? formatClock(source.lastRunAt) : '未检查'));
      copy.append(meta);
      button.append(pin, copy);
      fragment.append(button);
    });
    if (!visible.length) {
      const empty = createElement('div', 'empty-state');
      empty.append(createElement('b', '', '这个筛选下没有来源'), document.createTextNode('切换筛选或添加一条新探针。'));
      fragment.append(empty);
    }
    ui.sourceList.replaceChildren(fragment);
  }

  function renderWave(source) {
    const fragment = document.createDocumentFragment();
    const samples = source ? source.samples.slice(-Core.LIMITS.samples) : [];
    const padding = Math.max(0, Core.LIMITS.samples - samples.length);
    const items = [...Array.from({ length: padding }, () => null), ...samples];
    items.forEach((sample, index) => {
      const kind = sample ? sample.status : 'empty';
      const cell = createElement('span', `signal-sample ${kind}`);
      const bar = createElement('i');
      let height = 3;
      if (kind === 'stable' || kind === 'initial') height = 16 + ((index * 11) % 19);
      if (kind === 'changed') height = 76 + ((index * 7) % 22);
      if (kind === 'error') height = 58 + ((index * 5) % 18);
      cell.style.setProperty('--height', `${height}%`);
      if (sample) cell.title = `${formatDateTime(sample.at)} · ${statusLabel({ enabled: true, lastStatus: kind })}`;
      cell.append(bar);
      fragment.append(cell);
    });
    ui.signalWave.replaceChildren(fragment);
    ui.signalWave.setAttribute('aria-label', source ? `${source.name} 最近 ${samples.length} 次采集：${samples.map((sample) => statusLabel({ enabled: true, lastStatus: sample.status })).join('、')}` : '尚无采集状态');
  }

  function renderDiff(source) {
    const fragment = document.createDocumentFragment();
    if (!source) {
      const empty = createElement('div', 'diff-empty');
      empty.append(createElement('div', '', '请选择一个来源。'));
      fragment.append(empty);
    } else if (source.error) {
      const empty = createElement('div', 'diff-empty');
      const copy = createElement('div');
      copy.append(createElement('b', '', '本次没有覆盖旧快照'), document.createTextNode(source.error));
      empty.append(copy);
      fragment.append(empty);
    } else if (!source.lastDiff.length) {
      const empty = createElement('div', 'diff-empty');
      const copy = createElement('div');
      copy.append(createElement('b', '', source.lastFingerprint ? '最近一次内容稳定' : '等待第一次检查'), document.createTextNode(source.lastFingerprint ? '指纹与上一份快照一致，没有字段需要处理。' : '运行这一路后会建立内容基线。'));
      empty.append(copy);
      fragment.append(empty);
    } else {
      source.lastDiff.forEach((change) => {
        const row = createElement('div', `diff-row ${change.type}`);
        const path = createElement('div', 'diff-path');
        path.append(createElement('span', '', change.path || '$'), createElement('small', 'diff-type', ({ added: '新增', removed: '移除', modified: '修改' })[change.type] || '修改'));
        row.append(path, createElement('div', 'diff-value before', change.before || '—'), createElement('div', 'diff-arrow', '→'), createElement('div', 'diff-value after', change.after || '—'));
        fragment.append(row);
      });
    }
    ui.diffList.replaceChildren(fragment);
  }

  function renderDetail() {
    const source = selectedSource();
    const disabled = !source;
    ui.sourceDetail.classList.toggle('empty', disabled);
    [ui.editSourceButton, ui.pauseSourceButton, ui.runSourceButton, ui.copySummaryButton].forEach((button) => { button.disabled = disabled; });
    if (!source) {
      ui.selectedStatus.className = 'status-seal idle';
      ui.selectedStatus.textContent = '待命';
      ui.selectedName.textContent = '还没有观测来源';
      ui.selectedUrl.textContent = '添加一个公开 JSON 或文本地址开始。';
      ui.lastRunValue.textContent = '—';
      ui.nextRunValue.textContent = '—';
      ui.fingerprintValue.textContent = '—';
      ui.snapshotContent.textContent = '等待第一次检查…';
      renderWave(null);
      renderDiff(null);
      return;
    }
    const kind = statusClass(source);
    ui.selectedStatus.className = `status-seal ${kind}`;
    ui.selectedStatus.textContent = statusLabel(source);
    ui.selectedName.textContent = source.name;
    ui.selectedUrl.textContent = sourceDisplayUrl(source);
    ui.pauseSourceButton.textContent = source.enabled ? '暂停' : '继续';
    ui.runSourceButton.disabled = !source.enabled || locks.has(source.id);
    ui.runSourceButton.textContent = locks.has(source.id) ? '检查中…' : '检查这一路';
    ui.lastRunValue.textContent = source.lastRunAt ? formatDateTime(source.lastRunAt) : '从未检查';
    const next = Core.nextRunAt(source.lastRunAt, source.intervalMinutes, source.enabled);
    ui.nextRunValue.textContent = source.enabled ? (next ? nextLabel(next) : '等待首次检查') : '已暂停';
    ui.fingerprintValue.textContent = source.lastFingerprint || '尚未生成';
    ui.fingerprintValue.title = source.lastFingerprint || '';
    ui.changeSummary.className = `change-summary ${kind}`;
    ui.changeSummary.querySelector('b').textContent = source.lastSummary || '尚无观测结果';
    ui.changeSummary.querySelector('p').textContent = source.error || (source.lastStatus === 'changed' ? `${source.lastDiff.length} 条差异已写入本地事件记录。` : '下一次检查会继续与这份快照比较。');
    const rendered = source.lastFingerprint ? (source.format === 'json' ? JSON.stringify(source.lastSnapshot, null, 2) : String(source.lastSnapshot)) : '等待第一次检查…';
    ui.snapshotContent.textContent = rendered.length > 50000 ? `${rendered.slice(0, 50000)}\n…快照过长，界面仅显示前 50,000 字符` : rendered;
    renderWave(source);
    renderDiff(source);
  }

  function renderEvents() {
    const fragment = document.createDocumentFragment();
    const events = [...state.events].reverse();
    events.forEach((event) => {
      const source = state.sources.find((item) => item.id === event.sourceId);
      const item = createElement('article', `event-item ${event.type}`);
      item.append(createElement('time', 'event-time', formatClock(event.at)));
      const body = createElement('div', 'event-body');
      body.append(createElement('strong', '', source ? source.name : '已移除来源'));
      body.append(createElement('p', '', event.summary));
      body.append(createElement('span', 'event-code', ({ changed: 'CHANGE', error: 'FAILED', stable: 'STABLE', initial: 'BASELINE', info: 'SYSTEM' })[event.type] || 'LOG'));
      item.append(body);
      fragment.append(item);
    });
    if (!events.length) fragment.append(createElement('div', 'empty-state', '事件已清空。下一次检查会在这里留下记录。'));
    ui.eventList.replaceChildren(fragment);
    ui.clearEventsButton.disabled = !events.length;
  }

  function renderRunner() {
    const running = locks.size > 0;
    ui.runnerState.classList.toggle('running', running);
    ui.runnerState.querySelector('b').textContent = running ? `正在检查 ${locks.size} 路来源` : '观测台待命';
    ui.runAllButton.classList.toggle('running', running);
    const dueTimes = state.sources.map((source) => Core.nextRunAt(source.lastRunAt, source.intervalMinutes, source.enabled)).filter(Boolean).sort();
    ui.nextRunLabel.textContent = dueTimes.length ? `下一次检查：${nextLabel(dueTimes[0])}` : '没有启用的调度';
    ui.runAllButton.disabled = running || !state.sources.some((source) => source.enabled);
  }

  function render() {
    renderStats();
    renderFilters();
    renderSources();
    renderDetail();
    renderEvents();
    renderRunner();
    ui.diffTab.classList.toggle('active', activeTab === 'diff');
    ui.snapshotTab.classList.toggle('active', activeTab === 'snapshot');
    ui.diffTab.setAttribute('aria-selected', String(activeTab === 'diff'));
    ui.snapshotTab.setAttribute('aria-selected', String(activeTab === 'snapshot'));
    ui.diffPanel.hidden = activeTab !== 'diff';
    ui.snapshotPanel.hidden = activeTab !== 'snapshot';
    if (typeof Notification !== 'undefined') {
      ui.notificationButton.textContent = Notification.permission === 'granted' ? '本地通知已启用' : (Notification.permission === 'denied' ? '通知已被浏览器阻止' : '启用本地通知');
    } else {
      ui.notificationButton.textContent = '当前浏览器不支持通知';
      ui.notificationButton.disabled = true;
    }
  }

  function addEvent(source, type, summary, changes) {
    state.events.push({
      id: `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      sourceId: source.id,
      at: new Date().toISOString(),
      type,
      summary,
      changes: (changes || []).slice(0, Core.LIMITS.changes)
    });
    state.events = state.events.slice(-Core.LIMITS.events);
  }

  async function fetchSource(source) {
    if (source.url.startsWith('demo://')) {
      await new Promise((resolve) => setTimeout(resolve, 260));
      source.demoTick += 1;
      const payload = demoPayload(source.url, source.demoTick);
      return source.format === 'json' ? Core.extractAtPath(payload, source.path) : String(payload);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: { Accept: source.format === 'json' ? 'application/json, text/plain;q=0.8' : 'text/plain, application/json;q=0.8' },
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new Error('响应超过 200 KB 限制');
      if (source.format === 'text') return text;
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('响应不是有效 JSON'); }
      return Core.extractAtPath(payload, source.path);
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('检查超时（10 秒）');
      if (error instanceof TypeError) throw new Error('网络或跨域请求失败；请确认地址允许浏览器访问');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function sendChangeNotification(source, summary) {
    if (!source.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try { new Notification(`${source.name} 有变化`, { body: summary, tag: `pulsewatch-${source.id}` }); } catch {}
  }

  async function runSource(sourceId, options = {}) {
    const source = state.sources.find((item) => item.id === sourceId);
    if (!source || !source.enabled || locks.has(source.id)) return null;
    locks.add(source.id);
    source.lastStatus = 'running';
    source.error = '';
    render();
    try {
      const current = await fetchSource(source);
      const previous = source.lastFingerprint ? source.lastSnapshot : undefined;
      const comparison = Core.compareSnapshots(previous, current, source.format);
      const checkedAt = new Date().toISOString();
      const currentFingerprint = Core.fingerprint(current);
      source.lastRunAt = checkedAt;
      source.lastStatus = comparison.kind;
      source.lastSnapshot = current;
      source.lastFingerprint = currentFingerprint;
      source.lastSummary = comparison.summary;
      source.lastDiff = comparison.changes;
      source.error = '';
      source.samples.push({ at: checkedAt, status: comparison.kind, fingerprint: currentFingerprint });
      source.samples = source.samples.slice(-Core.LIMITS.samples);
      addEvent(source, comparison.kind, comparison.summary, comparison.changes);
      if (comparison.changed) sendChangeNotification(source, comparison.summary);
      if (!options.silent) toast(`${source.name}：${comparison.summary}`);
      return comparison;
    } catch (error) {
      const checkedAt = new Date().toISOString();
      source.lastRunAt = checkedAt;
      source.lastStatus = 'error';
      source.error = error.message || '未知检查错误';
      source.lastSummary = '检查失败，旧快照已保留';
      source.lastDiff = [];
      source.samples.push({ at: checkedAt, status: 'error', fingerprint: '' });
      source.samples = source.samples.slice(-Core.LIMITS.samples);
      addEvent(source, 'error', source.error, []);
      if (!options.silent) toast(`${source.name}：${source.error}`);
      return null;
    } finally {
      locks.delete(source.id);
      saveState();
      render();
    }
  }

  async function runSources(sources, options = {}) {
    const targets = sources.filter((source) => source.enabled && !locks.has(source.id));
    if (!targets.length) {
      if (!options.silent) toast('没有可检查的来源');
      return [];
    }
    const results = await Promise.all(targets.map((source) => runSource(source.id, { silent: true })));
    if (!options.silent) {
      const changed = results.filter((result) => result && result.changed).length;
      const failed = targets.filter((source) => source.lastStatus === 'error').length;
      toast(`检查完成：${changed} 路变化${failed ? `，${failed} 路失败` : ''}`);
    }
    return results;
  }

  function openSourceDialog(source) {
    editingSourceId = source ? source.id : '';
    ui.sourceDialogTitle.textContent = source ? '编辑观测来源' : '添加观测来源';
    ui.sourceNameInput.value = source ? source.name : '';
    ui.sourceUrlInput.value = source ? source.url : '';
    ui.sourceUrlInput.readOnly = Boolean(source && source.url.startsWith('demo://'));
    ui.sourceFormatInput.value = source ? source.format : 'json';
    ui.sourceFormatInput.disabled = Boolean(source && source.url.startsWith('demo://'));
    ui.sourceIntervalInput.value = String(source ? source.intervalMinutes : 15);
    ui.sourcePathInput.value = source ? source.path : '';
    ui.sourcePathInput.readOnly = Boolean(source && source.url.startsWith('demo://'));
    ui.sourceNotifyInput.checked = Boolean(source && source.notify);
    ui.sourceFormError.textContent = '';
    ui.deleteSourceButton.hidden = !source;
    updatePathField();
    ui.sourceDialog.showModal();
    setTimeout(() => ui.sourceNameInput.focus(), 0);
  }

  function closeSourceDialog() {
    if (ui.sourceDialog.open) ui.sourceDialog.close();
  }

  function updatePathField() {
    const isJson = ui.sourceFormatInput.value === 'json';
    ui.pathField.hidden = !isJson;
    ui.sourcePathInput.disabled = !isJson;
  }

  function sourceSignature(source) {
    return [source.url, source.format, source.path].join('|');
  }

  async function saveSource(event) {
    event.preventDefault();
    ui.sourceFormError.textContent = '';
    [ui.sourceNameInput, ui.sourceUrlInput].forEach((input) => input.removeAttribute('aria-invalid'));
    try {
      if (!editingSourceId && state.sources.length >= Core.LIMITS.sources) throw new Error(`最多只能保存 ${Core.LIMITS.sources} 路来源`);
      const existing = editingSourceId ? state.sources.find((source) => source.id === editingSourceId) : null;
      const config = Core.normalizeSource({
        id: existing ? existing.id : `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: ui.sourceNameInput.value,
        url: ui.sourceUrlInput.value,
        format: ui.sourceFormatInput.value,
        path: ui.sourcePathInput.value,
        intervalMinutes: ui.sourceIntervalInput.value,
        enabled: existing ? existing.enabled : true,
        notify: ui.sourceNotifyInput.checked
      });
      let target;
      if (existing) {
        const changedTarget = sourceSignature(existing) !== sourceSignature(config);
        Object.assign(existing, config);
        if (changedTarget) {
          existing.lastRunAt = null;
          existing.lastStatus = 'idle';
          existing.lastSnapshot = null;
          existing.lastFingerprint = '';
          existing.lastSummary = '地址或提取规则已改变，等待新基线';
          existing.lastDiff = [];
          existing.samples = [];
          existing.error = '';
          existing.demoTick = 0;
        }
        target = existing;
        addEvent(target, 'info', '来源设置已更新。', []);
      } else {
        target = {
          ...config,
          lastRunAt: null,
          lastStatus: 'idle',
          lastSnapshot: null,
          lastFingerprint: '',
          lastSummary: '等待第一次检查',
          lastDiff: [],
          samples: [],
          demoTick: 0,
          error: ''
        };
        state.sources.push(target);
        state.settings.selectedId = target.id;
        state.settings.filter = 'all';
        addEvent(target, 'info', '新探针已接通，准备建立内容基线。', []);
      }
      saveState();
      closeSourceDialog();
      render();
      await runSource(target.id);
    } catch (error) {
      ui.sourceFormError.textContent = error.message || '来源设置不合法';
      if (!ui.sourceNameInput.value.trim()) ui.sourceNameInput.setAttribute('aria-invalid', 'true');
      if (!ui.sourceUrlInput.value.trim() || error.code === 'INVALID_URL') ui.sourceUrlInput.setAttribute('aria-invalid', 'true');
    }
  }

  function showConfirm(title, message, actionLabel, action) {
    confirmAction = action;
    ui.confirmTitle.textContent = title;
    ui.confirmMessage.textContent = message;
    ui.confirmActionButton.textContent = actionLabel;
    ui.confirmDialog.showModal();
  }

  function removeSource(sourceId) {
    const source = state.sources.find((item) => item.id === sourceId);
    if (!source) return;
    state.sources = state.sources.filter((item) => item.id !== sourceId);
    state.events = state.events.filter((event) => event.sourceId !== sourceId);
    state.settings.selectedId = state.sources[0] ? state.sources[0].id : '';
    saveState();
    render();
    toast(`已删除来源：${source.name}`);
  }

  function exportState() {
    return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: state.settings, sources: state.sources, events: state.events }, null, 2);
  }

  function downloadExport() {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pulsewatch-91-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('观测数据已导出');
  }

  async function copySummary() {
    const source = selectedSource();
    if (!source) return;
    const text = [`${source.name} · ${statusLabel(source)}`, `检查时间：${formatDateTime(source.lastRunAt)}`, `摘要：${source.lastSummary}`, `指纹：${source.lastFingerprint || '—'}`].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('变化摘要已复制');
    } catch {
      toast('浏览器未允许复制，请从快照区域手动选择');
    }
  }

  function wireEvents() {
    ui.addSourceButton.addEventListener('click', () => openSourceDialog(null));
    ui.runAllButton.addEventListener('click', () => runSources(state.sources));
    ui.sourceFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.settings.filter = button.dataset.filter;
      saveState();
      render();
    });
    ui.sourceList.addEventListener('click', (event) => {
      const item = event.target.closest('[data-source-id]');
      if (!item) return;
      state.settings.selectedId = item.dataset.sourceId;
      saveState();
      render();
    });
    ui.runSourceButton.addEventListener('click', () => {
      const source = selectedSource();
      if (source) runSource(source.id);
    });
    ui.pauseSourceButton.addEventListener('click', () => {
      const source = selectedSource();
      if (!source) return;
      source.enabled = !source.enabled;
      addEvent(source, 'info', source.enabled ? '自动检查已继续。' : '自动检查已暂停。', []);
      saveState();
      render();
      toast(`${source.name}：${source.enabled ? '已继续' : '已暂停'}`);
    });
    ui.editSourceButton.addEventListener('click', () => openSourceDialog(selectedSource()));
    ui.copySummaryButton.addEventListener('click', copySummary);
    [ui.diffTab, ui.snapshotTab].forEach((tab) => tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); }));
    ui.clearEventsButton.addEventListener('click', () => showConfirm('清空事件记录？', '来源和当前快照会保留，仅删除本机的事件电报码。', '清空记录', () => {
      state.events = [];
      saveState();
      render();
      toast('事件记录已清空');
    }));
    ui.notificationButton.addEventListener('click', async () => {
      if (typeof Notification === 'undefined') return;
      const permission = await Notification.requestPermission();
      render();
      toast(permission === 'granted' ? '本地变化通知已启用' : '浏览器没有授予通知权限');
    });
    ui.exportButton.addEventListener('click', downloadExport);
    ui.importInput.addEventListener('change', async () => {
      const file = ui.importInput.files && ui.importInput.files[0];
      ui.importInput.value = '';
      if (!file) return;
      try {
        const clean = Core.sanitizeImport(await file.text());
        showConfirm('导入并替换本机数据？', `文件包含 ${clean.sources.length} 路来源和 ${clean.events.length} 条事件。当前本机数据将被替换。`, '确认导入', () => {
          state = clean.sources.length ? clean : defaultState();
          saveState();
          render();
          toast('观测数据已导入');
        });
      } catch (error) { toast(error.message || '导入文件不合法'); }
    });
    ui.resetButton.addEventListener('click', () => showConfirm('恢复四路演示数据？', '当前来源、快照与事件都会被本机演示数据替换。请先导出需要保留的记录。', '恢复演示', () => {
      state = defaultState();
      saveState();
      render();
      toast('演示数据已恢复');
    }));
    ui.sourceFormatInput.addEventListener('change', updatePathField);
    ui.sourceForm.addEventListener('submit', saveSource);
    ui.sourceDialogClose.addEventListener('click', closeSourceDialog);
    ui.cancelSourceButton.addEventListener('click', closeSourceDialog);
    ui.sourceDialog.addEventListener('click', (event) => { if (event.target === ui.sourceDialog) closeSourceDialog(); });
    ui.deleteSourceButton.addEventListener('click', () => {
      const source = state.sources.find((item) => item.id === editingSourceId);
      if (!source) return;
      closeSourceDialog();
      showConfirm('删除这路来源？', `${source.name} 的快照和事件会从本机移除。`, '删除来源', () => removeSource(source.id));
    });
    ui.confirmCancelButton.addEventListener('click', () => ui.confirmDialog.close());
    ui.confirmActionButton.addEventListener('click', () => {
      const action = confirmAction;
      confirmAction = null;
      ui.confirmDialog.close();
      if (action) action();
    });
    ui.confirmDialog.addEventListener('close', () => { confirmAction = null; });
    window.addEventListener('beforeunload', saveState);
  }

  function checkDueSources() {
    const now = new Date().toISOString();
    const due = state.sources.filter((source) => Core.isDue(source, now) && !locks.has(source.id));
    if (due.length) runSources(due, { silent: true });
    else renderRunner();
  }

  wireEvents();
  render();
  document.body.classList.add('ready');
  setInterval(checkDueSources, AUTO_CHECK_MS);
  setInterval(renderRunner, 30000);

  window.PulsewatchApp = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    runSource,
    runAll: () => runSources(state.sources),
    exportState,
    importState: (raw) => {
      const clean = Core.sanitizeImport(raw);
      state = clean;
      saveState();
      render();
      return state;
    }
  });
})();
