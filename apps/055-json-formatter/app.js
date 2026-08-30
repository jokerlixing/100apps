(function startJsonWorkbench() {
  'use strict';

  const Core = window.JsonCore;
  if (!Core) return;

  const DRAFT_KEY = 'spec55_json_draft_v1';
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_DRAFT_BYTES = 250 * 1024;
  const MAX_RENDER_NODES = 2800;
  const MAX_EXPAND_NODES = 2400;
  const VALIDATION_DELAY = 220;
  const SEARCH_DELAY = 140;
  const SAMPLE_JSON = JSON.stringify({
    specimen: 'SPEC/55',
    collectedAt: '2026-08-30T15:00:00.000Z',
    subject: {
      name: 'JSON 格式化工具',
      status: 'ready',
      privateByDefault: true,
    },
    readings: [
      { channel: 'syntax', passed: true, score: 100 },
      { channel: 'structure', passed: true, score: 96 },
      { channel: 'path', passed: true, score: 98 },
    ],
    labels: ['format', 'trace', 'local-only'],
    notes: null,
  }, null, 2);

  const dom = {
    sampleButton: document.querySelector('#sampleButton'),
    fileInput: document.querySelector('#fileInput'),
    clearButton: document.querySelector('#clearButton'),
    clearButtonText: document.querySelector('#clearButtonText'),
    dropZone: document.querySelector('#dropZone'),
    jsonInput: document.querySelector('#jsonInput'),
    lineGutter: document.querySelector('#lineGutter'),
    lineReadout: document.querySelector('#lineReadout'),
    charReadout: document.querySelector('#charReadout'),
    validationCard: document.querySelector('#validationCard'),
    validationSeal: document.querySelector('#validationSeal'),
    validationKicker: document.querySelector('#validationKicker'),
    validationTitle: document.querySelector('#validationTitle'),
    validationDetail: document.querySelector('#validationDetail'),
    jumpErrorButton: document.querySelector('#jumpErrorButton'),
    errorContext: document.querySelector('#errorContext'),
    spineStatus: document.querySelector('#spineStatus'),
    indentButtons: [...document.querySelectorAll('[data-indent]')],
    formatButton: document.querySelector('#formatButton'),
    minifyButton: document.querySelector('#minifyButton'),
    copyButton: document.querySelector('#copyButton'),
    downloadButton: document.querySelector('#downloadButton'),
    expandAllButton: document.querySelector('#expandAllButton'),
    collapseAllButton: document.querySelector('#collapseAllButton'),
    statNodes: document.querySelector('#statNodes'),
    statDepth: document.querySelector('#statDepth'),
    statLeaves: document.querySelector('#statLeaves'),
    statSize: document.querySelector('#statSize'),
    treeSearchForm: document.querySelector('#treeSearchForm'),
    treeSearch: document.querySelector('#treeSearch'),
    searchCount: document.querySelector('#searchCount'),
    nextMatchButton: document.querySelector('#nextMatchButton'),
    treeStage: document.querySelector('#treeStage'),
    treeEmpty: document.querySelector('#treeEmpty'),
    treeRoot: document.querySelector('#treeRoot'),
    selectedType: document.querySelector('#selectedType'),
    selectedPath: document.querySelector('#selectedPath'),
    selectedPreview: document.querySelector('#selectedPreview'),
    copyPathButton: document.querySelector('#copyPathButton'),
    toast: document.querySelector('#toast'),
    announcer: document.querySelector('#announcer'),
  };

  const state = {
    parsed: null,
    parseResult: null,
    indent: 2,
    expanded: new Set(['$']),
    searchResults: [],
    currentMatch: -1,
    selectedPath: '$',
    nodeRecords: new Map(),
    renderCount: 0,
    renderLimited: false,
    validateTimer: 0,
    searchTimer: 0,
    toastTimer: 0,
    clearTimer: 0,
    clearArmed: false,
    importedName: '',
    draftLimitNotified: false,
  };

  loadInitialDraft();
  bindEvents();
  syncInputMetrics();
  validateNow(false);

  function bindEvents() {
    dom.jsonInput.addEventListener('input', handleInput);
    dom.jsonInput.addEventListener('scroll', syncGutterScroll);
    dom.jsonInput.addEventListener('keydown', handleEditorShortcut);
    dom.sampleButton.addEventListener('click', loadSample);
    dom.fileInput.addEventListener('change', handleFileSelection);
    dom.clearButton.addEventListener('click', handleClear);
    dom.jumpErrorButton.addEventListener('click', jumpToError);
    dom.indentButtons.forEach((button) => button.addEventListener('click', changeIndent));
    dom.formatButton.addEventListener('click', formatCurrent);
    dom.minifyButton.addEventListener('click', minifyCurrent);
    dom.copyButton.addEventListener('click', copyCurrent);
    dom.downloadButton.addEventListener('click', downloadCurrent);
    dom.expandAllButton.addEventListener('click', expandAll);
    dom.collapseAllButton.addEventListener('click', collapseAll);
    dom.treeSearchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      performSearch(true);
    });
    dom.treeSearch.addEventListener('input', scheduleSearch);
    dom.nextMatchButton.addEventListener('click', nextMatch);
    dom.copyPathButton.addEventListener('click', () => copyPath(state.selectedPath));

    ['dragenter', 'dragover'].forEach((eventName) => {
      dom.dropZone.addEventListener(eventName, handleDragOver);
    });
    dom.dropZone.addEventListener('dragleave', handleDragLeave);
    dom.dropZone.addEventListener('drop', handleDrop);
    document.addEventListener('dragover', preventFileNavigation);
    document.addEventListener('drop', preventFileNavigation);
  }

  function loadInitialDraft() {
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY);
      dom.jsonInput.value = draft === null ? SAMPLE_JSON : draft;
    } catch {
      dom.jsonInput.value = SAMPLE_JSON;
    }
  }

  function handleInput() {
    disarmClear();
    syncInputMetrics();
    persistDraft();
    window.clearTimeout(state.validateTimer);
    state.validateTimer = window.setTimeout(() => validateNow(false), VALIDATION_DELAY);
  }

  function syncInputMetrics() {
    const text = dom.jsonInput.value;
    const lineCount = Math.max(1, text.split('\n').length);
    const numbers = new Array(lineCount);
    for (let index = 0; index < lineCount; index += 1) numbers[index] = index + 1;
    dom.lineGutter.textContent = numbers.join('\n');
    dom.lineReadout.textContent = `${lineCount} 行`;
    dom.charReadout.textContent = `${formatInteger(text.length)} 字符`;
    syncGutterScroll();
  }

  function syncGutterScroll() {
    dom.lineGutter.scrollTop = dom.jsonInput.scrollTop;
  }

  function persistDraft() {
    const text = dom.jsonInput.value;
    try {
      if (utf8Bytes(text) <= MAX_DRAFT_BYTES) {
        window.localStorage.setItem(DRAFT_KEY, text);
        state.draftLimitNotified = false;
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
        if (!state.draftLimitNotified) {
          showToast('内容超过 250 KB，本次仍可处理，但不会自动保存草稿。');
          state.draftLimitNotified = true;
        }
      }
    } catch {
      if (!state.draftLimitNotified) {
        showToast('浏览器未允许本地保存；当前内容仍可继续处理。');
        state.draftLimitNotified = true;
      }
    }
  }

  function validateNow(shouldAnnounce = true) {
    window.clearTimeout(state.validateTimer);
    const result = Core.parseJson(dom.jsonInput.value);
    const wasValid = Boolean(state.parseResult && state.parseResult.ok);
    state.parseResult = result;
    state.parsed = result.ok ? result.value : null;

    if (result.ok) {
      renderValidState(shouldAnnounce && !wasValid);
      return;
    }
    if (result.empty) {
      renderEmptyState();
      return;
    }
    renderErrorState(result.error, shouldAnnounce);
  }

  function renderValidState(shouldAnnounce) {
    setValidationMode('valid');
    const stats = Core.analyzeJson(state.parsed);
    const rootType = Core.getValueType(state.parsed);
    dom.validationSeal.textContent = 'VALID';
    dom.validationKicker.textContent = '语法通过';
    dom.validationTitle.textContent = `有效的 ${typeLabel(rootType)} 根节点`;
    dom.validationDetail.textContent = `${formatInteger(stats.nodes)} 个节点，最大深度 ${stats.maxDepth}；可以整理、搜索或导出。`;
    dom.jumpErrorButton.hidden = true;
    dom.errorContext.hidden = true;
    dom.statNodes.textContent = formatInteger(stats.nodes);
    dom.statDepth.textContent = String(stats.maxDepth);
    dom.statLeaves.textContent = formatInteger(stats.leaves);
    dom.statSize.textContent = formatBytes(stats.bytes);
    setWorkspaceEnabled(true);
    performSearch(false);
    selectPathIfAvailable(state.selectedPath);
    if (shouldAnnounce) announce(`JSON 校验通过，共 ${stats.nodes} 个节点。`);
  }

  function renderEmptyState() {
    setValidationMode('empty');
    dom.validationSeal.textContent = 'WAIT';
    dom.validationKicker.textContent = '等待样本';
    dom.validationTitle.textContent = '输入 JSON 后自动校验';
    dom.validationDetail.textContent = '粘贴文本、打开文件，或先装入示例。';
    dom.jumpErrorButton.hidden = true;
    dom.errorContext.hidden = true;
    setWorkspaceEnabled(false);
    resetStats();
    showTreeEmpty('结构尚未装片', '有效 JSON 会在这里展开成可以搜索和折叠的路径。');
    resetInspector();
  }

  function renderErrorState(error, shouldAnnounce) {
    setValidationMode('error');
    dom.validationSeal.textContent = 'ERROR';
    dom.validationKicker.textContent = '语法中断';
    dom.validationTitle.textContent = `第 ${error.line} 行，第 ${error.column} 列`;
    dom.validationDetail.textContent = cleanParserMessage(error.message);
    dom.jumpErrorButton.hidden = false;
    dom.errorContext.hidden = false;
    dom.errorContext.textContent = buildErrorContext(error);
    setWorkspaceEnabled(false);
    resetStats();
    showTreeEmpty('结构无法展开', `先修正第 ${error.line} 行第 ${error.column} 列附近的语法。`);
    resetInspector();
    if (shouldAnnounce) announce(`JSON 语法错误，第 ${error.line} 行，第 ${error.column} 列。`);
  }

  function setValidationMode(mode) {
    dom.validationCard.classList.remove('is-empty', 'is-valid', 'is-error');
    dom.validationCard.classList.add(`is-${mode}`);
    dom.spineStatus.classList.remove('is-empty', 'is-valid', 'is-error');
    dom.spineStatus.classList.add(`is-${mode}`);
    dom.spineStatus.textContent = mode === 'valid' ? '结构有效' : mode === 'error' ? '发现错误' : '待校验';
  }

  function setWorkspaceEnabled(enabled) {
    [
      dom.formatButton,
      dom.minifyButton,
      dom.copyButton,
      dom.downloadButton,
      dom.expandAllButton,
      dom.collapseAllButton,
      dom.treeSearch,
    ].forEach((control) => { control.disabled = !enabled; });
    if (!enabled) {
      dom.nextMatchButton.disabled = true;
      dom.copyPathButton.disabled = true;
      state.searchResults = [];
      state.currentMatch = -1;
      dom.searchCount.textContent = '0';
    }
  }

  function resetStats() {
    [dom.statNodes, dom.statDepth, dom.statLeaves, dom.statSize].forEach((element) => {
      element.textContent = '—';
    });
  }

  function buildErrorContext(error) {
    const width = String(error.lines[error.lines.length - 1].number).length;
    const output = [];
    error.lines.forEach((line) => {
      output.push(`${String(line.number).padStart(width, ' ')} │ ${line.text}`);
      if (line.number === error.line) output.push(`${' '.repeat(width)} │ ${error.pointer}`);
    });
    return output.join('\n');
  }

  function cleanParserMessage(message) {
    return String(message || 'JSON 语法无效')
      .replace(/^JSON\.parse:\s*/i, '')
      .replace(/\s+at\s+position\s+\d+(?:\s*\(line\s+\d+\s+column\s+\d+\))?$/i, '')
      .trim();
  }

  function jumpToError() {
    const error = state.parseResult && state.parseResult.error;
    if (!error) return;
    const end = Math.min(dom.jsonInput.value.length, error.position + 1);
    dom.jsonInput.focus();
    dom.jsonInput.setSelectionRange(error.position, end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(dom.jsonInput).lineHeight) || 22;
    dom.jsonInput.scrollTop = Math.max(0, (error.line - 4) * lineHeight);
    syncGutterScroll();
  }

  function changeIndent(event) {
    state.indent = Number(event.currentTarget.dataset.indent) === 4 ? 4 : 2;
    dom.indentButtons.forEach((button) => {
      const active = Number(button.dataset.indent) === state.indent;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function formatCurrent() {
    if (!ensureValid()) return;
    replaceEditorText(Core.formatJson(state.parsed, state.indent));
    showToast(`已按 ${state.indent} 空格缩进格式化。`);
  }

  function minifyCurrent() {
    if (!ensureValid()) return;
    replaceEditorText(Core.minifyJson(state.parsed));
    showToast('已压缩为单行 JSON。');
  }

  function replaceEditorText(text) {
    dom.jsonInput.value = text;
    syncInputMetrics();
    persistDraft();
    validateNow(false);
    dom.jsonInput.focus();
    dom.jsonInput.setSelectionRange(0, 0);
    dom.jsonInput.scrollTop = 0;
    dom.jsonInput.scrollLeft = 0;
    syncGutterScroll();
  }

  function ensureValid() {
    validateNow(false);
    if (state.parseResult && state.parseResult.ok) return true;
    showToast(state.parseResult && state.parseResult.empty ? '请先输入 JSON。' : '请先修正语法错误。');
    return false;
  }

  async function copyCurrent() {
    if (!ensureValid()) return;
    const copied = await copyText(dom.jsonInput.value);
    showToast(copied ? 'JSON 已复制到剪贴板。' : '无法访问剪贴板，请手动复制。');
  }

  function downloadCurrent() {
    if (!ensureValid()) return;
    const blob = new Blob([dom.jsonInput.value], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildDownloadName();
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('JSON 文件已生成。');
  }

  function buildDownloadName() {
    if (state.importedName) {
      const base = state.importedName.replace(/\.json$/i, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '-');
      if (base) return `${base}-formatted.json`;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `spec55-${timestamp}.json`;
  }

  function handleEditorShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
    const key = event.key.toLocaleLowerCase();
    if (key === 'f') {
      event.preventDefault();
      formatCurrent();
    }
    if (key === 'm') {
      event.preventDefault();
      minifyCurrent();
    }
  }

  function loadSample() {
    state.importedName = 'specimen.json';
    state.expanded = new Set(['$', '$.subject', '$.readings']);
    replaceEditorText(SAMPLE_JSON);
    showToast('示例 JSON 已装入。');
  }

  function handleClear() {
    if (!dom.jsonInput.value) {
      disarmClear();
      dom.jsonInput.focus();
      return;
    }
    if (!state.clearArmed) {
      state.clearArmed = true;
      dom.clearButton.classList.add('is-armed');
      dom.clearButtonText.textContent = '再点一次清空';
      window.clearTimeout(state.clearTimer);
      state.clearTimer = window.setTimeout(disarmClear, 3200);
      announce('再次点击清空按钮将删除当前内容。');
      return;
    }
    disarmClear();
    state.importedName = '';
    state.expanded = new Set(['$']);
    state.selectedPath = '$';
    replaceEditorText('');
    showToast('编辑区已清空。');
  }

  function disarmClear() {
    state.clearArmed = false;
    window.clearTimeout(state.clearTimer);
    dom.clearButton.classList.remove('is-armed');
    dom.clearButtonText.textContent = '清空';
  }

  function handleFileSelection(event) {
    const [file] = event.target.files || [];
    if (file) readFile(file);
    event.target.value = '';
  }

  function handleDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dom.dropZone.classList.add('is-dragging');
  }

  function handleDragLeave(event) {
    if (event.relatedTarget && dom.dropZone.contains(event.relatedTarget)) return;
    dom.dropZone.classList.remove('is-dragging');
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dom.dropZone.classList.remove('is-dragging');
    const [file] = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
    if (!file) {
      showToast('请拖入一个 .json 或文本文件。');
      return;
    }
    readFile(file);
  }

  function preventFileNavigation(event) {
    if (event.dataTransfer && event.dataTransfer.types.includes('Files')) event.preventDefault();
  }

  async function readFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showToast(`文件为 ${formatBytes(file.size)}，超过 2 MB 上限。`);
      return;
    }
    const supported = /\.json$/i.test(file.name)
      || ['application/json', 'text/json', 'text/plain', ''].includes(file.type);
    if (!supported) {
      showToast('只支持 .json 或纯文本文件。');
      return;
    }
    try {
      const text = await file.text();
      state.importedName = file.name;
      state.expanded = new Set(['$']);
      replaceEditorText(text.replace(/^\uFEFF/, ''));
      showToast(`已打开 ${file.name}（${formatBytes(file.size)}）。`);
    } catch {
      showToast('无法读取这个文件，请检查文件权限后重试。');
    }
  }

  function scheduleSearch() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => performSearch(true), SEARCH_DELAY);
  }

  function performSearch(resetMatch = true) {
    window.clearTimeout(state.searchTimer);
    if (state.parsed === null && !(state.parseResult && state.parseResult.ok)) return;
    const query = dom.treeSearch.value;
    state.searchResults = Core.searchJson(state.parsed, query, { limit: 100 });
    if (resetMatch) state.currentMatch = state.searchResults.length ? 0 : -1;
    else if (state.currentMatch >= state.searchResults.length) state.currentMatch = state.searchResults.length ? 0 : -1;
    dom.searchCount.textContent = state.searchResults.length === 100 ? '100+' : String(state.searchResults.length);
    dom.nextMatchButton.disabled = state.searchResults.length === 0;
    renderTree();
    if (state.currentMatch >= 0) window.requestAnimationFrame(() => goToCurrentMatch(false));
  }

  function nextMatch() {
    if (!state.searchResults.length) return;
    state.currentMatch = (state.currentMatch + 1) % state.searchResults.length;
    updateCurrentMatchStyles();
    goToCurrentMatch(true);
  }

  function goToCurrentMatch(announceMatch) {
    const match = state.searchResults[state.currentMatch];
    if (!match) return;
    const record = state.nodeRecords.get(match.path);
    if (!record) return;
    selectNode(match.path, record.value, record.row);
    record.row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    if (announceMatch) announce(`第 ${state.currentMatch + 1} 个匹配：${match.path}`);
  }

  function updateCurrentMatchStyles() {
    state.nodeRecords.forEach((record) => record.row.classList.remove('is-current-match'));
    const match = state.searchResults[state.currentMatch];
    const record = match && state.nodeRecords.get(match.path);
    if (record) record.row.classList.add('is-current-match');
  }

  function renderTree() {
    if (!(state.parseResult && state.parseResult.ok)) return;
    state.nodeRecords.clear();
    state.renderCount = 0;
    state.renderLimited = false;
    dom.treeRoot.replaceChildren();
    dom.treeEmpty.hidden = true;
    dom.treeRoot.hidden = false;
    const rootNode = createTreeNode(state.parsed, '$', null, 0, false);
    if (rootNode) dom.treeRoot.append(rootNode);
    if (state.renderLimited) {
      const note = document.createElement('p');
      note.className = 'tree-limit-note';
      note.textContent = `为保持流畅，本次最多渲染 ${formatInteger(MAX_RENDER_NODES)} 个可见节点。收起分支或搜索可继续定位。`;
      dom.treeRoot.append(note);
    }
    updateCurrentMatchStyles();
  }

  function createTreeNode(value, path, key, depth, isIndex) {
    if (state.renderCount >= MAX_RENDER_NODES) {
      state.renderLimited = true;
      return null;
    }
    state.renderCount += 1;

    const type = Core.getValueType(value);
    const container = type === 'object' || type === 'array';
    const node = document.createElement('div');
    node.className = `tree-node type-${type}`;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.path = path;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(depth + 1));
    row.tabIndex = 0;
    if (state.searchResults.some((result) => result.path === path)) row.classList.add('is-match');
    if (path === state.selectedPath) row.classList.add('is-selected');

    const expanded = container && shouldExpand(path);
    if (container) {
      row.setAttribute('aria-expanded', String(expanded));
      const toggle = document.createElement('button');
      toggle.className = 'node-toggle';
      toggle.type = 'button';
      toggle.textContent = expanded ? '−' : '+';
      toggle.setAttribute('aria-label', expanded ? `收起 ${path}` : `展开 ${path}`);
      toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePath(path);
      });
      row.append(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'node-spacer';
      row.append(spacer);
    }

    const keyElement = document.createElement('span');
    keyElement.className = `node-key${isIndex ? ' is-index' : ''}`;
    keyElement.textContent = key === null ? '$' : isIndex ? `[${key}]` : String(key);
    row.append(keyElement);

    const separator = document.createElement('span');
    separator.className = 'node-separator';
    separator.textContent = ':';
    row.append(separator);

    const preview = document.createElement('span');
    preview.className = 'node-preview';
    preview.textContent = Core.previewValue(value, 90);
    row.append(preview);

    const typeTag = document.createElement('span');
    typeTag.className = 'type-tag';
    typeTag.textContent = type;
    row.append(typeTag);

    const pathButton = document.createElement('button');
    pathButton.className = 'path-pin';
    pathButton.type = 'button';
    pathButton.textContent = '⌘';
    pathButton.title = `复制 ${path}`;
    pathButton.setAttribute('aria-label', `复制路径 ${path}`);
    pathButton.addEventListener('click', (event) => {
      event.stopPropagation();
      copyPath(path);
    });
    row.append(pathButton);

    row.addEventListener('click', () => selectNode(path, value, row));
    row.addEventListener('keydown', (event) => handleTreeRowKey(event, path, value, row, container, expanded));
    node.append(row);
    state.nodeRecords.set(path, { row, value, type });

    if (container && expanded) {
      const group = document.createElement('div');
      group.className = 'tree-children';
      group.setAttribute('role', 'group');
      const entries = type === 'array'
        ? value.map((child, index) => [index, child, true])
        : Object.entries(value).map(([childKey, child]) => [childKey, child, false]);
      entries.forEach(([childKey, child, childIsIndex]) => {
        const childPath = Core.joinPath(path, childKey, childIsIndex);
        const childNode = createTreeNode(child, childPath, childKey, depth + 1, childIsIndex);
        if (childNode) group.append(childNode);
      });
      node.append(group);
    }

    return node;
  }

  function handleTreeRowKey(event, path, value, row, container, expanded) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (container) togglePath(path);
      else selectNode(path, value, row);
    }
    if (event.key === 'ArrowRight' && container && !expanded) {
      event.preventDefault();
      state.expanded.add(path);
      renderTree();
      focusTreePath(path);
    }
    if (event.key === 'ArrowLeft' && container && expanded) {
      event.preventDefault();
      state.expanded.delete(path);
      renderTree();
      focusTreePath(path);
    }
  }

  function shouldExpand(path) {
    if (state.expanded.has(path)) return true;
    return state.searchResults.some((result) => isDescendantPath(result.path, path));
  }

  function isDescendantPath(candidate, parent) {
    if (candidate === parent) return false;
    if (parent === '$') return candidate.startsWith('$.') || candidate.startsWith('$[');
    return candidate.startsWith(`${parent}.`) || candidate.startsWith(`${parent}[`);
  }

  function togglePath(path) {
    if (state.expanded.has(path)) state.expanded.delete(path);
    else state.expanded.add(path);
    renderTree();
    focusTreePath(path);
  }

  function focusTreePath(path) {
    window.requestAnimationFrame(() => {
      const record = state.nodeRecords.get(path);
      if (record) record.row.focus();
    });
  }

  function expandAll() {
    if (!(state.parseResult && state.parseResult.ok)) return;
    state.expanded = new Set();
    let visited = 0;

    function collect(value, path, depth) {
      if (visited >= MAX_EXPAND_NODES || depth > 80) return;
      const type = Core.getValueType(value);
      if (type !== 'object' && type !== 'array') return;
      visited += 1;
      state.expanded.add(path);
      const entries = type === 'array'
        ? value.map((child, index) => [index, child, true])
        : Object.entries(value).map(([key, child]) => [key, child, false]);
      entries.forEach(([key, child, isIndex]) => collect(child, Core.joinPath(path, key, isIndex), depth + 1));
    }

    collect(state.parsed, '$', 0);
    renderTree();
    showToast(visited >= MAX_EXPAND_NODES ? '结构较大，已展开前 2,400 个容器节点。' : '已展开全部容器节点。');
  }

  function collapseAll() {
    dom.treeSearch.value = '';
    state.searchResults = [];
    state.currentMatch = -1;
    dom.searchCount.textContent = '0';
    dom.nextMatchButton.disabled = true;
    state.expanded = new Set();
    renderTree();
    showToast('已清除搜索并收起全部容器节点。');
  }

  function selectNode(path, value, row) {
    state.selectedPath = path;
    state.nodeRecords.forEach((record) => record.row.classList.remove('is-selected'));
    if (row) row.classList.add('is-selected');
    dom.selectedPath.textContent = path;
    dom.selectedPath.title = path;
    dom.selectedType.textContent = Core.getValueType(value);
    dom.selectedPreview.textContent = Core.previewValue(value, 180);
    dom.copyPathButton.disabled = false;
  }

  function selectPathIfAvailable(path) {
    const record = state.nodeRecords.get(path) || state.nodeRecords.get('$');
    if (record) selectNode(record === state.nodeRecords.get(path) ? path : '$', record.value, record.row);
  }

  function resetInspector() {
    state.selectedPath = '$';
    dom.selectedPath.textContent = '$';
    dom.selectedPath.title = '$';
    dom.selectedType.textContent = '—';
    dom.selectedPreview.textContent = '选择树中的节点即可读取路径。';
    dom.copyPathButton.disabled = true;
  }

  function showTreeEmpty(title, detail) {
    dom.treeRoot.hidden = true;
    dom.treeRoot.replaceChildren();
    dom.treeEmpty.hidden = false;
    const strong = dom.treeEmpty.querySelector('strong');
    const paragraph = dom.treeEmpty.querySelector('p');
    if (strong) strong.textContent = title;
    if (paragraph) paragraph.textContent = detail;
  }

  async function copyPath(path) {
    const copied = await copyText(path);
    showToast(copied ? `已复制路径：${path}` : '无法访问剪贴板，请手动复制路径。');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand('copy');
      helper.remove();
      return copied;
    } catch {
      return false;
    }
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2600);
  }

  function announce(message) {
    dom.announcer.textContent = '';
    window.setTimeout(() => { dom.announcer.textContent = message; }, 20);
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text).length;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function typeLabel(type) {
    return ({ object: '对象', array: '数组', string: '字符串', number: '数字', boolean: '布尔值', null: 'null' })[type] || type;
  }
})();
