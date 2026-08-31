(function startGalley() {
  'use strict';

  const Core = window.GalleyCore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const params = new URLSearchParams(location.search);
  const NAME_KEY = 'galley74:member-name';
  const RECENT_KEY = 'galley74:recent-rooms';
  const ROOM_DELETE_KEY = 'galley74:room-deleted';
  const room = Core.normalizeRoom(params.get('room'));
  const memberId = sessionStorage.getItem('galley74:member-id') || makeId('member');
  const memberName = Core.normalizeName(localStorage.getItem(NAME_KEY));
  sessionStorage.setItem('galley74:member-id', memberId);
  localStorage.setItem(NAME_KEY, memberName);

  const elements = {
    roomCode: $('#roomCode'),
    paperRoom: $('#paperRoom'),
    connectionPill: $('#connectionPill'),
    connectionText: $('#connectionText'),
    avatarStack: $('#avatarStack'),
    memberCount: $('#memberCount'),
    identityLabel: $('#identityLabel'),
    title: $('#documentTitle'),
    editor: $('#editor'),
    saveState: $('#saveState'),
    wordCount: $('#wordCount'),
    charCount: $('#charCount'),
    drawerWordCount: $('#drawerWordCount'),
    drawerRevision: $('#drawerRevision'),
    currentFileHeading: $('#currentFileHeading'),
    recentList: $('#recentList'),
    selectionQuote: $('#selectionQuote'),
    commentInput: $('#commentInput'),
    commentCounter: $('#commentCounter'),
    commentList: $('#commentList'),
    openCommentCount: $('#openCommentCount'),
    versionCount: $('#versionCount'),
    versionList: $('#versionList'),
    commentsPanel: $('#commentsPanel'),
    versionsPanel: $('#versionsPanel'),
    commentsTab: $('#commentsTab'),
    versionsTab: $('#versionsTab'),
    roomDialog: $('#roomDialog'),
    roomInput: $('#roomInput'),
    memberNameInput: $('#memberNameInput'),
    wsInput: $('#wsInput'),
    restoreDialog: $('#restoreDialog'),
    restoreDialogTitle: $('#restoreDialogTitle'),
    restoreDialogText: $('#restoreDialogText'),
    restoreConfirmButton: $('#restoreConfirmButton'),
    deleteDialog: $('#deleteDialog'),
    deleteScopeText: $('#deleteScopeText'),
    deleteRoomCode: $('#deleteRoomCode'),
    deleteConfirmInput: $('#deleteConfirmInput'),
    deleteConfirmButton: $('#deleteConfirmButton'),
    toast: $('#toast'),
  };

  let state = loadLocalState();
  let remoteVersions = [];
  let members = [{ id: memberId, name: memberName, joinedAt: new Date().toISOString() }];
  let selectedQuote = '';
  let commentFilter = 'open';
  let pendingRestoreRevision = null;
  let restoreDialogMode = null;
  let saveTimer = null;
  let toastTimer = null;
  let socket = null;
  let socketJoined = false;
  let socketPending = false;
  let deletePending = false;
  let defaultRestorePending = false;
  let pendingDraft = null;
  let dirtyAfterPending = false;
  let reconnectTimer = null;
  let reconnectDelay = 1200;
  let localChannel = null;
  let presenceTimer = null;
  let localMembers = new Map();
  let connectionMode = 'local';
  let activePane = 'editor';
  let lastDeleteRevision = -1;
  let roomDeleted = false;
  const wsEndpoint = inferWebSocketEndpoint();

  function makeId(prefix) {
    const random = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  }

  function documentKey() {
    return `galley74:document:${room}`;
  }

  function cleanStoredHistory(history) {
    if (!Array.isArray(history)) return [];
    const valid = [];
    for (const raw of history.slice(-Core.LIMITS.history)) {
      if (!raw || !Number.isInteger(Number(raw.revision))) continue;
      const checked = Core.validateDocumentInput(raw);
      if (!checked.ok) continue;
      valid.push({
        revision: Number(raw.revision),
        ...checked.value,
        updatedAt: validIso(raw.updatedAt),
        updatedBy: Core.normalizeName(raw.updatedBy),
      });
    }
    return valid;
  }

  function validIso(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function loadLocalState() {
    const initial = Core.createInitialState(room);
    try {
      const raw = JSON.parse(localStorage.getItem(documentKey()));
      if (!raw) return initial;
      const checked = Core.validateDocumentInput(raw);
      if (!checked.ok) return initial;
      return {
        ...initial,
        ...checked.value,
        revision: Number.isInteger(Number(raw.revision)) ? Math.max(0, Number(raw.revision)) : 0,
        updatedAt: validIso(raw.updatedAt),
        updatedBy: raw.updatedBy ? Core.normalizeName(raw.updatedBy) : '',
        history: cleanStoredHistory(raw.history),
      };
    } catch {
      return initial;
    }
  }

  function persistState({ broadcast = true } = {}) {
    if (roomDeleted) return;
    try {
      localStorage.setItem(documentKey(), JSON.stringify(state));
      rememberRoom();
      if (broadcast && localChannel) {
        localChannel.postMessage({ type: 'state:changed', source: memberId, revision: state.revision });
      }
    } catch {
      setSaveState('error', '本机存储已满');
      toast('本机存储空间不足，请先导出备份。');
    }
  }

  function readRecentRooms() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function rememberRoom() {
    const next = [
      { room, title: state.title, updatedAt: state.updatedAt },
      ...readRecentRooms().filter((item) => item && item.room !== room),
    ].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    renderRecentRooms(next);
  }

  function renderRecentRooms(recent = readRecentRooms()) {
    elements.recentList.replaceChildren();
    if (!recent.length) {
      const empty = document.createElement('p');
      empty.className = 'recent-empty';
      empty.textContent = '打开或新建房间后，会在这里保留最近记录。';
      elements.recentList.append(empty);
      return;
    }
    for (const item of recent) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-item';
      button.dataset.room = Core.normalizeRoom(item.room);
      const dot = document.createElement('i');
      const copy = document.createElement('span');
      const title = document.createElement('b');
      title.textContent = item.title || '未命名文档';
      const meta = document.createElement('small');
      meta.textContent = `${button.dataset.room} · ${relativeTime(item.updatedAt)}`;
      copy.append(title, meta);
      const arrow = document.createElement('span');
      arrow.textContent = item.room === room ? '当前' : '›';
      button.append(dot, copy, arrow);
      button.disabled = item.room === room;
      elements.recentList.append(button);
    }
  }

  function inferWebSocketEndpoint() {
    const explicit = params.get('ws');
    if (explicit) {
      try {
        const url = new URL(explicit);
        if (url.protocol === 'http:') url.protocol = 'ws:';
        if (url.protocol === 'https:') url.protocol = 'wss:';
        if (!['ws:', 'wss:'].includes(url.protocol)) return '';
        return url.toString();
      } catch {
        return '';
      }
    }
    if (['localhost', '127.0.0.1', '::1'].includes(location.hostname) && /^https?:$/.test(location.protocol)) {
      return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    }
    return '';
  }

  function setConnection(mode, text) {
    connectionMode = mode;
    elements.connectionPill.dataset.state = mode;
    elements.connectionText.textContent = text;
    if (elements.deleteDialog.open) updateDeleteConfirmation();
    if (elements.restoreDialog.open) updateRestoreConfirmation();
  }

  function forgetRoom() {
    try {
      localStorage.removeItem(documentKey());
      const recent = readRecentRooms().filter((item) => item && Core.normalizeRoom(item.room) !== room);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      renderRecentRooms(recent);
    } catch {
      // Navigation still proceeds if the browser blocks local storage cleanup.
    }
  }

  function makeRoomCode() {
    const taken = new Set([room, ...readRecentRooms().map((item) => Core.normalizeRoom(item && item.room))]);
    let nextRoom;
    do {
      nextRoom = `DOC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    } while (taken.has(nextRoom));
    return nextRoom;
  }

  function roomUrl(nextRoom) {
    const url = new URL(location.href);
    url.searchParams.set('room', Core.normalizeRoom(nextRoom));
    return url.toString();
  }

  function setSaveState(mode, text) {
    elements.saveState.dataset.state = mode;
    $('span', elements.saveState).textContent = text;
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['H1', 'H2', 'H3', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'CODE', 'PRE', 'DIV']);
    const nodes = [...template.content.querySelectorAll('*')];
    for (const node of nodes) {
      if (!allowed.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        continue;
      }
      for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
    }
    return template.innerHTML.slice(0, Core.LIMITS.content);
  }

  function collectDraft() {
    return {
      title: elements.title.value,
      content: sanitizeHtml(elements.editor.innerHTML),
      comments: state.comments.map((comment) => ({ ...comment })),
    };
  }

  function queueSave(immediate = false) {
    if (roomDeleted) return;
    clearTimeout(saveTimer);
    setSaveState('saving', '待同步');
    saveTimer = setTimeout(flushDraft, immediate ? 0 : 240);
  }

  function flushDraft() {
    if (roomDeleted) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const draft = collectDraft();
    const checked = Core.validateDocumentInput(draft);
    if (!checked.ok) {
      setSaveState('error', '无法保存');
      toast('文档包含无法保存的内容，请撤销刚才的粘贴。');
      return;
    }
    if (connectionMode === 'online' && socket?.readyState === WebSocket.OPEN && socketJoined) {
      if (socketPending) {
        dirtyAfterPending = true;
        pendingDraft = checked.value;
        return;
      }
      socketPending = true;
      pendingDraft = checked.value;
      socket.send(JSON.stringify({
        v: Core.PROTOCOL_VERSION,
        type: 'document:update',
        baseRevision: state.revision,
        ...checked.value,
      }));
      setSaveState('saving', '同步中');
      return;
    }
    applyLocalDraft(checked.value);
  }

  function applyLocalDraft(draft) {
    const stored = loadLocalState();
    const base = stored.revision > state.revision ? stored : state;
    const result = Core.applyDocumentUpdate(base, {
      baseRevision: base.revision,
      ...draft,
    }, { id: memberId, name: memberName }, new Date().toISOString());
    if (!result.ok) {
      setSaveState('error', '保存冲突');
      toast('发现更新冲突，请刷新房间后重试。');
      return;
    }
    state = result.state;
    remoteVersions = [];
    persistState();
    renderState({ replaceEditor: false });
    setSaveState('saved', '已保存本机');
  }

  function captureCurrentVersion() {
    return {
      revision: state.revision,
      title: state.title,
      content: state.content,
      comments: state.comments.map((comment) => ({ ...comment })),
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
    };
  }

  function applyClientSnapshot(snapshot, { replaceEditor = true, clearHistory = false, broadcast } = {}) {
    const checked = Core.validateDocumentInput(snapshot);
    if (!checked.ok) return;
    let history = clearHistory ? [] : (state.history || []);
    if (!clearHistory && Number(snapshot.revision) > state.revision) {
      history = [...history, captureCurrentVersion()].slice(-Core.LIMITS.history);
    }
    state = {
      ...state,
      ...checked.value,
      revision: Math.max(0, Number(snapshot.revision) || 0),
      updatedAt: validIso(snapshot.updatedAt),
      updatedBy: snapshot.updatedBy ? Core.normalizeName(snapshot.updatedBy) : '',
      history,
    };
    remoteVersions = Array.isArray(snapshot.versions) ? snapshot.versions : [];
    persistState({ broadcast: broadcast ?? connectionMode !== 'online' });
    renderState({ replaceEditor });
  }

  function renderState({ replaceEditor = true } = {}) {
    elements.roomCode.textContent = room;
    elements.paperRoom.textContent = room;
    elements.identityLabel.textContent = memberName;
    if (replaceEditor) {
      const selection = elements.editor.contains(document.activeElement) ? selectionOffset() : null;
      elements.title.value = state.title;
      resizeTitle();
      elements.editor.innerHTML = sanitizeHtml(state.content);
      if (selection != null) restoreSelectionOffset(selection);
    }
    elements.currentFileHeading.textContent = elements.title.value || state.title;
    elements.drawerRevision.textContent = state.revision;
    updateCounts();
    renderComments();
    renderVersions();
    rememberRoom();
  }

  function updateCounts() {
    const text = elements.editor.textContent.replace(/\s+/g, ' ').trim();
    const chars = text.length;
    const words = /[\u3400-\u9fff]/.test(text)
      ? text.replace(/\s/g, '').length
      : (text.match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length;
    elements.wordCount.textContent = `${words} 字`;
    elements.charCount.textContent = `${chars} 字符`;
    elements.drawerWordCount.textContent = words;
    elements.currentFileHeading.textContent = elements.title.value.trim() || '未命名文档';
  }

  function resizeTitle() {
    elements.title.style.height = 'auto';
    elements.title.style.height = `${elements.title.scrollHeight}px`;
  }

  function renderMembers() {
    elements.avatarStack.replaceChildren();
    for (const member of members.slice(0, 5).reverse()) {
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.title = member.name;
      avatar.style.setProperty('--avatar', avatarColor(member.id));
      avatar.textContent = [...member.name][0] || '匿';
      elements.avatarStack.append(avatar);
    }
    elements.memberCount.textContent = `${members.length} 人在线`;
  }

  function avatarColor(value) {
    const palette = ['#f1c84b', '#8fc7ff', '#f49e93', '#99d8bd', '#c3aff1', '#ffbc78'];
    let hash = 0;
    for (const character of String(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function renderComments() {
    const open = state.comments.filter((comment) => !comment.resolved).length;
    elements.openCommentCount.textContent = open;
    elements.commentList.replaceChildren();
    const list = state.comments
      .filter((comment) => commentFilter === 'all' || !comment.resolved)
      .slice()
      .reverse();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-panel';
      const strong = document.createElement('strong');
      strong.textContent = commentFilter === 'open' && state.comments.length ? '批注都处理完了' : '还没有批注';
      const copy = document.createElement('span');
      copy.textContent = '选中正文中的句子，再写下校对意见。';
      empty.append(strong, copy);
      elements.commentList.append(empty);
      return;
    }
    for (const comment of list) elements.commentList.append(createCommentCard(comment));
  }

  function createCommentCard(comment) {
    const card = document.createElement('article');
    card.className = `comment-card${comment.resolved ? ' resolved' : ''}`;
    const header = document.createElement('header');
    const author = document.createElement('b');
    author.textContent = comment.author;
    const time = document.createElement('time');
    time.dateTime = comment.createdAt;
    time.textContent = relativeTime(comment.createdAt);
    header.append(author, time);
    card.append(header);
    if (comment.quote) {
      const quote = document.createElement('blockquote');
      quote.textContent = `“${comment.quote}”`;
      card.append(quote);
    }
    const body = document.createElement('p');
    body.textContent = comment.text;
    card.append(body);
    const footer = document.createElement('footer');
    const action = document.createElement('button');
    action.type = 'button';
    action.dataset.commentId = comment.id;
    action.textContent = comment.resolved ? '重新打开' : '标记已处理';
    footer.append(action);
    card.append(footer);
    return card;
  }

  function versionEntries() {
    if (connectionMode === 'online' && remoteVersions.length) return remoteVersions;
    return [...(state.history || [])].reverse().map((version) => ({
      revision: version.revision,
      title: version.title,
      updatedAt: version.updatedAt,
      updatedBy: version.updatedBy,
    }));
  }

  function renderVersions() {
    const versions = versionEntries();
    elements.versionCount.textContent = versions.length;
    elements.versionList.replaceChildren();
    const current = document.createElement('div');
    current.className = 'version-item';
    current.append(
      versionBadge(state.revision),
      versionCopy(state.title, `当前 · ${relativeTime(state.updatedAt)}${state.updatedBy ? ` · ${state.updatedBy}` : ''}`),
    );
    const currentLabel = document.createElement('span');
    currentLabel.textContent = '当前';
    currentLabel.className = 'eyebrow';
    current.append(currentLabel);
    elements.versionList.append(current);
    for (const version of versions) {
      const item = document.createElement('div');
      item.className = 'version-item';
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.dataset.restoreRevision = version.revision;
      restore.textContent = '恢复';
      item.append(
        versionBadge(version.revision),
        versionCopy(version.title, `${relativeTime(version.updatedAt)}${version.updatedBy ? ` · ${version.updatedBy}` : ''}`),
        restore,
      );
      elements.versionList.append(item);
    }
  }

  function versionBadge(revision) {
    const badge = document.createElement('span');
    badge.className = 'version-number';
    badge.textContent = `r${revision}`;
    return badge;
  }

  function versionCopy(titleText, metaText) {
    const copy = document.createElement('span');
    copy.className = 'version-copy';
    const title = document.createElement('b');
    title.textContent = titleText || '未命名文档';
    const meta = document.createElement('span');
    meta.textContent = metaText;
    copy.append(title, meta);
    return copy;
  }

  function relativeTime(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '刚刚';
    const difference = Date.now() - timestamp;
    const minutes = Math.floor(Math.abs(difference) / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  }

  function selectionOffset() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!elements.editor.contains(range.startContainer)) return null;
    const before = range.cloneRange();
    before.selectNodeContents(elements.editor);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  }

  function restoreSelectionOffset(offset) {
    const selection = window.getSelection();
    const walker = document.createTreeWalker(elements.editor, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let node = walker.nextNode();
    while (node) {
      if (remaining <= node.nodeValue.length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= node.nodeValue.length;
      node = walker.nextNode();
    }
  }

  function captureQuote() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!elements.editor.contains(range.commonAncestorContainer)) return;
    selectedQuote = selection.toString().replace(/\s+/g, ' ').trim().slice(0, Core.LIMITS.quote);
    elements.selectionQuote.textContent = selectedQuote ? `“${selectedQuote}”` : '先在正文中选中一段文字';
  }

  function addComment() {
    const text = elements.commentInput.value.replace(/\s+/g, ' ').trim();
    if (!text) return toast('先写下要提醒同伴的校对意见。');
    state.comments.push({
      id: makeId('comment'),
      text: text.slice(0, Core.LIMITS.commentText),
      quote: selectedQuote,
      author: memberName,
      createdAt: new Date().toISOString(),
      resolved: false,
    });
    elements.commentInput.value = '';
    elements.commentCounter.textContent = '0 / 1000';
    selectedQuote = '';
    elements.selectionQuote.textContent = '先在正文中选中一段文字';
    renderComments();
    queueSave(true);
    toast('批注已添加。');
  }

  function toggleComment(id) {
    const comment = state.comments.find((item) => item.id === id);
    if (!comment) return;
    comment.resolved = !comment.resolved;
    if (comment.resolved) comment.resolvedAt = new Date().toISOString();
    else delete comment.resolvedAt;
    renderComments();
    queueSave(true);
  }

  function openRestoreDialog(revision) {
    if (saveTimer) flushDraft();
    restoreDialogMode = 'version';
    pendingRestoreRevision = Number(revision);
    elements.restoreDialogTitle.textContent = '恢复这个版本？';
    elements.restoreDialogText.textContent = `将 r${pendingRestoreRevision} 恢复为新版本。当前内容会先保留在历史记录中。`;
    elements.restoreConfirmButton.textContent = '恢复版本';
    elements.restoreConfirmButton.classList.add('button-proof');
    elements.restoreConfirmButton.classList.remove('button-primary');
    updateRestoreConfirmation();
    elements.restoreDialog.showModal();
  }

  function defaultDraft() {
    const initial = Core.createInitialState(room);
    return {
      title: initial.title,
      content: initial.content,
      comments: [],
    };
  }

  function updateRestoreConfirmation() {
    const waitingForSync = connectionMode === 'online' && socketPending && !defaultRestorePending;
    elements.restoreConfirmButton.disabled = waitingForSync;
    if (restoreDialogMode === 'default') {
      elements.restoreDialogText.textContent = `当前内容会保留在版本记录中，再恢复 GALLEY/74 的默认标题与正文。${waitingForSync ? ' 当前修改同步完成后才能恢复。' : ''}`;
    }
  }

  function openDefaultRestoreDialog() {
    if (saveTimer) flushDraft();
    restoreDialogMode = 'default';
    pendingRestoreRevision = null;
    elements.restoreDialogTitle.textContent = '恢复默认发布稿？';
    elements.restoreConfirmButton.textContent = '恢复默认稿';
    elements.restoreConfirmButton.classList.add('button-primary');
    elements.restoreConfirmButton.classList.remove('button-proof');
    updateRestoreConfirmation();
    elements.restoreDialog.showModal();
  }

  function cancelRestoreConfirmationForUpdate() {
    if (!elements.restoreDialog.open) return;
    const wasDefault = restoreDialogMode === 'default';
    elements.restoreDialog.close();
    restoreDialogMode = null;
    pendingRestoreRevision = null;
    toast(wasDefault
      ? '同伴刚更新了文档，请查看最新稿后重新确认恢复默认稿。'
      : '文档版本刚刚更新，请重新选择要恢复的版本。');
  }

  function submitRestore(event) {
    event.preventDefault();
    if (elements.restoreConfirmButton.disabled) return;
    const mode = restoreDialogMode;
    elements.restoreDialog.close();
    restoreDialogMode = null;
    if (mode === 'default') restoreDefaultDraft();
    else restorePendingVersion();
  }

  function restoreDefaultDraft() {
    const draft = defaultDraft();
    if (connectionMode === 'online' && socket?.readyState === WebSocket.OPEN && socketJoined) {
      defaultRestorePending = true;
      socketPending = true;
      pendingDraft = draft;
      dirtyAfterPending = false;
      elements.title.value = draft.title;
      resizeTitle();
      elements.editor.innerHTML = sanitizeHtml(draft.content);
      updateCounts();
      socket.send(JSON.stringify({
        v: Core.PROTOCOL_VERSION,
        type: 'document:update',
        baseRevision: state.revision,
        ...draft,
      }));
      setSaveState('saving', '恢复默认稿');
      return;
    }

    const stored = loadLocalState();
    if (stored.revision !== state.revision) {
      state = stored;
      renderState();
      setSaveState('saved', '已收到同伴更新');
      toast('同伴刚更新了文档，请查看最新稿后重新确认恢复默认稿。');
      return;
    }
    const result = Core.applyDocumentUpdate(state, {
      baseRevision: state.revision,
      ...draft,
    }, { id: memberId, name: memberName }, new Date().toISOString());
    if (!result.ok) return toast('文档刚刚发生变化，请重新确认恢复默认稿。');
    state = result.state;
    remoteVersions = [];
    persistState();
    renderState();
    setSaveState('saved', '默认稿已恢复');
    toast('默认发布稿已恢复，原稿已保留在版本记录中。');
  }

  function restorePendingVersion() {
    if (!Number.isInteger(pendingRestoreRevision)) return;
    if (connectionMode === 'online' && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        v: Core.PROTOCOL_VERSION,
        type: 'version:restore',
        baseRevision: state.revision,
        targetRevision: pendingRestoreRevision,
      }));
      setSaveState('saving', '恢复中');
    } else {
      const result = Core.restoreVersion(state, {
        baseRevision: state.revision,
        targetRevision: pendingRestoreRevision,
      }, { id: memberId, name: memberName }, new Date().toISOString());
      if (!result.ok) return toast('这个版本已不可用，请刷新版本列表。');
      state = result.state;
      persistState();
      renderState();
      setSaveState('saved', '已恢复');
      toast(`已把 r${pendingRestoreRevision} 恢复为新版本。`);
    }
    pendingRestoreRevision = null;
  }

  function isClearedDraft(candidate) {
    return candidate
      && candidate.title === '未命名文档'
      && candidate.content === ''
      && Array.isArray(candidate.comments)
      && candidate.comments.length === 0
      && (!candidate.history || candidate.history.length === 0)
      && (!candidate.versions || candidate.versions.length === 0);
  }

  function updateDeleteConfirmation() {
    const matchesRoom = elements.deleteConfirmInput.value.trim().toUpperCase() === room;
    const waitingForSync = connectionMode === 'online' && socketPending && !deletePending;
    elements.deleteConfirmButton.disabled = !matchesRoom || waitingForSync;
    elements.deleteScopeText.textContent = connectionMode === 'online'
      ? `房间 ${room}、正文、批注和全部版本都会被删除；所有在线成员将一起进入新房间。${waitingForSync ? ' 当前修改同步完成后才能删除。' : ''}`
      : `本浏览器中的房间 ${room}、正文、批注和全部版本都会被删除；同房间标签页将一起进入新房间。`;
  }

  function openDeleteDialog() {
    if (saveTimer) flushDraft();
    elements.deleteRoomCode.textContent = room;
    elements.deleteConfirmInput.value = '';
    updateDeleteConfirmation();
    elements.deleteDialog.showModal();
    requestAnimationFrame(() => elements.deleteConfirmInput.focus());
  }

  function cancelDeleteConfirmationForUpdate() {
    if (!elements.deleteDialog.open) return;
    elements.deleteDialog.close();
    elements.deleteConfirmInput.value = '';
    updateDeleteConfirmation();
    toast('同伴刚更新了文档，请查看最新稿后重新确认删除。');
  }

  function clearDraftInteractions() {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingDraft = null;
    dirtyAfterPending = false;
    pendingRestoreRevision = null;
    restoreDialogMode = null;
    selectedQuote = '';
    elements.selectionQuote.textContent = '先在正文中选中一段文字';
    elements.commentInput.value = '';
    elements.commentCounter.textContent = '0 / 1000';
  }

  function acceptDeletedSnapshot(snapshot, { fromSelf = false } = {}) {
    const revision = Math.max(0, Number(snapshot && snapshot.revision) || 0);
    if (revision < state.revision || revision === lastDeleteRevision || !isClearedDraft(snapshot)) return;
    lastDeleteRevision = revision;
    clearDraftInteractions();
    socketPending = false;
    deletePending = false;
    applyClientSnapshot(snapshot, { replaceEditor: true, clearHistory: true, broadcast: false });
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    if (elements.restoreDialog.open) elements.restoreDialog.close();
    updateDeleteConfirmation();
    updateRestoreConfirmation();
    setSaveState('saved', connectionMode === 'online' ? '删除已同步' : '已在本机删除');
    if (fromSelf) {
      showPane('editor');
      elements.editor.focus();
    }
    toast(fromSelf ? '协作稿已永久删除，房间已清空。' : '同伴已删除协作稿，房间已同步清空。');
  }

  function leaveDeletedRoom(nextRoom, { notifyLocal = false } = {}) {
    if (roomDeleted) return;
    const replacementRoom = Core.normalizeRoom(nextRoom);
    if (replacementRoom === room) return;
    const notification = {
      type: 'room:deleted',
      room,
      nextRoom: replacementRoom,
      source: memberId,
      at: Date.now(),
    };
    roomDeleted = true;
    clearTimeout(reconnectTimer);
    clearDraftInteractions();
    socketPending = false;
    deletePending = false;
    defaultRestorePending = false;
    if (elements.deleteDialog.open) elements.deleteDialog.close();
    if (elements.restoreDialog.open) elements.restoreDialog.close();
    if (notifyLocal) {
      localChannel?.postMessage(notification);
      try {
        localStorage.setItem(ROOM_DELETE_KEY, JSON.stringify(notification));
        localStorage.removeItem(ROOM_DELETE_KEY);
      } catch {
        // BroadcastChannel remains the primary same-browser transport.
      }
    }
    forgetRoom();
    setSaveState('saving', '正在进入新房间');
    toast('协作稿与房间号已删除，正在进入新房间…');
    stopLocalPresence();
    setTimeout(() => location.replace(roomUrl(replacementRoom)), 40);
  }

  function submitDeleteDocument(event) {
    event.preventDefault();
    if (elements.deleteConfirmInput.value.trim().toUpperCase() !== room || elements.deleteConfirmButton.disabled) return;
    if (connectionMode === 'online' && socket?.readyState === WebSocket.OPEN && socketJoined) {
      deletePending = true;
      socketPending = true;
      pendingDraft = null;
      dirtyAfterPending = false;
      elements.deleteDialog.close();
      socket.send(JSON.stringify({
        v: Core.PROTOCOL_VERSION,
        type: 'room:delete',
        baseRevision: state.revision,
        nextRoom: makeRoomCode(),
      }));
      setSaveState('saving', '删除中');
      return;
    }

    const stored = loadLocalState();
    if (stored.revision !== state.revision) {
      state = stored;
      renderState();
      setSaveState('saved', '已收到同伴更新');
      toast('同伴刚更新了文档，请查看最新稿后重新确认删除。');
      return;
    }
    leaveDeletedRoom(makeRoomCode(), { notifyLocal: true });
  }

  function connectWebSocket() {
    if (!wsEndpoint) return startLocalMode('本机协作');
    clearTimeout(reconnectTimer);
    stopLocalPresence();
    setConnection('connecting', '连接协作服务');
    const url = new URL(wsEndpoint);
    url.searchParams.set('room', room);
    socket = new WebSocket(url);
    socketJoined = false;
    socket.addEventListener('open', () => {
      reconnectDelay = 1200;
      socket.send(JSON.stringify({
        v: Core.PROTOCOL_VERSION,
        type: 'join',
        member: { id: memberId, name: memberName },
      }));
    });
    socket.addEventListener('message', handleSocketMessage);
    socket.addEventListener('close', () => {
      if (roomDeleted) return;
      if (defaultRestorePending) {
        defaultRestorePending = false;
        renderState();
      }
      socketJoined = false;
      socketPending = false;
      deletePending = false;
      startLocalMode('服务断开 · 本机协作');
      reconnectTimer = setTimeout(connectWebSocket, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.8, 12000);
    });
    socket.addEventListener('error', () => {
      if (roomDeleted) return;
      setConnection('error', '服务不可达');
    });
  }

  function handleSocketMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'snapshot') {
      const localDraft = collectDraft();
      const shouldUpload = state.revision > 0 && Number(message.state.revision) === 0;
      socketJoined = true;
      socketPending = false;
      setConnection('online', '跨设备在线');
      members = Array.isArray(message.members) ? message.members : members;
      renderMembers();
      applyClientSnapshot(message.state);
      if (shouldUpload) {
        elements.title.value = localDraft.title;
        elements.editor.innerHTML = localDraft.content;
        state.comments = localDraft.comments;
        queueSave(true);
      } else setSaveState('saved', '已同步');
      updateDeleteConfirmation();
      updateRestoreConfirmation();
      return;
    }
    if (message.type === 'presence') {
      members = Array.isArray(message.members) ? message.members : members;
      renderMembers();
      return;
    }
    if (message.type === 'document:update' || message.type === 'version:restored') {
      const fromSelf = message.source === memberId;
      const completedDefaultRestore = defaultRestorePending && fromSelf && message.type === 'document:update';
      if (completedDefaultRestore) defaultRestorePending = false;
      socketPending = false;
      pendingDraft = null;
      applyClientSnapshot(message.state, {
        replaceEditor: !fromSelf || message.type === 'version:restored' || (completedDefaultRestore && !dirtyAfterPending),
      });
      setSaveState('saved', completedDefaultRestore ? '默认稿已恢复' : '已同步');
      updateDeleteConfirmation();
      updateRestoreConfirmation();
      if (!fromSelf) {
        cancelDeleteConfirmationForUpdate();
        cancelRestoreConfirmationForUpdate();
      }
      if (message.type === 'version:restored') toast('历史版本已恢复。');
      if (completedDefaultRestore) toast('默认发布稿已恢复，原稿已保留在版本记录中。');
      if (dirtyAfterPending) {
        dirtyAfterPending = false;
        queueSave(true);
      }
      return;
    }
    if (message.type === 'document:deleted') {
      acceptDeletedSnapshot(message.state, { fromSelf: message.source === memberId });
      return;
    }
    if (message.type === 'room:deleted' && Core.normalizeRoom(message.room) === room) {
      leaveDeletedRoom(message.nextRoom);
      return;
    }
    if (message.type === 'document:conflict') {
      if (deletePending) {
        socketPending = false;
        deletePending = false;
        pendingDraft = null;
        dirtyAfterPending = false;
        applyClientSnapshot(message.state);
        updateDeleteConfirmation();
        setSaveState('saved', '已同步最新稿');
        toast('同伴刚更新了文档，请确认最新内容后再次删除。');
        return;
      }
      if (defaultRestorePending) {
        socketPending = false;
        defaultRestorePending = false;
        pendingDraft = null;
        dirtyAfterPending = false;
        applyClientSnapshot(message.state);
        updateDeleteConfirmation();
        updateRestoreConfirmation();
        setSaveState('saved', '已同步最新稿');
        toast('同伴先提交了更新，默认发布稿未恢复，请查看后重试。');
        return;
      }
      const draft = pendingDraft || collectDraft();
      socketPending = false;
      pendingDraft = null;
      applyClientSnapshot(message.state);
      elements.title.value = draft.title;
      elements.editor.innerHTML = draft.content;
      state.comments = draft.comments;
      dirtyAfterPending = false;
      queueSave(true);
      toast('同伴先提交了更新，已在最新版本上重新同步你的修改。');
      return;
    }
    if (message.type === 'error') {
      if (defaultRestorePending) {
        defaultRestorePending = false;
        renderState();
      }
      socketPending = false;
      deletePending = false;
      updateDeleteConfirmation();
      updateRestoreConfirmation();
      setSaveState('error', '同步失败');
      toast(message.message || '协作服务未能处理这次操作。');
    }
  }

  function startLocalMode(label) {
    setConnection('local', label);
    if (localChannel) return;
    if ('BroadcastChannel' in window) {
      localChannel = new BroadcastChannel(`galley74:${room}`);
      localChannel.addEventListener('message', handleLocalMessage);
    }
    localMembers = new Map([[memberId, { id: memberId, name: memberName, joinedAt: new Date().toISOString(), seenAt: Date.now() }]]);
    publishPresence('presence');
    presenceTimer = setInterval(() => {
      publishPresence('presence');
      pruneLocalMembers();
    }, 4000);
    renderLocalMembers();
  }

  function stopLocalPresence() {
    clearInterval(presenceTimer);
    presenceTimer = null;
    if (localChannel) {
      localChannel.postMessage({ type: 'bye', source: memberId });
      localChannel.close();
      localChannel = null;
    }
  }

  function publishPresence(type) {
    localChannel?.postMessage({ type, source: memberId, member: { id: memberId, name: memberName, joinedAt: new Date().toISOString() } });
  }

  function handleLocalMessage(event) {
    const message = event.data || {};
    if (message.type === 'room:deleted' && Core.normalizeRoom(message.room) === room) {
      leaveDeletedRoom(message.nextRoom);
      return;
    }
    if (message.source === memberId) return;
    if (message.type === 'presence' && message.member) {
      localMembers.set(message.source, { ...message.member, seenAt: Date.now() });
      renderLocalMembers();
      return;
    }
    if (message.type === 'bye') {
      localMembers.delete(message.source);
      renderLocalMembers();
      return;
    }
    if (message.type === 'document:deleted' && Number(message.revision) >= state.revision) {
      const stored = loadLocalState();
      acceptDeletedSnapshot(stored);
      return;
    }
    if (message.type === 'state:changed' && Number(message.revision) > state.revision) {
      cancelDeleteConfirmationForUpdate();
      cancelRestoreConfirmationForUpdate();
      if (saveTimer) flushDraft();
      else {
        const stored = loadLocalState();
        if (stored.revision > state.revision) {
          state = stored;
          renderState();
          setSaveState('saved', '已收到同伴更新');
        }
      }
    }
  }

  function pruneLocalMembers() {
    const now = Date.now();
    for (const [id, member] of localMembers) {
      if (id !== memberId && now - member.seenAt > 11000) localMembers.delete(id);
    }
    renderLocalMembers();
  }

  function renderLocalMembers() {
    members = [...localMembers.values()];
    renderMembers();
  }

  function openRoomDialog() {
    elements.roomInput.value = room;
    elements.memberNameInput.value = memberName;
    elements.wsInput.value = params.get('ws') || '';
    elements.roomDialog.showModal();
  }

  function submitRoom(event) {
    event.preventDefault();
    const nextRoom = Core.normalizeRoom(elements.roomInput.value);
    const nextName = Core.normalizeName(elements.memberNameInput.value);
    localStorage.setItem(NAME_KEY, nextName);
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('room', nextRoom);
    const ws = elements.wsInput.value.trim();
    if (ws) nextUrl.searchParams.set('ws', ws);
    else nextUrl.searchParams.delete('ws');
    location.href = nextUrl.toString();
  }

  async function copyText(text, success) {
    try {
      await navigator.clipboard.writeText(text);
      toast(success);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      toast(copied ? success : `请手动复制：${text}`);
    }
  }

  function shareUrl() {
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    url.searchParams.delete('_ts');
    return url.toString();
  }

  function download(filename, type, content) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    const data = {
      app: 'GALLEY/74',
      formatVersion: 1,
      room,
      title: state.title,
      content: sanitizeHtml(state.content),
      comments: state.comments,
      revision: state.revision,
      exportedAt: new Date().toISOString(),
    };
    download(`galley-${room.toLowerCase()}-${dateStamp()}.json`, 'application/json;charset=utf-8', JSON.stringify(data, null, 2));
    toast('JSON 备份已导出。');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function exportHtml() {
    const html = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.title)}</title><style>body{max-width:760px;margin:48px auto;padding:0 24px;color:#282726;background:#fffdf6;font:18px/1.8 Georgia,"Songti SC",serif}h1,h2,h3{line-height:1.2}blockquote{padding-left:18px;border-left:4px solid #d64a3a;color:#5c5247}footer{margin-top:48px;padding-top:12px;border-top:1px solid #ccc;font:12px sans-serif;color:#777}</style></head><body><h1>${escapeHtml(state.title)}</h1>${sanitizeHtml(state.content)}<footer>由 GALLEY/74 导出 · ${escapeHtml(room)} · ${new Date().toLocaleString('zh-CN')}</footer></body></html>`;
    download(`galley-${room.toLowerCase()}-${dateStamp()}.html`, 'text/html;charset=utf-8', html);
    toast('HTML 文档已导出。');
  }

  function dateStamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) return toast('备份文件超过 1MB，无法导入。');
    try {
      const parsed = JSON.parse(await file.text());
      const checked = Core.validateDocumentInput(parsed);
      if (!checked.ok) throw new Error(checked.code);
      elements.title.value = checked.value.title;
      elements.editor.innerHTML = sanitizeHtml(checked.value.content);
      state.comments = checked.value.comments;
      updateCounts();
      renderComments();
      queueSave(true);
      toast('备份已导入并保存为新版本。');
    } catch {
      toast('无法导入：请选择由 GALLEY/74 导出的有效 JSON 备份。');
    }
  }

  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2800);
  }

  function showMarginTab(tab) {
    const comments = tab === 'comments';
    elements.commentsTab.setAttribute('aria-selected', String(comments));
    elements.versionsTab.setAttribute('aria-selected', String(!comments));
    elements.commentsPanel.hidden = !comments;
    elements.versionsPanel.hidden = comments;
  }

  function showPane(pane) {
    activePane = pane;
    $$('.mobile-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.pane === pane));
    $$('.workspace > .pane').forEach((element) => element.classList.toggle('active', element.dataset.pane === pane));
  }

  function bindEvents() {
    elements.editor.addEventListener('input', () => { updateCounts(); queueSave(); });
    elements.editor.addEventListener('mouseup', captureQuote);
    elements.editor.addEventListener('keyup', captureQuote);
    elements.title.addEventListener('input', () => { resizeTitle(); updateCounts(); queueSave(); });
    elements.commentInput.addEventListener('input', () => { elements.commentCounter.textContent = `${elements.commentInput.value.length} / 1000`; });
    $('#addCommentButton').addEventListener('click', addComment);
    $('#selectionCommentButton').addEventListener('click', () => { showPane('margin'); showMarginTab('comments'); elements.commentInput.focus(); });
    $('.format-bar').addEventListener('mousedown', (event) => {
      const button = event.target.closest('[data-command]');
      if (!button) return;
      event.preventDefault();
      document.execCommand(button.dataset.command, false, button.dataset.value || null);
      elements.editor.focus();
      updateCounts();
      queueSave();
    });
    elements.commentList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-comment-id]');
      if (button) toggleComment(button.dataset.commentId);
    });
    $('.comment-filter').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      commentFilter = button.dataset.filter;
      $$('.comment-filter button').forEach((item) => item.classList.toggle('active', item === button));
      renderComments();
    });
    elements.versionList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-restore-revision]');
      if (button) openRestoreDialog(button.dataset.restoreRevision);
    });
    elements.commentsTab.addEventListener('click', () => showMarginTab('comments'));
    elements.versionsTab.addEventListener('click', () => showMarginTab('versions'));
    $('#roomButton').addEventListener('click', openRoomDialog);
    $('#identityButton').addEventListener('click', openRoomDialog);
    $('#roomForm').addEventListener('submit', submitRoom);
    $('#restoreDefaultButton').addEventListener('click', openDefaultRestoreDialog);
    $('#deleteDocumentButton').addEventListener('click', openDeleteDialog);
    elements.deleteConfirmInput.addEventListener('input', updateDeleteConfirmation);
    $('#deleteForm').addEventListener('submit', submitDeleteDocument);
    $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close()));
    $('#restoreForm').addEventListener('submit', submitRestore);
    $('#shareButton').addEventListener('click', () => copyText(shareUrl(), '房间链接已复制。'));
    $('#copyRoomButton').addEventListener('click', () => copyText(room, '房间号已复制。'));
    $('#newDocumentButton').addEventListener('click', () => {
      location.href = roomUrl(makeRoomCode());
    });
    elements.recentList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-room]');
      if (!button || button.disabled) return;
      const url = new URL(location.href);
      url.searchParams.set('room', button.dataset.room);
      location.href = url.toString();
    });
    $('#exportJsonButton').addEventListener('click', exportJson);
    $('#exportHtmlButton').addEventListener('click', exportHtml);
    $('#importButton').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (event) => { importBackup(event.target.files[0]); event.target.value = ''; });
    $$('.mobile-tabs button').forEach((button) => button.addEventListener('click', () => showPane(button.dataset.pane)));
    window.addEventListener('storage', (event) => {
      if (event.key === ROOM_DELETE_KEY && event.newValue) {
        try {
          const message = JSON.parse(event.newValue);
          if (Core.normalizeRoom(message.room) === room) leaveDeletedRoom(message.nextRoom);
        } catch {
          // Ignore malformed events written by unrelated scripts.
        }
        return;
      }
      if (event.key !== documentKey() || connectionMode === 'online') return;
      const stored = loadLocalState();
      if (stored.revision <= state.revision) return;
      if (isClearedDraft(stored)) {
        acceptDeletedSnapshot(stored);
        return;
      }
      cancelDeleteConfirmationForUpdate();
      cancelRestoreConfirmationForUpdate();
      if (!saveTimer) { state = stored; renderState(); }
    });
    window.addEventListener('beforeunload', () => {
      if (!roomDeleted && saveTimer) flushDraft();
      if (!roomDeleted) {
        publishPresence('bye');
        stopLocalPresence();
      }
      socket?.close();
    });
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        flushDraft();
        toast('文档已保存。');
      }
      if (event.key === 'Escape' && activePane !== 'editor' && matchMedia('(max-width: 940px)').matches) showPane('editor');
    });
  }

  bindEvents();
  renderState();
  renderMembers();
  setSaveState('saved', '已保存');
  connectWebSocket();
  document.body.classList.add('ready');
}());
