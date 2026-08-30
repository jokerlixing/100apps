(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DashboardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GRID_COLUMNS = 12;
  const GRID_ROW_HEIGHT = 48;
  const WIDGET_TYPES = Object.freeze(['metric', 'bar', 'line', 'donut', 'table']);
  const WIDGET_DEFAULTS = Object.freeze({
    metric: Object.freeze({
      title: '关键指标', subtitle: '当前值', labelField: '', valueField: '', accent: '#53c7c9',
      layout: Object.freeze({ x: 0, y: 0, w: 3, h: 2 })
    }),
    bar: Object.freeze({
      title: '柱状图', subtitle: '分类对比', labelField: '', valueField: '', accent: '#ff6b4a',
      layout: Object.freeze({ x: 0, y: 0, w: 6, h: 4 })
    }),
    line: Object.freeze({
      title: '趋势图', subtitle: '时间序列', labelField: '', valueField: '', accent: '#53c7c9',
      layout: Object.freeze({ x: 6, y: 0, w: 6, h: 4 })
    }),
    donut: Object.freeze({
      title: '占比环图', subtitle: '结构分布', labelField: '', valueField: '', accent: '#f0c85a',
      layout: Object.freeze({ x: 0, y: 4, w: 4, h: 4 })
    }),
    table: Object.freeze({
      title: '数据明细', subtitle: '最近记录', labelField: '', valueField: '', accent: '#8aa6ff',
      layout: Object.freeze({ x: 4, y: 4, w: 8, h: 4 })
    })
  });

  function cleanHeader(value, index, used) {
    const base = String(value == null ? '' : value).replace(/^\uFEFF/, '').trim() || `column_${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    return name;
  }

  function parseCsv(input) {
    const text = String(input == null ? '' : input);
    if (!text.trim()) return [];
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    function finishRow() {
      row.push(field);
      field = '';
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
    }

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field === '') quoted = true;
      else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') finishRow();
      else if (char !== '\r') field += char;
    }
    if (field !== '' || row.length) finishRow();
    if (!rows.length) return [];

    const used = new Set();
    const headers = rows[0].map((value, index) => cleanHeader(value, index, used));
    return rows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, index) => { record[header] = cells[index] == null ? '' : cells[index]; });
      return record;
    });
  }

  function copyRecords(records) {
    if (!Array.isArray(records)) throw new Error('数据必须是记录数组');
    return records.map((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error(`第 ${index + 1} 条数据不是对象`);
      }
      const clean = {};
      Object.keys(record).forEach((key) => { clean[String(key)] = record[key]; });
      return clean;
    });
  }

  function parseDataInput(input, format) {
    const text = String(input == null ? '' : input).trim();
    if (!text) throw new Error('请粘贴 JSON 或 CSV 数据');
    const selectedFormat = format === 'auto' || !format
      ? (text.startsWith('[') || text.startsWith('{') ? 'json' : 'csv')
      : format;
    if (selectedFormat === 'csv') return parseCsv(text);
    if (selectedFormat !== 'json') throw new Error('仅支持 JSON 或 CSV 格式');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (error) { throw new Error(`JSON 解析失败：${error.message}`); }
    if (!Array.isArray(parsed)) throw new Error('JSON 顶层必须是 JSON 数组');
    return copyRecords(parsed);
  }

  function numericCandidate(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string' || !value.trim()) return false;
    const cleaned = value.trim().replace(/[,\s]/g, '').replace(/%$/, '');
    return cleaned !== '' && Number.isFinite(Number(cleaned));
  }

  function toNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value == null || value === '') return 0;
    const cleaned = String(value).trim().replace(/[,\s]/g, '').replace(/%$/, '');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function inferFields(records) {
    const rows = Array.isArray(records) ? records : [];
    const fields = [];
    const seen = new Set();
    rows.forEach((record) => {
      if (!record || typeof record !== 'object') return;
      Object.keys(record).forEach((name) => {
        if (!seen.has(name)) {
          seen.add(name);
          fields.push(name);
        }
      });
    });
    return fields.map((name) => {
      const values = rows.map((record) => record && record[name]).filter((value) => value != null && value !== '');
      return { name, type: values.length > 0 && values.every(numericCandidate) ? 'number' : 'text' };
    });
  }

  function resolveSeries(records, labelField, valueField, limit) {
    const rows = (Array.isArray(records) ? records : []).slice(0, limit || 12);
    const labels = rows.map((record, index) => {
      const value = labelField && record ? record[labelField] : null;
      return value == null || value === '' ? `记录 ${index + 1}` : String(value);
    });
    const values = rows.map((record) => toNumber(valueField && record ? record[valueField] : 0));
    return {
      labels,
      values,
      total: values.reduce((sum, value) => sum + value, 0),
      max: values.length ? Math.max(...values.map((value) => Math.abs(value)), 0) : 0
    };
  }

  function integer(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  }

  function clampLayout(layout) {
    const source = layout || {};
    const width = Math.min(GRID_COLUMNS, Math.max(1, integer(source.w, 3)));
    const height = Math.min(12, Math.max(1, integer(source.h, 2)));
    const x = Math.min(GRID_COLUMNS - width, Math.max(0, integer(source.x, 0)));
    const y = Math.max(0, integer(source.y, 0));
    return { x, y, w: width, h: height };
  }

  function gridPosition(clientX, clientY, rect, layout) {
    const safeRect = rect || { left: 0, top: 0, width: GRID_COLUMNS };
    const columnWidth = Math.max(1, safeRect.width / GRID_COLUMNS);
    const next = {
      x: Math.floor((Number(clientX) - safeRect.left) / columnWidth),
      y: Math.floor((Number(clientY) - safeRect.top) / GRID_ROW_HEIGHT),
      w: layout && layout.w,
      h: layout && layout.h
    };
    return clampLayout(next);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createWidget(type, sequence) {
    if (!WIDGET_TYPES.includes(type)) throw new Error(`未知组件类型：${type}`);
    const defaults = WIDGET_DEFAULTS[type];
    const serial = Number.isFinite(Number(sequence)) ? Number(sequence) : Date.now();
    return {
      id: `widget-${type}-${serial}`,
      type,
      sourceId: '',
      layout: clone(defaults.layout),
      config: {
        title: defaults.title,
        subtitle: defaults.subtitle,
        labelField: defaults.labelField,
        valueField: defaults.valueField,
        accent: defaults.accent
      }
    };
  }

  function normalizeSource(source, index) {
    if (!source || typeof source !== 'object') throw new Error(`第 ${index + 1} 个数据源无效`);
    const id = String(source.id || `source-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      id,
      name: String(source.name || `数据源 ${index + 1}`).slice(0, 40),
      records: copyRecords(source.records || [])
    };
  }

  function normalizeWidget(widget, index) {
    if (!widget || typeof widget !== 'object') throw new Error(`第 ${index + 1} 个组件无效`);
    if (!WIDGET_TYPES.includes(widget.type)) throw new Error(`第 ${index + 1} 个组件类型无效`);
    const defaults = WIDGET_DEFAULTS[widget.type];
    const config = widget.config && typeof widget.config === 'object' ? widget.config : {};
    return {
      id: String(widget.id || `widget-${widget.type}-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-'),
      type: widget.type,
      sourceId: String(widget.sourceId || ''),
      layout: clampLayout(widget.layout || defaults.layout),
      config: {
        title: String(config.title || defaults.title).slice(0, 60),
        subtitle: String(config.subtitle || defaults.subtitle).slice(0, 80),
        labelField: String(config.labelField || ''),
        valueField: String(config.valueField || ''),
        accent: /^#[0-9a-f]{6}$/i.test(config.accent || '') ? config.accent : defaults.accent
      }
    };
  }

  function normalizeProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('项目结构无效');
    if (!Array.isArray(project.sources)) throw new Error('项目数据源列表无效');
    if (!Array.isArray(project.widgets)) throw new Error('项目组件列表无效');
    const sources = project.sources.map(normalizeSource);
    const sourceIds = new Set(sources.map((source) => source.id));
    const widgets = project.widgets.map(normalizeWidget).map((widget) => ({
      ...widget,
      sourceId: sourceIds.has(widget.sourceId) ? widget.sourceId : (sources[0] ? sources[0].id : '')
    }));
    return {
      version: 1,
      name: String(project.name || '未命名大屏').slice(0, 60),
      theme: project.theme === 'paper' ? 'paper' : 'ocean',
      sources,
      widgets
    };
  }

  function serializeProject(project) {
    return JSON.stringify(normalizeProject(project), null, 2);
  }

  function deserializeProject(text) {
    let parsed;
    try { parsed = JSON.parse(String(text)); }
    catch (error) { throw new Error(`项目文件不是有效 JSON：${error.message}`); }
    return normalizeProject(parsed);
  }

  return Object.freeze({
    GRID_COLUMNS,
    GRID_ROW_HEIGHT,
    WIDGET_TYPES,
    WIDGET_DEFAULTS,
    parseCsv,
    parseDataInput,
    inferFields,
    toNumber,
    resolveSeries,
    clampLayout,
    gridPosition,
    createWidget,
    normalizeProject,
    serializeProject,
    deserializeProject
  });
});
