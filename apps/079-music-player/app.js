(function () {
  'use strict';

  const Core = window.PlayerCore;
  const STORAGE_KEY = 'reel79.state.v1';
  const DB_NAME = 'reel79.library.v1';
  const DB_STORE = 'audio';
  const MODE_LABELS = {
    order: '顺序播放',
    shuffle: '随机队列',
    'repeat-one': '单曲循环',
    'repeat-all': '列表循环',
  };
  const MODE_ORDER = ['order', 'shuffle', 'repeat-one', 'repeat-all'];

  const DEMO_TRACKS = [
    {
      id: 'demo:night-transit', title: '夜班列车', artist: 'REEL/79 Studio', album: '城市样带 · A 面',
      duration: 48, kind: 'demo',
      lyrics: [
        { time: 0, text: '磁带入仓，夜班列车从站台缓缓启动' },
        { time: 5, text: '街灯一格一格，从车窗背后退场' },
        { time: 11, text: '把白天没有说完的话，留给轨道回响' },
        { time: 18, text: '穿过河面，风把城市调成很轻的声道' },
        { time: 26, text: '下一站没有名字，只有凌晨两点的光' },
        { time: 34, text: '别急着抵达，让这一卷磁带多转一圈' },
        { time: 42, text: '列车减速，余音停在清晨以前' },
      ],
    },
    {
      id: 'demo:weather-dial', title: '晴雨刻度', artist: 'REEL/79 Studio', album: '城市样带 · A 面',
      duration: 52, kind: 'demo',
      lyrics: [
        { time: 0, text: '旋钮停在多云，窗台还留着昨夜的水' },
        { time: 6, text: '你说天气只是借口，出门才有答案' },
        { time: 13, text: '雨点敲出四拍，伞面跟着低声合唱' },
        { time: 21, text: '转过街角，云层忽然让出一小块蓝' },
        { time: 30, text: '把刻度推向晴天，不必等预报同意' },
        { time: 39, text: '鞋边的水光，也能反射完整的太阳' },
        { time: 47, text: '今日记录：阵雨之后，继续前行' },
      ],
    },
    {
      id: 'demo:paper-constellation', title: '纸上星图', artist: 'REEL/79 Studio', album: '城市样带 · B 面',
      duration: 46, kind: 'demo',
      lyrics: [
        { time: 0, text: '铅笔落下第一颗星，纸面开始有了方向' },
        { time: 6, text: '把今天的坐标，连到很远很远的愿望' },
        { time: 13, text: '有些路线绕了一点，却没有因此失效' },
        { time: 20, text: '折痕像地平线，提醒旅程可以收进口袋' },
        { time: 28, text: '灯熄灭以后，墨点反而更加明亮' },
        { time: 36, text: '明天沿着这张星图，再走一小段就好' },
        { time: 42, text: '卷末留白，等待下一次标记' },
      ],
    },
  ];

  const DEMO_SCORES = {
    'demo:night-transit': { bpm: 92, roots: [45, 48, 41, 43], melody: [69, 72, 76, 72, 67, 71, 74, 71], wave: 'triangle' },
    'demo:weather-dial': { bpm: 106, roots: [48, 43, 45, 41], melody: [72, 74, 76, 79, 76, 74, 71, 74], wave: 'sine' },
    'demo:paper-constellation': { bpm: 78, roots: [41, 45, 48, 43], melody: [65, 69, 72, 76, 74, 72, 69, 67], wave: 'triangle' },
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    body: document.body,
    storageStatus: $('#storage-status'),
    audioInput: $('#audio-input'),
    playlistList: $('#playlist-list'),
    newPlaylist: $('#new-playlist'),
    renamePlaylist: $('#rename-playlist'),
    deletePlaylist: $('#delete-playlist'),
    libraryList: $('#library-list'),
    libraryCount: $('#library-count'),
    deckSource: $('#deck-source'),
    deckCounter: $('#deck-counter'),
    cassette: $('#cassette'),
    nowTitle: $('#now-title'),
    nowArtist: $('#now-artist'),
    nowAlbum: $('#now-album'),
    favorite: $('#favorite-button'),
    currentTime: $('#current-time'),
    duration: $('#duration'),
    seek: $('#seek'),
    previous: $('#previous-button'),
    play: $('#play-button'),
    next: $('#next-button'),
    mode: $('#mode-button'),
    mute: $('#mute-button'),
    volume: $('#volume'),
    volumeOutput: $('#volume-output'),
    queueSummary: $('#queue-summary'),
    queueList: $('#queue-list'),
    lrcInput: $('#lrc-input'),
    lrcLabel: $('#lrc-label'),
    lyricNote: $('#lyric-note'),
    lyricList: $('#lyric-list'),
    audio: $('#audio-player'),
    toast: $('#toast'),
    playlistDialog: $('#playlist-dialog'),
    playlistForm: $('#playlist-form'),
    playlistDialogTitle: $('#playlist-dialog-title'),
    playlistName: $('#playlist-name'),
    confirmDialog: $('#confirm-dialog'),
    confirmTitle: $('#confirm-title'),
    confirmMessage: $('#confirm-message'),
    confirmAction: $('#confirm-action'),
  };

  let rawState = {};
  try { rawState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
  let state = Core.normalizeState(rawState, DEMO_TRACKS);
  let playlistDialogMode = 'create';
  let confirmCallback = null;
  let toastTimer = 0;
  let activeLyricIndex = -2;
  let seekDragging = false;
  let lastSavedSecond = -1;
  let playOrder = [];
  let loadToken = 0;
  let objectUrl = '';
  let loadedLocalId = '';
  const sessionBlobs = new Map();

  const runtime = {
    playing: false,
    audioContext: null,
    masterGain: null,
    demoNodes: [],
    demoOffset: 0,
    demoStartedAt: 0,
    demoStartedWall: 0,
    endedPending: false,
  };

  function currentTrack() {
    return state.tracks.find((track) => track.id === state.currentTrackId) || null;
  }

  function selectedPlaylist() {
    return state.playlists.find((playlist) => playlist.id === state.selectedPlaylistId) || state.playlists[0];
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast('元数据暂时无法保存；当前播放仍可继续。');
    }
  }

  function announce(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2800);
  }

  const toast = announce;

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open audio database'));
    });
  }

  const databaseReady = openDatabase()
    .then((database) => {
      elements.storageStatus.textContent = '本地存储可用 · 音频不会上传';
      return database;
    })
    .catch(() => {
      elements.storageStatus.textContent = '会话模式 · 导入音频不会跨刷新保留';
      return null;
    });

  async function databaseRequest(mode, operation) {
    const database = await databaseReady;
    if (!database) return null;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, mode);
      const request = operation(transaction.objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Audio storage operation failed'));
    });
  }

  async function putBlob(id, blob) {
    sessionBlobs.set(id, blob);
    try { await databaseRequest('readwrite', (store) => store.put({ id, blob })); }
    catch { toast('音频已加入当前会话，但浏览器未能持久保存它。'); }
  }

  async function getBlob(id) {
    if (sessionBlobs.has(id)) return sessionBlobs.get(id);
    try {
      const record = await databaseRequest('readonly', (store) => store.get(id));
      if (record && record.blob) sessionBlobs.set(id, record.blob);
      return record && record.blob || null;
    } catch { return null; }
  }

  async function deleteBlob(id) {
    sessionBlobs.delete(id);
    try { await databaseRequest('readwrite', (store) => store.delete(id)); } catch {}
  }

  function revokeObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    loadedLocalId = '';
    elements.audio.removeAttribute('src');
    elements.audio.load();
  }

  async function ensureLocalSource(track) {
    if (!track || track.kind !== 'local') return false;
    if (loadedLocalId === track.id && elements.audio.src) return true;
    const token = ++loadToken;
    const blob = await getBlob(track.id);
    if (token !== loadToken) return false;
    if (!blob) {
      toast('找不到这首音频。请重新导入；浏览器数据可能已被清除。');
      return false;
    }
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(blob);
    loadedLocalId = track.id;
    elements.audio.src = objectUrl;
    elements.audio.volume = state.muted ? 0 : state.volume;
    elements.audio.currentTime = Math.min(state.positions[track.id] || 0, Math.max(0, track.duration - .05));
    return true;
  }

  function midiToFrequency(note) {
    return 440 * (2 ** ((note - 69) / 12));
  }

  async function ensureAudioContext() {
    if (!runtime.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      runtime.audioContext = new AudioContextClass();
      runtime.masterGain = runtime.audioContext.createGain();
      runtime.masterGain.connect(runtime.audioContext.destination);
    }
    if (runtime.audioContext.state === 'suspended') await runtime.audioContext.resume();
    runtime.masterGain.gain.setTargetAtTime(state.muted ? 0 : state.volume * .34, runtime.audioContext.currentTime, .02);
    return runtime.audioContext;
  }

  function stopDemoNodes() {
    for (const oscillator of runtime.demoNodes) {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
    }
    runtime.demoNodes = [];
  }

  function scheduleTone(context, note, start, duration, level, wave) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = midiToFrequency(note);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + Math.min(.035, duration / 4));
    gain.gain.setValueAtTime(level, Math.max(start + .04, start + duration - .08));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(runtime.masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
    runtime.demoNodes.push(oscillator);
  }

  async function startDemo(offset) {
    const track = currentTrack();
    const score = track && DEMO_SCORES[track.id];
    const context = await ensureAudioContext();
    if (!track || !score || !context) {
      toast('当前浏览器不支持示例样带，请导入本地音频播放。');
      return false;
    }
    stopDemoNodes();
    const position = Math.max(0, Math.min(offset, Math.max(0, track.duration - .03)));
    const beat = 60 / score.bpm;
    const now = context.currentTime + .025;
    runtime.demoOffset = position;
    runtime.demoStartedAt = now;
    runtime.demoStartedWall = performance.now();
    runtime.endedPending = false;
    for (let index = 0; index * beat < track.duration; index += 1) {
      const cue = index * beat;
      if (cue + beat * .82 <= position) continue;
      const chordIndex = Math.floor(index / 4) % score.roots.length;
      const melody = score.melody[index % score.melody.length] + (Math.floor(index / 16) % 2 ? 0 : -12);
      const relative = Math.max(0, cue - position);
      const clipped = Math.max(.05, Math.min(beat * .78, cue + beat * .78 - position));
      scheduleTone(context, melody, now + relative, clipped, .09, score.wave);
      if (index % 2 === 0) scheduleTone(context, score.roots[chordIndex], now + relative, Math.max(.08, beat * 1.5), .12, 'sine');
      if (index % 4 === 0) scheduleTone(context, score.roots[chordIndex] + 12, now + relative, Math.max(.08, beat * 3.2), .035, 'triangle');
    }
    runtime.playing = true;
    setPlayingAppearance();
    return true;
  }

  function getCurrentTime() {
    const track = currentTrack();
    if (!track) return 0;
    if (track.kind === 'local') return Number.isFinite(elements.audio.currentTime) ? elements.audio.currentTime : (state.positions[track.id] || 0);
    if (runtime.playing && runtime.audioContext) {
      const contextElapsed = Math.max(0, runtime.audioContext.currentTime - runtime.demoStartedAt);
      const wallElapsed = Math.max(0, (performance.now() - runtime.demoStartedWall) / 1000);
      return Math.min(track.duration, runtime.demoOffset + Math.max(contextElapsed, wallElapsed));
    }
    return runtime.demoOffset || state.positions[track.id] || 0;
  }

  function rememberPosition() {
    const track = currentTrack();
    if (!track) return;
    const time = Math.max(0, Math.min(track.duration || 86400, getCurrentTime()));
    state.positions[track.id] = Math.round(time * 10) / 10;
  }

  function setPlayingAppearance() {
    elements.body.classList.toggle('is-playing', runtime.playing);
    elements.play.textContent = runtime.playing ? 'Ⅱ' : '▶';
    elements.play.setAttribute('aria-label', runtime.playing ? '暂停' : '播放');
    updateMediaSession(currentTrack());
  }

  async function playCurrent() {
    const track = currentTrack();
    if (!track || runtime.playing) return;
    if (track.kind === 'demo') {
      await startDemo(state.positions[track.id] || runtime.demoOffset || 0);
    } else {
      const ready = await ensureLocalSource(track);
      if (!ready) return;
      try {
        elements.audio.currentTime = Math.min(state.positions[track.id] || 0, Math.max(0, (track.duration || 0) - .03));
        elements.audio.volume = state.muted ? 0 : state.volume;
        await elements.audio.play();
        runtime.playing = true;
        setPlayingAppearance();
      } catch {
        toast('浏览器没有开始播放。请再次点击播放，或检查音频格式。');
      }
    }
  }

  function pauseCurrent(shouldSave = true) {
    if (!runtime.playing) return;
    rememberPosition();
    const track = currentTrack();
    if (track && track.kind === 'demo') {
      runtime.demoOffset = state.positions[track.id] || 0;
      stopDemoNodes();
    } else elements.audio.pause();
    runtime.playing = false;
    setPlayingAppearance();
    if (shouldSave) saveState();
  }

  async function togglePlayback() {
    if (runtime.playing) pauseCurrent();
    else await playCurrent();
  }

  async function seekTo(seconds) {
    const track = currentTrack();
    if (!track) return;
    const time = Math.max(0, Math.min(Number(seconds) || 0, Math.max(0, track.duration - .02)));
    state.positions[track.id] = time;
    if (track.kind === 'demo') {
      runtime.demoOffset = time;
      if (runtime.playing) await startDemo(time);
    } else {
      const ready = await ensureLocalSource(track);
      if (ready) elements.audio.currentTime = time;
    }
    updateProgress(true);
  }

  function refreshPlayOrder() {
    const playlist = selectedPlaylist();
    playOrder = Core.buildPlayOrder(playlist ? playlist.trackIds : [], state.currentTrackId, state.playMode);
  }

  async function selectTrack(trackId, autoplay = false) {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) return;
    if (runtime.playing) pauseCurrent(false);
    state.currentTrackId = track.id;
    runtime.demoOffset = state.positions[track.id] || 0;
    runtime.endedPending = false;
    activeLyricIndex = -2;
    if (track.kind === 'local') await ensureLocalSource(track);
    else revokeObjectUrl();
    refreshPlayOrder();
    renderAll();
    saveState();
    if (autoplay) await playCurrent();
  }

  async function changeTrack(direction, reason = 'manual') {
    const track = currentTrack();
    if (direction < 0 && reason === 'manual' && getCurrentTime() > 3) {
      await seekTo(0);
      return;
    }
    rememberPosition();
    const order = playOrder.length ? playOrder : (selectedPlaylist() ? selectedPlaylist().trackIds : []);
    const resolveMode = state.playMode === 'shuffle' ? 'order' : state.playMode;
    let nextId = Core.resolveNextTrack(order, track && track.id, direction, resolveMode, reason);
    if (!nextId && state.playMode === 'shuffle' && reason === 'ended') {
      refreshPlayOrder();
      nextId = playOrder[0] === (track && track.id) ? playOrder[1] : playOrder[0];
    }
    if (!nextId) {
      pauseCurrent();
      if (reason === 'ended' && track) {
        state.positions[track.id] = track.duration;
        updateProgress(true);
        toast('当前歌单已播放完毕。');
      }
      return;
    }
    if (reason === 'ended') state.positions[nextId] = 0;
    await selectTrack(nextId, true);
  }

  async function handleEnded() {
    if (runtime.endedPending) return;
    runtime.endedPending = true;
    const track = currentTrack();
    if (track) state.positions[track.id] = 0;
    runtime.playing = false;
    stopDemoNodes();
    setPlayingAppearance();
    await changeTrack(1, 'ended');
    runtime.endedPending = false;
  }

  function renderPlaylists() {
    elements.playlistList.replaceChildren();
    for (const playlist of state.playlists) {
      const button = create('button', 'playlist-item');
      button.type = 'button';
      button.dataset.playlistId = playlist.id;
      button.setAttribute('aria-current', playlist.id === state.selectedPlaylistId ? 'true' : 'false');
      const name = create('strong', '', playlist.name);
      const count = create('span', '', String(playlist.trackIds.length).padStart(2, '0'));
      button.append(create('span'), name, count);
      elements.playlistList.append(button);
    }
    const selected = selectedPlaylist();
    const locked = !selected || selected.fixed;
    elements.renamePlaylist.disabled = locked;
    elements.deletePlaylist.disabled = locked;
  }

  function renderLibrary() {
    const localTracks = state.tracks.filter((track) => track.kind === 'local');
    elements.libraryCount.textContent = String(localTracks.length).padStart(2, '0');
    elements.libraryList.replaceChildren();
    if (!localTracks.length) {
      elements.libraryList.append(create('p', 'library-empty', '还没有本地音频。点击页首“导入音频”，文件不会离开浏览器。'));
      return;
    }
    for (const track of localTracks) {
      const row = create('div', 'library-track');
      const select = create('button', 'library-select');
      select.type = 'button';
      select.dataset.trackId = track.id;
      select.append(create('strong', '', track.title), create('small', '', `${track.artist} · ${Core.formatTime(track.duration)}`));
      const actions = create('div', 'library-mini-actions');
      const add = create('button', 'library-add', '+');
      add.type = 'button';
      add.dataset.addTrack = track.id;
      add.setAttribute('aria-label', `把 ${track.title} 加入当前歌单`);
      const remove = create('button', 'library-delete', '×');
      remove.type = 'button';
      remove.dataset.deleteTrack = track.id;
      remove.setAttribute('aria-label', `从曲库删除 ${track.title}`);
      actions.append(add, remove);
      row.append(select, actions);
      elements.libraryList.append(row);
    }
  }

  function renderQueue() {
    const playlist = selectedPlaylist();
    const ids = playlist ? playlist.trackIds : [];
    const tracks = ids.map((id) => state.tracks.find((track) => track.id === id)).filter(Boolean);
    elements.queueList.replaceChildren();
    elements.queueSummary.textContent = `${tracks.length} 首 · ${Core.formatTime(tracks.reduce((sum, track) => sum + track.duration, 0))}`;
    if (!tracks.length) {
      const empty = create('li', 'queue-empty', '这个歌单还是空的。从左侧曲库加入音频，或导入新文件。');
      elements.queueList.append(empty);
      return;
    }
    tracks.forEach((track, index) => {
      const item = create('li', `queue-track${track.id === state.currentTrackId ? ' is-current' : ''}`);
      item.dataset.trackId = track.id;
      const number = create('span', 'queue-number', String(index + 1).padStart(2, '0'));
      const main = create('button', 'queue-main');
      main.type = 'button';
      main.dataset.selectTrack = track.id;
      main.append(create('strong', '', track.title), create('small', '', `${track.artist} · ${track.kind === 'demo' ? '样带' : '本地'}`));
      const duration = create('span', 'queue-duration', Core.formatTime(track.duration));
      const actions = create('div', 'queue-actions');
      const up = create('button', '', '↑');
      up.type = 'button'; up.dataset.moveTrack = track.id; up.dataset.delta = '-1'; up.disabled = playlist.fixed || index === 0; up.setAttribute('aria-label', `上移 ${track.title}`);
      const down = create('button', '', '↓');
      down.type = 'button'; down.dataset.moveTrack = track.id; down.dataset.delta = '1'; down.disabled = playlist.fixed || index === tracks.length - 1; down.setAttribute('aria-label', `下移 ${track.title}`);
      const remove = create('button', '', '−');
      remove.type = 'button'; remove.dataset.removeTrack = track.id; remove.disabled = playlist.fixed; remove.setAttribute('aria-label', `从歌单移除 ${track.title}`);
      actions.append(up, down, remove);
      item.append(number, main, duration, actions);
      elements.queueList.append(item);
    });
  }

  function renderLyrics() {
    const track = currentTrack();
    elements.lyricList.replaceChildren();
    activeLyricIndex = -2;
    const canImport = Boolean(track && track.kind === 'local');
    elements.lrcInput.disabled = !canImport;
    elements.lrcLabel.classList.toggle('disabled', !canImport);
    elements.lrcLabel.setAttribute('aria-disabled', canImport ? 'false' : 'true');
    if (!track || !track.lyrics.length) {
      elements.lyricNote.textContent = canImport ? '当前音频没有词页。可导入 UTF-8 LRC 文件。' : '示例曲目的时间提示会在这里同步显示。';
      elements.lyricList.append(create('p', 'lyric-empty', canImport ? '选择“导入 LRC”，时间标签格式示例：[00:12.50] 第一行歌词。' : '当前没有可显示的同步内容。'));
      return;
    }
    elements.lyricNote.textContent = '点击任意时间码可以跳转到对应位置。';
    track.lyrics.forEach((line, index) => {
      const button = create('button', 'lyric-line');
      button.type = 'button';
      button.dataset.lyricIndex = String(index);
      const time = create('time', '', Core.formatTime(line.time));
      time.dateTime = `PT${line.time}S`;
      button.append(time, create('span', '', line.text));
      elements.lyricList.append(button);
    });
  }

  function renderNowPlaying() {
    const track = currentTrack();
    const playlist = selectedPlaylist();
    if (!track) {
      elements.nowTitle.textContent = '歌单为空';
      elements.nowArtist.textContent = '请导入音频';
      elements.nowAlbum.textContent = 'REEL/79';
      elements.play.disabled = true;
      elements.previous.disabled = true;
      elements.next.disabled = true;
      return;
    }
    elements.play.disabled = false;
    elements.previous.disabled = false;
    elements.next.disabled = false;
    elements.nowTitle.textContent = track.title;
    elements.nowArtist.textContent = track.artist;
    elements.nowAlbum.textContent = track.album;
    elements.deckSource.textContent = track.kind === 'demo' ? 'SAMPLE REEL · TYPE I' : 'LOCAL FILE · USER SHELF';
    const position = playlist ? playlist.trackIds.indexOf(track.id) : -1;
    elements.deckCounter.textContent = position >= 0 ? `A-${String(position + 1).padStart(2, '0')}` : 'LIBRARY';
    const favorite = state.favorites.includes(track.id);
    elements.favorite.textContent = favorite ? '★' : '☆';
    elements.favorite.setAttribute('aria-pressed', String(favorite));
    elements.favorite.setAttribute('aria-label', favorite ? '取消收藏当前曲目' : '收藏当前曲目');
    elements.mode.textContent = MODE_LABELS[state.playMode];
    elements.mode.setAttribute('aria-label', `播放模式：${MODE_LABELS[state.playMode]}，点击切换`);
    elements.volume.value = String(Math.round(state.volume * 100));
    elements.volumeOutput.textContent = String(Math.round(state.volume * 100));
    elements.mute.setAttribute('aria-pressed', String(state.muted));
    elements.mute.setAttribute('aria-label', state.muted ? '取消静音' : '静音');
    elements.mute.textContent = state.muted ? 'MUTE' : 'VOL';
    updateMediaSession(track);
  }

  function renderAll() {
    renderPlaylists();
    renderLibrary();
    renderQueue();
    renderNowPlaying();
    renderLyrics();
    updateProgress(true);
  }

  function updateActiveLyric(time) {
    const track = currentTrack();
    const index = track ? Core.findActiveLyric(track.lyrics, time) : -1;
    if (index === activeLyricIndex) return;
    activeLyricIndex = index;
    elements.lyricList.querySelectorAll('.lyric-line').forEach((line, lineIndex) => {
      const active = lineIndex === index;
      line.classList.toggle('is-active', active);
      if (active) line.setAttribute('aria-current', 'true');
      else line.removeAttribute('aria-current');
    });
    const activeLine = elements.lyricList.querySelector('.lyric-line.is-active');
    if (activeLine && runtime.playing) {
      const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      activeLine.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function updateProgress(force = false) {
    const track = currentTrack();
    const duration = track ? track.duration : 0;
    const time = track ? Math.max(0, Math.min(duration || 86400, getCurrentTime())) : 0;
    const progress = duration ? time / duration : 0;
    elements.currentTime.textContent = Core.formatTime(time);
    elements.duration.textContent = Core.formatTime(duration);
    if (!seekDragging || force) elements.seek.value = String(Math.round(progress * 1000));
    elements.cassette.style.setProperty('--progress', progress.toFixed(4));
    updateActiveLyric(time);
    const wholeSecond = Math.floor(time);
    if (runtime.playing && wholeSecond > 0 && wholeSecond % 5 === 0 && wholeSecond !== lastSavedSecond) {
      lastSavedSecond = wholeSecond;
      state.positions[track.id] = Math.round(time * 10) / 10;
      saveState();
    }
    if (track && track.kind === 'demo' && runtime.playing && duration && time >= duration - .02) handleEnded();
  }

  function tick() {
    updateProgress();
    requestAnimationFrame(tick);
  }

  function openPlaylistDialog(mode) {
    playlistDialogMode = mode;
    const playlist = selectedPlaylist();
    elements.playlistDialogTitle.textContent = mode === 'create' ? '新建歌单' : '重命名歌单';
    elements.playlistName.value = mode === 'rename' && playlist ? playlist.name : '';
    elements.playlistDialog.showModal();
    setTimeout(() => elements.playlistName.focus(), 20);
  }

  function openConfirm(title, message, actionLabel, callback) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAction.textContent = actionLabel;
    confirmCallback = callback;
    elements.confirmDialog.showModal();
  }

  function ensureLocalPlaylist() {
    let playlist = selectedPlaylist();
    if (playlist && !playlist.fixed) return playlist;
    playlist = state.playlists.find((item) => item.id === 'playlist:library');
    if (!playlist) {
      playlist = { id: 'playlist:library', name: '我的曲库', trackIds: [], fixed: false };
      state.playlists.push(playlist);
    }
    state.selectedPlaylistId = playlist.id;
    return playlist;
  }

  function addTrackToCurrent(trackId) {
    const playlist = ensureLocalPlaylist();
    if (playlist.trackIds.includes(trackId)) {
      toast('这首曲目已经在当前歌单中。');
      renderAll();
      return;
    }
    playlist.trackIds.push(trackId);
    refreshPlayOrder();
    saveState();
    renderAll();
    toast(`已加入“${playlist.name}”。`);
  }

  async function deleteTrack(trackId) {
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track || track.kind !== 'local') return;
    if (state.currentTrackId === trackId && runtime.playing) pauseCurrent(false);
    state = Core.removeTrackEverywhere(state, trackId);
    await deleteBlob(trackId);
    if (loadedLocalId === trackId) revokeObjectUrl();
    refreshPlayOrder();
    saveState();
    renderAll();
    toast(`已从本地曲库删除“${track.title}”。`);
  }

  function loadAudioDuration(file) {
    return new Promise((resolve) => {
      const probe = document.createElement('audio');
      const url = URL.createObjectURL(file);
      const finish = (duration) => {
        URL.revokeObjectURL(url);
        probe.removeAttribute('src');
        resolve(Number.isFinite(duration) ? duration : 0);
      };
      const timer = setTimeout(() => finish(0), 7000);
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => { clearTimeout(timer); finish(probe.duration); };
      probe.onerror = () => { clearTimeout(timer); finish(0); };
      probe.src = url;
    });
  }

  async function importAudioFiles(files) {
    const candidates = [...files].slice(0, 20);
    if (!candidates.length) return;
    const imported = [];
    let rejected = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      const file = candidates[index];
      const extensionOkay = /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name);
      if (file.size <= 0 || file.size > 80 * 1024 * 1024 || (!String(file.type).startsWith('audio/') && !extensionOkay)) {
        rejected += 1;
        continue;
      }
      const duration = await loadAudioDuration(file);
      if (!duration) { rejected += 1; continue; }
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || '未命名音频';
      const id = `local:${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const track = Core.normalizeTrack({
        id, title: baseName, artist: '本地文件', album: '本地曲库', duration, kind: 'local',
        size: file.size, mime: file.type, addedAt: new Date().toISOString(), lyrics: [],
      });
      if (!track) { rejected += 1; continue; }
      await putBlob(track.id, file);
      state.tracks.push(track);
      imported.push(track);
    }
    elements.audioInput.value = '';
    if (!imported.length) {
      toast('没有导入音频。请检查格式、文件大小或浏览器解码支持。');
      return;
    }
    const playlist = ensureLocalPlaylist();
    for (const track of imported) if (!playlist.trackIds.includes(track.id)) playlist.trackIds.push(track.id);
    state.currentTrackId = imported[0].id;
    state.positions[imported[0].id] = 0;
    refreshPlayOrder();
    saveState();
    await ensureLocalSource(imported[0]);
    renderAll();
    toast(`已导入 ${imported.length} 首${rejected ? `，跳过 ${rejected} 个文件` : ''}。`);
  }

  async function importLRC(file) {
    const track = currentTrack();
    elements.lrcInput.value = '';
    if (!track || track.kind !== 'local') return;
    if (!file || file.size > 500000) {
      toast('LRC 文件需小于 500 KB。');
      return;
    }
    let parsed;
    try { parsed = Core.parseLRC(await file.text()); }
    catch { toast('无法读取 LRC 文件，请确认它是文本格式。'); return; }
    if (!parsed.lines.length) {
      toast('没有找到有效时间标签；示例格式为 [00:12.50] 歌词。');
      return;
    }
    track.lyrics = parsed.lines;
    saveState();
    renderLyrics();
    updateProgress(true);
    toast(`已导入 ${parsed.lines.length} 行同步歌词。`);
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window) || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album });
      navigator.mediaSession.playbackState = runtime.playing ? 'playing' : 'paused';
    } catch {}
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => playCurrent(),
      pause: () => pauseCurrent(),
      previoustrack: () => changeTrack(-1),
      nexttrack: () => changeTrack(1),
      seekbackward: (event) => seekTo(getCurrentTime() - (event.seekOffset || 10)),
      seekforward: (event) => seekTo(getCurrentTime() + (event.seekOffset || 10)),
      seekto: (event) => seekTo(event.seekTime || 0),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    }
  }

  elements.play.addEventListener('click', togglePlayback);
  elements.previous.addEventListener('click', () => changeTrack(-1));
  elements.next.addEventListener('click', () => changeTrack(1));
  elements.seek.addEventListener('pointerdown', () => { seekDragging = true; });
  elements.seek.addEventListener('input', () => {
    const track = currentTrack();
    if (!track) return;
    elements.currentTime.textContent = Core.formatTime((Number(elements.seek.value) / 1000) * track.duration);
  });
  elements.seek.addEventListener('change', async () => {
    seekDragging = false;
    const track = currentTrack();
    if (track) await seekTo((Number(elements.seek.value) / 1000) * track.duration);
    saveState();
  });
  elements.volume.addEventListener('input', () => {
    state.volume = Number(elements.volume.value) / 100;
    if (state.volume > 0) state.muted = false;
    elements.volumeOutput.textContent = elements.volume.value;
    elements.audio.volume = state.muted ? 0 : state.volume;
    if (runtime.masterGain && runtime.audioContext) runtime.masterGain.gain.setTargetAtTime(state.muted ? 0 : state.volume * .34, runtime.audioContext.currentTime, .02);
    renderNowPlaying();
    saveState();
  });
  elements.mute.addEventListener('click', () => {
    state.muted = !state.muted;
    elements.audio.volume = state.muted ? 0 : state.volume;
    if (runtime.masterGain && runtime.audioContext) runtime.masterGain.gain.setTargetAtTime(state.muted ? 0 : state.volume * .34, runtime.audioContext.currentTime, .02);
    renderNowPlaying();
    saveState();
    toast(state.muted ? '已静音。' : '已恢复音量。');
  });
  elements.mode.addEventListener('click', () => {
    state.playMode = MODE_ORDER[(MODE_ORDER.indexOf(state.playMode) + 1) % MODE_ORDER.length];
    refreshPlayOrder();
    renderNowPlaying();
    saveState();
    toast(`播放模式：${MODE_LABELS[state.playMode]}。`);
  });
  elements.favorite.addEventListener('click', () => {
    const track = currentTrack();
    if (!track) return;
    const index = state.favorites.indexOf(track.id);
    if (index >= 0) state.favorites.splice(index, 1);
    else state.favorites.push(track.id);
    renderNowPlaying();
    saveState();
  });

  elements.playlistList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-playlist-id]');
    if (!button) return;
    state.selectedPlaylistId = button.dataset.playlistId;
    const playlist = selectedPlaylist();
    if (playlist.trackIds.length && !playlist.trackIds.includes(state.currentTrackId)) await selectTrack(playlist.trackIds[0], false);
    else { refreshPlayOrder(); renderAll(); saveState(); }
  });
  elements.newPlaylist.addEventListener('click', () => openPlaylistDialog('create'));
  elements.renamePlaylist.addEventListener('click', () => openPlaylistDialog('rename'));
  elements.deletePlaylist.addEventListener('click', () => {
    const playlist = selectedPlaylist();
    if (!playlist || playlist.fixed) return;
    openConfirm('删除歌单', `删除“${playlist.name}”？曲库里的音频文件会保留。`, '删除歌单', () => {
      state.playlists = state.playlists.filter((item) => item.id !== playlist.id);
      state.selectedPlaylistId = 'sample';
      const sample = selectedPlaylist();
      state.currentTrackId = sample.trackIds[0] || state.currentTrackId;
      refreshPlayOrder(); saveState(); renderAll(); toast('歌单已删除，音频仍在本地曲库。');
    });
  });
  elements.playlistForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = elements.playlistName.value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!name) { elements.playlistName.focus(); return; }
    if (playlistDialogMode === 'create') {
      const id = `playlist:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      state.playlists.push({ id, name, trackIds: [], fixed: false });
      state.selectedPlaylistId = id;
      toast(`已新建歌单“${name}”。`);
    } else {
      const playlist = selectedPlaylist();
      if (playlist && !playlist.fixed) playlist.name = name;
      toast(`歌单已重命名为“${name}”。`);
    }
    elements.playlistDialog.close();
    refreshPlayOrder(); saveState(); renderAll();
  });

  elements.libraryList.addEventListener('click', (event) => {
    const select = event.target.closest('[data-track-id]');
    const add = event.target.closest('[data-add-track]');
    const remove = event.target.closest('[data-delete-track]');
    if (select) selectTrack(select.dataset.trackId, true);
    else if (add) addTrackToCurrent(add.dataset.addTrack);
    else if (remove) {
      const track = state.tracks.find((item) => item.id === remove.dataset.deleteTrack);
      if (track) openConfirm('删除本地音频', `从浏览器中删除“${track.title}”？它会同时离开所有歌单，且无法在这里恢复。`, '删除音频', () => deleteTrack(track.id));
    }
  });

  elements.queueList.addEventListener('click', (event) => {
    const select = event.target.closest('[data-select-track]');
    const move = event.target.closest('[data-move-track]');
    const remove = event.target.closest('[data-remove-track]');
    const playlist = selectedPlaylist();
    if (select) selectTrack(select.dataset.selectTrack, true);
    else if (move && playlist && !playlist.fixed) {
      playlist.trackIds = Core.moveTrack(playlist.trackIds, move.dataset.moveTrack, Number(move.dataset.delta));
      refreshPlayOrder(); saveState(); renderQueue();
    } else if (remove && playlist && !playlist.fixed) {
      playlist.trackIds = playlist.trackIds.filter((id) => id !== remove.dataset.removeTrack);
      refreshPlayOrder(); saveState(); renderQueue(); renderPlaylists();
      toast('已从当前歌单移除，音频仍在本地曲库。');
    }
  });

  elements.lyricList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lyric-index]');
    const track = currentTrack();
    if (!button || !track) return;
    const line = track.lyrics[Number(button.dataset.lyricIndex)];
    if (line) seekTo(line.time);
  });
  elements.audioInput.addEventListener('change', () => importAudioFiles(elements.audioInput.files));
  elements.lrcInput.addEventListener('change', () => importLRC(elements.lrcInput.files[0]));
  elements.audio.addEventListener('ended', handleEnded);
  elements.audio.addEventListener('error', () => {
    if (loadedLocalId) toast('浏览器无法解码这首音频，请尝试 MP3、WAV、M4A、OGG 或 WebM。');
  });

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) document.getElementById(closer.dataset.close).close();
  });
  elements.confirmAction.addEventListener('click', async () => {
    const callback = confirmCallback;
    confirmCallback = null;
    elements.confirmDialog.close();
    if (callback) await callback();
  });
  document.addEventListener('keydown', (event) => {
    const editable = event.target.closest('input, textarea, select, button, [contenteditable="true"]');
    if (editable) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); seekTo(getCurrentTime() - 5); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); seekTo(getCurrentTime() + 5); }
    else if (event.key.toLowerCase() === 'm') { event.preventDefault(); elements.mute.click(); }
  });

  window.addEventListener('beforeunload', () => {
    rememberPosition();
    saveState();
    stopDemoNodes();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });

  refreshPlayOrder();
  renderAll();
  setPlayingAppearance();
  bindMediaSession();
  const initialTrack = currentTrack();
  if (initialTrack && initialTrack.kind === 'local') ensureLocalSource(initialTrack);
  document.body.classList.add('ready');
  requestAnimationFrame(tick);
})();
