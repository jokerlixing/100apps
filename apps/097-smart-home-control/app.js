(function startHabitat() {
  'use strict';

  const Core = window.SmartHomeCore;
  const STORAGE_KEY = 'habitat97_state_v1';
  const roomById = Object.fromEntries(Core.ROOMS.map((room) => [room.id, room]));
  const dom = {
    currentTime: document.getElementById('currentTime'),
    onlineCount: document.getElementById('onlineCount'),
    sceneList: document.getElementById('sceneList'),
    automationList: document.getElementById('automationList'),
    floorplan: document.getElementById('floorplan'),
    floorplanWrap: document.querySelector('.floorplan-wrap'),
    deviceList: document.getElementById('deviceList'),
    roomHeading: document.getElementById('roomHeading'),
    roomClimate: document.getElementById('roomClimate'),
    powerMetric: document.getElementById('powerMetric'),
    activeMetric: document.getElementById('activeMetric'),
    comfortMetric: document.getElementById('comfortMetric'),
    monthlyMetric: document.getElementById('monthlyMetric'),
    powerHint: document.getElementById('powerHint'),
    comfortHint: document.getElementById('comfortHint'),
    energyChart: document.getElementById('energyChart'),
    activityList: document.getElementById('activityList'),
    stageNote: document.getElementById('stageNote'),
    resetButton: document.getElementById('resetButton'),
    resetDialog: document.getElementById('resetDialog'),
    confirmResetButton: document.getElementById('confirmResetButton'),
    airEventButton: document.getElementById('airEventButton'),
    toast: document.getElementById('toast'),
  };

  let state = loadState();
  let toastTimer = 0;
  let pulseTimer = 0;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Core.hydrateState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn('HABITAT/97 cache was unavailable and has been reset.', error);
      return Core.createInitialState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn('HABITAT/97 could not save browser state.', error);
      showToast('当前浏览器无法保存；本次操作仍然有效');
      return false;
    }
  }

  function commit(nextState, message, pulse) {
    if (nextState === state) return;
    state = nextState;
    persist();
    render();
    if (message) showToast(message);
    if (pulse) pulseHouse();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2600);
  }

  function pulseHouse() {
    clearTimeout(pulseTimer);
    dom.floorplanWrap.classList.remove('is-pulsing');
    void dom.floorplanWrap.offsetWidth;
    dom.floorplanWrap.classList.add('is-pulsing');
    pulseTimer = window.setTimeout(() => dom.floorplanWrap.classList.remove('is-pulsing'), 2400);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function updateClock() {
    const now = new Date();
    dom.currentTime.dateTime = now.toISOString();
    dom.currentTime.textContent = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(now);
  }

  function deviceIsActive(device) {
    if (device.kind === 'lock') return device.locked;
    if (device.kind === 'curtain') return device.level > 0;
    return device.power;
  }

  function deviceStatus(device) {
    if (device.kind === 'lock') return device.locked ? '安全反锁' : '当前解锁';
    if (device.kind === 'curtain') return `开合 ${Math.round(device.level)}%`;
    if (!device.power) return '待机';
    if (device.kind === 'climate') return `制冷 · ${Math.round(device.level)}°C`;
    if (device.kind === 'light') return `点亮 · ${Math.round(device.level)}%`;
    if (device.kind === 'purifier') return `净化 · ${Math.round(device.level)}%`;
    return '运行中';
  }

  function renderScenes() {
    dom.sceneList.innerHTML = Object.entries(Core.SCENES).map(([id, scene]) => {
      const active = state.activeScene === id;
      return `
        <button class="scene-button${active ? ' is-active' : ''}" type="button" data-scene="${id}" aria-pressed="${active}">
          <span class="scene-icon" aria-hidden="true">${escapeHtml(scene.icon)}</span>
          <span class="scene-copy"><b>${escapeHtml(scene.name)}</b><small>${escapeHtml(scene.caption)}</small></span>
          <span class="scene-arrow" aria-hidden="true">${active ? '●' : '↗'}</span>
        </button>`;
    }).join('');
  }

  function renderAutomations() {
    dom.automationList.innerHTML = state.automations.map((rule) => `
      <div class="automation-row">
        <span class="automation-copy"><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(rule.detail)}</small></span>
        <button class="switch" type="button" role="switch" data-automation="${escapeHtml(rule.id)}"
          aria-checked="${rule.enabled}" aria-label="${escapeHtml(rule.name)}"></button>
      </div>`).join('');
  }

  function roomSummary(roomId, devices) {
    if (roomId === 'entry') {
      const lock = devices.find((device) => device.kind === 'lock');
      return lock.locked ? '门锁已反锁，守护正常' : '门锁已解锁，请确认安全';
    }
    const active = devices.filter((device) => device.power);
    if (!active.length) return '设备待机，空间安静';
    return active.slice(0, 2).map(deviceStatus).join(' · ');
  }

  function renderFloorplan() {
    dom.floorplan.innerHTML = Core.ROOMS.map((room) => {
      const devices = state.devices.filter((device) => device.roomId === room.id);
      const activeCount = devices.filter((device) => device.power).length;
      const selected = state.selectedRoom === room.id;
      return `
        <button class="room-cell${selected ? ' is-selected' : ''}${activeCount ? ' has-active' : ''}"
          type="button" data-room="${room.id}" aria-pressed="${selected}">
          <span class="room-code">${escapeHtml(room.short)} / ${String(Core.ROOMS.indexOf(room) + 1).padStart(2, '0')}</span>
          <h3>${escapeHtml(room.name)}</h3>
          <span class="room-status">${escapeHtml(roomSummary(room.id, devices))}</span>
          <span class="room-device-count">${activeCount} ACTIVE / ${devices.length}</span>
          <span class="room-value">${room.temp.toFixed(1)}°</span>
        </button>`;
    }).join('');
  }

  function deviceSwitch(device) {
    const checked = device.kind === 'lock' ? device.locked : device.power;
    const label = device.kind === 'lock'
      ? `${device.name}${checked ? '已反锁' : '已解锁'}`
      : `${device.name}${checked ? '已开启' : '已关闭'}`;
    if (device.kind === 'curtain') return '';
    return `<button class="switch" type="button" role="switch" data-device-toggle="${escapeHtml(device.id)}"
      aria-checked="${checked}" aria-label="${escapeHtml(label)}"></button>`;
  }

  function levelControl(device) {
    if (!Number.isFinite(device.level)) return '';
    const label = device.kind === 'climate' ? '目标温度' : device.kind === 'curtain' ? '窗帘开合' : '运行档位';
    const quick = device.kind === 'curtain'
      ? `<div class="quick-actions"><button type="button" data-device-level="${device.id}" data-level="0">全部合拢</button><button type="button" data-device-level="${device.id}" data-level="50">半开</button><button type="button" data-device-level="${device.id}" data-level="100">全部打开</button></div>`
      : '';
    return `
      <label class="device-reading">
        <span class="eyebrow">${label}</span>
        <input type="range" min="${device.min}" max="${device.max}" value="${device.level}"
          data-device-range="${device.id}" aria-label="${escapeHtml(device.name)}${label}">
        <output>${Math.round(device.level)}${escapeHtml(device.unit || '')}</output>
      </label>${quick}`;
  }

  function renderDevices() {
    const room = roomById[state.selectedRoom];
    const devices = state.devices.filter((device) => device.roomId === state.selectedRoom);
    dom.roomHeading.textContent = room.name;
    dom.roomClimate.textContent = `${room.temp.toFixed(1)}° · ${room.humidity}%`;
    dom.deviceList.innerHTML = devices.map((device) => `
      <article class="device-card${deviceIsActive(device) ? ' is-on' : ''}" data-device-card="${escapeHtml(device.id)}">
        <div class="device-title">
          <span class="device-identity">
            <span class="device-icon" aria-hidden="true">${escapeHtml(device.icon)}</span>
            <span class="device-copy"><b>${escapeHtml(device.name)}</b><small>${escapeHtml(deviceStatus(device))}</small></span>
          </span>
          ${deviceSwitch(device)}
        </div>
        ${levelControl(device)}
      </article>`).join('');

    if (!devices.length) {
      dom.deviceList.innerHTML = '<p class="empty-state">这个房间当前没有可控设备。</p>';
    }
  }

  function renderMetrics() {
    const metrics = Core.calculateMetrics(state);
    dom.powerMetric.textContent = metrics.totalWatts;
    dom.activeMetric.textContent = metrics.activeCount;
    dom.comfortMetric.textContent = metrics.comfortScore;
    dom.monthlyMetric.textContent = metrics.monthlyKwh.toFixed(1);
    dom.onlineCount.textContent = `${metrics.onlineCount} / ${metrics.onlineCount}`;
    dom.powerHint.textContent = metrics.totalWatts > 1500 ? '已超过峰值阈值' : metrics.totalWatts > 900 ? '用电处于中等水平' : '低于节能阈值';
    dom.powerHint.style.color = metrics.totalWatts > 1500 ? 'var(--terracotta)' : '';
    dom.comfortHint.textContent = metrics.comfortScore >= 90 ? '温湿度适宜' : metrics.comfortScore >= 75 ? '建议检查环境设备' : '舒适度需要处理';
  }

  function renderEnergy() {
    const max = Math.max(...state.energyHistory.map((item) => item.kwh), 1);
    dom.energyChart.innerHTML = state.energyHistory.map((item, index) => `
      <div class="energy-bar${index === state.energyHistory.length - 1 ? ' is-today' : ''}" title="周${escapeHtml(item.label)} ${item.kwh} kWh">
        <i style="--bar-height:${Math.round(item.kwh / max * 74)}px"></i>
        <span>${escapeHtml(item.label)}</span>
      </div>`).join('');
  }

  function renderActivity() {
    dom.activityList.innerHTML = state.activity.slice(0, 7).map((item) => `
      <li>
        <span class="activity-tone ${escapeHtml(item.tone)}" aria-hidden="true"></span>
        <span>${escapeHtml(item.text)}</span>
        <time datetime="${escapeHtml(item.at)}">${formatTime(item.at)}</time>
      </li>`).join('');
  }

  function renderStageNote() {
    const room = roomById[state.selectedRoom];
    const devices = state.devices.filter((device) => device.roomId === state.selectedRoom);
    const descriptions = devices.map((device) => `${device.name}${deviceStatus(device)}`);
    dom.stageNote.textContent = `${room.name} · ${descriptions.join('；') || '当前没有模拟设备'}。`;
  }

  function render() {
    renderScenes();
    renderAutomations();
    renderFloorplan();
    renderDevices();
    renderMetrics();
    renderEnergy();
    renderActivity();
    renderStageNote();
  }

  document.addEventListener('click', (event) => {
    const sceneButton = event.target.closest('[data-scene]');
    if (sceneButton) {
      const sceneId = sceneButton.dataset.scene;
      const scene = Core.SCENES[sceneId];
      commit(Core.applyScene(state, sceneId), `${scene.name}场景已联动`, true);
      return;
    }

    const roomButton = event.target.closest('[data-room]');
    if (roomButton) {
      commit(Core.selectRoom(state, roomButton.dataset.room));
      return;
    }

    const deviceButton = event.target.closest('[data-device-toggle]');
    if (deviceButton) {
      const device = state.devices.find((item) => item.id === deviceButton.dataset.deviceToggle);
      if (!device) return;
      const patch = device.kind === 'lock' ? { locked: !device.locked } : { power: !device.power };
      commit(Core.updateDevice(state, device.id, patch), device.kind === 'lock'
        ? `${device.name}已${patch.locked ? '反锁' : '解锁'}`
        : `${device.name}已${patch.power ? '开启' : '关闭'}`);
      return;
    }

    const quickButton = event.target.closest('[data-device-level]');
    if (quickButton) {
      const device = state.devices.find((item) => item.id === quickButton.dataset.deviceLevel);
      const level = Number(quickButton.dataset.level);
      if (!device) return;
      commit(Core.updateDevice(state, device.id, { level }), `${device.name}调至 ${level}${device.unit || ''}`);
      return;
    }

    const automationButton = event.target.closest('[data-automation]');
    if (automationButton) {
      const rule = state.automations.find((item) => item.id === automationButton.dataset.automation);
      if (!rule) return;
      commit(Core.toggleAutomation(state, rule.id, !rule.enabled), `${rule.name}已${rule.enabled ? '暂停' : '启用'}`);
    }
  });

  dom.deviceList.addEventListener('input', (event) => {
    if (!event.target.matches('[data-device-range]')) return;
    const output = event.target.closest('.device-reading').querySelector('output');
    const device = state.devices.find((item) => item.id === event.target.dataset.deviceRange);
    output.textContent = `${event.target.value}${device ? device.unit || '' : ''}`;
  });

  dom.deviceList.addEventListener('change', (event) => {
    if (!event.target.matches('[data-device-range]')) return;
    const device = state.devices.find((item) => item.id === event.target.dataset.deviceRange);
    if (!device) return;
    const level = Number(event.target.value);
    commit(Core.updateDevice(state, device.id, { level }), `${device.name}调至 ${level}${device.unit || ''}`);
  });

  dom.airEventButton.addEventListener('click', () => {
    const next = Core.evaluateAutomation(state, { type: 'air-quality', pm25: 86 });
    if (next === state) {
      showToast('空气自净已暂停；先启用对应自动化');
      return;
    }
    commit(next, 'PM2.5 升至 86，净化器已自动增强', true);
  });

  dom.resetButton.addEventListener('click', () => {
    if (typeof dom.resetDialog.showModal === 'function') dom.resetDialog.showModal();
    else if (window.confirm('恢复示范住宅的默认状态？')) resetHome();
  });

  dom.confirmResetButton.addEventListener('click', () => {
    window.setTimeout(resetHome, 0);
  });

  function resetHome() {
    state = Core.createInitialState();
    persist();
    render();
    pulseHouse();
    showToast('示范住宅已恢复默认');
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  render();
  document.body.classList.add('ready');
})();
