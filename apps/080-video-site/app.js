(function startChannel80() {
  'use strict';

  const Core = window.VideoCore;
  if (!Core) throw new Error('CHANNEL/80 core is unavailable');

  const STORAGE = Object.freeze({
    settings: 'channel80_settings_v1',
    progress: 'channel80_progress_v1',
    bullets: 'channel80_bullets_v1',
    lastVideo: 'channel80_last_video_v1'
  });

  const REMOTE_VIDEOS = Object.freeze([
    {
      id: 'film-flower',
      title: '花园一刻',
      englishTitle: 'FLOWER STUDY',
      sourceLabel: 'MDN · CC0 SAMPLE',
      durationHint: 30,
      src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      colors: ['#243b4b', '#d9ad6c']
    },
    {
      id: 'film-sintel',
      title: '辛特尔 · 预告',
      englishTitle: 'SINTEL TRAILER',
      sourceLabel: 'W3C MEDIA SAMPLE',
      durationHint: 52,
      src: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      colors: ['#38425d', '#d96c6c']
    },
    {
      id: 'film-bunny',
      title: '大雄兔 · 预告',
      englishTitle: 'BIG BUCK BUNNY',
      sourceLabel: 'W3C MEDIA SAMPLE',
      durationHint: 33,
      src: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
      colors: ['#31535a', '#8ec7d3']
    }
  ]);

  const SEED_BULLETS = Core.cleanBullets([
    { id: 'seed_flower_01', videoId: 'film-flower', text: '风把花瓣推近了镜头', time: 2.5, color: '#F2E7D2', createdAt: 1 },
    { id: 'seed_flower_02', videoId: 'film-flower', text: '这一段适合慢下来', time: 8.2, color: '#8EC7D3', createdAt: 2 },
    { id: 'seed_flower_03', videoId: 'film-flower', text: '光线像下午四点', time: 15.4, color: '#E9A45B', createdAt: 3 },
    { id: 'seed_sintel_01', videoId: 'film-sintel', text: '雪地里的脚步声很有空间感', time: 6.1, color: '#FFFFFF', createdAt: 4 },
    { id: 'seed_sintel_02', videoId: 'film-sintel', text: '镜头开始加速了', time: 20.3, color: '#D96C6C', createdAt: 5 },
    { id: 'seed_bunny_01', videoId: 'film-bunny', text: '这只兔子的表情太有戏', time: 4.7, color: '#E9A45B', createdAt: 6 },
    { id: 'seed_bunny_02', videoId: 'film-bunny', text: '草地的层次很舒服', time: 13.8, color: '#8EC7D3', createdAt: 7 }
  ]);

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    body: document.body,
    video: $('#video'),
    playerStage: $('#playerStage'),
    screenFrame: $('#screenFrame'),
    danmakuLayer: $('#danmakuLayer'),
    centerPlayButton: $('#centerPlayButton'),
    playButton: $('#playButton'),
    muteButton: $('#muteButton'),
    volumeInput: $('#volumeInput'),
    rateSelect: $('#rateSelect'),
    seekInput: $('#seekInput'),
    currentTime: $('#currentTime'),
    durationTime: $('#durationTime'),
    bulletToggle: $('#bulletToggle'),
    autoNextToggle: $('#autoNextToggle'),
    fullscreenButton: $('#fullscreenButton'),
    bulletForm: $('#bulletForm'),
    bulletInput: $('#bulletInput'),
    bulletCount: $('#bulletCount'),
    bulletHint: $('#bulletHint'),
    sendTime: $('#sendTime'),
    clearBulletsButton: $('#clearBulletsButton'),
    playlist: $('#playlist'),
    localVideoInput: $('#localVideoInput'),
    loadLocalFromError: $('#loadLocalFromError'),
    fileStatus: $('#fileStatus'),
    sourceChip: $('#sourceChip'),
    nowPlayingTitle: $('#nowPlayingTitle'),
    nowPlayingMeta: $('#nowPlayingMeta'),
    screeningStatus: $('#screeningStatus'),
    loadPanel: $('#loadPanel'),
    signalFill: $('#signalFill'),
    signalNeedle: $('#signalNeedle'),
    signalPercent: $('#signalPercent'),
    signalBulletCount: $('#signalBulletCount'),
    toast: $('#toast')
  };

  let toastTimer = 0;
  let localVideo = null;
  let localObjectUrl = '';
  let currentVideoId = '';
  let resumeAt = 0;
  let playAfterLoad = false;
  let isScrubbing = false;
  let laneOffset = 0;
  let lastProgressSave = 0;
  let renderedBulletIds = new Set();
  let sessionBullets = [];

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      showToast('浏览器没有留下这次更改；请检查存储权限。', true);
      return false;
    }
  }

  let settings = Core.normalizeSettings(readJson(STORAGE.settings, null));
  let progress = Core.normalizeProgress(readJson(STORAGE.progress, {}), REMOTE_VIDEOS.map((video) => video.id));
  let storedBullets = Core.cleanBullets(readJson(STORAGE.bullets, []));

  function allVideos() {
    return localVideo ? [...REMOTE_VIDEOS, localVideo] : [...REMOTE_VIDEOS];
  }

  function currentVideo() {
    return allVideos().find((video) => video.id === currentVideoId) || REMOTE_VIDEOS[0];
  }

  function allBullets() {
    return [...SEED_BULLETS, ...storedBullets, ...sessionBullets];
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function setStatus(message, isError = false) {
    elements.screeningStatus.querySelector('span').textContent = message;
    elements.screeningStatus.classList.toggle('error', isError);
  }

  function makePoster(video) {
    const [start, end] = video.colors;
    const safeTitle = video.englishTitle.replace(/[^A-Z0-9 ]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient><radialGradient id="v"><stop stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="#080d17"/><path d="M0 0h1280v720H0z" fill="url(#g)" opacity=".82"/><circle cx="850" cy="260" r="440" fill="url(#v)"/><path d="M0 575h1280v145H0z" fill="#080d17" opacity=".62"/><text x="70" y="630" fill="#f2e7d2" font-family="Arial Narrow,Arial" font-size="54" font-weight="700" letter-spacing="8">${safeTitle}</text><text x="74" y="674" fill="#f2e7d2" opacity=".7" font-family="monospace" font-size="18" letter-spacing="4">CHANNEL 80 / CURATED SCREENING</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function watchedPercent(video) {
    if (video.isLocal) return 0;
    return Math.min(100, Math.round(((progress[video.id] || 0) / Math.max(1, video.durationHint)) * 100));
  }

  function createPlaylistItem(video, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `playlist-item${video.id === currentVideoId ? ' active' : ''}`;
    button.dataset.videoId = video.id;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-current', video.id === currentVideoId ? 'true' : 'false');

    const number = document.createElement('span');
    number.className = 'playlist-number';
    number.textContent = video.isLocal ? 'FILE' : String(index + 1).padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'playlist-copy';
    const title = document.createElement('b');
    title.textContent = video.title;
    const meta = document.createElement('small');
    meta.textContent = `${video.englishTitle} · ${video.sourceLabel}`;
    copy.append(title, meta);

    const percent = watchedPercent(video);
    const watched = document.createElement('span');
    watched.className = 'playlist-progress';
    const watchedText = document.createElement('span');
    watchedText.textContent = video.isLocal ? '本页' : percent > 0 ? `${percent}%` : '未看';
    const line = document.createElement('i');
    line.style.setProperty('--watched', `${percent}%`);
    watched.append(watchedText, line);

    button.append(number, copy, watched);
    return button;
  }

  function renderPlaylist() {
    elements.playlist.replaceChildren(...allVideos().map(createPlaylistItem));
  }

  function saveSettings() {
    writeJson(STORAGE.settings, settings);
  }

  function saveProgress(force = false) {
    const video = currentVideo();
    if (!video || video.isLocal || !Number.isFinite(elements.video.currentTime)) return;
    const now = Date.now();
    if (!force && now - lastProgressSave < 1000) return;
    lastProgressSave = now;
    const duration = Number.isFinite(elements.video.duration) && elements.video.duration > 0
      ? elements.video.duration
      : video.durationHint;
    progress[video.id] = Core.clampProgress(elements.video.currentTime, duration);
    writeJson(STORAGE.progress, progress);
    updateActivePlaylistProgress(video, duration);
  }

  function updateActivePlaylistProgress(video, duration) {
    const item = elements.playlist.querySelector(`[data-video-id="${video.id}"]`);
    if (!item || video.isLocal) return;
    const percent = Math.min(100, Math.round(((progress[video.id] || 0) / Math.max(1, duration)) * 100));
    const label = item.querySelector('.playlist-progress span');
    const line = item.querySelector('.playlist-progress i');
    if (label) label.textContent = percent > 0 ? `${percent}%` : '未看';
    if (line) line.style.setProperty('--watched', `${percent}%`);
  }

  function resetDanmakuEpoch() {
    renderedBulletIds = new Set();
    elements.danmakuLayer.replaceChildren();
  }

  function updateBulletSummary() {
    const count = Core.bulletsForVideo(allBullets(), currentVideoId).length;
    const personalCount = [...storedBullets, ...sessionBullets].filter((bullet) => bullet.videoId === currentVideoId).length;
    elements.signalBulletCount.textContent = `${count} 条弹幕`;
    elements.clearBulletsButton.disabled = personalCount === 0;
    elements.clearBulletsButton.textContent = personalCount > 0 ? `清除本片我的弹幕 · ${personalCount}` : '清除本片我的弹幕';
  }

  function updateTimeUi(current = elements.video.currentTime, duration = elements.video.duration) {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const ratio = safeDuration > 0 ? Math.min(1, safeCurrent / safeDuration) : 0;
    const percent = Math.round(ratio * 100);
    elements.currentTime.textContent = Core.formatTime(safeCurrent);
    elements.durationTime.textContent = Core.formatTime(safeDuration);
    elements.sendTime.textContent = Core.formatTime(safeCurrent);
    elements.seekInput.value = String(Math.round(ratio * 1000));
    elements.seekInput.style.setProperty('--range-progress', `${percent}%`);
    elements.seekInput.setAttribute('aria-valuetext', `${Core.formatTime(safeCurrent)} / ${Core.formatTime(safeDuration)}`);
    elements.signalPercent.textContent = `${String(percent).padStart(2, '0')}%`;
    elements.signalFill.style.setProperty('--signal-progress', `${percent}%`);
    elements.signalNeedle.style.setProperty('--signal-progress', `${percent}%`);
  }

  function updatePlayUi() {
    const playing = !elements.video.paused && !elements.video.ended;
    elements.screenFrame.classList.toggle('playing', playing);
    elements.playButton.innerHTML = playing ? '<span aria-hidden="true">Ⅱ</span>' : '<span aria-hidden="true">▶</span>';
    elements.playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
    elements.centerPlayButton.setAttribute('aria-label', playing ? '暂停当前视频' : '播放当前视频');
  }

  function updateSettingControls() {
    elements.volumeInput.value = String(settings.volume);
    elements.volumeInput.style.setProperty('--range-progress', `${settings.volume * 100}%`);
    elements.rateSelect.value = String(settings.rate);
    elements.bulletToggle.setAttribute('aria-pressed', String(settings.bulletsVisible));
    elements.bulletToggle.querySelector('b').textContent = settings.bulletsVisible ? '弹幕开' : '弹幕关';
    elements.autoNextToggle.setAttribute('aria-pressed', String(settings.autoNext));
    elements.autoNextToggle.querySelector('b').textContent = settings.autoNext ? '连播开' : '连播关';
    elements.danmakuLayer.classList.toggle('hidden', !settings.bulletsVisible);
    elements.video.volume = settings.volume;
    elements.video.muted = settings.muted;
    elements.video.playbackRate = settings.rate;
    elements.muteButton.innerHTML = settings.muted || settings.volume === 0
      ? '<span aria-hidden="true">×</span>'
      : '<span aria-hidden="true">◖</span>';
    elements.muteButton.setAttribute('aria-label', settings.muted ? '取消静音' : '静音');
  }

  async function togglePlay() {
    if (elements.loadPanel.hidden === false) {
      showToast('请先换片或选择本地视频。', true);
      return;
    }
    if (elements.video.paused) {
      try {
        await elements.video.play();
      } catch {
        showToast('浏览器没有开始播放；请再次点击播放或换一部片。', true);
      }
    } else {
      elements.video.pause();
    }
  }

  function selectVideo(videoId, options = {}) {
    const target = allVideos().find((video) => video.id === videoId);
    if (!target) return;
    if (currentVideoId && currentVideoId !== videoId) saveProgress(true);

    currentVideoId = target.id;
    playAfterLoad = options.autoplay === true;
    resumeAt = target.isLocal ? 0 : progress[target.id] || 0;
    elements.video.pause();
    elements.loadPanel.hidden = true;
    elements.video.poster = target.poster || makePoster(target);
    elements.video.src = target.src;
    elements.video.load();
    elements.nowPlayingTitle.textContent = target.title;
    elements.nowPlayingMeta.textContent = `${target.sourceLabel} · ${target.isLocal ? '本地临时片源' : '远程公开片源'}`;
    const index = allVideos().findIndex((video) => video.id === target.id);
    elements.sourceChip.textContent = target.isLocal ? '本地 / FILE' : `片单 / ${String(index + 1).padStart(2, '0')}`;
    elements.video.setAttribute('aria-label', `当前短片：${target.title}`);
    elements.bulletHint.textContent = target.isLocal
      ? '本地视频与本片弹幕只在当前标签页保留，不上传。'
      : '弹幕和远程片源进度只保存在当前浏览器。';
    setStatus(`已装片 · ${target.title}`);
    resetDanmakuEpoch();
    updateTimeUi(0, target.durationHint);
    updateBulletSummary();
    updatePlayUi();
    renderPlaylist();
    if (!target.isLocal) {
      try { localStorage.setItem(STORAGE.lastVideo, target.id); } catch {}
    }
  }

  function renderDanmaku(bullet, lane) {
    if (!settings.bulletsVisible) return;
    const item = document.createElement('span');
    item.className = 'danmaku-item';
    item.textContent = bullet.text;
    item.style.setProperty('--lane', String(lane));
    item.style.setProperty('--bullet-color', bullet.color);
    item.style.setProperty('--travel', `${7.2 + Math.min(2.8, Array.from(bullet.text).length / 24)}s`);
    elements.danmakuLayer.append(item);
    const remove = () => item.remove();
    item.addEventListener('animationend', remove, { once: true });
    window.setTimeout(remove, 11_000);
  }

  function renderDueDanmaku() {
    if (!settings.bulletsVisible || elements.video.paused) return;
    const due = Core.getDueBullets(allBullets(), currentVideoId, elements.video.currentTime, 0.42)
      .filter((bullet) => !renderedBulletIds.has(bullet.id));
    const assigned = Core.assignLanes(due, 6, laneOffset);
    laneOffset = (laneOffset + assigned.length) % 6;
    for (const bullet of assigned) {
      renderedBulletIds.add(bullet.id);
      renderDanmaku(bullet, bullet.lane);
    }
  }

  function saveBullets() {
    storedBullets = Core.cleanBullets(storedBullets, 300);
    writeJson(STORAGE.bullets, storedBullets);
  }

  function handleBulletSubmit(event) {
    event.preventDefault();
    const text = Core.cleanText(elements.bulletInput.value);
    if (!text) {
      elements.bulletInput.setAttribute('aria-invalid', 'true');
      showToast('先写一句想发到银幕上的话。', true);
      elements.bulletInput.focus();
      return;
    }
    elements.bulletInput.removeAttribute('aria-invalid');
    const selectedColor = elements.bulletForm.elements.bulletColor.value;
    const bullet = Core.normalizeBullet({
      id: `bullet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      videoId: currentVideoId,
      text,
      time: Math.max(0, elements.video.currentTime || 0),
      color: selectedColor,
      createdAt: Date.now()
    });
    if (!bullet) {
      showToast('这条弹幕没有通过格式检查。', true);
      return;
    }
    if (currentVideo().isLocal) sessionBullets.push(bullet);
    else {
      storedBullets.push(bullet);
      saveBullets();
    }
    renderedBulletIds.add(bullet.id);
    renderDanmaku(bullet, laneOffset++ % 6);
    elements.bulletInput.value = '';
    elements.bulletCount.textContent = '0 / 60';
    updateBulletSummary();
    showToast(currentVideo().isLocal ? '弹幕已发出，本页关闭后不会保留。' : '弹幕已发出，并留在当前浏览器。');
  }

  function clearPersonalBullets() {
    const before = storedBullets.length + sessionBullets.length;
    storedBullets = storedBullets.filter((bullet) => bullet.videoId !== currentVideoId);
    sessionBullets = sessionBullets.filter((bullet) => bullet.videoId !== currentVideoId);
    const removed = before - storedBullets.length - sessionBullets.length;
    if (removed === 0) {
      showToast('这部片还没有你发送的弹幕。');
      return;
    }
    saveBullets();
    resetDanmakuEpoch();
    updateBulletSummary();
    showToast(`已清除 ${removed} 条本片弹幕。`);
  }

  function handleLocalFile(file) {
    if (!file) return;
    if (!String(file.type).startsWith('video/')) {
      elements.localVideoInput.value = '';
      showToast('请选择浏览器可播放的视频文件。', true);
      return;
    }
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    localObjectUrl = URL.createObjectURL(file);
    const fileTitle = Core.cleanText(file.name.replace(/\.[^.]+$/, ''), 40) || '本地短片';
    localVideo = {
      id: `local-${Date.now().toString(36)}`,
      title: fileTitle,
      englishTitle: 'LOCAL SCREENING',
      sourceLabel: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      durationHint: 0,
      src: localObjectUrl,
      colors: ['#27334c', '#8ec7d3'],
      isLocal: true
    };
    elements.fileStatus.textContent = `已装片：${file.name} · 关闭本页即释放`;
    selectVideo(localVideo.id);
    showToast('本地视频已装片，没有上传。');
  }

  elements.playlist.addEventListener('click', (event) => {
    const item = event.target.closest('[data-video-id]');
    if (item) selectVideo(item.dataset.videoId);
  });

  elements.centerPlayButton.addEventListener('click', togglePlay);
  elements.playButton.addEventListener('click', togglePlay);
  elements.video.addEventListener('click', togglePlay);
  elements.video.addEventListener('play', updatePlayUi);
  elements.video.addEventListener('pause', updatePlayUi);

  elements.video.addEventListener('loadedmetadata', async () => {
    const target = currentVideo();
    if (!target.isLocal && Number.isFinite(elements.video.duration)) target.durationHint = elements.video.duration;
    const restored = Core.clampProgress(resumeAt, elements.video.duration);
    if (restored > 0 && restored < elements.video.duration - 1) elements.video.currentTime = restored;
    updateTimeUi(elements.video.currentTime, elements.video.duration);
    setStatus(`放映就绪 · ${target.title}`);
    elements.loadPanel.hidden = true;
    renderPlaylist();
    if (playAfterLoad) {
      playAfterLoad = false;
      try { await elements.video.play(); } catch {}
    }
  });

  elements.video.addEventListener('durationchange', () => updateTimeUi());
  elements.video.addEventListener('timeupdate', () => {
    if (!isScrubbing) updateTimeUi();
    renderDueDanmaku();
    saveProgress(false);
  });

  elements.video.addEventListener('seeking', resetDanmakuEpoch);
  elements.video.addEventListener('seeked', () => {
    resetDanmakuEpoch();
    updateTimeUi();
  });

  elements.video.addEventListener('ended', () => {
    saveProgress(true);
    const videos = allVideos();
    const currentIndex = videos.findIndex((video) => video.id === currentVideoId);
    const nextIndex = Core.nextVideoIndex(currentIndex, videos.length, settings.autoNext);
    if (nextIndex >= 0) selectVideo(videos[nextIndex].id, { autoplay: true });
    else setStatus('本片放映结束');
  });

  elements.video.addEventListener('error', () => {
    elements.loadPanel.hidden = false;
    elements.video.pause();
    setStatus('片源载入失败 · 可换片或本地选片', true);
    updatePlayUi();
  });

  elements.seekInput.addEventListener('input', () => {
    isScrubbing = true;
    const duration = elements.video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const next = (Number(elements.seekInput.value) / 1000) * duration;
    elements.video.currentTime = next;
    updateTimeUi(next, duration);
  });

  elements.seekInput.addEventListener('change', () => {
    isScrubbing = false;
    resetDanmakuEpoch();
    saveProgress(true);
  });

  elements.volumeInput.addEventListener('input', () => {
    settings = Core.normalizeSettings({ ...settings, volume: Number(elements.volumeInput.value), muted: false });
    updateSettingControls();
    saveSettings();
  });

  elements.muteButton.addEventListener('click', () => {
    settings = Core.normalizeSettings({ ...settings, muted: !settings.muted });
    updateSettingControls();
    saveSettings();
  });

  elements.rateSelect.addEventListener('change', () => {
    settings = Core.normalizeSettings({ ...settings, rate: Number(elements.rateSelect.value) });
    updateSettingControls();
    saveSettings();
    showToast(`播放速度已设为 ${settings.rate}×。`);
  });

  elements.bulletToggle.addEventListener('click', () => {
    settings = Core.normalizeSettings({ ...settings, bulletsVisible: !settings.bulletsVisible });
    if (settings.bulletsVisible) resetDanmakuEpoch();
    updateSettingControls();
    saveSettings();
  });

  elements.autoNextToggle.addEventListener('click', () => {
    settings = Core.normalizeSettings({ ...settings, autoNext: !settings.autoNext });
    updateSettingControls();
    saveSettings();
  });

  elements.fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await elements.screenFrame.requestFullscreen();
    } catch {
      showToast('当前浏览器不允许进入全屏。', true);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    elements.fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
  });

  elements.bulletInput.addEventListener('input', () => {
    const count = Array.from(elements.bulletInput.value).length;
    elements.bulletCount.textContent = `${Math.min(60, count)} / 60`;
    elements.bulletInput.removeAttribute('aria-invalid');
  });
  elements.bulletForm.addEventListener('submit', handleBulletSubmit);
  elements.clearBulletsButton.addEventListener('click', clearPersonalBullets);
  elements.localVideoInput.addEventListener('change', () => handleLocalFile(elements.localVideoInput.files?.[0]));
  elements.loadLocalFromError.addEventListener('click', () => elements.localVideoInput.click());

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      if (Number.isFinite(elements.video.duration)) {
        elements.video.currentTime = Core.clampProgress(elements.video.currentTime + direction * 5, elements.video.duration);
      }
    } else if (event.key.toLowerCase() === 'm') {
      elements.muteButton.click();
    } else if (event.key.toLowerCase() === 'd') {
      elements.bulletToggle.click();
    }
  });

  window.addEventListener('pagehide', () => {
    saveProgress(true);
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  });

  updateSettingControls();
  renderPlaylist();
  const savedVideo = (() => {
    try { return localStorage.getItem(STORAGE.lastVideo); } catch { return ''; }
  })();
  selectVideo(REMOTE_VIDEOS.some((video) => video.id === savedVideo) ? savedVideo : REMOTE_VIDEOS[0].id);
  elements.body.classList.add('ready');
})();
