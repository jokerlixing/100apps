(function startTackApp() {
  'use strict';

  const Core = window.NoteCore;
  const STORAGE_KEY = 'tack83_notebook_v1';
  const SETTINGS_KEY = 'tack83_settings_v1';
  const colorNames = { yellow: '索引黄', blue: '蓝图蓝', mint: '标签青', coral: '校对珊瑚', lilac: '档案紫' };
  const desktop = window.desktopAPI || null;
  const elements = Object.fromEntries([
    'alwaysOnTopButton', 'compactButton', 'runtimeLabel', 'searchInput', 'noteCount', 'noteList',
    'listEmpty', 'newNoteButton', 'emptyNewButton', 'importButton', 'exportButton', 'importFile',
    'workspaceEmpty', 'noteSheet', 'saveStatus', 'noteTitle', 'updatedTime', 'pinNoteButton',
    'duplicateButton', 'archiveButton', 'deleteButton', 'noteBody', 'noteStats', 'toast',
  ].map((id) => [id, document.getElementById(id)]));

  let notes = loadNotes();
  let selectedId = null;
  let scope = 'active';
  let query = '';
  let toastTimer = null;
  let listRefreshTimer = null;
  let compact = loadSettings().compact === true;
  let windowPinned = false;

  function seedNotes() {
    const now = Date.now();
    return [
      Core.createNote({
        title: '把下一步钉在桌面',
        body: '这张便签只保存在你的设备上。\n\n试试：\n• Ctrl + N 新建便签\n• 固定重要便签\n• Electron 桌面版可让窗口始终置顶',
        color: 'yellow',
        pinned: true,
      }, { now: new Date(now - 120000).toISOString() }),
      Core.createNote({
        title: '桌面版检查清单',
        body: '运行 npm install 与 npm start。\n点击顶部“始终置顶”，再切换到其他窗口检查便签是否留在最前。',
        color: 'blue',
      }, { now: new Date(now - 240000).toISOString() }),
      Core.createNote({
        title: '备份不依赖账号',
        body: '左下角可导出 JSON。导入前会验证版本和数据结构，损坏文件不会覆盖现有便签。',
        color: 'mint',
      }, { now: new Date(now - 360000).toISOString() }),
    ];
  }

  function loadNotes() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(stored)) return stored.map((note) => Core.normalizeNote(note));
    } catch (error) {
      // Fall through to a safe first-run notebook.
    }
    const seeded = seedNotes();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)); } catch (error) { /* handled on next save */ }
    return seeded;
  }

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (error) { return {}; }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      elements.saveStatus.textContent = '已保存在本机';
    } catch (error) {
      elements.saveStatus.textContent = '保存失败';
      showToast('本机存储空间不足，请先导出备份。');
    }
  }

  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ compact })); } catch (error) { /* non-critical */ }
  }

  function visibleNotes() {
    return Core.filterNotes(notes, { scope, query });
  }

  function currentNote() {
    return notes.find((note) => note.id === selectedId) || null;
  }

  function ensureSelection() {
    const visible = visibleNotes();
    if (!visible.some((note) => note.id === selectedId)) selectedId = visible[0]?.id || null;
    return visible;
  }

  function relativeTime(iso) {
    const difference = Math.max(0, Date.now() - Date.parse(iso));
    if (difference < 60000) return '刚刚更新';
    if (difference < 3600000) return `${Math.floor(difference / 60000)} 分钟前更新`;
    if (difference < 86400000) return `${Math.floor(difference / 3600000)} 小时前更新`;
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  function excerpt(body) {
    return body.replace(/\s+/g, ' ').trim() || '空白便签';
  }

  function renderList(visible) {
    const list = visible || visibleNotes();
    elements.noteList.replaceChildren();
    for (const note of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `note-card${note.id === selectedId ? ' is-selected' : ''}${note.pinned ? ' is-pinned' : ''}`;
      button.dataset.color = note.color;
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-label', `${note.title}，${colorNames[note.color]}${note.pinned ? '，已固定' : ''}`);

      const pin = document.createElement('span');
      pin.className = 'card-pin';
      pin.setAttribute('aria-hidden', 'true');
      const content = document.createElement('span');
      content.className = 'card-content';
      const title = document.createElement('strong');
      title.className = 'card-title';
      title.textContent = note.title;
      const summary = document.createElement('span');
      summary.className = 'card-excerpt';
      summary.textContent = excerpt(note.body);
      const meta = document.createElement('span');
      meta.className = 'card-meta';
      const time = document.createElement('span');
      time.textContent = relativeTime(note.updatedAt).replace('更新', '').trim();
      const length = document.createElement('span');
      length.textContent = `${note.body.trim().length} 字`;
      meta.append(time, length);
      content.append(title, summary, meta);
      button.append(pin, content);
      button.addEventListener('click', () => {
        selectedId = note.id;
        render();
        elements.noteTitle.focus();
      });
      elements.noteList.append(button);
    }
    elements.listEmpty.hidden = list.length > 0;
    elements.noteList.hidden = list.length === 0;
    elements.noteCount.textContent = `${list.length} 张`;
  }

  function updateEditorChrome(note) {
    elements.noteSheet.dataset.color = note.color;
    elements.updatedTime.textContent = relativeTime(note.updatedAt);
    elements.pinNoteButton.setAttribute('aria-pressed', String(note.pinned));
    elements.pinNoteButton.textContent = note.pinned ? '取消固定' : '固定';
    elements.archiveButton.textContent = note.archived ? '移出归档' : '归档';
    document.querySelectorAll('.color-swatch').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.color === note.color));
    });
    const characters = note.body.trim().length;
    const lines = note.body ? note.body.split(/\r?\n/).length : 1;
    elements.noteStats.textContent = `${characters} 字 · ${lines} 行`;
  }

  function renderEditor() {
    const note = currentNote();
    elements.workspaceEmpty.hidden = Boolean(note);
    elements.noteSheet.hidden = !note;
    if (!note) return;
    elements.noteTitle.value = note.title;
    elements.noteBody.value = note.body;
    updateEditorChrome(note);
  }

  function render() {
    const visible = ensureSelection();
    renderList(visible);
    renderEditor();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
  }

  function updateCurrent(patch, options) {
    const index = notes.findIndex((note) => note.id === selectedId);
    if (index < 0) return;
    notes[index] = Core.updateNote(notes[index], patch);
    persist();
    updateEditorChrome(notes[index]);
    clearTimeout(listRefreshTimer);
    listRefreshTimer = setTimeout(() => renderList(visibleNotes()), options?.immediate ? 0 : 100);
  }

  function createNewNote() {
    const note = Core.createNote({ title: '无标题便签', color: 'yellow' });
    notes.push(note);
    selectedId = note.id;
    scope = 'active';
    query = '';
    elements.searchInput.value = '';
    updateScopeButtons();
    persist();
    render();
    elements.noteTitle.select();
    showToast('已新建便签');
  }

  function updateScopeButtons() {
    document.querySelectorAll('.scope-tab').forEach((button) => {
      const active = button.dataset.scope === scope;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setCompact(nextValue, announce) {
    compact = Boolean(nextValue);
    document.body.classList.toggle('compact', compact);
    elements.compactButton.setAttribute('aria-pressed', String(compact));
    persistSettings();
    if (desktop && typeof desktop.setCompactMode === 'function') {
      desktop.setCompactMode(compact).catch(() => showToast('无法调整桌面窗口尺寸。'));
    }
    if (announce) showToast(compact ? '已进入紧凑便签模式' : '已返回便签匣模式');
  }

  function setWindowPinned(active) {
    windowPinned = Boolean(active);
    document.body.classList.toggle('window-pinned', windowPinned);
    elements.alwaysOnTopButton.setAttribute('aria-pressed', String(windowPinned));
  }

  async function toggleWindowPin() {
    const desired = !windowPinned;
    if (!desktop || typeof desktop.setAlwaysOnTop !== 'function') {
      setWindowPinned(desired);
      showToast(desired ? '网页仅展示置顶状态；Electron 桌面版会真正置顶窗口。' : '已关闭置顶状态预览');
      return;
    }
    try {
      const state = await desktop.setAlwaysOnTop(desired);
      setWindowPinned(state.alwaysOnTop);
      showToast(state.alwaysOnTop ? '窗口已保持在最前' : '已取消窗口置顶');
    } catch (error) {
      showToast('无法更改窗口置顶状态。');
    }
  }

  function exportBackup() {
    const blob = new Blob([Core.exportNotebook(notes)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tack83-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${notes.length} 张便签`);
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const imported = Core.importNotebook(await file.text());
      const shouldReplace = window.confirm(`备份中有 ${imported.length} 张便签。导入会替换当前便签匣，是否继续？`);
      if (!shouldReplace) return;
      notes = imported;
      selectedId = null;
      scope = 'active';
      query = '';
      elements.searchInput.value = '';
      updateScopeButtons();
      persist();
      render();
      showToast(`已导入 ${notes.length} 张便签`);
    } catch (error) {
      showToast(error.message || '无法读取备份文件');
    } finally {
      elements.importFile.value = '';
    }
  }

  elements.newNoteButton.addEventListener('click', createNewNote);
  elements.emptyNewButton.addEventListener('click', createNewNote);
  elements.searchInput.addEventListener('input', (event) => { query = event.target.value; render(); });
  elements.noteTitle.addEventListener('input', (event) => updateCurrent({ title: event.target.value }));
  elements.noteTitle.addEventListener('blur', () => {
    const note = currentNote();
    if (note) elements.noteTitle.value = note.title;
  });
  elements.noteBody.addEventListener('input', (event) => updateCurrent({ body: event.target.value }));
  elements.pinNoteButton.addEventListener('click', () => {
    const note = currentNote();
    if (!note) return;
    updateCurrent({ pinned: !note.pinned }, { immediate: true });
    elements.pinNoteButton.setAttribute('aria-pressed', String(!note.pinned));
    showToast(note.pinned ? '已取消固定' : '便签已固定到列表顶部');
  });
  elements.duplicateButton.addEventListener('click', () => {
    const note = currentNote();
    if (!note) return;
    const copy = Core.duplicateNote(note);
    notes.push(copy);
    selectedId = copy.id;
    scope = 'active';
    updateScopeButtons();
    persist();
    render();
    showToast('已复制便签');
  });
  elements.archiveButton.addEventListener('click', () => {
    const note = currentNote();
    if (!note) return;
    const restoring = note.archived;
    updateCurrent({ archived: !note.archived, pinned: restoring ? note.pinned : false }, { immediate: true });
    render();
    showToast(restoring ? '便签已移出归档' : '便签已归档');
  });
  elements.deleteButton.addEventListener('click', () => {
    const note = currentNote();
    if (!note || !window.confirm(`永久删除“${note.title}”？此操作无法撤销。`)) return;
    notes = notes.filter((entry) => entry.id !== note.id);
    selectedId = null;
    persist();
    render();
    showToast('便签已删除');
  });
  document.querySelectorAll('.color-swatch').forEach((button) => {
    button.addEventListener('click', () => updateCurrent({ color: button.dataset.color }, { immediate: true }));
  });
  document.querySelectorAll('.scope-tab').forEach((button) => {
    button.addEventListener('click', () => {
      scope = button.dataset.scope;
      updateScopeButtons();
      render();
    });
  });
  elements.alwaysOnTopButton.addEventListener('click', toggleWindowPin);
  elements.compactButton.addEventListener('click', () => setCompact(!compact, true));
  elements.exportButton.addEventListener('click', exportBackup);
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => importBackup(elements.importFile.files[0]));

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      createNewNote();
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      toggleWindowPin();
    }
  });

  async function initializeRuntime() {
    const status = document.querySelector('.runtime-status');
    if (!desktop || typeof desktop.getWindowState !== 'function') {
      elements.runtimeLabel.textContent = '网页演示 · 本地存储';
      setCompact(compact, false);
      return;
    }
    status.classList.add('is-desktop');
    elements.runtimeLabel.textContent = `Electron 桌面模式 · ${desktop.platform}`;
    try {
      const state = await desktop.getWindowState();
      setWindowPinned(state.alwaysOnTop);
      setCompact(state.compact, false);
    } catch (error) {
      setCompact(compact, false);
    }
  }

  updateScopeButtons();
  render();
  initializeRuntime();
})();
