import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeForecast } from '../src/api.js';
import { formatJson, formatTerminal, formatWindDirection, shouldUseColor } from '../src/format.js';
import { getCondition } from '../src/weather-codes.js';
import { forecastPayload, locationPayload } from './fixture.js';

const weather = normalizeForecast(locationPayload.results[0], forecastPayload);

test('maps WMO codes to bilingual labels and safe fallbacks', () => {
  assert.equal(getCondition(0, 'zh').label, '晴朗');
  assert.equal(getCondition(61, 'en').label, 'Rain');
  assert.equal(getCondition(99, 'zh').key, 'storm');
  assert.match(getCondition(1234, 'en').label, /Unknown/);
  assert.equal(getCondition(1234).art.length, 4);
});

test('converts degrees to eight compass directions', () => {
  assert.equal(formatWindDirection(0, 'zh'), '北');
  assert.equal(formatWindDirection(44, 'en'), 'NE');
  assert.equal(formatWindDirection(225, 'zh'), '西南');
  assert.equal(formatWindDirection(null), '-');
});

test('renders a readable deterministic terminal report', () => {
  const output = formatTerminal(weather, { lang: 'zh', color: false });
  assert.match(output, /SKY\/86  上海 · 上海市 · 中国/);
  assert.match(output, /大致晴朗/);
  assert.match(output, /29\.1°C  体感 31\.4°C/);
  assert.match(output, /2026-09-01\s+降雨/);
  assert.match(output, /数据：Open-Meteo/);
  assert.doesNotMatch(output, /\u001b\[/);
});

test('can force or suppress ANSI colors', () => {
  assert.equal(shouldUseColor({ requested: true, stream: {}, env: {} }), true);
  assert.equal(shouldUseColor({ requested: true, stream: {}, env: { NO_COLOR: '' } }), false);
  assert.equal(shouldUseColor({ requested: undefined, stream: { isTTY: false }, env: {} }), false);
  assert.match(formatTerminal(weather, { color: true }), /\u001b\[/);
});

test('produces valid normalized JSON', () => {
  const payload = JSON.parse(formatJson(weather));
  assert.equal(payload.app, 'SKY/86');
  assert.equal(payload.location.name, '上海');
  assert.equal(payload.forecast[2].weatherCode, 95);
});
