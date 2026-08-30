(function () {
  'use strict';

  const Core = window.EmotionCore;
  if (!Core) throw new Error('EmotionCore failed to load.');

  const STORAGE_KEY = 'tide71.entries.v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const moodLabels = ['低潮', '偏低', '中位', '不错', '明亮'];
  const moodColors = {
    平静: '#3c7c91', 愉快: '#ee9a62', 期待: '#d17f5c', 感激: '#416a5c', 放松: '#5f8f83', 振奋: '#d46f50',
    疲惫: '#7b8587', 焦虑: '#735e76', 低落: '#516774', 烦躁: '#a85448', 孤独: '#657383', 压力: '#855963',
  };

  const refs = Object.fromEntries([
    'today-label', 'entry-form', 'edit-id', 'entry-date', 'entry-note', 'note-count', 'form-error', 'save-entry', 'cancel-edit',
    'emotion-choices', 'factor-choices', 'range-title', 'metric-count', 'metric-mood', 'metric-energy', 'metric-variability',
    'chart-frame', 'tide-chart', 'chart-title', 'chart-desc', 'chart-empty', 'local-insights-list', 'entry-list', 'ledger-empty',
    'open-ai', 'export-data', 'import-data', 'clear-data', 'import-file', 'ai-dialog', 'ai-form', 'include-notes', 'ai-consent',
    'ai-send-preview', 'ai-status', 'request-ai', 'ai-results', 'ai-results-content', 'dismiss-ai-results', 'delete-dialog',
    'confirm-delete', 'import-dialog', 'import-summary', 'confirm-import', 'clear-dialog', 'confirm-clear', 'toast', 'live-region',
  ].map((id) => [id, document.getElementById(id)]));

  const state = {
    entries: loadEntries(),
    rangeDays: 14,
    pendingDeleteId: '',
    pendingImport: null,
    toastTimer: 0,
  };

  function loadEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return [...Core.normalizeEntries(parsed, new Date())];
    } catch {
      return [];
    }
  }

  function persistEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
      return true;
    } catch {
      showToast('浏览器无法保存记录，请先导出备份并检查存储权限。');
      return false;
    }
  }

  function localDateTimeValue(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function formatDate(value, options) {
    const date = new Date(value);
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function createSvg(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    refs.toast.textContent = message;
    refs.toast.hidden = false;
    refs['live-region'].textContent = message;
    state.toastTimer = window.setTimeout(() => {
      refs.toast.hidden = true;
    }, 3600);
  }

  function showFormError(message) {
    refs['form-error'].textContent = message;
    refs['form-error'].hidden = !message;
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `entry-${window.crypto.randomUUID()}`;
    return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function renderChoiceSet(container, name, values) {
    clearNode(container);
    values.forEach((value) => {
      const label = createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.value = value;
      const span = createElement('span', '', value);
      label.append(input, span);
      container.append(label);
    });
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function updateChoiceLimits(name) {
    const inputs = [...document.querySelectorAll(`input[name="${name}"]`)] ;
    const reached = inputs.filter((input) => input.checked).length >= 5;
    inputs.forEach((input) => {
      input.disabled = reached && !input.checked;
      input.closest('label').classList.toggle('limit-blocked', input.disabled);
    });
  }

  function updateNoteCount() {
    refs['note-count'].textContent = `${refs['entry-note'].value.length} / ${Core.MAX_NOTE_LENGTH}`;
  }

  function resetForm(options = {}) {
    refs['entry-form'].reset();
    refs['edit-id'].value = '';
    refs['entry-date'].value = localDateTimeValue();
    refs['entry-note'].value = '';
    refs['save-entry'].textContent = '保存这次观测';
    refs['cancel-edit'].hidden = true;
    showFormError('');
    updateNoteCount();
    updateChoiceLimits('emotions');
    updateChoiceLimits('factors');
    if (options.focus) refs['entry-date'].focus();
  }

  function setChecked(name, values) {
    const selected = new Set(values || []);
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
    updateChoiceLimits(name);
  }

  function startEdit(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    refs['edit-id'].value = entry.id;
    refs['entry-date'].value = localDateTimeValue(new Date(entry.date));
    const mood = document.querySelector(`input[name="mood"][value="${entry.mood}"]`);
    const energy = document.querySelector(`input[name="energy"][value="${entry.energy}"]`);
    if (mood) mood.checked = true;
    if (energy) energy.checked = true;
    setChecked('emotions', entry.emotions);
    setChecked('factors', entry.factors);
    refs['entry-note'].value = entry.note;
    updateNoteCount();
    refs['save-entry'].textContent = '保存修改';
    refs['cancel-edit'].hidden = false;
    showFormError('');
    document.getElementById('checkin-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => refs['entry-note'].focus(), 250);
  }

  function renderMetrics(summary) {
    refs['metric-count'].textContent = String(summary.count);
    refs['metric-mood'].textContent = summary.count ? summary.averageMood.toFixed(1) : '—';
    refs['metric-energy'].textContent = summary.count ? summary.averageEnergy.toFixed(1) : '—';
    refs['metric-variability'].textContent = summary.count ? summary.variability.toFixed(1) : '—';
    refs['range-title'].textContent = String(summary.rangeDays);
  }

  function renderInsights(entries) {
    clearNode(refs['local-insights-list']);
    Core.buildLocalInsights(entries, state.rangeDays, new Date()).forEach((insight) => {
      const row = createElement('article', 'insight-row');
      const heading = createElement('h4', '', insight.title);
      const copy = createElement('div');
      copy.append(createElement('p', '', insight.text), createElement('small', '', insight.evidence));
      row.append(heading, copy);
      refs['local-insights-list'].append(row);
    });
  }

  function renderChart(entries) {
    const svg = refs['tide-chart'];
    clearNode(svg);
    const title = createSvg('title', { id: 'chart-title' });
    title.textContent = '情绪潮位趋势图';
    const desc = createSvg('desc', { id: 'chart-desc' });
    svg.append(title, desc);

    const width = 720;
    const height = 300;
    const left = 45;
    const right = 22;
    const top = 30;
    const bottom = 45;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;

    for (let mood = 1; mood <= 5; mood += 1) {
      const y = top + ((5 - mood) / 4) * chartHeight;
      svg.append(createSvg('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'chart-grid-line' }));
      const label = createSvg('text', { x: 8, y: y + 4, class: 'chart-axis-label' });
      label.textContent = `${mood} ${moodLabels[mood - 1]}`;
      svg.append(label);
    }

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (state.rangeDays - 1));
    const span = Math.max(1, now.getTime() - cutoff.getTime());
    const startLabel = createSvg('text', { x: left, y: height - 12, class: 'chart-date-label' });
    startLabel.textContent = formatDate(cutoff, { month: '2-digit', day: '2-digit' });
    const endLabel = createSvg('text', { x: width - right, y: height - 12, class: 'chart-date-label', 'text-anchor': 'end' });
    endLabel.textContent = '今天';
    svg.append(startLabel, endLabel);

    if (!entries.length) {
      refs['chart-empty'].hidden = false;
      desc.textContent = `最近 ${state.rangeDays} 天没有情绪记录。`;
      return;
    }
    refs['chart-empty'].hidden = true;
    const chronological = [...entries].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const points = chronological.map((entry) => {
      const x = left + Math.max(0, Math.min(1, (Date.parse(entry.date) - cutoff.getTime()) / span)) * chartWidth;
      const y = top + ((5 - entry.mood) / 4) * chartHeight;
      return { entry, x, y };
    });
    const path = createSvg('path', {
      class: 'tide-path',
      d: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '),
    });
    svg.append(path);

    points.forEach(({ entry, x, y }) => {
      const group = createSvg('g', { class: 'tide-node', tabindex: '0', role: 'button', 'data-entry-id': entry.id });
      const label = `${formatDate(entry.date, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}，心情 ${entry.mood}，精力 ${entry.energy}`;
      group.setAttribute('aria-label', `${label}，定位到记录`);
      const nodeTitle = createSvg('title');
      nodeTitle.textContent = label;
      const circle = createSvg('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: 5 + entry.energy * 1.7,
        fill: moodColors[entry.emotions[0]] || '#3c7c91',
      });
      const text = createSvg('text', { x: x.toFixed(1), y: Math.max(13, y - 15).toFixed(1) });
      text.textContent = formatDate(entry.date, { day: '2-digit' });
      group.append(nodeTitle, circle, text);
      group.addEventListener('click', () => highlightEntry(entry.id));
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          highlightEntry(entry.id);
        }
      });
      svg.append(group);
    });
    desc.textContent = `最近 ${state.rangeDays} 天共有 ${entries.length} 条记录。节点高度代表心情，节点大小代表精力。`;
  }

  function highlightEntry(id) {
    const record = document.getElementById(`record-${id}`);
    if (!record) return;
    document.querySelectorAll('.ledger-entry.is-highlighted').forEach((node) => node.classList.remove('is-highlighted'));
    record.classList.add('is-highlighted');
    record.scrollIntoView({ behavior: 'smooth', block: 'center' });
    record.focus({ preventScroll: true });
    window.setTimeout(() => record.classList.remove('is-highlighted'), 2200);
  }

  function appendTags(container, values, className = '') {
    values.forEach((value) => container.append(createElement('span', className, value)));
  }

  function renderEntries() {
    clearNode(refs['entry-list']);
    refs['ledger-empty'].hidden = state.entries.length > 0;
    state.entries.forEach((entry) => {
      const article = createElement('article', 'ledger-entry');
      article.id = `record-${entry.id}`;
      article.tabIndex = -1;

      const date = createElement('div', 'entry-date');
      date.append(
        createElement('strong', '', formatDate(entry.date, { year: 'numeric', month: '2-digit', day: '2-digit' })),
        createElement('span', '', formatDate(entry.date, { weekday: 'short', hour: '2-digit', minute: '2-digit' })),
      );

      const levels = createElement('div', 'entry-levels');
      const mood = createElement('div');
      mood.append(createElement('span', '', '心情'), createElement('strong', '', `${entry.mood}.0`));
      const energy = createElement('div');
      energy.append(createElement('span', '', '精力'), createElement('strong', '', `${entry.energy}.0`));
      levels.append(mood, energy);

      const context = createElement('div', 'entry-context');
      const tags = createElement('div', 'entry-tags');
      appendTags(tags, entry.emotions);
      appendTags(tags, entry.factors, 'factor-tag');
      if (!entry.emotions.length && !entry.factors.length) tags.append(createElement('span', '', '未添加标签'));
      context.append(tags, createElement('p', '', entry.note || '这次只留下了数值观测。'));

      const actions = createElement('div', 'entry-actions');
      const edit = createElement('button', '', '编辑');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      edit.dataset.id = entry.id;
      edit.setAttribute('aria-label', `编辑 ${formatDate(entry.date, { month: 'numeric', day: 'numeric' })} 的记录`);
      const remove = createElement('button', '', '删除');
      remove.type = 'button';
      remove.dataset.action = 'delete';
      remove.dataset.id = entry.id;
      remove.setAttribute('aria-label', `删除 ${formatDate(entry.date, { month: 'numeric', day: 'numeric' })} 的记录`);
      actions.append(edit, remove);
      article.append(date, levels, context, actions);
      refs['entry-list'].append(article);
    });
  }

  function render(options = {}) {
    const filtered = Core.filterEntriesByRange(state.entries, state.rangeDays, new Date());
    const summary = Core.summarizeEntries(state.entries, state.rangeDays, new Date());
    renderMetrics(summary);
    renderChart(filtered);
    renderInsights(filtered);
    renderEntries();
    const hasEntries = state.entries.length > 0;
    refs['open-ai'].disabled = !hasEntries;
    refs['export-data'].disabled = !hasEntries;
    refs['clear-data'].disabled = !hasEntries;
    document.querySelectorAll('[data-range]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.range) === state.rangeDays));
    });
    if (options.justSaved) {
      refs['chart-frame'].classList.remove('just-saved');
      window.requestAnimationFrame(() => refs['chart-frame'].classList.add('just-saved'));
      window.setTimeout(() => refs['chart-frame'].classList.remove('just-saved'), 650);
    }
  }

  function updateAIPreview() {
    const payload = Core.buildAIPayload(state.entries, {
      rangeDays: state.rangeDays,
      includeNotes: refs['include-notes'].checked,
      now: new Date(),
    });
    clearNode(refs['ai-send-preview']);
    const headline = createElement('strong', '', `${payload.records.length} 条记录 · 最近 ${payload.rangeDays} 天`);
    const fields = createElement('span', '', '发送：日期、心情、精力、情绪词、影响因素、汇总统计');
    const notes = createElement('span', '', payload.includeNotes ? '另含：每条最多 240 字的日记摘录' : '不发送：日记正文');
    refs['ai-send-preview'].append(headline, fields, document.createElement('br'), notes);
    return payload;
  }

  function renderAIResults(insights) {
    clearNode(refs['ai-results-content']);
    const groups = [
      ['观察', insights.observations],
      ['反思问题', insights.questions],
      ['可以试试', insights.actions],
    ];
    groups.forEach(([title, items]) => {
      if (!items.length) return;
      const section = createElement('section', 'ai-group');
      const heading = createElement('h4', '', title);
      const list = document.createElement('ul');
      items.forEach((item) => list.append(createElement('li', '', item)));
      section.append(heading, list);
      refs['ai-results-content'].append(section);
    });
    refs['ai-results-content'].append(createElement('p', 'ai-disclaimer', insights.disclaimer));
    refs['ai-results'].hidden = false;
    refs['ai-results'].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  refs['entry-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    const mood = document.querySelector('input[name="mood"]:checked');
    const energy = document.querySelector('input[name="energy"]:checked');
    const date = new Date(refs['entry-date'].value);
    if (!mood || !energy || !refs['entry-date'].value || !Number.isFinite(date.getTime())) {
      showFormError('请补全记录时间、心情和精力。');
      return;
    }
    const id = refs['edit-id'].value || makeId();
    const normalized = Core.normalizeEntry({
      id,
      date: date.toISOString(),
      mood: mood.value,
      energy: energy.value,
      emotions: checkedValues('emotions'),
      factors: checkedValues('factors'),
      note: refs['entry-note'].value,
    }, new Date());
    if (!normalized) {
      showFormError('记录时间不能晚于现在，心情和精力必须在 1–5 之间。');
      return;
    }
    const wasEditing = Boolean(refs['edit-id'].value);
    state.entries = [...Core.normalizeEntries([normalized, ...state.entries.filter((item) => item.id !== id)], new Date())];
    if (!persistEntries()) return;
    resetForm();
    render({ justSaved: !wasEditing });
    showToast(wasEditing ? '修改已保存，本地趋势已重新计算。' : '观测已保存，只留在这台设备。');
  });

  refs['entry-note'].addEventListener('input', updateNoteCount);
  refs['cancel-edit'].addEventListener('click', () => resetForm({ focus: true }));
  refs['emotion-choices'].addEventListener('change', () => updateChoiceLimits('emotions'));
  refs['factor-choices'].addEventListener('change', () => updateChoiceLimits('factors'));

  document.querySelectorAll('[data-range]').forEach((button) => {
    button.addEventListener('click', () => {
      state.rangeDays = Core.normalizeRange(button.dataset.range);
      render();
    });
  });

  refs['entry-list'].addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'edit') startEdit(button.dataset.id);
    if (button.dataset.action === 'delete') {
      state.pendingDeleteId = button.dataset.id;
      openDialog(refs['delete-dialog']);
    }
  });

  refs['confirm-delete'].addEventListener('click', () => {
    if (!state.pendingDeleteId) return;
    state.entries = state.entries.filter((item) => item.id !== state.pendingDeleteId);
    state.pendingDeleteId = '';
    persistEntries();
    closeDialog(refs['delete-dialog']);
    resetForm();
    render();
    showToast('记录已删除，趋势已重新计算。');
  });

  refs['export-data'].addEventListener('click', () => {
    const backup = Core.createBackup(state.entries, new Date());
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tide71-backup-${Core.dayKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast(`已导出 ${state.entries.length} 条本地记录。`);
  });

  refs['import-data'].addEventListener('click', () => refs['import-file'].click());
  refs['import-file'].addEventListener('change', async () => {
    const [file] = refs['import-file'].files || [];
    refs['import-file'].value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('备份文件超过 2 MB，未读取。');
      return;
    }
    try {
      state.pendingImport = Core.importBackup(await file.text(), new Date());
      refs['import-summary'].textContent = `备份含 ${state.pendingImport.totalCount} 条，${state.pendingImport.entries.length} 条通过校验，${state.pendingImport.rejectedCount} 条被拒绝。`;
      openDialog(refs['import-dialog']);
    } catch (error) {
      state.pendingImport = null;
      showToast(error.message || '无法读取这份备份。');
    }
  });

  refs['confirm-import'].addEventListener('click', () => {
    if (!state.pendingImport) return;
    const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'merge';
    const source = mode === 'replace'
      ? state.pendingImport.entries
      : [...state.pendingImport.entries, ...state.entries];
    state.entries = [...Core.normalizeEntries(source, new Date())];
    persistEntries();
    const rejected = state.pendingImport.rejectedCount;
    state.pendingImport = null;
    closeDialog(refs['import-dialog']);
    resetForm();
    render();
    showToast(`导入完成，现有 ${state.entries.length} 条记录${rejected ? `；拒绝 ${rejected} 条无效记录` : ''}。`);
  });

  refs['clear-data'].addEventListener('click', () => openDialog(refs['clear-dialog']));
  refs['confirm-clear'].addEventListener('click', () => {
    state.entries = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage can be unavailable */ }
    closeDialog(refs['clear-dialog']);
    resetForm();
    refs['ai-results'].hidden = true;
    render();
    showToast('TIDE/71 的本地记录已全部清除。');
  });

  refs['open-ai'].addEventListener('click', () => {
    refs['include-notes'].checked = false;
    refs['ai-consent'].checked = false;
    refs['ai-status'].textContent = '';
    refs['request-ai'].disabled = false;
    refs['request-ai'].textContent = '确认并请求';
    updateAIPreview();
    openDialog(refs['ai-dialog']);
  });
  refs['include-notes'].addEventListener('change', updateAIPreview);

  refs['ai-form'].addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!refs['ai-consent'].checked) {
      refs['ai-status'].textContent = '请先确认你理解并同意发送预览中的数据。';
      refs['ai-consent'].focus();
      return;
    }
    const payload = updateAIPreview();
    if (!payload.records.length) {
      refs['ai-status'].textContent = '当前时间范围没有可发送的记录。';
      return;
    }
    refs['request-ai'].disabled = true;
    refs['request-ai'].textContent = '正在请求…';
    refs['ai-status'].textContent = '等待服务器返回；本地趋势不会受影响。';
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '当前 AI 服务不可用。');
      const insights = Core.sanitizeAIInsights(data.insights || data);
      if (!insights) throw new Error('AI 返回内容未通过安全校验。');
      renderAIResults(insights);
      closeDialog(refs['ai-dialog']);
      showToast('AI 反思已返回，结果不会保存。');
    } catch (error) {
      refs['ai-status'].textContent = error.message || 'AI 请求失败，本地趋势仍可使用。';
    } finally {
      refs['request-ai'].disabled = false;
      refs['request-ai'].textContent = '确认并请求';
    }
  });

  refs['dismiss-ai-results'].addEventListener('click', () => {
    refs['ai-results'].hidden = true;
    refs['open-ai'].focus();
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  refs['today-label'].textContent = formatDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  renderChoiceSet(refs['emotion-choices'], 'emotions', Core.EMOTIONS);
  renderChoiceSet(refs['factor-choices'], 'factors', Core.FACTORS);
  resetForm();
  render();
  document.body.classList.add('ready');
})();
