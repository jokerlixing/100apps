'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./dashboard-core.js');

test('parseCsv supports quoted commas, escaped quotes and blank lines', () => {
  const rows = Core.parseCsv('city,value,note\r\n"上海,浦东",128,"同比""上涨"""\r\n\r\n北京,96,稳定');
  assert.deepEqual(rows, [
    { city: '上海,浦东', value: '128', note: '同比"上涨"' },
    { city: '北京', value: '96', note: '稳定' }
  ]);
});

test('parseDataInput accepts JSON arrays and rejects unsupported JSON shapes', () => {
  assert.deepEqual(Core.parseDataInput('[{"name":"A","value":3}]', 'json'), [
    { name: 'A', value: 3 }
  ]);
  assert.throws(() => Core.parseDataInput('{"name":"A"}', 'json'), /JSON 数组/);
});

test('inferFields distinguishes numeric and text columns', () => {
  const fields = Core.inferFields([
    { city: '上海', visits: '1,280', rate: 42.5 },
    { city: '北京', visits: '960', rate: 38 }
  ]);
  assert.deepEqual(fields, [
    { name: 'city', type: 'text' },
    { name: 'visits', type: 'number' },
    { name: 'rate', type: 'number' }
  ]);
});

test('resolveSeries coerces numeric values and preserves readable labels', () => {
  const series = Core.resolveSeries([
    { day: '周一', amount: '1,250' },
    { day: '周二', amount: null },
    { day: '周三', amount: '-30.5' }
  ], 'day', 'amount');
  assert.deepEqual(series.labels, ['周一', '周二', '周三']);
  assert.deepEqual(series.values, [1250, 0, -30.5]);
  assert.equal(series.total, 1219.5);
});

test('clampLayout keeps widgets inside the 12-column stage', () => {
  assert.deepEqual(Core.clampLayout({ x: 11, y: -3, w: 5, h: 0 }), {
    x: 7, y: 0, w: 5, h: 1
  });
  assert.deepEqual(Core.clampLayout({ x: -2, y: 4, w: 99, h: 20 }), {
    x: 0, y: 4, w: 12, h: 12
  });
});

test('gridPosition converts pointer coordinates and respects widget size', () => {
  const position = Core.gridPosition(690, 250, { left: 100, top: 50, width: 600 }, { w: 4, h: 3 });
  assert.deepEqual(position, { x: 8, y: 4, w: 4, h: 3 });
});

test('createWidget returns isolated defaults with unique ids', () => {
  const first = Core.createWidget('bar', 1);
  const second = Core.createWidget('bar', 2);
  first.config.title = 'Changed';
  assert.notEqual(first.id, second.id);
  assert.equal(second.config.title, '柱状图');
  assert.deepEqual(first.layout, { x: 0, y: 0, w: 6, h: 4 });
});

test('project round-trip normalizes sources, widgets and unsafe layout values', () => {
  const input = {
    version: 1,
    name: '月度运营屏',
    theme: 'ocean',
    sources: [{ id: 'sales', name: '销售', records: [{ month: '8月', amount: 88 }] }],
    widgets: [{
      id: 'revenue', type: 'metric', sourceId: 'sales',
      layout: { x: 40, y: -1, w: 4, h: 2 },
      config: { title: '收入', labelField: 'month', valueField: 'amount', accent: '#ff6b4a' }
    }]
  };
  const normalized = Core.deserializeProject(Core.serializeProject(input));
  assert.equal(normalized.name, '月度运营屏');
  assert.deepEqual(normalized.widgets[0].layout, { x: 8, y: 0, w: 4, h: 2 });
  assert.equal(normalized.sources[0].records[0].amount, 88);
});

test('normalizeProject rejects malformed imports without mutating fallback data', () => {
  assert.throws(() => Core.normalizeProject({ widgets: 'bad', sources: [] }), /组件列表/);
  assert.throws(() => Core.deserializeProject('{broken'), /项目文件不是有效 JSON/);
});
