(function startRoom93() {
  'use strict';

  const Core = window.Room93Core;
  if (!Core) throw new Error('ROOM/93 core failed to load');

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const STORAGE_PREFIX = 'room93:v1:';
  const MEMBER_COLORS = ['#2e5bff', '#ef5b5b', '#1d9e67', '#8657d9', '#c56a15'];
  const MEMBER_NAMES = ['林青', '何川', '乔木', '简宁', '周野', '苏禾', '你'];
  const TYPE_LABELS = { sticky: 'STICKY NOTE', note: 'SECTION TITLE', text: 'TEXT', shape: 'SHAPE' };
  const TEMPLATE_NAMES = Object.fromEntries(Core.listTemplates().map((item) => [item.id, item.name]));

  const elements = {
    boardTitle: $('#boardTitle'),
    saveState: $('#saveState'),
    roomLabel: $('#roomLabel'),
    roomCodeCard: $('#roomCodeCard'),
    roomButton: $('#roomButton'),
    shareButton: $('#shareButton'),
    openSecondTab: $('#openSecondTab'),
    memberStack: $('#memberStack'),
    templateList: $('#templateList'),
    objectCount: $('#objectCount'),
    revisionCount: $('#revisionCount'),
    templateName: $('#templateName'),
    boardViewport: $('#boardViewport'),
    boardStage: $('#boardStage'),
    objectLayer: $('#objectLayer'),
    connectorLayer: $('#connectorLayer'),
    cursorLayer: $('#cursorLayer'),
    connectionHint: $('#connectionHint'),
    undoButton: $('#undoButton'),
    redoButton: $('#redoButton'),
    zoomLabel: $('#zoomLabel'),
    inspector: $('#inspector'),
    inspectorEmpty: $('#inspectorEmpty'),
    inspectorForm: $('#inspectorForm'),
    selectedType: $('#selectedType'),
    objectText: $('#objectText'),
    objectX: $('#objectX'),
    objectY: $('#objectY'),
    objectWidth: $('#objectWidth'),
    objectHeight: $('#objectHeight'),
    shapeOptions: $('#shapeOptions'),
    shapeSelect: $('#shapeSelect'),
    exportButton: $('#exportButton'),
    exportMenu: $('#exportMenu'),
    importButton: $('#importButton'),
    importFile: $('#importFile'),
    roomDialog: $('#roomDialog'),
    roomForm: $('#roomForm'),
    roomInput: $('#roomInput'),
    templateDialog: $('#templateDialog'),
    templateForm: $('#templateForm'),
    pendingTemplateName: $('#pendingTemplateName'),
    toast: $('#toast'),
    liveRegion: $('#liveRegion'),
  };

  const identity = createIdentity();
  let roomCode = Core.normalizeRoomCode(new URL(location.href).searchParams.get('room'));
  let history = Core.createHistory(loadRoom(roomCode));
  let board = history.present;
  let selectedId = null;
  let activeTool = 'select';
  let connectionSource = null;
  let pendingTemplate = null;
  let zoom = 1;
  let channel = null;
  let toastTimer = null;
  let pointerBroadcastAt = 0;
  let saveTimer = null;
  let heartbeatTimer = null;
  const members = new Map();
  const remoteCursors = new Map();

  function createIdentity() {
    let windowId = window.name.startsWith('room93-') ? window.name : '';
    if (!windowId) {
      windowId = `room93-${Math.random().toString(36).slice(2, 9)}`;
      window.name = windowId;
    }
    const seed = [...windowId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return {
      id: windowId,
      name: MEMBER_NAMES[seed % MEMBER_NAMES.length],
      color: MEMBER_COLORS[seed % MEMBER_COLORS.length],
      lastSeen: Date.now(),
    };
  }

  function loadRoom(code) {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${code}`);
      if (stored) {
        const parsed = Core.parseBoardJson(stored);
        return { ...parsed, roomId: code };
      }
    } catch (error) {
      queueMicrotask(() => notify('本机保存记录无法读取，已载入示例白板。', true));
    }
    return Core.instantiateTemplate('kickoff', { roomId: code });
  }

  function persist(nextBoard) {
    clearTimeout(saveTimer);
    elements.saveState.classList.add('saving');
    elements.saveState.innerHTML = '<i></i> 正在保存';
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${roomCode}`, JSON.stringify(nextBoard));
      saveTimer = setTimeout(() => {
        elements.saveState.classList.remove('saving');
        elements.saveState.innerHTML = '<i></i> 已保存到本机';
      }, 100);
    } catch (error) {
      elements.saveState.classList.remove('saving');
      elements.saveState.innerHTML = '<i></i> 保存受限';
      notify('浏览器拒绝本地保存，请检查隐私模式或站点存储权限。', true);
    }
  }

  function commit(nextBoard, options = {}) {
    const now = Date.now();
    const normalized = {
      ...nextBoard,
      roomId: roomCode,
      updatedAt: now,
      revision: options.keepRevision ? nextBoard.revision : Math.max(board.revision + 1, nextBoard.revision || 0),
    };
    if (options.recordHistory !== false) history = Core.commitHistory(history, normalized);
    else history = { ...history, present: Core.clone(normalized) };
    board = history.present;
    persist(board);
    render();
    if (options.broadcast !== false) broadcast({ type: 'state', board });
    if (options.announce) announce(options.announce);
  }

  function restoreFromHistory(nextHistory, message) {
    if (nextHistory === history) return;
    const restored = {
      ...nextHistory.present,
      roomId: roomCode,
      revision: Math.max(board.revision, nextHistory.present.revision || 0) + 1,
      updatedAt: Date.now(),
    };
    history = { ...nextHistory, present: restored };
    board = history.present;
    persist(board);
    render();
    broadcast({ type: 'state', board });
    announce(message);
  }

  function broadcast(message) {
    const payload = { ...message, sender: identity, room: roomCode, sentAt: Date.now() };
    if (channel) channel.postMessage(payload);
  }

  function openChannel() {
    if (channel) channel.close();
    clearInterval(heartbeatTimer);
    members.clear();
    remoteCursors.clear();
    members.set(identity.id, { ...identity, lastSeen: Date.now(), self: true });
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(`room93:${roomCode}`);
      channel.addEventListener('message', handleChannelMessage);
      broadcast({ type: 'presence', requestState: true });
      heartbeatTimer = setInterval(() => {
        members.set(identity.id, { ...identity, lastSeen: Date.now(), self: true });
        broadcast({ type: 'presence' });
        pruneMembers();
      }, 3500);
    } else {
      channel = null;
      queueMicrotask(() => notify('当前浏览器不支持实时频道；白板仍会在刷新后保留。', true));
    }
    renderMembers();
  }

  function handleChannelMessage(event) {
    const message = event.data;
    if (!message || message.room !== roomCode || !message.sender || message.sender.id === identity.id) return;
    members.set(message.sender.id, { ...message.sender, lastSeen: Date.now(), self: false });
    if (message.type === 'presence') {
      if (message.requestState) broadcast({ type: 'state', board });
      broadcast({ type: 'presence-ack' });
    }
    if (message.type === 'leave') {
      members.delete(message.sender.id);
      remoteCursors.delete(message.sender.id);
    }
    if (message.type === 'cursor' && message.point) {
      remoteCursors.set(message.sender.id, { ...message.point, member: message.sender, lastSeen: Date.now() });
      renderRemoteCursors();
    }
    if (message.type === 'state' && message.board) {
      const validation = Core.validateBoard(message.board);
      if (validation.ok && message.board.updatedAt >= board.updatedAt) {
        board = { ...Core.clone(message.board), roomId: roomCode };
        history = Core.createHistory(board);
        selectedId = board.objects.some((item) => item.id === selectedId) ? selectedId : null;
        persist(board);
        render();
        announce(`${message.sender.name} 同步了白板`);
      }
    }
    renderMembers();
  }

  function pruneMembers() {
    const cutoff = Date.now() - 11000;
    for (const [id, member] of members) if (!member.self && member.lastSeen < cutoff) members.delete(id);
    for (const [id, cursor] of remoteCursors) if (cursor.lastSeen < cutoff) remoteCursors.delete(id);
    renderMembers();
    renderRemoteCursors();
  }

  function render() {
    elements.boardTitle.value = board.title;
    elements.roomLabel.textContent = roomCode;
    elements.roomCodeCard.textContent = roomCode;
    elements.objectCount.textContent = board.objects.filter((item) => item.type !== 'connector').length;
    elements.revisionCount.textContent = String(board.revision).padStart(2, '0');
    elements.templateName.textContent = TEMPLATE_NAMES[board.templateId] || '自定义';
    elements.undoButton.disabled = history.past.length === 0;
    elements.redoButton.disabled = history.future.length === 0;
    renderTemplates();
    renderObjects();
    renderInspector();
    updateToolState();
  }

  function renderTemplates() {
    elements.templateList.replaceChildren(...Core.listTemplates().map((template) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `template-card${template.id === board.templateId ? ' active' : ''}`;
      button.dataset.template = template.id;
      button.setAttribute('aria-pressed', String(template.id === board.templateId));
      const preview = document.createElement('span');
      preview.className = `template-preview ${template.id}`;
      preview.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'template-copy';
      const name = document.createElement('b');
      name.textContent = template.name;
      const description = document.createElement('span');
      description.textContent = template.description;
      copy.append(name, description);
      button.append(preview, copy);
      return button;
    }));
  }

  function renderObjects() {
    const fragment = document.createDocumentFragment();
    for (const object of board.objects) {
      if (object.type === 'connector') continue;
      const element = document.createElement('div');
      element.className = `board-object ${object.type}${object.type === 'shape' ? ` ${object.shape}` : ''}${object.id === selectedId ? ' selected' : ''}${object.id === connectionSource ? ' connect-source' : ''}`;
      element.dataset.id = object.id;
      element.dataset.color = object.color;
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `${TYPE_LABELS[object.type] || object.type}：${object.text || '空白对象'}`);
      Object.assign(element.style, {
        left: `${object.x}px`,
        top: `${object.y}px`,
        width: `${object.width}px`,
        height: `${object.height}px`,
        fontSize: `${object.fontSize || 16}px`,
        transform: `rotate(${object.rotation || 0}deg)`,
      });
      const content = document.createElement('div');
      content.className = 'object-content';
      content.textContent = object.text || emptyCopy(object.type);
      element.append(content);
      fragment.append(element);
    }
    elements.objectLayer.replaceChildren(fragment);
    renderConnectors();
    renderRemoteCursors();
  }

  function emptyCopy(type) {
    if (type === 'sticky') return '双击写下想法';
    if (type === 'shape') return '流程节点';
    return '双击编辑文字';
  }

  function renderConnectors() {
    $$('.connector-path', elements.connectorLayer).forEach((path) => path.remove());
    const byId = new Map(board.objects.map((item) => [item.id, item]));
    for (const connector of board.objects.filter((item) => item.type === 'connector')) {
      const from = byId.get(connector.from);
      const to = byId.get(connector.to);
      if (!from || !to) continue;
      const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
      const delta = Math.max(70, Math.abs(b.x - a.x) * 0.42);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + delta} ${a.y}, ${b.x - delta} ${b.y}, ${b.x} ${b.y}`);
      path.setAttribute('class', `connector-path ${connector.color || 'ink'}`);
      elements.connectorLayer.append(path);
    }
  }

  function renderInspector() {
    const object = board.objects.find((item) => item.id === selectedId && item.type !== 'connector');
    elements.inspector.classList.toggle('has-selection', Boolean(object));
    elements.inspectorEmpty.hidden = Boolean(object);
    elements.inspectorForm.hidden = !object;
    if (!object) return;
    elements.selectedType.textContent = TYPE_LABELS[object.type] || object.type.toUpperCase();
    elements.objectText.value = object.text || '';
    elements.objectX.value = Math.round(object.x);
    elements.objectY.value = Math.round(object.y);
    elements.objectWidth.value = Math.round(object.width);
    elements.objectHeight.value = Math.round(object.height);
    elements.shapeOptions.hidden = object.type !== 'shape';
    elements.shapeSelect.value = object.shape || 'rectangle';
    const colorInput = $(`input[name="objectColor"][value="${object.color}"]`, elements.inspectorForm);
    if (colorInput) colorInput.checked = true;
  }

  function renderMembers() {
    const list = [...members.values()].sort((a, b) => Number(b.self) - Number(a.self)).slice(0, 5);
    elements.memberStack.replaceChildren(...list.map((member) => {
      const avatar = document.createElement('span');
      avatar.className = `member-avatar${member.self ? ' self' : ''}`;
      avatar.style.setProperty('--avatar-color', member.color);
      avatar.textContent = member.name.slice(-1);
      avatar.title = `${member.name}${member.self ? '（你）' : ' · 在线'}`;
      return avatar;
    }));
  }

  function renderRemoteCursors() {
    elements.cursorLayer.replaceChildren(...[...remoteCursors.values()].map((cursor) => {
      const element = document.createElement('div');
      element.className = 'remote-cursor';
      element.style.left = `${cursor.x}px`;
      element.style.top = `${cursor.y}px`;
      element.style.setProperty('--cursor-color', cursor.member.color);
      element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 3 15 10-7 1-4 7L4 3Z"/></svg>';
      const label = document.createElement('span');
      label.textContent = cursor.member.name;
      element.append(label);
      return element;
    }));
  }

  function updateToolState() {
    $$('[data-tool]').forEach((button) => {
      const active = button.dataset.tool === activeTool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.connectionHint.hidden = activeTool !== 'connector';
    if (activeTool === 'connector') {
      elements.connectionHint.textContent = connectionSource ? '再选择一个对象完成连接' : '选择第一个对象作为起点';
    }
  }

  function selectObject(id) {
    if (activeTool === 'connector') {
      if (!connectionSource) {
        connectionSource = id;
        updateToolState();
        renderObjects();
        return;
      }
      if (connectionSource === id) {
        notify('请选择另一个对象作为连接终点。', true);
        return;
      }
      const connector = Core.createObject('connector', { from: connectionSource, to: id, color: 'blue' });
      const next = Core.addObject(board, connector);
      connectionSource = null;
      commit(next, { announce: '已创建连接线' });
      return;
    }
    selectedId = id;
    renderObjects();
    renderInspector();
  }

  function setTool(tool) {
    activeTool = tool;
    if (tool !== 'connector') connectionSource = null;
    updateToolState();
    renderObjects();
  }

  function addNewObject(type) {
    const rect = elements.boardStage.getBoundingClientRect();
    const scale = rect.width / 1600 || zoom;
    const viewportRect = elements.boardViewport.getBoundingClientRect();
    const x = Math.max(70, Math.min(1320, (viewportRect.left + viewportRect.width / 2 - rect.left) / scale - 100));
    const y = Math.max(70, Math.min(790, (viewportRect.top + viewportRect.height / 2 - rect.top) / scale - 70));
    const copy = {
      sticky: '写下一个关键想法',
      text: '输入一段说明文字',
      shape: '流程节点',
    };
    const object = Core.createObject(type, { x, y, text: copy[type] });
    selectedId = object.id;
    setTool('select');
    commit(Core.addObject(board, object), { announce: `已添加${type === 'sticky' ? '便签' : type === 'text' ? '文本' : '形状'}` });
    requestAnimationFrame(() => beginInlineEdit(selectedId));
  }

  function beginInlineEdit(id) {
    const element = $(`.board-object[data-id="${CSS.escape(id)}"]`, elements.objectLayer);
    const content = element && $('.object-content', element);
    if (!content) return;
    content.contentEditable = 'true';
    content.setAttribute('role', 'textbox');
    content.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
    const finish = () => {
      content.contentEditable = 'false';
      const text = content.textContent.trim().slice(0, 2000);
      const next = Core.updateObject(board, id, { text });
      if (next !== board) commit(next, { announce: '文字已更新' });
    };
    content.addEventListener('blur', finish, { once: true });
    content.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') content.blur();
      event.stopPropagation();
    });
  }

  function handleObjectPointerDown(event) {
    const element = event.target.closest('.board-object');
    if (!element || event.button !== 0 || event.target.isContentEditable) return;
    const id = element.dataset.id;
    selectObject(id);
    if (activeTool !== 'select') return;
    event.preventDefault();
    const source = board.objects.find((item) => item.id === id);
    if (!source) return;
    const stageRect = elements.boardStage.getBoundingClientRect();
    const scale = stageRect.width / 1600 || zoom;
    const start = { x: event.clientX, y: event.clientY, objectX: source.x, objectY: source.y };
    let moved = false;
    try {
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      // Synthetic and assistive pointer events may not own an active pointer.
    }
    const move = (moveEvent) => {
      const nextX = Math.round(Math.max(0, Math.min(1600 - source.width, start.objectX + (moveEvent.clientX - start.x) / scale)));
      const nextY = Math.round(Math.max(0, Math.min(1000 - source.height, start.objectY + (moveEvent.clientY - start.y) / scale)));
      moved = moved || Math.abs(nextX - source.x) > 1 || Math.abs(nextY - source.y) > 1;
      element.style.left = `${nextX}px`;
      element.style.top = `${nextY}px`;
      element.dataset.dragX = nextX;
      element.dataset.dragY = nextY;
      renderConnectorPreview(id, nextX, nextY);
    };
    const up = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      if (moved) {
        const x = Number(element.dataset.dragX);
        const y = Number(element.dataset.dragY);
        commit(Core.updateObject(board, id, { x, y }), { announce: '对象位置已更新' });
      }
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
  }

  function renderConnectorPreview(id, x, y) {
    const object = board.objects.find((item) => item.id === id);
    if (!object) return;
    const draft = { ...object, x, y };
    const temporary = { ...board, objects: board.objects.map((item) => item.id === id ? draft : item) };
    const original = board;
    board = temporary;
    renderConnectors();
    board = original;
  }

  function patchSelected(patch, message = '对象已更新') {
    if (!selectedId) return;
    const next = Core.updateObject(board, selectedId, patch);
    if (next !== board) commit(next, { announce: message });
  }

  function removeSelected() {
    if (!selectedId) return;
    const id = selectedId;
    selectedId = null;
    commit(Core.removeObject(board, id), { announce: '对象已删除' });
  }

  function duplicateSelected() {
    if (!selectedId) return;
    const previousIds = new Set(board.objects.map((item) => item.id));
    const next = Core.duplicateObject(board, selectedId);
    const copy = next.objects.find((item) => !previousIds.has(item.id));
    if (!copy) return;
    selectedId = copy.id;
    commit(next, { announce: '已创建对象副本' });
  }

  function moveLayer(direction) {
    const index = board.objects.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    const target = Math.max(0, Math.min(board.objects.length - 1, index + direction));
    if (target === index) return;
    const objects = board.objects.slice();
    const [object] = objects.splice(index, 1);
    objects.splice(target, 0, object);
    commit({ ...board, objects }, { announce: direction > 0 ? '对象已上移一层' : '对象已下移一层' });
  }

  function changeRoom(rawCode) {
    const nextCode = Core.normalizeRoomCode(rawCode);
    if (nextCode === roomCode) return;
    broadcast({ type: 'leave' });
    roomCode = nextCode;
    board = loadRoom(roomCode);
    history = Core.createHistory(board);
    selectedId = null;
    connectionSource = null;
    const url = new URL(location.href);
    url.searchParams.set('room', roomCode);
    window.history.replaceState(null, '', url);
    openChannel();
    persist(board);
    render();
    fitBoard();
    notify(`已进入房间 ${roomCode}`);
  }

  function applyTemplate(templateId) {
    const next = Core.instantiateTemplate(templateId, { roomId: roomCode });
    selectedId = null;
    commit({ ...next, revision: board.revision + 1 }, { announce: `已使用${TEMPLATE_NAMES[templateId]}模板` });
    fitBoard();
  }

  function setZoom(value) {
    zoom = Math.max(0.4, Math.min(1.6, Math.round(value * 10) / 10));
    elements.boardStage.style.transform = `scale(${zoom})`;
    elements.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function fitBoard() {
    const rect = elements.boardViewport.getBoundingClientRect();
    setZoom(Math.min((rect.width - 80) / 1600, (rect.height - 110) / 1000, 1));
    elements.boardViewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }

  function copyInviteLink() {
    const url = new URL(location.href);
    url.searchParams.set('room', roomCode);
    copyText(url.href).then(() => notify(`房间链接已复制 · ${roomCode}（限同一浏览器本地协作）`));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      if (!document.execCommand('copy')) throw new Error('copy failed');
      input.remove();
    }
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function exportJson() {
    downloadBlob(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }), `room93-${roomCode.toLowerCase()}.json`);
    notify('JSON 备份已导出');
  }

  function exportPng() {
    try {
      const bounds = Core.getContentBounds(board.objects, 70);
      const scale = Math.max(0.5, Math.min(2, 4096 / bounds.width, 4096 / bounds.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.translate(-bounds.x, -bounds.y);
      drawBoard(context, bounds);
      canvas.toBlob((blob) => {
        if (!blob) return notify('浏览器无法生成 PNG，请改用 JSON 备份。', true);
        downloadBlob(blob, `room93-${roomCode.toLowerCase()}.png`);
        notify('PNG 快照已导出');
      }, 'image/png');
    } catch (error) {
      notify(`PNG 导出失败：${error.message}`, true);
    }
  }

  function drawBoard(context, bounds) {
    context.fillStyle = '#f7f9fd';
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    context.strokeStyle = 'rgba(46,91,255,.08)';
    context.lineWidth = 1;
    for (let x = Math.floor(bounds.x / 16) * 16; x < bounds.x + bounds.width; x += 16) {
      context.beginPath(); context.moveTo(x, bounds.y); context.lineTo(x, bounds.y + bounds.height); context.stroke();
    }
    for (let y = Math.floor(bounds.y / 16) * 16; y < bounds.y + bounds.height; y += 16) {
      context.beginPath(); context.moveTo(bounds.x, y); context.lineTo(bounds.x + bounds.width, y); context.stroke();
    }
    const byId = new Map(board.objects.map((item) => [item.id, item]));
    for (const connector of board.objects.filter((item) => item.type === 'connector')) {
      const from = byId.get(connector.from); const to = byId.get(connector.to);
      if (!from || !to) continue;
      const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
      const delta = Math.max(70, Math.abs(b.x - a.x) * 0.42);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.bezierCurveTo(a.x + delta, a.y, b.x - delta, b.y, b.x, b.y);
      context.strokeStyle = connector.color === 'coral' ? '#ef5b5b' : connector.color === 'blue' ? '#2e5bff' : '#172238';
      context.lineWidth = 2.5;
      context.stroke();
      drawArrow(context, a, b);
    }
    for (const object of board.objects.filter((item) => item.type !== 'connector')) drawObject(context, object);
  }

  function drawArrow(context, from, to) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    context.save(); context.translate(to.x, to.y); context.rotate(angle);
    context.beginPath(); context.moveTo(0, 0); context.lineTo(-11, -5); context.lineTo(-11, 5); context.closePath(); context.fillStyle = context.strokeStyle; context.fill(); context.restore();
  }

  function drawObject(context, object) {
    const fills = { yellow: '#ffd86b', blue: '#a9c1ff', mint: '#9ce5c2', coral: '#ffaaa2', paper: '#ffffff', ink: '#172238' };
    const textColor = object.color === 'ink' && object.type !== 'note' && object.type !== 'text' ? '#ffffff' : '#172238';
    context.save();
    context.translate(object.x + object.width / 2, object.y + object.height / 2);
    context.rotate((object.rotation || 0) * Math.PI / 180);
    context.translate(-object.width / 2, -object.height / 2);
    context.fillStyle = fills[object.color] || '#ffffff';
    context.strokeStyle = object.color === 'blue' ? '#2e5bff' : object.color === 'coral' ? '#b43f3f' : '#172238';
    context.lineWidth = object.type === 'shape' ? 2 : 0;
    if (object.type === 'note' || object.type === 'text') {
      if (object.type === 'note') { context.fillStyle = context.strokeStyle; context.fillRect(0, object.height - 3, object.width, 3); }
    } else {
      context.shadowColor = 'rgba(23,34,56,.16)'; context.shadowBlur = 14; context.shadowOffsetY = 7;
      roundedRect(context, 0, 0, object.width, object.height, object.shape === 'pill' ? object.height / 2 : object.shape === 'round' ? 18 : 1);
      context.fill(); if (object.type === 'shape') context.stroke(); context.shadowColor = 'transparent';
    }
    context.fillStyle = textColor;
    context.font = `${object.type === 'note' ? 700 : 500} ${object.fontSize || 16}px "Segoe UI", sans-serif`;
    context.textBaseline = 'top';
    drawWrappedText(context, object.text || emptyCopy(object.type), object.type === 'note' || object.type === 'text' ? 2 : 16, object.type === 'note' ? 7 : object.type === 'text' ? 6 : 17, object.width - (object.type === 'note' || object.type === 'text' ? 4 : 32), (object.fontSize || 16) * 1.38);
    context.restore();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r); context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r); context.arcTo(x, y, x + width, y, r); context.closePath();
  }

  function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    let lineY = y;
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const character of paragraph || ' ') {
        if (context.measureText(line + character).width > maxWidth && line) {
          context.fillText(line, x, lineY); line = character; lineY += lineHeight;
        } else line += character;
      }
      context.fillText(line, x, lineY); lineY += lineHeight;
    }
  }

  function closeExportMenu() {
    elements.exportMenu.hidden = true;
    elements.exportButton.setAttribute('aria-expanded', 'false');
  }

  function notify(message, isError = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2700);
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
  }

  function bindEvents() {
    elements.templateList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-template]');
      if (!button) return;
      pendingTemplate = button.dataset.template;
      elements.pendingTemplateName.textContent = TEMPLATE_NAMES[pendingTemplate];
      elements.templateDialog.showModal();
    });
    elements.templateForm.addEventListener('submit', (event) => {
      if (event.submitter && event.submitter.value === 'default' && pendingTemplate) applyTemplate(pendingTemplate);
      pendingTemplate = null;
    });
    elements.roomButton.addEventListener('click', () => {
      elements.roomInput.value = roomCode;
      elements.roomDialog.showModal();
      requestAnimationFrame(() => elements.roomInput.select());
    });
    elements.roomForm.addEventListener('submit', (event) => {
      if (event.submitter && event.submitter.value === 'default') changeRoom(elements.roomInput.value);
    });
    elements.shareButton.addEventListener('click', copyInviteLink);
    elements.openSecondTab.addEventListener('click', () => {
      const url = new URL(location.href); url.searchParams.set('room', roomCode); window.open(url, '_blank', 'noopener');
    });
    elements.boardTitle.addEventListener('change', () => {
      const title = elements.boardTitle.value.trim() || '未命名白板';
      commit({ ...board, title }, { announce: '白板名称已更新' });
    });
    $$('[data-add]').forEach((button) => button.addEventListener('click', () => addNewObject(button.dataset.add)));
    $$('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
    elements.objectLayer.addEventListener('pointerdown', handleObjectPointerDown);
    elements.objectLayer.addEventListener('dblclick', (event) => {
      const object = event.target.closest('.board-object'); if (object) beginInlineEdit(object.dataset.id);
    });
    elements.objectLayer.addEventListener('keydown', (event) => {
      const object = event.target.closest('.board-object');
      if (object && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectObject(object.dataset.id); }
    });
    elements.boardStage.addEventListener('pointerdown', (event) => {
      if (event.target === elements.boardStage || event.target === elements.objectLayer) { selectedId = null; renderObjects(); renderInspector(); }
    });
    elements.boardViewport.addEventListener('pointermove', (event) => {
      if (Date.now() - pointerBroadcastAt < 65) return;
      const rect = elements.boardStage.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      pointerBroadcastAt = Date.now();
      broadcast({ type: 'cursor', point: { x: (event.clientX - rect.left) / (rect.width / 1600), y: (event.clientY - rect.top) / (rect.height / 1000) } });
    });
    elements.undoButton.addEventListener('click', () => restoreFromHistory(Core.undoHistory(history), '已撤销')); 
    elements.redoButton.addEventListener('click', () => restoreFromHistory(Core.redoHistory(history), '已重做'));
    $('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
    $('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
    $('#zoomReset').addEventListener('click', () => setZoom(1));
    $('#fitBoard').addEventListener('click', fitBoard);
    $('#collapseRail').addEventListener('click', () => document.body.classList.toggle('rail-hidden'));
    $('#closeInspector').addEventListener('click', () => { selectedId = null; renderObjects(); renderInspector(); });
    elements.objectText.addEventListener('change', () => patchSelected({ text: elements.objectText.value }));
    $$('input[name="objectColor"]', elements.inspectorForm).forEach((input) => input.addEventListener('change', () => patchSelected({ color: input.value }, '对象颜色已更新')));
    for (const [element, key] of [[elements.objectX, 'x'], [elements.objectY, 'y'], [elements.objectWidth, 'width'], [elements.objectHeight, 'height']]) {
      element.addEventListener('change', () => patchSelected({ [key]: Number(element.value) }));
    }
    elements.shapeSelect.addEventListener('change', () => patchSelected({ shape: elements.shapeSelect.value }));
    $('#bringForward').addEventListener('click', () => moveLayer(1));
    $('#sendBackward').addEventListener('click', () => moveLayer(-1));
    $('#duplicateObject').addEventListener('click', duplicateSelected);
    $('#deleteObject').addEventListener('click', removeSelected);
    elements.exportButton.addEventListener('click', (event) => {
      event.stopPropagation();
      elements.exportMenu.hidden = !elements.exportMenu.hidden;
      elements.exportButton.setAttribute('aria-expanded', String(!elements.exportMenu.hidden));
    });
    elements.exportMenu.addEventListener('click', (event) => {
      const action = event.target.closest('[data-export]');
      if (action && action.dataset.export === 'png') exportPng();
      if (action && action.dataset.export === 'json') exportJson();
      closeExportMenu();
    });
    elements.importButton.addEventListener('click', () => { closeExportMenu(); elements.importFile.click(); });
    elements.importFile.addEventListener('change', async () => {
      const file = elements.importFile.files[0];
      if (!file) return;
      try {
        const imported = Core.parseBoardJson(await file.text());
        commit({ ...imported, roomId: roomCode, revision: board.revision + 1 }, { announce: '白板备份已导入' });
        notify('白板备份已导入');
      } catch (error) { notify(`无法导入：${error.message}`, true); }
      elements.importFile.value = '';
    });
    document.addEventListener('click', (event) => { if (!event.target.closest('.export-wrap')) closeExportMenu(); });
    document.addEventListener('keydown', handleKeyboard);
    window.addEventListener('beforeunload', () => broadcast({ type: 'leave' }));
    window.addEventListener('storage', (event) => {
      if (event.key !== `${STORAGE_PREFIX}${roomCode}` || !event.newValue) return;
      try {
        const next = Core.parseBoardJson(event.newValue);
        if (next.updatedAt > board.updatedAt) { board = { ...next, roomId: roomCode }; history = Core.createHistory(board); render(); }
      } catch (error) { /* Ignore invalid external writes. */ }
    });
  }

  function handleKeyboard(event) {
    const editable = event.target.matches('input, textarea, select') || event.target.isContentEditable;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      restoreFromHistory(event.shiftKey ? Core.redoHistory(history) : Core.undoHistory(history), event.shiftKey ? '已重做' : '已撤销');
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); restoreFromHistory(Core.redoHistory(history), '已重做'); return; }
    if (mod && event.key.toLowerCase() === 'd' && selectedId && !editable) { event.preventDefault(); duplicateSelected(); return; }
    if (editable) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); removeSelected(); return; }
    if (event.key === 'Escape') { selectedId = null; setTool('select'); renderInspector(); return; }
    if (event.key.toLowerCase() === 'v') setTool('select');
    if (event.key.toLowerCase() === 'n') addNewObject('sticky');
    if (event.key.toLowerCase() === 't') addNewObject('text');
    if (event.key.toLowerCase() === 's') addNewObject('shape');
    if (event.key.toLowerCase() === 'c') setTool('connector');
  }

  bindEvents();
  openChannel();
  persist(board);
  render();
  requestAnimationFrame(() => {
    fitBoard();
    elements.boardViewport.scrollTo({ left: 0, top: 0 });
  });

  window.__ROOM93__ = {
    getState: () => Core.clone(board),
    getMembers: () => [...members.values()].map((member) => ({ ...member })),
    addObject: (type, overrides = {}) => {
      const object = Core.createObject(type, overrides);
      commit(Core.addObject(board, object));
      return object.id;
    },
    changeRoom,
    applyTemplate,
    exportJson,
  };
})();
