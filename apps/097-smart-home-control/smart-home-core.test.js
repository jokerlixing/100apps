const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./smart-home-core.js');

const NOW = '2026-08-31T03:00:00.000Z';
const options = { now: () => Date.parse(NOW) };

test('createInitialState returns isolated homes with ten devices across six rooms', () => {
  const first = Core.createInitialState(options);
  const second = Core.createInitialState(options);

  assert.equal(first.devices.length, 10);
  assert.equal(new Set(first.devices.map((device) => device.roomId)).size, 6);
  assert.equal(first.activeScene, 'home');
  assert.equal(first.selectedRoom, 'living');
  assert.equal(first.activity[0].at, NOW);

  first.devices[0].locked = false;
  assert.equal(second.devices[0].locked, true, 'homes must not share nested state');
});

test('updateDevice clamps supported levels and leaves the source state untouched', () => {
  const state = Core.createInitialState(options);
  const next = Core.updateDevice(state, 'living-climate', { power: true, level: 99 }, options);

  assert.equal(next.devices.find((device) => device.id === 'living-climate').level, 30);
  assert.equal(state.devices.find((device) => device.id === 'living-climate').level, 24);
  assert.equal(next.activeScene, 'custom');
  assert.match(next.activity[0].text, /客厅空调/);
  assert.strictEqual(Core.updateDevice(state, 'missing-device', { power: true }, options), state);
});

test('applyScene links security, lighting, climate, curtains, and entertainment', () => {
  const state = Core.createInitialState(options);
  const cinema = Core.applyScene(state, 'cinema', options);

  assert.equal(cinema.activeScene, 'cinema');
  assert.equal(cinema.devices.find((device) => device.id === 'living-tv').power, true);
  assert.equal(cinema.devices.find((device) => device.id === 'living-light').level, 12);
  assert.equal(cinema.devices.find((device) => device.id === 'living-curtain').level, 0);
  assert.equal(cinema.devices.find((device) => device.id === 'entry-lock').locked, true);
  assert.match(cinema.activity[0].text, /观影/);
  assert.strictEqual(Core.applyScene(state, 'unknown-scene', options), state);
});

test('calculateMetrics derives active devices, current power, and projected energy', () => {
  const home = Core.createInitialState(options);
  const homeMetrics = Core.calculateMetrics(home);
  const awayMetrics = Core.calculateMetrics(Core.applyScene(home, 'away', options));

  assert.equal(homeMetrics.activeCount, 4);
  assert.equal(homeMetrics.totalWatts, 634);
  assert.equal(homeMetrics.monthlyKwh, 98.9);
  assert.equal(homeMetrics.comfortScore, 96);
  assert.equal(awayMetrics.activeCount, 0);
  assert.equal(awayMetrics.totalWatts, 8);
  assert.ok(awayMetrics.monthlyKwh < homeMetrics.monthlyKwh);
});

test('evaluateAutomation reacts only when the matching rule is enabled', () => {
  let state = Core.applyScene(Core.createInitialState(options), 'away', options);
  state = {
    ...state,
    devices: state.devices.map((device) => device.id === 'entry-lock' ? { ...device, locked: false } : device),
  };

  const secured = Core.evaluateAutomation(state, { type: 'door-open' }, options);
  assert.equal(secured.devices.find((device) => device.id === 'entry-lock').locked, true);
  assert.match(secured.activity[0].text, /离家守护/);

  const disabled = Core.toggleAutomation(state, 'away-guard', false, options);
  const untouched = Core.evaluateAutomation(disabled, { type: 'door-open' }, options);
  assert.equal(untouched.devices.find((device) => device.id === 'entry-lock').locked, false);

  const airCare = Core.evaluateAutomation(
    Core.updateDevice(state, 'bedroom-purifier', { power: false, level: 20 }, options),
    { type: 'air-quality', pm25: 86 },
    options,
  );
  const purifier = airCare.devices.find((device) => device.id === 'bedroom-purifier');
  assert.equal(purifier.power, true);
  assert.equal(purifier.level, 80);
});

test('hydrateState restores known values, rejects poisoned fields, and isolates the result', () => {
  const cached = {
    selectedRoom: 'study',
    activeScene: 'custom',
    devices: [
      { id: 'study-lamp', power: true, level: 140, name: '<script>' },
      { id: 'unknown', power: true },
    ],
    automations: [{ id: 'air-care', enabled: false, name: 'tampered' }],
    activity: [{ id: 'cached-1', text: '已恢复操作', at: NOW, tone: 'ok' }],
  };

  const restored = Core.hydrateState(cached, options);
  const lamp = restored.devices.find((device) => device.id === 'study-lamp');

  assert.equal(lamp.power, true);
  assert.equal(lamp.level, 100);
  assert.equal(lamp.name, '书房工作灯');
  assert.equal(restored.devices.length, 10);
  assert.equal(restored.automations.find((rule) => rule.id === 'air-care').enabled, false);
  assert.equal(restored.automations.find((rule) => rule.id === 'air-care').name, '空气自净');
  assert.equal(restored.activity[0].text, '已恢复操作');

  cached.devices[0].level = 0;
  assert.equal(lamp.level, 100);
  assert.deepEqual(Core.hydrateState(null, options), Core.createInitialState(options));
});
