(function attachSmartHomeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmartHomeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSmartHomeCore() {
  'use strict';

  const VERSION = 1;

  const ROOMS = Object.freeze([
    { id: 'entry', name: '玄关', short: 'ENTRY', temp: 25.1, humidity: 56 },
    { id: 'living', name: '客厅', short: 'LIVING', temp: 24.3, humidity: 52 },
    { id: 'kitchen', name: '厨房', short: 'KITCHEN', temp: 25.8, humidity: 58 },
    { id: 'bedroom', name: '卧室', short: 'BEDROOM', temp: 23.9, humidity: 55 },
    { id: 'study', name: '书房', short: 'STUDY', temp: 24.6, humidity: 49 },
    { id: 'balcony', name: '阳台', short: 'BALCONY', temp: 27.2, humidity: 61 },
  ]);

  const DEVICE_BLUEPRINTS = Object.freeze([
    { id: 'entry-lock', roomId: 'entry', name: '玄关门锁', kind: 'lock', icon: '⌁', power: false, locked: true, ratedWatts: 0, standbyWatts: 1.8 },
    { id: 'living-light', roomId: 'living', name: '客厅主灯', kind: 'light', icon: '✦', power: true, level: 72, min: 0, max: 100, unit: '%', ratedWatts: 14, standbyWatts: 0.2 },
    { id: 'living-curtain', roomId: 'living', name: '落地窗帘', kind: 'curtain', icon: 'Ⅱ', power: false, level: 72, min: 0, max: 100, unit: '%', ratedWatts: 0, standbyWatts: 0.5 },
    { id: 'living-climate', roomId: 'living', name: '客厅空调', kind: 'climate', icon: '❉', power: true, level: 24, min: 16, max: 30, unit: '°C', ratedWatts: 898, standbyWatts: 2 },
    { id: 'living-tv', roomId: 'living', name: '客厅电视', kind: 'media', icon: '▰', power: false, ratedWatts: 110, standbyWatts: 0.6 },
    { id: 'bedroom-light', roomId: 'bedroom', name: '床头氛围灯', kind: 'light', icon: '✦', power: false, level: 36, min: 0, max: 100, unit: '%', ratedWatts: 11, standbyWatts: 0.2 },
    { id: 'bedroom-purifier', roomId: 'bedroom', name: '卧室净化器', kind: 'purifier', icon: '≋', power: true, level: 48, min: 20, max: 100, unit: '%', ratedWatts: 55, standbyWatts: 1 },
    { id: 'study-lamp', roomId: 'study', name: '书房工作灯', kind: 'light', icon: '⌁', power: false, level: 78, min: 0, max: 100, unit: '%', ratedWatts: 10, standbyWatts: 0.2 },
    { id: 'kitchen-light', roomId: 'kitchen', name: '厨房操作灯', kind: 'light', icon: '✦', power: true, level: 52, min: 0, max: 100, unit: '%', ratedWatts: 12, standbyWatts: 0.2 },
    { id: 'balcony-dryer', roomId: 'balcony', name: '阳台烘干机', kind: 'appliance', icon: '◌', power: false, ratedWatts: 680, standbyWatts: 0.8 },
  ]);

  const AUTOMATIONS = Object.freeze([
    { id: 'away-guard', name: '离家守护', detail: '离家模式开门时自动反锁', enabled: true },
    { id: 'air-care', name: '空气自净', detail: 'PM2.5 高于 75 时增强净化', enabled: true },
    { id: 'peak-save', name: '峰值节能', detail: '功率超 1500W 时暂停大功率设备', enabled: true },
  ]);

  const SCENES = Object.freeze({
    home: {
      name: '回家', caption: '灯光迎接，舒适温度', icon: '↳',
      patches: {
        'entry-lock': { locked: true },
        'living-light': { power: true, level: 72 },
        'living-curtain': { level: 72 },
        'living-climate': { power: true, level: 24 },
        'living-tv': { power: false },
        'bedroom-light': { power: false },
        'bedroom-purifier': { power: true, level: 48 },
        'study-lamp': { power: false },
        'kitchen-light': { power: true, level: 52 },
        'balcony-dryer': { power: false },
      },
    },
    away: {
      name: '离家', caption: '全屋节能，门锁设防', icon: '→',
      patches: {
        'entry-lock': { locked: true },
        'living-light': { power: false },
        'living-curtain': { level: 18 },
        'living-climate': { power: false },
        'living-tv': { power: false },
        'bedroom-light': { power: false },
        'bedroom-purifier': { power: false },
        'study-lamp': { power: false },
        'kitchen-light': { power: false },
        'balcony-dryer': { power: false },
      },
    },
    cinema: {
      name: '观影', caption: '幕布合拢，低照度沉浸', icon: '▶',
      patches: {
        'entry-lock': { locked: true },
        'living-light': { power: true, level: 12 },
        'living-curtain': { level: 0 },
        'living-climate': { power: true, level: 24 },
        'living-tv': { power: true },
        'bedroom-light': { power: false },
        'bedroom-purifier': { power: true, level: 38 },
        'study-lamp': { power: false },
        'kitchen-light': { power: false },
        'balcony-dryer': { power: false },
      },
    },
    sleep: {
      name: '睡眠', caption: '夜灯保留，空气静音', icon: '☾',
      patches: {
        'entry-lock': { locked: true },
        'living-light': { power: false },
        'living-curtain': { level: 0 },
        'living-climate': { power: true, level: 25 },
        'living-tv': { power: false },
        'bedroom-light': { power: true, level: 14 },
        'bedroom-purifier': { power: true, level: 30 },
        'study-lamp': { power: false },
        'kitchen-light': { power: false },
        'balcony-dryer': { power: false },
      },
    },
  });

  const ENERGY_HISTORY = Object.freeze([
    { label: '一', kwh: 8.6 }, { label: '二', kwh: 7.9 }, { label: '三', kwh: 9.8 },
    { label: '四', kwh: 7.2 }, { label: '五', kwh: 8.1 }, { label: '六', kwh: 6.7 },
    { label: '日', kwh: 5.9 },
  ]);

  function getNow(options) {
    const value = options && typeof options.now === 'function' ? options.now() : Date.now();
    return Number.isFinite(value) ? value : Date.now();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function activity(text, tone, state, options) {
    const at = new Date(getNow(options)).toISOString();
    return {
      id: `${at}-${(state.activity || []).length + 1}`,
      text,
      tone: tone || 'info',
      at,
    };
  }

  function createInitialState(options) {
    const state = {
      version: VERSION,
      selectedRoom: 'living',
      activeScene: 'home',
      devices: clone(DEVICE_BLUEPRINTS),
      automations: clone(AUTOMATIONS),
      energyHistory: clone(ENERGY_HISTORY),
      activity: [],
    };
    state.activity.push(activity('住宅中控已就绪', 'ok', state, options));
    return state;
  }

  function sanitizePatch(device, patch) {
    const next = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'power') && device.kind !== 'lock' && device.kind !== 'curtain') {
      next.power = Boolean(patch.power);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'locked') && device.kind === 'lock') {
      next.locked = Boolean(patch.locked);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'level') && Number.isFinite(device.min) && Number.isFinite(device.max)) {
      next.level = clamp(patch.level, device.min, device.max, device.level);
    }
    return next;
  }

  function deviceActionText(device, patch) {
    if (device.kind === 'lock' && Object.prototype.hasOwnProperty.call(patch, 'locked')) {
      return `${device.name}已${patch.locked ? '反锁' : '解锁'}`;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'power')) {
      return `${device.name}已${patch.power ? '开启' : '关闭'}`;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'level')) {
      return `${device.name}调至 ${patch.level}${device.unit || ''}`;
    }
    return `${device.name}已更新`;
  }

  function updateDevice(state, deviceId, patch, options) {
    const index = state.devices.findIndex((device) => device.id === deviceId);
    if (index < 0 || !patch || typeof patch !== 'object') return state;
    const safePatch = sanitizePatch(state.devices[index], patch);
    if (!Object.keys(safePatch).length) return state;

    const next = { ...state, devices: state.devices.map((device) => ({ ...device })), activity: [...state.activity] };
    next.devices[index] = { ...next.devices[index], ...safePatch };
    next.activeScene = 'custom';
    next.activity.unshift(activity(deviceActionText(next.devices[index], safePatch), 'info', next, options));
    next.activity = next.activity.slice(0, 12);
    return next;
  }

  function applyScene(state, sceneId, options) {
    const scene = SCENES[sceneId];
    if (!scene) return state;
    const next = { ...state, activeScene: sceneId, activity: [...state.activity] };
    next.devices = state.devices.map((device) => ({
      ...device,
      ...sanitizePatch(device, scene.patches[device.id] || {}),
    }));
    next.activity.unshift(activity(`${scene.name}场景已联动`, 'ok', next, options));
    next.activity = next.activity.slice(0, 12);
    return next;
  }

  function powerForDevice(device) {
    let active = 0;
    if (device.power) {
      if (device.kind === 'light' || device.kind === 'purifier') active = device.ratedWatts * (device.level / 100);
      else if (device.kind === 'climate') active = device.ratedWatts * 0.65;
      else active = device.ratedWatts;
    }
    return active + (device.standbyWatts || 0);
  }

  function calculateMetrics(state) {
    const totalWatts = Math.round(state.devices.reduce((sum, device) => sum + powerForDevice(device), 0));
    const activeCount = state.devices.filter((device) => device.power).length;
    const monthlyKwh = Math.round((totalWatts * 5.2 * 30 / 1000) * 10) / 10;
    const climate = state.devices.find((device) => device.id === 'living-climate');
    const purifier = state.devices.find((device) => device.id === 'bedroom-purifier');
    const lock = state.devices.find((device) => device.id === 'entry-lock');
    let comfortScore = 96;
    if (!climate.power) comfortScore -= 8;
    else comfortScore -= Math.abs(climate.level - 24) * 2;
    if (!purifier.power) comfortScore -= 4;
    if (!lock.locked) comfortScore -= 12;

    return {
      totalWatts,
      activeCount,
      monthlyKwh,
      comfortScore: Math.max(0, Math.round(comfortScore)),
      onlineCount: state.devices.length,
    };
  }

  function toggleAutomation(state, automationId, enabled, options) {
    const index = state.automations.findIndex((rule) => rule.id === automationId);
    if (index < 0) return state;
    const next = { ...state, automations: state.automations.map((rule) => ({ ...rule })), activity: [...state.activity] };
    next.automations[index].enabled = Boolean(enabled);
    next.activity.unshift(activity(`${next.automations[index].name}已${enabled ? '启用' : '暂停'}`, 'info', next, options));
    next.activity = next.activity.slice(0, 12);
    return next;
  }

  function automationEnabled(state, id) {
    const rule = state.automations.find((item) => item.id === id);
    return Boolean(rule && rule.enabled);
  }

  function applyAutomationPatches(state, patches, message, options) {
    const next = { ...state, devices: state.devices.map((device) => ({ ...device })), activity: [...state.activity] };
    next.devices = next.devices.map((device) => ({
      ...device,
      ...sanitizePatch(device, patches[device.id] || {}),
    }));
    next.activeScene = 'custom';
    next.activity.unshift(activity(message, 'alert', next, options));
    next.activity = next.activity.slice(0, 12);
    return next;
  }

  function evaluateAutomation(state, event, options) {
    if (!event || typeof event !== 'object') return state;
    if (event.type === 'door-open' && state.activeScene === 'away' && automationEnabled(state, 'away-guard')) {
      return applyAutomationPatches(state, { 'entry-lock': { locked: true } }, '离家守护：检测到开门，已自动反锁', options);
    }
    if (event.type === 'air-quality' && Number(event.pm25) > 75 && automationEnabled(state, 'air-care')) {
      return applyAutomationPatches(state, { 'bedroom-purifier': { power: true, level: 80 } }, `空气自净：PM2.5 ${Math.round(Number(event.pm25))}，净化器已增强`, options);
    }
    if (event.type === 'power-peak' && calculateMetrics(state).totalWatts > 1500 && automationEnabled(state, 'peak-save')) {
      return applyAutomationPatches(state, {
        'balcony-dryer': { power: false },
        'living-tv': { power: false },
      }, '峰值节能：已暂停烘干机与电视', options);
    }
    return state;
  }

  function selectRoom(state, roomId) {
    if (!ROOMS.some((room) => room.id === roomId)) return state;
    return { ...state, selectedRoom: roomId };
  }

  function sanitizeActivity(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 12).filter((item) => item && typeof item.text === 'string' && typeof item.at === 'string').map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `restored-${index}`,
      text: item.text.slice(0, 120),
      at: item.at,
      tone: ['ok', 'alert', 'info'].includes(item.tone) ? item.tone : 'info',
    }));
  }

  function hydrateState(raw, options) {
    if (!raw || typeof raw !== 'object') return createInitialState(options);
    const state = createInitialState(options);
    if (ROOMS.some((room) => room.id === raw.selectedRoom)) state.selectedRoom = raw.selectedRoom;
    if (raw.activeScene === 'custom' || Object.prototype.hasOwnProperty.call(SCENES, raw.activeScene)) state.activeScene = raw.activeScene;

    const cachedDevices = Array.isArray(raw.devices) ? raw.devices : [];
    state.devices = state.devices.map((device) => {
      const cached = cachedDevices.find((item) => item && item.id === device.id);
      return cached ? { ...device, ...sanitizePatch(device, cached) } : device;
    });

    const cachedAutomations = Array.isArray(raw.automations) ? raw.automations : [];
    state.automations = state.automations.map((rule) => {
      const cached = cachedAutomations.find((item) => item && item.id === rule.id);
      return cached ? { ...rule, enabled: Boolean(cached.enabled) } : rule;
    });

    const restoredActivity = sanitizeActivity(raw.activity);
    if (restoredActivity.length) state.activity = restoredActivity;
    return state;
  }

  return Object.freeze({
    VERSION,
    ROOMS,
    DEVICE_BLUEPRINTS,
    AUTOMATIONS,
    SCENES,
    createInitialState,
    updateDevice,
    applyScene,
    calculateMetrics,
    toggleAutomation,
    evaluateAutomation,
    selectRoom,
    hydrateState,
  });
});
