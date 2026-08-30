(function initMindMapApp() {
  'use strict';

  const Core = window.MindMapCore;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'line52-document-v1';
  const HISTORY_LIMIT = 50;
  const BRANCH_COLORS = ['#2f5bd3', '#ef5b4d', '#279778', '#7856c8', '#2383b8', '#c7791c'];

  if (!Core) throw new Error('MindMapCore failed to load.');

  const elements = {
    documentTitle: document.querySelector('#documentTitle'),
    saveStatus: document.querySelector('#saveStatus'),
    undoBtn: document.querySelector('#undoBtn'),
    redoBtn: document.querySelector('#redoBtn'),
    newMapBtn: document.querySelector('#newMapBtn'),
    exportBtn: document.querySelector('#exportBtn'),
    nodeDepth: document.querySelector('#nodeDepth'),
    nodePath: document.querySelector('#nodePath'),
    nodeText: document.querySelector('#nodeText'),
    textCount: document.querySelector('#textCount'),
    saveNodeBtn: document.querySelector('#saveNodeBtn'),
    addChildBtn: document.querySelector('#addChildBtn'),
    addSiblingBtn: document.querySelector('#addSiblingBtn'),
    toggleBtn: document.querySelector('#toggleBtn'),
    deleteBtn: document.querySelector('#deleteBtn'),
    nodeCount: document.querySelector('#nodeCount'),
    outlineTree: document.querySelector('#outlineTree'),
    mapFrame: document.querySelector('#mapFrame'),
    mapCanvas: document.querySelector('#mapCanvas'),
    viewportGroup: document.querySelector('#viewportGroup'),
    edgeLayer: document.querySelector('#edgeLayer'),
    nodeLayer: document.querySelector('#nodeLayer'),
    zoomOutBtn: document.querySelector('#zoomOutBtn'),
    zoomInBtn: document.querySelector('#zoomInBtn'),
    fitBtn: document.querySelector('#fitBtn'),
    zoomValue: document.querySelector('#zoomValue'),
    newMapDialog: document.querySelector('#newMapDialog'),
    toast: document.querySelector('#toast'),
    liveRegion: document.querySelector('#liveRegion'),
  };

  const loaded = loadDocument();
  const state = {
    document: loaded.document,
    selectedId: loaded.document.root.id,
    history: [],
    future: [],
    viewport: { x: 36, y: 36, scale: 1 },
    layout: null,
    pan: null,
    toastTimer: null,
    storageAvailable: true,
    exporting: false,
  };

  let idCounter = 0;
  let resizeTimer = null;

  bindEvents();
  renderAll();
  requestAnimationFrame(fitMap);

  if (loaded.source === 'recovered') {
    const recoveredSaved = saveDocument();
    if (recoveredSaved) setSaveStatus('已恢复示例 · 原存档损坏', 'error');
    showToast('本地存档无法读取，已恢复示例脑图');
    announce('本地存档无法读取，已恢复示例脑图');
  } else if (loaded.source === 'starter') {
    setSaveStatus('示例脑图 · 编辑后自动保存', 'quiet');
  } else {
    setSaveStatus(`已载入本地版本 · ${formatClock(state.document.updatedAt)}`, 'ok');
  }

  function bindEvents() {
    elements.documentTitle.addEventListener('change', saveDocumentTitle);
    elements.documentTitle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        elements.documentTitle.blur();
      }
    });

    elements.nodeText.addEventListener('input', updateTextCount);
    elements.nodeText.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveSelectedNode();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        renderSelectionPanel();
        elements.nodeText.blur();
      }
    });

    elements.saveNodeBtn.addEventListener('click', saveSelectedNode);
    elements.addChildBtn.addEventListener('click', () => addChildTo(state.selectedId));
    elements.addSiblingBtn.addEventListener('click', addSibling);
    elements.toggleBtn.addEventListener('click', toggleSelectedBranch);
    elements.deleteBtn.addEventListener('click', deleteSelectedNode);
    elements.undoBtn.addEventListener('click', undo);
    elements.redoBtn.addEventListener('click', redo);
    elements.exportBtn.addEventListener('click', exportPng);
    elements.newMapBtn.addEventListener('click', openNewMapDialog);

    elements.newMapDialog.addEventListener('close', () => {
      if (elements.newMapDialog.returnValue === 'confirm') createBlankDocument();
    });

    elements.zoomOutBtn.addEventListener('click', () => zoomAt(0.82));
    elements.zoomInBtn.addEventListener('click', () => zoomAt(1.2));
    elements.fitBtn.addEventListener('click', fitMap);
    elements.mapCanvas.addEventListener('wheel', handleWheel, { passive: false });
    elements.mapCanvas.addEventListener('pointerdown', beginPan);
    elements.mapCanvas.addEventListener('pointermove', movePan);
    elements.mapCanvas.addEventListener('pointerup', endPan);
    elements.mapCanvas.addEventListener('pointercancel', endPan);

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(fitMap, 140);
    });
  }

  function loadDocument() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return { document: Core.createStarterDocument(), source: 'starter' };
      const parsed = JSON.parse(stored);
      if (!Core.isValidDocument(parsed)) throw new Error('Invalid stored document');
      return { document: parsed, source: 'stored' };
    } catch (error) {
      console.warn('LINE/52 could not restore the local document.', error);
      return { document: Core.createStarterDocument(), source: 'recovered' };
    }
  }

  function saveDocument() {
    state.document.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.document));
      state.storageAvailable = true;
      setSaveStatus(`已自动保存 · ${formatClock(state.document.updatedAt)}`, 'ok');
      return true;
    } catch (error) {
      state.storageAvailable = false;
      setSaveStatus('无法保存 · 请检查浏览器存储权限', 'error');
      console.warn('LINE/52 could not save the local document.', error);
      return false;
    }
  }

  function saveDocumentTitle() {
    const title = String(elements.documentTitle.value || '').replace(/\s+/g, ' ').trim().slice(0, 60) || '未命名脑图';
    if (title === state.document.title) {
      elements.documentTitle.value = title;
      return;
    }
    commitDocument({ ...state.document, title }, `脑图已改名为“${title}”`);
  }

  function commitDocument(nextDocument, message, selectedId = state.selectedId) {
    state.history.push(cloneDocument(state.document));
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.future = [];
    state.document = { ...nextDocument, updatedAt: new Date().toISOString() };
    state.selectedId = Core.findNode(state.document.root, selectedId) ? selectedId : state.document.root.id;
    saveDocument();
    renderAll();
    showToast(message);
    announce(message);
  }

  function saveSelectedNode() {
    const result = Core.updateNodeText(state.document.root, state.selectedId, elements.nodeText.value);
    if (!result.changed) {
      if (result.reason === 'unchanged') showToast('名称没有变化');
      return;
    }
    const selectedId = state.selectedId;
    commitDocument({ ...state.document, root: result.root }, '节点名称已保存', selectedId);
    focusSelectedMapNode();
  }

  function addChildTo(parentId) {
    const id = createNodeId();
    const result = Core.addChild(state.document.root, parentId, { id, text: '新节点' });
    if (!result.changed) {
      showToast('无法继续添加节点');
      return;
    }
    commitDocument({ ...state.document, root: result.root }, '已添加子节点', id);
    requestAnimationFrame(() => {
      elements.nodeText.focus();
      elements.nodeText.select();
    });
  }

  function addSibling() {
    const parentId = Core.findParentId(state.document.root, state.selectedId);
    if (!parentId) return;
    const id = createNodeId();
    const result = Core.addChild(state.document.root, parentId, { id, text: '新节点' });
    if (!result.changed) return;
    commitDocument({ ...state.document, root: result.root }, '已添加同级节点', id);
    requestAnimationFrame(() => {
      elements.nodeText.focus();
      elements.nodeText.select();
    });
  }

  function deleteSelectedNode() {
    const selected = Core.findNode(state.document.root, state.selectedId);
    const parentId = Core.findParentId(state.document.root, state.selectedId);
    if (!selected || !parentId) return;
    const result = Core.removeNode(state.document.root, state.selectedId);
    if (!result.changed) return;
    commitDocument({ ...state.document, root: result.root }, `已删除“${selected.text}”，可撤销`, parentId);
    focusSelectedMapNode();
  }

  function toggleSelectedBranch() {
    const selected = Core.findNode(state.document.root, state.selectedId);
    if (!selected || selected.children.length === 0) return;
    const result = Core.toggleCollapsed(state.document.root, state.selectedId);
    if (!result.changed) return;
    commitDocument(
      { ...state.document, root: result.root },
      selected.collapsed ? '分支已展开' : `分支已收起，隐藏 ${Core.countNodes(selected) - 1} 个节点`,
      selected.id,
    );
    focusSelectedMapNode();
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return;
    state.future.push(cloneDocument(state.document));
    state.document = previous;
    repairSelection();
    saveDocument();
    renderAll();
    showToast('已撤销上一步');
    announce('已撤销上一步');
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(cloneDocument(state.document));
    state.document = next;
    repairSelection();
    saveDocument();
    renderAll();
    showToast('已重做上一步');
    announce('已重做上一步');
  }

  function repairSelection() {
    if (!Core.findNode(state.document.root, state.selectedId)) state.selectedId = state.document.root.id;
  }

  function openNewMapDialog() {
    if (typeof elements.newMapDialog.showModal === 'function') {
      elements.newMapDialog.showModal();
      return;
    }
    if (window.confirm('新建一张空白脑图？当前内容可以通过撤销恢复。')) createBlankDocument();
  }

  function createBlankDocument() {
    const rootId = createNodeId();
    const nextDocument = {
      version: 1,
      title: '我的新脑图',
      updatedAt: new Date().toISOString(),
      root: { id: rootId, text: '中心主题', collapsed: false, children: [] },
    };
    commitDocument(nextDocument, '空白脑图已创建', rootId);
    requestAnimationFrame(() => {
      fitMap();
      elements.nodeText.focus();
      elements.nodeText.select();
    });
  }

  function renderAll() {
    repairSelection();
    elements.documentTitle.value = state.document.title;
    elements.undoBtn.disabled = state.history.length === 0;
    elements.redoBtn.disabled = state.future.length === 0;
    renderSelectionPanel();
    renderOutline();
    renderMap();
  }

  function renderSelectionPanel() {
    const selected = Core.findNode(state.document.root, state.selectedId);
    if (!selected) return;
    const path = getNodePath(selected.id);
    const depth = path.length - 1;
    const descendants = Core.countNodes(selected) - 1;

    elements.nodeDepth.textContent = depth === 0 ? '总站' : `L${depth}`;
    elements.nodePath.textContent = path.map((node) => node.text).join(' / ');
    elements.nodePath.title = elements.nodePath.textContent;
    elements.nodeText.value = selected.text;
    updateTextCount();
    elements.addSiblingBtn.disabled = depth === 0;
    elements.deleteBtn.disabled = depth === 0;
    elements.toggleBtn.disabled = selected.children.length === 0;
    elements.toggleBtn.innerHTML = selected.collapsed
      ? '<span aria-hidden="true">＋</span>展开分支'
      : '<span aria-hidden="true">−</span>收起分支';
    elements.toggleBtn.title = descendants ? `此分支包含 ${descendants} 个下级节点` : '叶节点不能折叠';
  }

  function renderOutline() {
    elements.outlineTree.replaceChildren();
    elements.nodeCount.textContent = `${Core.countNodes(state.document.root)} 站`;

    function appendNode(node, depth, branchIndex) {
      const row = document.createElement('div');
      const color = depth === 0 ? '#f2b544' : branchColor(branchIndex);
      row.className = 'outline-row';
      row.style.setProperty('--depth', depth);
      row.style.setProperty('--branch-color', color);

      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'treeitem';
      button.textContent = node.text;
      button.title = node.text;
      button.setAttribute('aria-level', String(depth + 1));
      button.setAttribute('aria-current', String(node.id === state.selectedId));
      if (node.children.length) button.setAttribute('aria-expanded', String(!node.collapsed));
      button.addEventListener('click', () => selectNode(node.id, true));
      row.append(button);

      if (node.collapsed && node.children.length) {
        const folded = document.createElement('span');
        folded.className = 'outline-fold';
        folded.textContent = `+${Core.countNodes(node) - 1}`;
        folded.title = '已收起的节点数';
        row.append(folded);
      }
      elements.outlineTree.append(row);

      node.children.forEach((child, childIndex) => {
        const childBranch = depth === 0 ? childIndex : branchIndex;
        appendNode(child, depth + 1, childBranch);
      });
    }

    appendNode(state.document.root, 0, -1);
  }

  function renderMap() {
    state.layout = Core.calculateLayout(state.document.root);
    elements.edgeLayer.replaceChildren();
    elements.nodeLayer.replaceChildren();
    const byId = new Map(state.layout.nodes.map((node) => [node.id, node]));

    state.layout.edges.forEach((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      const pathData = connectorPath(from, to);

      const shadow = createSvg('path', {
        d: pathData,
        class: 'map-edge-shadow',
        fill: 'none',
        stroke: 'rgba(20,43,59,0.13)',
        'stroke-width': '10',
        'stroke-linecap': 'round',
      });
      const path = createSvg('path', {
        d: pathData,
        class: 'map-edge',
        fill: 'none',
        stroke: branchColor(edge.branchIndex),
        'stroke-width': '6',
        'stroke-linecap': 'round',
        opacity: '0.82',
      });
      elements.edgeLayer.append(shadow, path);
    });

    state.layout.nodes.forEach((record) => {
      const node = Core.findNode(state.document.root, record.id);
      elements.nodeLayer.append(createNodeGroup(node, record));
    });

    updateViewportTransform();
  }

  function createNodeGroup(node, record) {
    const isRoot = record.depth === 0;
    const color = isRoot ? '#f2b544' : branchColor(record.branchIndex);
    const group = createSvg('g', {
      class: `map-node${isRoot ? ' is-root' : ''}${node.id === state.selectedId ? ' is-selected' : ''}`,
      transform: `translate(${record.x} ${record.y - record.height / 2})`,
      tabindex: '0',
      role: 'treeitem',
      'aria-level': String(record.depth + 1),
      'aria-label': `${node.text}${node.children.length ? `，${node.children.length} 个直接下级` : ''}`,
      'data-node-id': node.id,
    });
    if (node.children.length) group.setAttribute('aria-expanded', String(!node.collapsed));

    const title = createSvg('title');
    title.textContent = node.text;
    const halo = createSvg('rect', {
      class: 'selection-halo',
      x: '-5',
      y: '-5',
      width: String(record.width + 10),
      height: String(record.height + 10),
      rx: isRoot ? '32' : '13',
      fill: 'none',
      stroke: '#f2b544',
      'stroke-width': '4',
      opacity: node.id === state.selectedId ? '1' : '0',
    });
    const body = createSvg('rect', {
      class: 'node-body',
      width: String(record.width),
      height: String(record.height),
      rx: isRoot ? '26' : '8',
      fill: isRoot ? '#142b3b' : '#f7fbff',
      stroke: color,
      'stroke-width': isRoot ? '5' : '3',
    });
    const stationOuter = createSvg('circle', {
      cx: '16',
      cy: String(record.height / 2),
      r: isRoot ? '9' : '7',
      fill: isRoot ? '#f2b544' : '#f7fbff',
      stroke: color,
      'stroke-width': '3',
    });
    const stationInner = createSvg('circle', {
      cx: '16',
      cy: String(record.height / 2),
      r: isRoot ? '3.5' : '2.5',
      fill: isRoot ? '#142b3b' : color,
    });

    const label = createSvg('text', {
      class: 'node-label',
      x: '34',
      fill: isRoot ? '#ffffff' : '#142b3b',
      'font-family': isRoot ? 'Bahnschrift, Arial Narrow, sans-serif' : 'Segoe UI, Microsoft YaHei, sans-serif',
      'font-size': isRoot ? '15' : '14',
      'font-weight': '700',
    });
    const lines = wrapLabel(node.text, isRoot ? 16 : 13);
    const firstY = lines.length === 1 ? record.height / 2 + 5 : record.height / 2 - 4;
    lines.forEach((line, index) => {
      const tspan = createSvg('tspan', { x: '34', y: String(firstY + index * 17) });
      tspan.textContent = line;
      label.append(tspan);
    });

    group.append(title, halo, body, stationOuter, stationInner, label);

    if (record.hiddenCount > 0) {
      const badge = createSvg('rect', {
        x: String(record.width - 40),
        y: '6',
        width: '33',
        height: '17',
        rx: '8.5',
        fill: color,
      });
      const count = createSvg('text', {
        class: 'fold-count',
        x: String(record.width - 23.5),
        y: '18',
        fill: '#ffffff',
        'text-anchor': 'middle',
        'font-family': 'Consolas, monospace',
        'font-size': '10',
        'font-weight': '700',
      });
      count.textContent = `+${record.hiddenCount}`;
      group.append(badge, count);
    }

    group.addEventListener('click', (event) => {
      event.stopPropagation();
      selectNode(node.id, false);
    });
    group.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      selectNode(node.id, false);
      focusNodeEditor();
    });
    group.addEventListener('keydown', (event) => handleNodeKeydown(event, node));
    return group;
  }

  function selectNode(nodeId, focusMapNode) {
    if (!Core.findNode(state.document.root, nodeId)) return;
    state.selectedId = nodeId;
    renderAll();
    if (focusMapNode) requestAnimationFrame(focusSelectedMapNode);
  }

  function handleNodeKeydown(event, node) {
    if (event.key === 'Enter') {
      event.preventDefault();
      selectNode(node.id, false);
      focusNodeEditor();
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      selectNode(node.id, false);
      addChildTo(node.id);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      selectNode(node.id, false);
      deleteSelectedNode();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      selectNode(node.id, false);
      toggleSelectedBranch();
      return;
    }
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      moveMapSelection(node.id, event.key);
    }
  }

  function moveMapSelection(nodeId, key) {
    const visibleIds = state.layout.nodes.map((node) => node.id);
    const index = visibleIds.indexOf(nodeId);
    let targetId = nodeId;

    if (key === 'ArrowUp') targetId = visibleIds[Math.max(0, index - 1)];
    if (key === 'ArrowDown') targetId = visibleIds[Math.min(visibleIds.length - 1, index + 1)];
    if (key === 'ArrowLeft') targetId = Core.findParentId(state.document.root, nodeId) || nodeId;
    if (key === 'ArrowRight') {
      const node = Core.findNode(state.document.root, nodeId);
      if (node && !node.collapsed && node.children.length) targetId = node.children[0].id;
    }
    selectNode(targetId, true);
  }

  function handleGlobalKeydown(event) {
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (document.activeElement === elements.nodeText) saveSelectedNode();
      else saveDocument();
    }
  }

  function beginPan(event) {
    if (event.button !== 0 || event.target.closest('.map-node')) return;
    state.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: state.viewport.x,
      originY: state.viewport.y,
    };
    elements.mapCanvas.setPointerCapture(event.pointerId);
    elements.mapCanvas.classList.add('is-dragging');
  }

  function movePan(event) {
    if (!state.pan || state.pan.pointerId !== event.pointerId) return;
    state.viewport.x = state.pan.originX + event.clientX - state.pan.startX;
    state.viewport.y = state.pan.originY + event.clientY - state.pan.startY;
    updateViewportTransform();
  }

  function endPan(event) {
    if (!state.pan || state.pan.pointerId !== event.pointerId) return;
    state.pan = null;
    elements.mapCanvas.classList.remove('is-dragging');
    if (elements.mapCanvas.hasPointerCapture(event.pointerId)) elements.mapCanvas.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(factor, event.clientX, event.clientY);
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = elements.mapCanvas.getBoundingClientRect();
    const pointX = Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2;
    const pointY = Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2;
    const previous = state.viewport.scale;
    const next = clamp(previous * factor, 0.35, 2.2);
    const worldX = (pointX - state.viewport.x) / previous;
    const worldY = (pointY - state.viewport.y) / previous;
    state.viewport.scale = next;
    state.viewport.x = pointX - worldX * next;
    state.viewport.y = pointY - worldY * next;
    updateViewportTransform();
  }

  function fitMap() {
    if (!state.layout) return;
    const rect = elements.mapCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const bounds = state.layout.bounds;
    const padding = rect.width < 600 ? 18 : 34;
    const scale = clamp(
      Math.min((rect.width - padding * 2) / bounds.width, (rect.height - padding * 2) / bounds.height),
      0.35,
      1.15,
    );
    state.viewport.scale = scale;
    state.viewport.x = (rect.width - bounds.width * scale) / 2 - bounds.x * scale;
    state.viewport.y = (rect.height - bounds.height * scale) / 2 - bounds.y * scale;
    updateViewportTransform();
  }

  function updateViewportTransform() {
    elements.viewportGroup.setAttribute(
      'transform',
      `translate(${state.viewport.x} ${state.viewport.y}) scale(${state.viewport.scale})`,
    );
    elements.zoomValue.value = `${Math.round(state.viewport.scale * 100)}%`;
    elements.zoomValue.textContent = elements.zoomValue.value;
  }

  async function exportPng() {
    if (state.exporting || !state.layout) return;
    state.exporting = true;
    elements.exportBtn.disabled = true;
    elements.exportBtn.textContent = '正在导出…';

    try {
      const bounds = state.layout.bounds;
      const width = Math.ceil(bounds.width);
      const height = Math.ceil(bounds.height);
      const pixelRatio = clamp(4800 / Math.max(width, height), 0.5, 2);
      const exportSvg = createSvg('svg', {
        xmlns: SVG_NS,
        width: String(width),
        height: String(height),
        viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
      });
      const defs = createSvg('defs');
      const pattern = createSvg('pattern', { id: 'exportGrid', width: '24', height: '24', patternUnits: 'userSpaceOnUse' });
      pattern.append(createSvg('circle', { cx: '2', cy: '2', r: '1.25', fill: '#b4c8d8' }));
      defs.append(pattern);
      const background = createSvg('rect', {
        x: String(bounds.x),
        y: String(bounds.y),
        width: String(bounds.width),
        height: String(bounds.height),
        fill: '#f7fbff',
      });
      const grid = createSvg('rect', {
        x: String(bounds.x),
        y: String(bounds.y),
        width: String(bounds.width),
        height: String(bounds.height),
        fill: 'url(#exportGrid)',
      });
      const content = createSvg('g');
      content.append(elements.edgeLayer.cloneNode(true), elements.nodeLayer.cloneNode(true));
      content.querySelectorAll('.selection-halo').forEach((halo) => halo.setAttribute('opacity', '0'));
      exportSvg.append(defs, background, grid, content);

      const source = new XMLSerializer().serializeToString(exportSvg);
      const imageUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
      const image = await loadImage(imageUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#f7fbff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(imageUrl);

      const pngBlob = await canvasToBlob(canvas);
      const downloadUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${safeFilename(state.document.title)}-mind-map.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      showToast(`已导出 ${canvas.width} × ${canvas.height} PNG`);
      announce('脑图 PNG 已导出');
    } catch (error) {
      console.error('LINE/52 export failed.', error);
      showToast('导出失败，请稍后重试');
      announce('脑图导出失败');
    } finally {
      state.exporting = false;
      elements.exportBtn.disabled = false;
      elements.exportBtn.textContent = '导出 PNG';
    }
  }

  function getNodePath(nodeId) {
    const path = [];
    let currentId = nodeId;
    while (currentId) {
      const node = Core.findNode(state.document.root, currentId);
      if (!node) break;
      path.unshift(node);
      currentId = Core.findParentId(state.document.root, currentId);
    }
    return path;
  }

  function connectorPath(from, to) {
    const startX = from.x + from.width;
    const startY = from.y;
    const endX = to.x;
    const endY = to.y;
    const curve = Math.max(48, (endX - startX) * 0.48);
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  }

  function focusNodeEditor() {
    requestAnimationFrame(() => {
      elements.nodeText.focus();
      elements.nodeText.select();
    });
  }

  function focusSelectedMapNode() {
    const selected = [...elements.nodeLayer.querySelectorAll('.map-node')]
      .find((node) => node.dataset.nodeId === state.selectedId);
    if (selected) selected.focus();
  }

  function updateTextCount() {
    elements.textCount.textContent = `${elements.nodeText.value.length} / ${Core.MAX_TEXT_LENGTH}`;
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2200);
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    requestAnimationFrame(() => {
      elements.liveRegion.textContent = message;
    });
  }

  function setSaveStatus(message, tone) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.dataset.tone = tone;
  }

  function cloneDocument(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createNodeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    idCounter += 1;
    return `node-${Date.now().toString(36)}-${idCounter.toString(36)}`;
  }

  function createSvg(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function wrapLabel(text, limit) {
    const characters = Array.from(text);
    if (characters.length <= limit) return [text];
    const first = characters.slice(0, limit).join('');
    const remaining = characters.slice(limit);
    const second = remaining.length > limit
      ? `${remaining.slice(0, limit - 1).join('')}…`
      : remaining.join('');
    return [first, second];
  }

  function branchColor(index) {
    return BRANCH_COLORS[Math.abs(index) % BRANCH_COLORS.length];
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function formatClock(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function safeFilename(value) {
    return String(value || 'line-52')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'line-52';
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('SVG snapshot could not be rendered.'));
      image.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas did not produce a PNG.'));
      }, 'image/png');
    });
  }
})();
