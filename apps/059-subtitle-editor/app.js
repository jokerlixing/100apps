(function () {
  'use strict';

  const Core = window.SubtitleCore;
  const STORAGE_KEY = 'cut59.subtitle-draft.v1';
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const FRAME_MS = 40;
  const SAMPLE_CUES = [
    { id: 'sample-1', startMs: 800, endMs: 3100, text: '先听见房间里的呼吸，\n再决定从哪里剪开。' },
    { id: 'sample-2', startMs: 3650, endMs: 6200, text: '字幕不是贴纸，\n它要跟着画面的节奏走。' },
    { id: 'sample-3', startMs: 7050, endMs: 9600, text: '把播放头停在声音落下的位置。' },
    { id: 'sample-4', startMs: 10200, endMs: 13200, text: '微调一百毫秒，\n让每句话刚好抵达。' }
  ];

  const $ = id => document.getElementById(id);
  const elements = {
    saveState: $('saveState'), videoInput: $('videoInput'), subtitleInput: $('subtitleInput'), newButton: $('newButton'),
    exportButton: $('exportButton'), exportMenu: $('exportMenu'), video: $('video'), videoStage: $('videoStage'),
    videoState: $('videoState'), sourceBadge: $('sourceBadge'), frameReadout: $('frameReadout'), subtitleOverlay: $('subtitleOverlay'),
    playButton: $('playButton'), playIcon: $('playIcon'), stepBackButton: $('stepBackButton'), stepForwardButton: $('stepForwardButton'),
    currentReadout: $('currentReadout'), durationReadout: $('durationReadout'), transportRange: $('transportRange'), muteButton: $('muteButton'),
    addCueButton: $('addCueButton'), searchInput: $('searchInput'), cueCount: $('cueCount'), warningSummary: $('warningSummary'), cueList: $('cueList'),
    timelineRuler: $('timelineRuler'), timelineTicks: $('timelineTicks'), timelineCues: $('timelineCues'), timelinePlayhead: $('timelinePlayhead'),
    timelineRange: $('timelineRange'), timelineEnd: $('timelineEnd'), selectionLabel: $('selectionLabel'), emptyInspector: $('emptyInspector'),
    inspectorForm: $('inspectorForm'), startInput: $('startInput'), endInput: $('endInput'), setStartButton: $('setStartButton'),
    setEndButton: $('setEndButton'), captionInput: $('captionInput'), textCount: $('textCount'), durationMetric: $('durationMetric'),
    speedMetric: $('speedMetric'), cueStatus: $('cueStatus'), jumpButton: $('jumpButton'), splitButton: $('splitButton'),
    duplicateButton: $('duplicateButton'), deleteButton: $('deleteButton'), toast: $('toast')
  };

  let idSequence = 0;
  let saveTimer = 0;
  let toastTimer = 0;
  let playbackFrame = 0;
  let previousVideoUrl = '';
  let lastActiveKey = '';
  let diagnostics = { byId: Object.create(null), errorCount: 0, warningCount: 0 };

  const state = {
    cues: [],
    selectedId: '',
    currentMs: 0,
    videoDurationMs: 0,
    videoName: '',
    projectName: 'cut-59-subtitles',
    sourceFormat: 'srt',
    search: ''
  };

  function nextId(prefix) {
    idSequence += 1;
    return `${prefix || 'cue'}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.cues)) {
          state.cues = Core.normalizeCues(parsed.cues);
          state.projectName = safeBaseName(parsed.projectName || state.projectName);
          state.sourceFormat = parsed.sourceFormat === 'vtt' ? 'vtt' : 'srt';
        }
      }
    } catch (error) {
      console.warn('CUT/59 draft could not be loaded.', error);
    }
    if (!state.cues.length) state.cues = Core.normalizeCues(SAMPLE_CUES);
    state.selectedId = state.cues[0]?.id || '';
  }

  function safeBaseName(value) {
    const clean = String(value || 'cut-59-subtitles').replace(/\.(srt|vtt)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').trim();
    return (clean || 'cut-59-subtitles').slice(0, 80);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    elements.saveState.textContent = '正在保存草稿…';
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          version: 1,
          projectName: state.projectName,
          sourceFormat: state.sourceFormat,
          cues: state.cues
        }));
        elements.saveState.textContent = '草稿已保存';
      } catch (error) {
        elements.saveState.textContent = '草稿保存失败';
        showToast('浏览器无法保存草稿，请先导出字幕文件。', true);
      }
    }, 180);
  }

  function showToast(message, isError) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', Boolean(isError));
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function getSelectedCue() {
    return state.cues.find(cue => cue.id === state.selectedId) || null;
  }

  function timelineDuration() {
    const cueEnd = state.cues.reduce((maximum, cue) => Math.max(maximum, Number(cue.endMs) || 0), 0);
    const basis = Math.max(state.videoDurationMs, cueEnd + 1500, 15000);
    return Math.ceil(basis / 5000) * 5000;
  }

  function updateCue(id, patch, options) {
    state.cues = Core.normalizeCues(state.cues.map(cue => cue.id === id ? { ...cue, ...patch } : cue));
    if (!state.cues.some(cue => cue.id === state.selectedId)) state.selectedId = state.cues[0]?.id || '';
    scheduleSave();
    renderProject(options);
  }

  function renderProject(options) {
    diagnostics = Core.diagnoseCues(state.cues);
    elements.cueCount.textContent = String(state.cues.length);
    const noticeCount = diagnostics.errorCount + diagnostics.warningCount;
    elements.warningSummary.innerHTML = `<b>${noticeCount}</b> 提醒`;
    elements.warningSummary.hidden = noticeCount === 0;
    renderCueList(options);
    renderTimeline();
    renderInspector();
    updatePlaybackUi(true);
  }

  function renderCueList(options) {
    const query = state.search.trim().toLocaleLowerCase('zh-CN');
    const filtered = state.cues.filter(cue => !query || cue.text.toLocaleLowerCase('zh-CN').includes(query) || Core.compactTimecode(cue.startMs).includes(query));
    elements.cueList.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'cue-empty';
      empty.innerHTML = query
        ? '<div><strong>没有匹配字幕</strong><span>换一个关键词，或清除搜索。</span></div>'
        : '<div><strong>场记单还是空的</strong><span>在当前播放位置新增第一条字幕。</span></div>';
      elements.cueList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    filtered.forEach(cue => {
      const index = state.cues.indexOf(cue);
      const diagnostic = diagnostics.byId[cue.id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cue-card';
      card.dataset.id = cue.id;
      card.id = `cue-card-${cue.id}`;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(cue.id === state.selectedId));
      if (diagnostic && (diagnostic.errors.length || diagnostic.warnings.length)) card.classList.add('has-warning');

      const number = document.createElement('span');
      number.className = 'cue-index';
      number.textContent = String(index + 1).padStart(3, '0');
      const copy = document.createElement('span');
      copy.className = 'cue-copy';
      const time = document.createElement('span');
      time.className = 'cue-time';
      const start = document.createElement('span');
      start.textContent = Core.compactTimecode(cue.startMs);
      const dash = document.createElement('i');
      const end = document.createElement('span');
      end.textContent = Core.compactTimecode(cue.endMs);
      time.append(start, dash, end);
      const text = document.createElement('span');
      text.className = 'cue-text';
      text.textContent = cue.text || '（空字幕）';
      copy.append(time, text);
      const flag = document.createElement('span');
      flag.className = 'cue-flag';
      flag.setAttribute('aria-hidden', 'true');
      card.append(number, copy, flag);
      card.addEventListener('click', () => selectCue(cue.id, true));
      fragment.append(card);
    });
    elements.cueList.append(fragment);
    if (options && options.scrollSelected) {
      requestAnimationFrame(() => document.getElementById(`cue-card-${state.selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  }

  function renderTimeline() {
    const duration = timelineDuration();
    elements.timelineTicks.replaceChildren();
    for (let index = 0; index <= 10; index += 1) {
      const tick = document.createElement('span');
      tick.className = 'timeline-tick';
      tick.style.left = `${index * 10}%`;
      tick.dataset.time = Core.compactTimecode(duration * index / 10);
      elements.timelineTicks.append(tick);
    }
    elements.timelineCues.replaceChildren();
    state.cues.forEach(cue => {
      const block = document.createElement('button');
      const diagnostic = diagnostics.byId[cue.id];
      const start = Math.max(0, Math.min(100, cue.startMs / duration * 100));
      const end = Math.max(start, Math.min(100, cue.endMs / duration * 100));
      block.type = 'button';
      block.className = 'timeline-cue';
      block.dataset.id = cue.id;
      block.style.left = `${start}%`;
      block.style.width = `${Math.max(.55, end - start)}%`;
      block.textContent = cue.text || 'EMPTY';
      block.title = `${Core.compactTimecode(cue.startMs)} → ${Core.compactTimecode(cue.endMs)}\n${cue.text || '空字幕'}`;
      block.setAttribute('aria-label', `定位到字幕：${cue.text || '空字幕'}`);
      block.setAttribute('aria-pressed', String(cue.id === state.selectedId));
      if (diagnostic && (diagnostic.errors.length || diagnostic.warnings.length)) block.classList.add('has-warning');
      block.addEventListener('click', () => selectCue(cue.id, true));
      elements.timelineCues.append(block);
    });
    [elements.timelineRange, elements.transportRange].forEach(range => {
      range.max = String(duration);
      range.value = String(Math.min(duration, state.currentMs));
    });
    elements.timelineEnd.textContent = `END ${Core.compactTimecode(duration)}`;
    elements.durationReadout.textContent = Core.compactTimecode(state.videoDurationMs || duration);
  }

  function renderInspector() {
    const cue = getSelectedCue();
    elements.emptyInspector.hidden = Boolean(cue);
    elements.inspectorForm.hidden = !cue;
    if (!cue) {
      elements.selectionLabel.textContent = '选择一条字幕开始校准';
      return;
    }
    const index = state.cues.indexOf(cue);
    elements.selectionLabel.textContent = `CUE ${String(index + 1).padStart(3, '0')} · ${Core.compactTimecode(cue.startMs)}`;
    if (document.activeElement !== elements.startInput) elements.startInput.value = Core.formatTimecode(cue.startMs, 'vtt');
    if (document.activeElement !== elements.endInput) elements.endInput.value = Core.formatTimecode(cue.endMs, 'vtt');
    if (document.activeElement !== elements.captionInput) elements.captionInput.value = cue.text;
    elements.startInput.setCustomValidity('');
    elements.endInput.setCustomValidity('');
    elements.textCount.textContent = `${cue.text.length}/${Core.MAX_TEXT_LENGTH}`;
    const metrics = Core.cueMetrics(cue);
    elements.durationMetric.textContent = `${(metrics.durationMs / 1000).toFixed(2)} s`;
    elements.speedMetric.textContent = `${metrics.charactersPerSecond.toFixed(1)} 字/秒`;
    const diagnostic = diagnostics.byId[cue.id];
    let label = 'READY';
    if (diagnostic?.errors.includes('duration')) label = 'INVALID RANGE';
    else if (diagnostic?.warnings.includes('overlap')) label = 'OVERLAP';
    else if (diagnostic?.warnings.includes('empty')) label = 'EMPTY';
    else if (metrics.charactersPerSecond > 18) label = 'TOO FAST';
    else if (diagnostic?.warnings.includes('long')) label = 'LONG CUE';
    elements.cueStatus.textContent = label;
    elements.cueStatus.classList.toggle('is-warning', label !== 'READY');
  }

  function selectCue(id, shouldSeek) {
    if (!state.cues.some(cue => cue.id === id)) return;
    state.selectedId = id;
    const cue = getSelectedCue();
    if (shouldSeek && cue) seekTo(cue.startMs);
    renderProject({ scrollSelected: true });
  }

  function activeCueIds() {
    return Core.activeCuesAt(state.cues, state.currentMs).map(cue => cue.id);
  }

  function updatePlaybackUi(force) {
    const duration = timelineDuration();
    const percent = Math.max(0, Math.min(100, state.currentMs / duration * 100));
    elements.timelinePlayhead.style.left = `${percent}%`;
    elements.timelineRange.value = String(Math.min(duration, state.currentMs));
    elements.transportRange.value = String(Math.min(duration, state.currentMs));
    elements.currentReadout.textContent = Core.compactTimecode(state.currentMs);
    elements.frameReadout.textContent = `FRAME ${String(Math.floor(state.currentMs / FRAME_MS)).padStart(5, '0')}`;
    const active = Core.activeCuesAt(state.cues, state.currentMs);
    const key = active.map(cue => cue.id).join('|');
    if (!force && key === lastActiveKey) return;
    lastActiveKey = key;
    elements.subtitleOverlay.replaceChildren();
    active.forEach(cue => {
      const line = document.createElement('span');
      line.textContent = cue.text;
      elements.subtitleOverlay.append(line);
    });
    const activeIds = new Set(active.map(cue => cue.id));
    document.querySelectorAll('.cue-card,.timeline-cue').forEach(node => node.classList.toggle('is-active', activeIds.has(node.dataset.id)));
  }

  function seekTo(value) {
    const maximum = timelineDuration();
    const next = Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));
    state.currentMs = next;
    if (elements.video.src && Number.isFinite(elements.video.duration)) elements.video.currentTime = Math.min(elements.video.duration, next / 1000);
    updatePlaybackUi(true);
  }

  function togglePlayback() {
    if (!elements.video.src) {
      showToast('先打开本地视频，再开始播放。', true);
      return;
    }
    if (elements.video.paused) {
      elements.video.play().catch(() => showToast('浏览器未能播放这个视频，请尝试其他格式。', true));
    } else {
      elements.video.pause();
    }
  }

  function stepVideo(delta) {
    if (elements.video.src) elements.video.pause();
    seekTo(state.currentMs + delta);
  }

  function startPlaybackLoop() {
    cancelAnimationFrame(playbackFrame);
    const tick = () => {
      state.currentMs = Math.round(elements.video.currentTime * 1000);
      updatePlaybackUi(false);
      if (!elements.video.paused && !elements.video.ended) playbackFrame = requestAnimationFrame(tick);
    };
    playbackFrame = requestAnimationFrame(tick);
  }

  function setPlayingState(isPlaying) {
    elements.playButton.classList.toggle('is-playing', isPlaying);
    elements.playIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
    elements.playButton.setAttribute('aria-label', isPlaying ? '暂停视频' : '播放视频');
    elements.videoState.textContent = isPlaying ? 'PLAYBACK RUNNING' : elements.video.src ? 'MEDIA ON BENCH' : 'WAITING FOR LOCAL MEDIA';
    if (isPlaying) startPlaybackLoop();
    else cancelAnimationFrame(playbackFrame);
  }

  async function openVideo(file) {
    if (!file) return;
    if (!String(file.type).startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) {
      showToast('请选择浏览器支持的视频文件。', true);
      return;
    }
    if (previousVideoUrl) URL.revokeObjectURL(previousVideoUrl);
    previousVideoUrl = URL.createObjectURL(file);
    state.videoName = file.name;
    state.currentMs = 0;
    state.videoDurationMs = 0;
    elements.video.src = previousVideoUrl;
    elements.videoStage.classList.remove('is-empty');
    elements.sourceBadge.textContent = file.name.toUpperCase().slice(0, 42);
    elements.videoState.textContent = 'READING MEDIA METADATA';
    elements.video.load();
    showToast(`已装入视频：${file.name}`);
  }

  async function importSubtitle(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast('字幕文件超过 2MB，请拆分后再导入。', true);
      return;
    }
    try {
      const source = await file.text();
      const parsed = Core.parseSubtitles(source, file.name);
      if (!parsed.cues.length) throw new Error(parsed.warnings[0] || '没有找到有效字幕条目');
      if (state.cues.length && !window.confirm(`导入将替换当前 ${state.cues.length} 条字幕，继续吗？`)) return;
      state.cues = parsed.cues.map(cue => ({ ...cue, id: nextId('cue') }));
      state.selectedId = state.cues[0]?.id || '';
      state.projectName = safeBaseName(file.name);
      state.sourceFormat = parsed.format;
      state.currentMs = state.cues[0]?.startMs || 0;
      scheduleSave();
      renderProject({ scrollSelected: true });
      showToast(`已导入 ${state.cues.length} 条字幕${parsed.warnings.length ? `，另有 ${parsed.warnings.length} 条提示` : ''}。`);
    } catch (error) {
      showToast(`导入失败：${error.message}`, true);
    }
  }

  function newProject() {
    if (state.cues.length && !window.confirm('清空当前字幕并新建空白场记单吗？')) return;
    state.cues = [];
    state.selectedId = '';
    state.currentMs = 0;
    state.projectName = 'cut-59-subtitles';
    state.sourceFormat = 'srt';
    scheduleSave();
    renderProject();
    showToast('空白场记单已就绪。');
  }

  function addCue() {
    const cue = Core.createCue(state.currentMs, 2000, '', nextId('cue'));
    state.cues = Core.normalizeCues([...state.cues, cue]);
    state.selectedId = cue.id;
    scheduleSave();
    renderProject({ scrollSelected: true });
    requestAnimationFrame(() => elements.captionInput.focus());
  }

  function deleteSelected() {
    const cue = getSelectedCue();
    if (!cue) return;
    if (cue.text && !window.confirm('删除这条字幕吗？')) return;
    const index = state.cues.indexOf(cue);
    state.cues = state.cues.filter(item => item.id !== cue.id);
    state.selectedId = state.cues[Math.min(index, state.cues.length - 1)]?.id || '';
    scheduleSave();
    renderProject({ scrollSelected: true });
    showToast('字幕已删除。');
  }

  function duplicateSelected() {
    const cue = getSelectedCue();
    if (!cue) return;
    const duration = Math.max(Core.MIN_CUE_DURATION, cue.endMs - cue.startMs);
    const copy = { ...cue, id: nextId('cue'), startMs: cue.endMs + 100, endMs: cue.endMs + 100 + duration };
    state.cues = Core.normalizeCues([...state.cues, copy]);
    state.selectedId = copy.id;
    scheduleSave();
    renderProject({ scrollSelected: true });
  }

  function splitSelected() {
    const cue = getSelectedCue();
    if (!cue) return;
    try {
      const [left, right] = Core.splitCue(cue, state.currentMs);
      left.id = nextId('cue');
      right.id = nextId('cue');
      state.cues = Core.normalizeCues(state.cues.flatMap(item => item.id === cue.id ? [left, right] : [item]));
      state.selectedId = right.id;
      scheduleSave();
      renderProject({ scrollSelected: true });
      showToast('字幕已在播放头处拆分。');
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function nudgeSelected(delta) {
    const cue = getSelectedCue();
    if (!cue) return;
    updateCue(cue.id, Core.shiftCue(cue, delta), { scrollSelected: true });
  }

  function setSelectedBoundary(field, value) {
    const cue = getSelectedCue();
    if (!cue) return;
    updateCue(cue.id, { [field]: Math.max(0, Math.round(value)) });
  }

  function handleTimeInput(input, field) {
    const value = Core.parseTimecode(input.value);
    if (!Number.isFinite(value)) {
      input.setCustomValidity('请输入 00:00:00.000 格式的时间码');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    setSelectedBoundary(field, value);
  }

  function exportProject(format) {
    if (!state.cues.length) {
      showToast('没有可导出的字幕。', true);
      return;
    }
    if (diagnostics.errorCount && !window.confirm(`有 ${diagnostics.errorCount} 处无效时间范围；这些条目不会写入文件。仍要导出吗？`)) return;
    const content = Core.exportSubtitles(state.cues, format);
    if (!content.trim() || content.trim() === 'WEBVTT') {
      showToast('没有时间和文字都有效的字幕条目。', true);
      return;
    }
    const blob = new Blob([content], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeBaseName(state.projectName)}.${format}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeExportMenu();
    showToast(`已导出 ${format.toUpperCase()} 文件。`);
  }

  function closeExportMenu() {
    elements.exportMenu.hidden = true;
    elements.exportButton.setAttribute('aria-expanded', 'false');
  }

  function toggleExportMenu() {
    const willOpen = elements.exportMenu.hidden;
    elements.exportMenu.hidden = !willOpen;
    elements.exportButton.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) elements.exportMenu.querySelector('button')?.focus();
  }

  function bindEvents() {
    elements.videoInput.addEventListener('change', event => {
      openVideo(event.target.files?.[0]);
      event.target.value = '';
    });
    elements.subtitleInput.addEventListener('change', event => {
      importSubtitle(event.target.files?.[0]);
      event.target.value = '';
    });
    elements.newButton.addEventListener('click', newProject);
    elements.exportButton.addEventListener('click', toggleExportMenu);
    elements.exportMenu.addEventListener('click', event => {
      const target = event.target.closest('[data-export]');
      if (target) exportProject(target.dataset.export);
    });
    document.addEventListener('pointerdown', event => {
      if (!event.target.closest('.head-actions')) closeExportMenu();
    });

    elements.playButton.addEventListener('click', togglePlayback);
    elements.stepBackButton.addEventListener('click', () => stepVideo(-FRAME_MS));
    elements.stepForwardButton.addEventListener('click', () => stepVideo(FRAME_MS));
    elements.muteButton.addEventListener('click', () => {
      elements.video.muted = !elements.video.muted;
      elements.muteButton.setAttribute('aria-pressed', String(elements.video.muted));
      elements.muteButton.textContent = elements.video.muted ? 'MUTE' : 'VOL';
    });
    [elements.transportRange, elements.timelineRange].forEach(range => range.addEventListener('input', event => seekTo(event.target.value)));
    elements.video.addEventListener('loadedmetadata', () => {
      state.videoDurationMs = Number.isFinite(elements.video.duration) ? Math.round(elements.video.duration * 1000) : 0;
      elements.videoState.textContent = 'MEDIA ON BENCH';
      renderProject();
    });
    elements.video.addEventListener('play', () => setPlayingState(true));
    elements.video.addEventListener('pause', () => setPlayingState(false));
    elements.video.addEventListener('ended', () => setPlayingState(false));
    elements.video.addEventListener('timeupdate', () => {
      state.currentMs = Math.round(elements.video.currentTime * 1000);
      updatePlaybackUi(false);
    });
    elements.video.addEventListener('error', () => {
      elements.videoStage.classList.add('is-empty');
      elements.videoState.textContent = 'MEDIA FORMAT ERROR';
      showToast('浏览器无法读取这个视频，请尝试 MP4 或 WebM。', true);
    });

    elements.addCueButton.addEventListener('click', addCue);
    elements.searchInput.addEventListener('input', event => {
      state.search = event.target.value;
      renderCueList();
    });
    elements.startInput.addEventListener('change', () => handleTimeInput(elements.startInput, 'startMs'));
    elements.endInput.addEventListener('change', () => handleTimeInput(elements.endInput, 'endMs'));
    elements.setStartButton.addEventListener('click', () => setSelectedBoundary('startMs', state.currentMs));
    elements.setEndButton.addEventListener('click', () => setSelectedBoundary('endMs', state.currentMs));
    elements.captionInput.addEventListener('input', event => {
      const cue = getSelectedCue();
      if (cue) updateCue(cue.id, { text: event.target.value });
    });
    document.querySelectorAll('[data-nudge]').forEach(button => button.addEventListener('click', () => nudgeSelected(Number(button.dataset.nudge))));
    elements.jumpButton.addEventListener('click', () => {
      const cue = getSelectedCue();
      if (!cue) return;
      seekTo(cue.startMs);
      if (elements.video.src) elements.video.play().catch(() => {});
    });
    elements.splitButton.addEventListener('click', splitSelected);
    elements.duplicateButton.addEventListener('click', duplicateSelected);
    elements.deleteButton.addEventListener('click', deleteSelected);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeExportMenu();
      const target = event.target;
      const isEditing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (isEditing) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      else if (event.key.toLowerCase() === 'j') { event.preventDefault(); stepVideo(-FRAME_MS); }
      else if (event.key.toLowerCase() === 'k') { event.preventDefault(); elements.video.pause(); }
      else if (event.key.toLowerCase() === 'l') { event.preventDefault(); stepVideo(FRAME_MS); }
      else if (event.key === '[') { event.preventDefault(); setSelectedBoundary('startMs', state.currentMs); }
      else if (event.key === ']') { event.preventDefault(); setSelectedBoundary('endMs', state.currentMs); }
      else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); nudgeSelected(-100); }
      else if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); nudgeSelected(100); }
      else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); addCue(); }
    });

    document.body.addEventListener('dragover', event => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    });
    document.body.addEventListener('drop', event => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      event.preventDefault();
      if (String(file.type).startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) openVideo(file);
      else if (/\.(srt|vtt)$/i.test(file.name)) importSubtitle(file);
      else showToast('拖入视频或 SRT/VTT 字幕文件。', true);
    });

    window.addEventListener('beforeunload', () => {
      if (previousVideoUrl) URL.revokeObjectURL(previousVideoUrl);
    });
  }

  loadDraft();
  bindEvents();
  renderProject();
})();

