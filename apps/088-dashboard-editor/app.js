(function () {
  'use strict';

  const Core = window.DashboardCore;
  const STORAGE_KEY = 'apps100_grid88_project_v1';
  const TYPE_NAMES = Object.freeze({ metric: '指标卡', bar: '柱状图', line: '趋势图', donut: '占比环图', table: '数据表' });
  const DONUT_COLORS = ['#53c7c9', '#ff6b4a', '#f0c85a', '#8aa6ff', '#bd8af3', '#80d59d'];
  const JSON_SAMPLE = `[
  { "区域": "华东", "访问量": 12840, "转化率": 42 },
  { "区域": "华北", "访问量": 9680, "转化率": 36 },
  { "区域": "华南", "访问量": 11260, "转化率": 39 }
]`;
  const CSV_SAMPLE = `区域,访问量,转化率
华东,12840,42
华北,9680,36
华南,11260,39`;

  const elements = {
    projectName: document.querySelector('#project-name'),
    undo: document.querySelector('#undo-button'),
    redo: document.querySelector('#redo-button'),
    theme: document.querySelector('#theme-button'),
    importButton: document.querySelector('#import-button'),
    exportButton: document.querySelector('#export-button'),
    reset: document.querySelector('#reset-button'),
    preview: document.querySelector('#preview-button'),
    exitPreview: document.querySelector('#exit-preview-button'),
    componentList: document.querySelector('#component-list'),
    widgetCount: document.querySelector('#widget-count'),
    sourceList: document.querySelector('#source-list'),
    addSource: document.querySelector('#add-source-button'),
    stage: document.querySelector('#stage'),
    stageScroller: document.querySelector('#stage-scroller'),
    stageTheme: document.querySelector('#stage-theme-label'),
    saveStatus: document.querySelector('#save-status'),
    inspector: document.querySelector('#inspector'),
    inspectorContent: document.querySelector('#inspector-content'),
    closeInspector: document.querySelector('#close-inspector'),
    mobileInspector: document.querySelector('#mobile-inspector-button'),
    sourceDialog: document.querySelector('#source-dialog'),
    sourceForm: document.querySelector('#source-form'),
    sourceName: document.querySelector('#source-name'),
    sourceInput: document.querySelector('#source-input'),
    sourceError: document.querySelector('#source-error'),
    importInput: document.querySelector('#import-input'),
    toast: document.querySelector('#toast')
  };

  let project = loadProject();
  let selectedId = project.widgets[0] ? project.widgets[0].id : null;
  let history = [Core.serializeProject(project)];
  let historyIndex = 0;
  let widgetSequence = 100;
  let dragState = null;
  let toastTimer = null;
  let saveTimer = null;
  let resetTimer = null;
  let sourceDeleteArmed = '';

  function seedProject() {
    return Core.normalizeProject({
      version: 1,
      name: '夏季运营控制室',
      theme: 'ocean',
      sources: [
        {
          id: 'weekly-traffic',
          name: '七日访问趋势',
          records: [
            { 日期: '周一', 访问量: 12840, 转化数: 1380, 客单价: 286 },
            { 日期: '周二', 访问量: 14120, 转化数: 1590, 客单价: 302 },
            { 日期: '周三', 访问量: 13760, 转化数: 1480, 客单价: 295 },
            { 日期: '周四', 访问量: 16980, 转化数: 1930, 客单价: 318 },
            { 日期: '周五', 访问量: 18460, 转化数: 2210, 客单价: 324 },
            { 日期: '周六', 访问量: 21880, 转化数: 2680, 客单价: 341 },
            { 日期: '周日', 访问量: 20340, 转化数: 2470, 客单价: 336 }
          ]
        },
        {
          id: 'regional-sales',
          name: '区域营收结构',
          records: [
            { 区域: '华东', 营收: 486000, 订单: 1520, 达成率: 94 },
            { 区域: '华南', 营收: 372000, 订单: 1186, 达成率: 88 },
            { 区域: '华北', 营收: 318000, 订单: 970, 达成率: 83 },
            { 区域: '西南', 营收: 236000, 订单: 748, 达成率: 79 },
            { 区域: '其他', 营收: 158000, 订单: 506, 达成率: 72 }
          ]
        }
      ],
      widgets: [
        widget('metric-visits', 'metric', 'weekly-traffic', { x: 0, y: 0, w: 3, h: 2 }, '累计访问', '七日流量总和', '日期', '访问量', '#53c7c9'),
        widget('metric-orders', 'metric', 'regional-sales', { x: 3, y: 0, w: 3, h: 2 }, '区域订单', '当前统计周期', '区域', '订单', '#f0c85a'),
        widget('region-donut', 'donut', 'regional-sales', { x: 6, y: 0, w: 6, h: 4 }, '营收结构', '按区域拆分', '区域', '营收', '#ff6b4a'),
        widget('traffic-bars', 'bar', 'weekly-traffic', { x: 0, y: 2, w: 6, h: 4 }, '七日访问量', '每日流量对比', '日期', '访问量', '#53c7c9'),
        widget('conversion-line', 'line', 'weekly-traffic', { x: 0, y: 6, w: 7, h: 4 }, '转化趋势', '七日成交信号', '日期', '转化数', '#ff6b4a'),
        widget('regional-table', 'table', 'regional-sales', { x: 7, y: 4, w: 5, h: 6 }, '区域明细', '营收与目标达成', '区域', '营收', '#8aa6ff')
      ]
    });
  }

  function widget(id, type, sourceId, layout, title, subtitle, labelField, valueField, accent) {
    return { id, type, sourceId, layout, config: { title, subtitle, labelField, valueField, accent } };
  }

  function loadProject() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return Core.deserializeProject(stored);
    } catch (error) {
      console.warn('Could not restore GRID/88 project', error);
    }
    return seedProject();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value, compact) {
    const number = Core.toNumber(value);
    return new Intl.NumberFormat('zh-CN', {
      notation: compact && Math.abs(number) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(number) < 100 ? 1 : 0
    }).format(number);
  }

  function sourceFor(widgetItem) {
    return project.sources.find((source) => source.id === widgetItem.sourceId) || project.sources[0] || null;
  }

  function selectedWidget() {
    return project.widgets.find((item) => item.id === selectedId) || null;
  }

  function optionsMarkup(fields, selected, filter) {
    const list = filter ? fields.filter(filter) : fields;
    if (!list.length) return '<option value="">没有可用字段</option>';
    return list.map((field) => `<option value="${escapeHtml(field.name)}" ${field.name === selected ? 'selected' : ''}>${escapeHtml(field.name)} · ${field.type === 'number' ? '数值' : '文本'}</option>`).join('');
  }

  function renderAll() {
    elements.projectName.value = project.name;
    document.body.classList.toggle('theme-paper', project.theme === 'paper');
    document.body.classList.toggle('theme-ocean', project.theme !== 'paper');
    elements.stageTheme.textContent = project.theme === 'paper' ? 'PAPER' : 'OCEAN';
    elements.widgetCount.textContent = project.widgets.length;
    renderSources();
    renderStage();
    renderInspector();
    renderHistoryControls();
  }

  function renderSources() {
    if (!project.sources.length) {
      elements.sourceList.innerHTML = '<div class="chart-empty">还没有数据源<br>点击“新建”接入数据</div>';
      return;
    }
    elements.sourceList.innerHTML = project.sources.map((source) => `
      <div class="source-item" data-source-item="${escapeHtml(source.id)}">
        <span class="source-pulse" aria-hidden="true"></span>
        <span><b title="${escapeHtml(source.name)}">${escapeHtml(source.name)}</b><small>${source.records.length} ROWS · ${Core.inferFields(source.records).length} FIELDS</small></span>
        <button class="source-delete" type="button" data-delete-source="${escapeHtml(source.id)}" ${project.sources.length <= 1 ? 'disabled' : ''} aria-label="删除数据源 ${escapeHtml(source.name)}">×</button>
      </div>`).join('');
  }

  function renderStage() {
    if (!project.widgets.length) {
      elements.stage.innerHTML = '<div class="stage-empty">从左侧组件仓拖入第一个组件</div>';
      return;
    }
    elements.stage.innerHTML = project.widgets.map((item) => renderWidget(item)).join('');
  }

  function renderWidget(item) {
    const layout = item.layout;
    const selected = item.id === selectedId;
    return `
      <article class="dashboard-widget ${selected ? 'selected' : ''}" data-widget-id="${escapeHtml(item.id)}"
        tabindex="0" aria-label="${escapeHtml(item.config.title)}，${TYPE_NAMES[item.type]}"
        style="grid-column:${layout.x + 1} / span ${layout.w};grid-row:${layout.y + 1} / span ${layout.h};--accent:${item.config.accent}">
        <div class="widget-shell">
          <header class="widget-head">
            <span class="widget-title"><b>${escapeHtml(item.config.title)}</b><small>${escapeHtml(item.config.subtitle || TYPE_NAMES[item.type])}</small></span>
            <button class="widget-grip" type="button" data-grip="${escapeHtml(item.id)}" aria-label="拖动 ${escapeHtml(item.config.title)}">
              <i></i><i></i><i></i><i></i><i></i><i></i>
            </button>
          </header>
          <div class="widget-body">${renderWidgetBody(item)}</div>
        </div>
      </article>`;
  }

  function renderWidgetBody(item) {
    const source = sourceFor(item);
    if (!source || !source.records.length) return '<div class="chart-empty">未绑定可用数据<br>在右侧选择数据源</div>';
    const series = Core.resolveSeries(source.records, item.config.labelField, item.config.valueField);
    if (!series.values.length) return '<div class="chart-empty">数据源没有记录<br>接入 JSON 或 CSV 后重试</div>';
    if (item.type === 'metric') return renderMetric(series, source.records.length);
    if (item.type === 'bar') return renderBar(series);
    if (item.type === 'line') return renderLine(series);
    if (item.type === 'donut') return renderDonut(series);
    return renderTable(source.records, item);
  }

  function renderMetric(series, rowCount) {
    const first = series.values[0] || 0;
    const last = series.values[series.values.length - 1] || 0;
    const delta = first ? ((last - first) / Math.abs(first)) * 100 : 0;
    const sign = delta > 0 ? '+' : '';
    return `<div class="metric-view">
      <div class="metric-value">${formatNumber(series.total, true)}<small>SUM</small></div>
      <div class="metric-meta"><span class="metric-delta">${sign}${delta.toFixed(1)}%</span><span>${rowCount} 条记录 · 首尾变化</span></div>
    </div>`;
  }

  function renderBar(series) {
    const max = series.max || 1;
    return `<div class="bar-chart" style="--items:${series.values.length}">${series.values.map((value, index) => {
      const height = Math.max(2, Math.abs(value) / max * 88);
      return `<div class="bar-item"><div class="bar-track"><i class="bar-fill" style="height:${height}%" data-value="${escapeHtml(formatNumber(value, true))}"></i></div><small title="${escapeHtml(series.labels[index])}">${escapeHtml(series.labels[index])}</small></div>`;
    }).join('')}</div>`;
  }

  function renderLine(series) {
    const width = 360;
    const height = 112;
    const top = 8;
    const bottom = 98;
    const min = Math.min(...series.values);
    const max = Math.max(...series.values);
    const range = max - min || 1;
    const points = series.values.map((value, index) => {
      const x = series.values.length === 1 ? width / 2 : index / (series.values.length - 1) * width;
      const y = bottom - ((value - min) / range) * (bottom - top);
      return { x, y, value };
    });
    const path = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const area = points.length ? `0,${bottom} ${path} ${width},${bottom}` : '';
    const labels = series.labels.filter((label, index) => index === 0 || index === series.labels.length - 1 || (series.labels.length <= 5 && index > 0));
    return `<div class="line-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="从 ${formatNumber(min)} 到 ${formatNumber(max)} 的趋势图">
        <line class="line-grid" x1="0" y1="30" x2="360" y2="30"></line><line class="line-grid" x1="0" y1="64" x2="360" y2="64"></line><line class="line-grid" x1="0" y1="98" x2="360" y2="98"></line>
        <polygon class="line-area" points="${area}"></polygon><polyline class="line-path" points="${path}"></polyline>
        ${points.map((point) => `<circle class="line-dot" cx="${point.x}" cy="${point.y}" r="3"><title>${formatNumber(point.value)}</title></circle>`).join('')}
      </svg>
      <div class="line-labels">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>
    </div>`;
  }

  function renderDonut(series) {
    const positiveValues = series.values.map((value) => Math.max(0, value));
    const total = positiveValues.reduce((sum, value) => sum + value, 0);
    if (!total) return '<div class="chart-empty">数值总和为 0<br>请选择其他数值字段</div>';
    let cursor = 0;
    const segments = positiveValues.map((value, index) => {
      const start = cursor;
      const end = cursor + value / total * 100;
      cursor = end;
      return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `<div class="donut-view">
      <div class="donut-chart" style="--donut:conic-gradient(${segments.join(',')})" data-total="${escapeHtml(formatNumber(total, true))}" aria-label="总计 ${formatNumber(total)}"></div>
      <div class="legend-list">${series.labels.slice(0, 6).map((label, index) => `<div class="legend-item"><i style="--swatch:${DONUT_COLORS[index % DONUT_COLORS.length]}"></i><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><b>${(positiveValues[index] / total * 100).toFixed(0)}%</b></div>`).join('')}</div>
    </div>`;
  }

  function renderTable(records, item) {
    const inferred = Core.inferFields(records).map((field) => field.name);
    const preferred = [item.config.labelField, item.config.valueField].filter(Boolean);
    const fields = [...new Set([...preferred, ...inferred])].slice(0, 4);
    if (!fields.length) return '<div class="chart-empty">没有可展示字段</div>';
    return `<table class="table-view"><thead><tr>${fields.map((field) => `<th>${escapeHtml(field)}</th>`).join('')}</tr></thead><tbody>${records.slice(0, 6).map((record) => `<tr>${fields.map((field) => `<td title="${escapeHtml(record[field])}">${escapeHtml(record[field])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderInspector() {
    const item = selectedWidget();
    elements.mobileInspector.hidden = !item;
    if (!item) {
      elements.inspectorContent.innerHTML = `<div class="inspector-empty"><span class="inspector-empty-mark">＋</span><b>还没选中组件</b><p>点击画布中的组件，数据绑定与布局设置会出现在这里。</p></div>`;
      return;
    }
    const source = sourceFor(item);
    const fields = Core.inferFields(source ? source.records : []);
    elements.inspectorContent.innerHTML = `
      <div class="inspector-type"><span>SELECTED / ${escapeHtml(item.id)}</span><b>${TYPE_NAMES[item.type]}</b></div>
      <section class="inspector-section">
        <h3>文字与颜色</h3>
        <label class="field"><span>标题</span><input value="${escapeHtml(item.config.title)}" maxlength="60" data-config="title"></label>
        <label class="field"><span>辅助说明</span><input value="${escapeHtml(item.config.subtitle)}" maxlength="80" data-config="subtitle"></label>
        <label class="color-field"><span>强调色</span><input type="color" value="${escapeHtml(item.config.accent)}" data-config="accent" aria-label="强调色"></label>
      </section>
      <section class="inspector-section">
        <h3>数据绑定</h3>
        <label class="field"><span>数据源</span><select data-source-id>${project.sources.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === item.sourceId ? 'selected' : ''}>${escapeHtml(entry.name)}</option>`).join('')}</select></label>
        <label class="field"><span>标签字段</span><select data-config="labelField">${optionsMarkup(fields, item.config.labelField)}</select></label>
        <label class="field"><span>数值字段</span><select data-config="valueField">${optionsMarkup(fields, item.config.valueField, (field) => field.type === 'number')}</select></label>
        <p class="field-help">当前数据源包含 ${source ? source.records.length : 0} 条记录；图表最多绘制前 12 条。</p>
      </section>
      <section class="inspector-section">
        <h3>网格布局</h3>
        <div class="field-row">
          <label class="field"><span>列 X · 0–11</span><input type="number" min="0" max="11" value="${item.layout.x}" data-layout="x"></label>
          <label class="field"><span>行 Y</span><input type="number" min="0" max="60" value="${item.layout.y}" data-layout="y"></label>
          <label class="field"><span>宽 W · 1–12</span><input type="number" min="1" max="12" value="${item.layout.w}" data-layout="w"></label>
          <label class="field"><span>高 H · 1–12</span><input type="number" min="1" max="12" value="${item.layout.h}" data-layout="h"></label>
        </div>
      </section>
      <div class="inspector-actions">
        <button class="quiet-button" type="button" data-duplicate-widget>复制组件</button>
        <button class="quiet-button delete-widget" type="button" data-delete-widget>删除组件</button>
      </div>`;
  }

  function renderHistoryControls() {
    elements.undo.disabled = historyIndex <= 0;
    elements.redo.disabled = historyIndex >= history.length - 1;
  }

  function persist() {
    clearTimeout(saveTimer);
    elements.saveStatus.textContent = '保存中…';
    try { window.localStorage.setItem(STORAGE_KEY, Core.serializeProject(project)); }
    catch (error) { showToast('浏览器存储不可用，请先导出项目备份'); }
    saveTimer = window.setTimeout(() => { elements.saveStatus.textContent = '已自动保存'; }, 450);
  }

  function checkpoint(message) {
    const snapshot = Core.serializeProject(project);
    if (history[historyIndex] !== snapshot) {
      history = history.slice(0, historyIndex + 1);
      history.push(snapshot);
      if (history.length > 50) history.shift();
      historyIndex = history.length - 1;
    }
    persist();
    renderHistoryControls();
    if (message) showToast(message);
  }

  function restoreHistory(nextIndex) {
    if (nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    project = Core.deserializeProject(history[historyIndex]);
    if (!project.widgets.some((item) => item.id === selectedId)) selectedId = project.widgets[0] ? project.widgets[0].id : null;
    persist();
    renderAll();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function chooseInitialFields(item) {
    const source = sourceFor(item);
    const fields = Core.inferFields(source ? source.records : []);
    const numeric = fields.find((field) => field.type === 'number');
    const label = fields.find((field) => field.type === 'text') || fields[0];
    item.config.labelField = label ? label.name : '';
    item.config.valueField = numeric ? numeric.name : '';
  }

  function nextOpenLayout(defaultLayout) {
    const base = Core.clampLayout(defaultLayout);
    const slotsPerRow = Math.max(1, Math.floor(12 / base.w));
    const index = project.widgets.length;
    return Core.clampLayout({ ...base, x: (index % slotsPerRow) * base.w, y: 10 + Math.floor(index / slotsPerRow) * base.h });
  }

  function addWidget(type, position) {
    const item = Core.createWidget(type, Date.now() + widgetSequence++);
    item.sourceId = project.sources[0] ? project.sources[0].id : '';
    item.layout = position ? Core.clampLayout({ ...item.layout, ...position }) : nextOpenLayout(item.layout);
    chooseInitialFields(item);
    project.widgets.push(item);
    selectedId = item.id;
    checkpoint(`${TYPE_NAMES[type]}已放入画布`);
    renderAll();
    window.setTimeout(() => {
      const node = elements.stage.querySelector(`[data-widget-id="${item.id}"]`);
      if (node) node.focus({ preventScroll: true });
    }, 0);
  }

  function deleteWidget(id) {
    const index = project.widgets.findIndex((item) => item.id === id);
    if (index < 0) return;
    project.widgets.splice(index, 1);
    selectedId = project.widgets[index] ? project.widgets[index].id : (project.widgets[index - 1] ? project.widgets[index - 1].id : null);
    checkpoint('组件已删除，可用 Ctrl+Z 撤销');
    renderAll();
  }

  function duplicateWidget(id) {
    const original = project.widgets.find((item) => item.id === id);
    if (!original) return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = `widget-${original.type}-${Date.now() + widgetSequence++}`;
    copy.config.title = `${original.config.title} 副本`;
    copy.layout = Core.clampLayout({ ...original.layout, x: original.layout.x + 1, y: original.layout.y + 1 });
    project.widgets.push(copy);
    selectedId = copy.id;
    checkpoint('组件副本已创建');
    renderAll();
  }

  function selectWidget(id, focus) {
    if (!project.widgets.some((item) => item.id === id)) return;
    selectedId = id;
    elements.stage.querySelectorAll('.dashboard-widget').forEach((node) => node.classList.toggle('selected', node.dataset.widgetId === id));
    renderInspector();
    if (focus) {
      const node = elements.stage.querySelector(`[data-widget-id="${id}"]`);
      if (node) node.focus({ preventScroll: true });
    }
  }

  function nudgeWidget(item, key, amount) {
    const next = { ...item.layout };
    if (key === 'ArrowLeft') next.x -= amount;
    if (key === 'ArrowRight') next.x += amount;
    if (key === 'ArrowUp') next.y -= amount;
    if (key === 'ArrowDown') next.y += amount;
    const clamped = Core.clampLayout(next);
    if (JSON.stringify(clamped) === JSON.stringify(item.layout)) return;
    item.layout = clamped;
    checkpoint();
    renderStage();
    renderInspector();
    const node = elements.stage.querySelector(`[data-widget-id="${item.id}"]`);
    if (node) node.focus({ preventScroll: true });
  }

  function openSourceDialog() {
    elements.sourceName.value = `数据源 ${project.sources.length + 1}`;
    elements.sourceInput.value = JSON_SAMPLE;
    elements.sourceError.textContent = '';
    elements.sourceForm.querySelector('input[value="json"]').checked = true;
    elements.sourceDialog.showModal();
    window.setTimeout(() => elements.sourceName.focus(), 0);
  }

  function closeSourceDialog() {
    if (elements.sourceDialog.open) elements.sourceDialog.close();
  }

  function createSource(event) {
    event.preventDefault();
    const format = new FormData(elements.sourceForm).get('source-format');
    try {
      const records = Core.parseDataInput(elements.sourceInput.value, format);
      if (!records.length) throw new Error('数据中没有可用记录');
      const slug = elements.sourceName.value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'source';
      let id = `${slug}-${Date.now().toString(36)}`;
      while (project.sources.some((source) => source.id === id)) id += '-1';
      project.sources.push({ id, name: elements.sourceName.value.trim() || '未命名数据源', records });
      checkpoint(`已接入 ${records.length} 条记录`);
      closeSourceDialog();
      renderAll();
    } catch (error) {
      elements.sourceError.textContent = error.message;
    }
  }

  function removeSource(id, button) {
    if (project.sources.length <= 1) return;
    const source = project.sources.find((entry) => entry.id === id);
    if (!source) return;
    if (sourceDeleteArmed !== id) {
      sourceDeleteArmed = id;
      button.textContent = '!';
      showToast(`再次点击删除“${source.name}”`);
      window.setTimeout(() => {
        if (sourceDeleteArmed === id) {
          sourceDeleteArmed = '';
          if (button.isConnected) button.textContent = '×';
        }
      }, 3000);
      return;
    }
    sourceDeleteArmed = '';
    project.sources = project.sources.filter((entry) => entry.id !== id);
    project.widgets.forEach((item) => {
      if (item.sourceId === id) {
        item.sourceId = project.sources[0] ? project.sources[0].id : '';
        chooseInitialFields(item);
      }
    });
    checkpoint(`数据源“${source.name}”已删除`);
    renderAll();
  }

  function setPreview(active) {
    document.body.classList.toggle('preview-mode', active);
    if (active) {
      elements.inspector.classList.remove('open');
      elements.exitPreview.focus();
    } else {
      elements.preview.focus();
    }
  }

  function exportProject() {
    const content = Core.serializeProject(project);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = project.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'grid-88-dashboard';
    link.href = url;
    link.download = `${safeName}.grid88.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('项目 JSON 已导出');
  }

  async function importProject(file) {
    if (!file) return;
    try {
      const imported = Core.deserializeProject(await file.text());
      project = imported;
      selectedId = project.widgets[0] ? project.widgets[0].id : null;
      history = [Core.serializeProject(project)];
      historyIndex = 0;
      persist();
      renderAll();
      showToast(`已导入“${project.name}”`);
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.importInput.value = '';
    }
  }

  function resetProject() {
    if (!elements.reset.classList.contains('armed')) {
      elements.reset.classList.add('armed');
      elements.reset.textContent = '再次点击确认';
      clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        elements.reset.classList.remove('armed');
        elements.reset.textContent = '重置示例';
      }, 3500);
      return;
    }
    clearTimeout(resetTimer);
    elements.reset.classList.remove('armed');
    elements.reset.textContent = '重置示例';
    project = seedProject();
    selectedId = project.widgets[0].id;
    history = [Core.serializeProject(project)];
    historyIndex = 0;
    persist();
    renderAll();
    showToast('示例大屏已恢复');
  }

  elements.componentList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-widget-type]');
    if (button) addWidget(button.dataset.widgetType);
  });

  elements.componentList.addEventListener('dragstart', (event) => {
    const button = event.target.closest('[data-widget-type]');
    if (!button) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-grid88', button.dataset.widgetType);
    event.dataTransfer.setData('text/plain', button.dataset.widgetType);
  });

  elements.stage.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    elements.stage.classList.add('drop-ready');
  });

  elements.stage.addEventListener('dragleave', (event) => {
    if (!elements.stage.contains(event.relatedTarget)) elements.stage.classList.remove('drop-ready');
  });

  elements.stage.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.stage.classList.remove('drop-ready');
    const type = event.dataTransfer.getData('application/x-grid88') || event.dataTransfer.getData('text/plain');
    if (!Core.WIDGET_TYPES.includes(type)) return;
    const defaults = Core.WIDGET_DEFAULTS[type].layout;
    const layout = Core.gridPosition(event.clientX, event.clientY, elements.stage.getBoundingClientRect(), defaults);
    addWidget(type, layout);
  });

  elements.stage.addEventListener('click', (event) => {
    const node = event.target.closest('[data-widget-id]');
    if (node) selectWidget(node.dataset.widgetId, false);
  });

  elements.stage.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip || document.body.classList.contains('preview-mode')) return;
    const item = project.widgets.find((entry) => entry.id === grip.dataset.grip);
    if (!item) return;
    event.preventDefault();
    selectWidget(item.id, false);
    const node = elements.stage.querySelector(`[data-widget-id="${item.id}"]`);
    if (node) node.classList.add('dragging');
    dragState = { id: item.id, start: { ...item.layout }, draft: { ...item.layout } };
  });

  document.addEventListener('pointermove', (event) => {
    if (!dragState) return;
    const item = project.widgets.find((entry) => entry.id === dragState.id);
    const node = elements.stage.querySelector(`[data-widget-id="${dragState.id}"]`);
    if (!item || !node) return;
    dragState.draft = Core.gridPosition(event.clientX, event.clientY, elements.stage.getBoundingClientRect(), item.layout);
    node.style.gridColumn = `${dragState.draft.x + 1} / span ${dragState.draft.w}`;
    node.style.gridRow = `${dragState.draft.y + 1} / span ${dragState.draft.h}`;
  });

  document.addEventListener('pointerup', () => {
    if (!dragState) return;
    const item = project.widgets.find((entry) => entry.id === dragState.id);
    const changed = item && (dragState.start.x !== dragState.draft.x || dragState.start.y !== dragState.draft.y);
    if (item) item.layout = dragState.draft;
    dragState = null;
    if (changed) checkpoint('组件位置已更新');
    renderStage();
    renderInspector();
  });

  elements.stage.addEventListener('keydown', (event) => {
    const node = event.target.closest('[data-widget-id]');
    if (!node || document.body.classList.contains('preview-mode')) return;
    const item = project.widgets.find((entry) => entry.id === node.dataset.widgetId);
    if (!item) return;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      nudgeWidget(item, event.key, event.shiftKey ? 2 : 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteWidget(item.id);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateWidget(item.id);
    }
  });

  elements.inspectorContent.addEventListener('input', (event) => {
    const item = selectedWidget();
    if (!item) return;
    const configKey = event.target.dataset.config;
    if (configKey) {
      item.config[configKey] = event.target.value;
      renderStage();
    }
  });

  elements.inspectorContent.addEventListener('change', (event) => {
    const item = selectedWidget();
    if (!item) return;
    if (event.target.matches('[data-source-id]')) {
      item.sourceId = event.target.value;
      chooseInitialFields(item);
      checkpoint('数据源绑定已更新');
      renderStage();
      renderInspector();
      return;
    }
    const layoutKey = event.target.dataset.layout;
    if (layoutKey) {
      item.layout = Core.clampLayout({ ...item.layout, [layoutKey]: Number(event.target.value) });
      checkpoint('组件布局已更新');
      renderStage();
      renderInspector();
      return;
    }
    if (event.target.dataset.config) {
      item.config[event.target.dataset.config] = event.target.value;
      checkpoint('组件设置已更新');
      renderStage();
    }
  });

  elements.inspectorContent.addEventListener('click', (event) => {
    const item = selectedWidget();
    if (!item) return;
    if (event.target.closest('[data-duplicate-widget]')) duplicateWidget(item.id);
    if (event.target.closest('[data-delete-widget]')) deleteWidget(item.id);
  });

  elements.sourceList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-source]');
    if (button) removeSource(button.dataset.deleteSource, button);
  });

  elements.projectName.addEventListener('input', () => { project.name = elements.projectName.value || '未命名大屏'; });
  elements.projectName.addEventListener('change', () => checkpoint('项目名称已更新'));
  elements.undo.addEventListener('click', () => restoreHistory(historyIndex - 1));
  elements.redo.addEventListener('click', () => restoreHistory(historyIndex + 1));
  elements.theme.addEventListener('click', () => {
    project.theme = project.theme === 'ocean' ? 'paper' : 'ocean';
    checkpoint(project.theme === 'paper' ? '已切换到纸面底色' : '已切换到深海底色');
    renderAll();
  });
  elements.importButton.addEventListener('click', () => elements.importInput.click());
  elements.exportButton.addEventListener('click', exportProject);
  elements.reset.addEventListener('click', resetProject);
  elements.preview.addEventListener('click', () => setPreview(true));
  elements.exitPreview.addEventListener('click', () => setPreview(false));
  elements.addSource.addEventListener('click', openSourceDialog);
  elements.closeInspector.addEventListener('click', () => elements.inspector.classList.remove('open'));
  elements.mobileInspector.addEventListener('click', () => elements.inspector.classList.add('open'));
  elements.sourceForm.addEventListener('submit', createSource);
  elements.sourceDialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', closeSourceDialog));
  elements.sourceForm.addEventListener('change', (event) => {
    if (event.target.name === 'source-format') elements.sourceInput.value = event.target.value === 'csv' ? CSV_SAMPLE : JSON_SAMPLE;
  });
  elements.importInput.addEventListener('change', () => importProject(elements.importInput.files[0]));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (document.body.classList.contains('preview-mode')) setPreview(false);
      else if (elements.sourceDialog.open) closeSourceDialog();
      else elements.inspector.classList.remove('open');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.matches('input,textarea,select')) {
      event.preventDefault();
      restoreHistory(historyIndex + (event.shiftKey ? 1 : -1));
    }
  });

  window.addEventListener('beforeunload', persist);
  renderAll();
  document.body.classList.add('ready');
})();
