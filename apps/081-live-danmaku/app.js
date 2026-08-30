(function startWaveRoom() {
  'use strict';

  const core = window.WaveCore;
  if (!core) throw new Error('WAVE/81 core failed to load');

  const STORAGE_KEY = 'wave81.preferences.v1';
  const STORAGE_EVENT_KEY = 'wave81.room-event.v1';
  const CHANNEL_NAME = 'wave81-room';
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

  const elements = {
    shell: $('#broadcastShell'),
    stage: $('#liveStage'),
    liveStatus: $('#liveStatus'),
    audience: $('#audienceCount'),
    timecode: $('#timecode'),
    danmakuLayer: $('#danmakuLayer'),
    reactionLayer: $('#reactionLayer'),
    chatFeed: $('#chatFeed'),
    messageForm: $('#messageForm'),
    messageInput: $('#messageInput'),
    messageError: $('#messageError'),
    charCount: $('#charCount'),
    messageCount: $('#messageCount'),
    likeCount: $('#likeCount'),
    playToggle: $('#playToggle'),
    muteToggle: $('#muteToggle'),
    danmakuToggle: $('#danmakuToggle'),
    theaterToggle: $('#theaterToggle'),
    volumeRange: $('#volumeRange'),
    densitySelect: $('#densitySelect'),
    opacityRange: $('#opacityRange'),
    opacityValue: $('#opacityValue'),
    speedRange: $('#speedRange'),
    speedValue: $('#speedValue'),
    connectionState: $('#connectionState'),
    latency: $('#latencyReadout'),
    audioMeter: $('#audioMeter'),
    toast: $('#toast'),
  };

  const ambientPool = [
    ['胶片汽水', '这个落日机位太会了', '#f1ad3d'],
    ['凌晨列车', '前奏一出来就起鸡皮疙瘩', '#b7c9ff'],
    ['木星来信', '贝斯线请单独加鸡腿！', '#55b8aa'],
    ['纸飞机', '晚风航线现场版封神', '#ff8b73'],
    ['白噪点', '戴耳机听空间感好棒', '#f3f0e7'],
    ['一颗橘子', '灯光扫过来的那一下绝了', '#f1ad3d'],
    ['海盐唱片', '鼓手今天状态拉满', '#55b8aa'],
    ['南窗', '从上一首追到这里', '#b7c9ff'],
    ['半格电量', '城市天台就该这样唱', '#f3f0e7'],
    ['雨棚下', '主唱笑了！我也笑了', '#ff8b73'],
    ['信号塔', 'CH81 收到，画面稳定', '#55b8aa'],
    ['月台尽头', '求返场再唱一遍玻璃海', '#f1ad3d'],
    ['晚风用户', '这句和声听得好清楚', '#b7c9ff'],
    ['北纬31度', '天色和歌刚好一起暗下来', '#f3f0e7'],
    ['小城听众', '在加班，偷偷开着直播', '#ff8b73'],
    ['松针收音机', '现场的朋友挥挥手', '#55b8aa'],
  ];

  const startupMessages = [
    ['WAVE 导播台', '本场为本地模拟信号，互动不会上传。'],
    ['信号塔', 'CH81 收到，画面稳定'],
    ['凌晨列车', '从《玻璃海》一路听过来的'],
    ['胶片汽水', '这个落日机位太会了'],
    ['海盐唱片', '鼓手今天状态拉满'],
    ['木星来信', '弹幕测试：今晚一起听到最后'],
  ];

  const state = {
    preferences: loadPreferences(),
    playing: true,
    audience: 12_840,
    likes: 4_821,
    messageTotal: 0,
    lastSentAt: 0,
    elapsedMs: 0,
    previousFrame: performance.now(),
    lastMeterFrame: 0,
    laneLastUsed: {
      scroll: Array(7).fill(0),
      top: Array(2).fill(0),
      bottom: Array(2).fill(0),
    },
    ambientTimer: null,
    audienceTimer: null,
    transport: null,
    destroyed: false,
  };

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return core.normalizePreferences(saved);
    } catch (error) {
      return core.normalizePreferences();
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.preferences));
    } catch (error) {
      setConnectionCopy('单页模式 · 设置未保存');
    }
  }

  function setConnectionCopy(copy) {
    if (elements.connectionState) elements.connectionState.textContent = copy;
  }

  function setupTransport() {
    if ('BroadcastChannel' in window) {
      try {
        state.transport = new BroadcastChannel(CHANNEL_NAME);
        state.transport.addEventListener('message', (event) => receiveTransportEvent(event.data));
        setConnectionCopy('跨标签实时信号已连接');
        return;
      } catch (error) {
        state.transport = null;
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    setConnectionCopy('本页实时模拟 · 本地回退');
  }

  function handleStorageEvent(event) {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
    try {
      receiveTransportEvent(JSON.parse(event.newValue));
    } catch (error) {
      // Ignore malformed events from stale local storage.
    }
  }

  function postTransport(payload) {
    const event = { ...payload, sender: tabId, sentAt: Date.now() };
    if (state.transport) {
      state.transport.postMessage(event);
      return;
    }
    try {
      localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(event));
      localStorage.removeItem(STORAGE_EVENT_KEY);
    } catch (error) {
      setConnectionCopy('本页实时模拟 · 无跨页同步');
    }
  }

  function receiveTransportEvent(event) {
    if (!event || event.sender === tabId) return;
    if (event.type === 'message' && event.message) {
      const normalized = core.normalizeMessage({ ...event.message, source: 'remote' }, event.message.createdAt);
      if (normalized.ok) processMessage(normalized.message, { shouldBroadcast: false });
    }
    if (event.type === 'reaction' && event.emoji) {
      spawnReaction(event.emoji, false);
    }
  }

  function formatClock(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));
  }

  function avatarColor(author) {
    const palette = ['#f1ad3d', '#55b8aa', '#ff8b73', '#b7c9ff', '#f3f0e7'];
    let total = 0;
    for (const character of author) total += character.codePointAt(0);
    return palette[total % palette.length];
  }

  function renderChatMessage(message) {
    const shouldStick = elements.chatFeed.scrollHeight - elements.chatFeed.scrollTop - elements.chatFeed.clientHeight < 72;
    const item = document.createElement('article');
    item.className = `chat-message${message.source === 'self' ? ' is-self' : ''}`;
    item.dataset.messageId = message.id;

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.setProperty('--avatar-color', avatarColor(message.author));
    avatar.textContent = Array.from(message.author)[0] || '·';

    const copy = document.createElement('div');
    copy.className = 'chat-copy';
    const authorLine = document.createElement('div');
    authorLine.className = 'chat-author';
    const author = document.createElement('b');
    author.textContent = message.source === 'self' ? `${message.author} · 你` : message.author;
    const time = document.createElement('time');
    time.dateTime = new Date(message.createdAt).toISOString();
    time.textContent = formatClock(message.createdAt);
    const body = document.createElement('p');
    body.textContent = message.text;

    authorLine.append(author, time);
    copy.append(authorLine, body);
    item.append(avatar, copy);
    elements.chatFeed.append(item);

    while (elements.chatFeed.children.length > 80) elements.chatFeed.firstElementChild.remove();
    if (shouldStick || message.source === 'self') elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
    state.messageTotal += 1;
    elements.messageCount.textContent = String(state.messageTotal);
  }

  function renderDanmaku(message) {
    const item = document.createElement('span');
    const mode = message.mode;
    const laneState = state.laneLastUsed[mode] || state.laneLastUsed.scroll;
    const now = performance.now();
    const speed = state.preferences.speed;
    const duration = mode === 'scroll'
      ? (9.4 / speed) + (Math.random() * 1.4)
      : 4.1;
    const lane = core.chooseLane(laneState, now, mode === 'scroll' ? duration * 420 : 2_800);
    laneState[lane] = now;

    item.className = 'danmaku-item';
    item.dataset.mode = mode;
    item.dataset.messageId = message.id;
    item.textContent = message.text;
    item.style.setProperty('--lane', String(lane));
    item.style.setProperty('--duration', `${duration.toFixed(2)}s`);
    item.style.setProperty('--message-color', message.color);
    elements.danmakuLayer.append(item);

    requestAnimationFrame(() => item.classList.add('is-running'));
    item.addEventListener('animationend', () => item.remove(), { once: true });
    window.setTimeout(() => item.remove(), Math.ceil((duration + 1) * 1_000));
  }

  function processMessage(message, options = {}) {
    renderChatMessage(message);
    renderDanmaku(message);
    if (options.shouldBroadcast) postTransport({ type: 'message', message });
  }

  function setError(copy = '') {
    elements.messageError.textContent = copy;
    elements.messageInput.setAttribute('aria-invalid', copy ? 'true' : 'false');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const now = Date.now();
    if (!core.canSend(state.lastSentAt, now)) {
      setError('发送得太快了，等一拍再试');
      return;
    }

    const result = core.normalizeMessage({
      text: elements.messageInput.value,
      author: '本机观众',
      mode: state.preferences.mode,
      color: state.preferences.color,
      source: 'self',
    }, now);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    state.lastSentAt = now;
    setError();
    processMessage(result.message, { shouldBroadcast: true });
    elements.messageInput.value = '';
    updateCharacterCount();
    showToast('弹幕已送上画面');
  }

  function updateCharacterCount() {
    const length = Array.from(elements.messageInput.value).length;
    elements.charCount.textContent = `${length}/48`;
    if (elements.messageError.textContent) setError();
  }

  function spawnReaction(emoji, shouldBroadcast = true) {
    const particle = document.createElement('span');
    particle.className = 'reaction-particle';
    particle.textContent = emoji;
    particle.style.setProperty('--reaction-x', `${5 + (Math.random() * 22)}%`);
    particle.style.setProperty('--reaction-drift', `${-52 + (Math.random() * 92)}px`);
    elements.reactionLayer.append(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    window.setTimeout(() => particle.remove(), 2_100);
    state.likes += 1;
    elements.likeCount.textContent = state.likes.toLocaleString('en-US');
    if (shouldBroadcast) postTransport({ type: 'reaction', emoji });
  }

  function scheduleAmbientMessage() {
    window.clearTimeout(state.ambientTimer);
    const delay = core.getAmbientDelay(state.preferences.density, Math.random());
    state.ambientTimer = window.setTimeout(() => {
      if (state.playing && !document.hidden && !state.destroyed) {
        const [author, text, color] = ambientPool[Math.floor(Math.random() * ambientPool.length)];
        const modeRoll = Math.random();
        const mode = modeRoll > 0.92 ? 'top' : (modeRoll < 0.06 ? 'bottom' : 'scroll');
        const result = core.normalizeMessage({ author, text, color, mode, source: 'ambient' });
        if (result.ok) processMessage(result.message);
      }
      if (!state.destroyed) scheduleAmbientMessage();
    }, delay);
  }

  function togglePlaying() {
    state.playing = !state.playing;
    elements.stage.classList.toggle('is-paused', !state.playing);
    elements.playToggle.setAttribute('aria-pressed', String(!state.playing));
    elements.playToggle.setAttribute('aria-label', state.playing ? '暂停信号' : '恢复信号');
    $('.control-label', elements.playToggle).textContent = state.playing ? '暂停' : '播放';
    elements.liveStatus.classList.toggle('is-paused', !state.playing);
    elements.liveStatus.lastChild.textContent = state.playing ? ' ON AIR' : ' PAUSED';
    showToast(state.playing ? '模拟信号已恢复' : '模拟信号已暂停');
  }

  function toggleDanmaku() {
    state.preferences.danmakuVisible = !state.preferences.danmakuVisible;
    applyPreferences();
    savePreferences();
    showToast(state.preferences.danmakuVisible ? '弹幕已显示' : '弹幕已隐藏');
  }

  function toggleMuted() {
    state.preferences.muted = !state.preferences.muted;
    applyPreferences();
    savePreferences();
    showToast(state.preferences.muted ? '模拟声音已静音' : '模拟声音已恢复');
  }

  function toggleTheater() {
    state.preferences.theater = !state.preferences.theater;
    applyPreferences();
    savePreferences();
    showToast(state.preferences.theater ? '已进入影院模式' : '已退出影院模式');
  }

  function applyPreferences() {
    const preferences = state.preferences;
    elements.danmakuLayer.classList.toggle('is-hidden', !preferences.danmakuVisible);
    elements.danmakuLayer.style.setProperty('--danmaku-opacity', preferences.opacity.toFixed(2));
    elements.danmakuToggle.classList.toggle('is-on', preferences.danmakuVisible);
    elements.danmakuToggle.setAttribute('aria-pressed', String(preferences.danmakuVisible));
    elements.danmakuToggle.setAttribute('aria-label', preferences.danmakuVisible ? '隐藏弹幕' : '显示弹幕');
    elements.danmakuToggle.querySelector('b').textContent = preferences.danmakuVisible ? 'ON' : 'OFF';

    elements.muteToggle.setAttribute('aria-pressed', String(preferences.muted));
    elements.muteToggle.setAttribute('aria-label', preferences.muted ? '恢复声音' : '静音');
    elements.muteToggle.firstElementChild.textContent = preferences.muted ? '◖×' : '◖))';
    elements.volumeRange.value = String(preferences.volume);
    elements.volumeRange.disabled = preferences.muted;

    elements.shell.classList.toggle('is-theater', preferences.theater);
    elements.theaterToggle.classList.toggle('is-on', preferences.theater);
    elements.theaterToggle.setAttribute('aria-pressed', String(preferences.theater));
    elements.theaterToggle.setAttribute('aria-label', preferences.theater ? '退出影院模式' : '开启影院模式');

    elements.densitySelect.value = preferences.density;
    elements.opacityRange.value = String(preferences.opacity);
    elements.opacityValue.textContent = `${Math.round(preferences.opacity * 100)}%`;
    elements.speedRange.value = String(preferences.speed);
    elements.speedValue.textContent = `${preferences.speed.toFixed(1)}×`;

    $$('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === preferences.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('[data-color]').forEach((button) => {
      const active = button.dataset.color === preferences.color;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function showToast(copy) {
    window.clearTimeout(showToast.timer);
    elements.toast.textContent = copy;
    elements.toast.classList.add('is-visible');
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2_000);
  }

  function formatTimecode(milliseconds) {
    const seconds = Math.floor(milliseconds / 1_000);
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
  }

  function animateFrame(now) {
    if (state.destroyed) return;
    const delta = Math.min(250, now - state.previousFrame);
    state.previousFrame = now;
    if (state.playing) state.elapsedMs += delta;
    elements.timecode.textContent = formatTimecode(state.elapsedMs);

    if (now - state.lastMeterFrame > 100) {
      state.lastMeterFrame = now;
      const muted = state.preferences.muted || !state.playing;
      $$('i', elements.audioMeter).forEach((bar, index) => {
        const wave = muted ? 0.08 : 0.2 + (Math.abs(Math.sin((now / 260) + index)) * 0.72 * state.preferences.volume);
        bar.style.setProperty('--level', wave.toFixed(2));
      });
    }
    requestAnimationFrame(animateFrame);
  }

  function seedRoom() {
    const base = Date.now() - (startupMessages.length * 34_000);
    startupMessages.forEach(([author, text], index) => {
      const result = core.normalizeMessage({
        author,
        text,
        mode: index === 0 ? 'top' : 'scroll',
        color: index === 0 ? '#f1ad3d' : ambientPool[index % ambientPool.length][2],
        source: 'ambient',
      }, base + (index * 34_000));
      if (result.ok) renderChatMessage(result.message);
    });

    startupMessages.slice(-3).forEach(([author, text], index) => {
      window.setTimeout(() => {
        const result = core.normalizeMessage({
          author,
          text,
          mode: index === 2 ? 'top' : 'scroll',
          color: ambientPool[(index + 4) % ambientPool.length][2],
          source: 'ambient',
        });
        if (result.ok) renderDanmaku(result.message);
      }, 420 + (index * 430));
    });
  }

  function bindEvents() {
    elements.messageForm.addEventListener('submit', handleSubmit);
    elements.messageInput.addEventListener('input', updateCharacterCount);
    elements.playToggle.addEventListener('click', togglePlaying);
    elements.danmakuToggle.addEventListener('click', toggleDanmaku);
    elements.muteToggle.addEventListener('click', toggleMuted);
    elements.theaterToggle.addEventListener('click', toggleTheater);

    $$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      state.preferences.mode = button.dataset.mode;
      applyPreferences();
      savePreferences();
    }));

    $$('[data-color]').forEach((button) => button.addEventListener('click', () => {
      state.preferences.color = button.dataset.color;
      applyPreferences();
      savePreferences();
    }));

    $$('[data-reaction]').forEach((button) => button.addEventListener('click', () => {
      spawnReaction(button.dataset.reaction);
      showToast(`${button.dataset.reaction} 已送到现场`);
    }));

    elements.volumeRange.addEventListener('input', () => {
      state.preferences.volume = Number(elements.volumeRange.value);
      if (state.preferences.volume > 0) state.preferences.muted = false;
      applyPreferences();
      savePreferences();
    });

    elements.densitySelect.addEventListener('change', () => {
      state.preferences.density = elements.densitySelect.value;
      savePreferences();
      scheduleAmbientMessage();
    });

    elements.opacityRange.addEventListener('input', () => {
      state.preferences.opacity = Number(elements.opacityRange.value);
      applyPreferences();
      savePreferences();
    });

    elements.speedRange.addEventListener('input', () => {
      state.preferences.speed = Number(elements.speedRange.value);
      applyPreferences();
      savePreferences();
    });

    document.addEventListener('visibilitychange', () => {
      state.previousFrame = performance.now();
      if (!document.hidden) scheduleAmbientMessage();
    });

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === 'd') toggleDanmaku();
      if (key === 't') toggleTheater();
      if (key === 'm') toggleMuted();
    });

    window.addEventListener('beforeunload', destroy, { once: true });
  }

  function startAudienceDrift() {
    state.audienceTimer = window.setInterval(() => {
      if (!state.playing || document.hidden) return;
      state.audience = Math.max(10_000, state.audience + Math.round((Math.random() - 0.43) * 22));
      elements.audience.textContent = core.formatAudience(state.audience);
      elements.latency.textContent = `${28 + Math.floor(Math.random() * 15)} ms`;
    }, 2_400);
  }

  function destroy() {
    state.destroyed = true;
    window.clearTimeout(state.ambientTimer);
    window.clearInterval(state.audienceTimer);
    if (state.transport) state.transport.close();
    window.removeEventListener('storage', handleStorageEvent);
  }

  function boot() {
    applyPreferences();
    bindEvents();
    setupTransport();
    seedRoom();
    scheduleAmbientMessage();
    startAudienceDrift();
    requestAnimationFrame(animateFrame);
    elements.audience.textContent = core.formatAudience(state.audience);
    elements.likeCount.textContent = state.likes.toLocaleString('en-US');
    document.body.classList.add('ready');
  }

  window.__wave81 = {
    getState: () => ({
      playing: state.playing,
      preferences: { ...state.preferences },
      messageTotal: state.messageTotal,
      likes: state.likes,
    }),
    sendMessage: (text) => {
      elements.messageInput.value = text;
      elements.messageForm.requestSubmit();
    },
    destroy,
  };

  boot();
}());
