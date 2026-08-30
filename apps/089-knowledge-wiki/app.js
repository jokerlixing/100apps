(function startLoom() {
  'use strict';

  const Core = window.KnowledgeCore;
  if (!Core) throw new Error('KnowledgeCore failed to load');

  const STORAGE_KEY = 'loom89.notes.v1';
  const SELECTED_KEY = 'loom89.selected.v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const byId = (id) => document.getElementById(id);
  const dom = {
    newNoteButton: byId('newNoteButton'),
    emptyNewButton: byId('emptyNewButton'),
    noteCount: byId('noteCount'),
    searchInput: byId('searchInput'),
    clearSearchButton: byId('clearSearchButton'),
    tagFilters: byId('tagFilters'),
    resultCount: byId('resultCount'),
    noteList: byId('noteList'),
    emptyList: byId('emptyList'),
    pathTitle: byId('pathTitle'),
    titleInput: byId('titleInput'),
    tagsInput: byId('tagsInput'),
    contentInput: byId('contentInput'),
    editorStage: byId('editorStage'),
    formatToolbar: byId('formatToolbar'),
    linkSuggestions: byId('linkSuggestions'),
    preview: byId('preview'),
    editModeButton: byId('editModeButton'),
    previewModeButton: byId('previewModeButton'),
    duplicateButton: byId('duplicateButton'),
    deleteButton: byId('deleteButton'),
    saveStatus: byId('saveStatus'),
    documentStats: byId('documentStats'),
    connectionCount: byId('connectionCount'),
    outgoingCount: byId('outgoingCount'),
    backlinkCount: byId('backlinkCount'),
    outgoingList: byId('outgoingList'),
    backlinkList: byId('backlinkList'),
    miniGraph: byId('miniGraph'),
    refreshGraphButton: byId('refreshGraphButton'),
    openGraphButton: byId('openGraphButton'),
    graphDialog: byId('graphDialog'),
    graphCanvas: byId('graphCanvas'),
    graphSummary: byId('graphSummary'),
    closeGraphButton: byId('closeGraphButton'),
    deleteDialog: byId('deleteDialog'),
    deleteDialogCopy: byId('deleteDialogCopy'),
    confirmDeleteButton: byId('confirmDeleteButton'),
    guideDialog: byId('guideDialog'),
    openGuideButton: byId('openGuideButton'),
    showShortcutsButton: byId('showShortcutsButton'),
    closeGuideButton: byId('closeGuideButton'),
    moreButton: byId('moreButton'),
    moreMenu: byId('moreMenu'),
    exportBackupButton: byId('exportBackupButton'),
    exportMarkdownButton: byId('exportMarkdownButton'),
    importInput: byId('importInput'),
    toast: byId('toast'),
  };

  const state = {
    notes: [],
    selectedId: '',
    query: '',
    tag: '',
    mode: 'edit',
    saveTimer: 0,
    renderTimer: 0,
    toastTimer: 0,
    suggestion: null,
  };

  const seedDefinitions = [
    {
      id: 'welcome',
      title: '欢迎来到 LOOM',
      tags: ['起点', '方法'],
      content: `# 把笔记织成脉络

LOOM 不是一个用来堆积资料的抽屉。它更像一张不断生长的地图：每次记录时，都问一句——这个想法与什么有关？

## 从这里开始

- 打开 [[阅读收件箱]]，放下刚收集的材料
- 用 [[渐进式总结]] 把长内容压缩成自己的话
- 在 [[领域地图]] 中维护正在生长的主题
- 完成一段工作后写进 [[项目复盘]]

> 输入双中括号建立连接。右侧会立即出现出链与反向链接。

所有内容默认只保存在当前浏览器。记得定期导出 JSON 备份。`,
      createdAt: '2026-08-27T02:00:00.000Z',
      updatedAt: '2026-08-31T00:42:00.000Z',
    },
    {
      id: 'progressive-summary',
      title: '渐进式总结',
      tags: ['方法', '写作'],
      content: `# 渐进式总结

不要试图第一次就把一篇材料整理得完美。让信息在每次重访时逐渐显影：

1. **保留原文**：先收进 [[阅读收件箱]]，只标记真正有反应的段落。
2. **粗体提炼**：第二次阅读时加粗关键句。
3. **边栏重述**：用自己的话写一句结论。
4. **连接用途**：把结论连到 [[领域地图]] 或正在进行的项目。

最终目标不是更短的摘要，而是更快地抵达可行动的理解。`,
      createdAt: '2026-08-27T03:00:00.000Z',
      updatedAt: '2026-08-30T11:20:00.000Z',
    },
    {
      id: 'domain-map',
      title: '领域地图',
      tags: ['地图', '长期'],
      content: `# 领域地图

领域是需要长期维护、没有明确终点的责任范围。每个领域页只保留最有用的入口。

## 当前领域

- 产品设计：从 [[项目复盘]] 中提取可复用判断
- 写作系统：用 [[渐进式总结]] 把阅读变成观点
- 个人知识管理：定期清理 [[阅读收件箱]]

## 每周维护

- 删除不再重要的入口
- 给孤立笔记补一条连接
- 把已经结束的项目移出活跃区`,
      createdAt: '2026-08-28T02:00:00.000Z',
      updatedAt: '2026-08-30T08:05:00.000Z',
    },
    {
      id: 'project-review',
      title: '项目复盘',
      tags: ['工作', '复盘'],
      content: `# 项目复盘

## 事实

- 原目标是什么？
- 哪些结果可以用数字或交付物证明？
- 哪个意外最影响判断？

## 提炼

把可重复的方法写回 [[领域地图]]，把仍需探索的问题放进 [[阅读收件箱]]。

## 下一次

只保留一条会真正改变行为的调整。`,
      createdAt: '2026-08-28T04:00:00.000Z',
      updatedAt: '2026-08-29T15:36:00.000Z',
    },
    {
      id: 'reading-inbox',
      title: '阅读收件箱',
      tags: ['收集', '待读'],
      content: `# 阅读收件箱

这里允许临时混乱，但不允许永久堆积。

- [ ] 一篇值得用 [[渐进式总结]] 处理的长文
- [ ] 与 [[领域地图]] 相关的新案例
- [ ] 等待验证的产品判断

每周清空一次：删除、归档，或连接到真正会再次使用的页面。`,
      createdAt: '2026-08-29T02:00:00.000Z',
      updatedAt: '2026-08-29T09:12:00.000Z',
    },
  ];

  function seededNotes() {
    return seedDefinitions.map((seed) =>
      Core.createNote(seed, { id: seed.id, now: seed.createdAt }),
    );
  }

  function currentNote() {
    return state.notes.find((note) => note.id === state.selectedId) || state.notes[0] || null;
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) state.notes = Core.importBackup(stored).notes;
    } catch (error) {
      state.notes = [];
      notify(`本地数据无法读取，已打开示例知识库。${error.message}`);
    }
    if (!state.notes.length) {
      state.notes = seededNotes();
      persistNow(false);
    }

    const remembered = localStorage.getItem(SELECTED_KEY);
    state.selectedId = state.notes.some((note) => note.id === remembered) ? remembered : state.notes[0].id;
  }

  function setSaveStatus(kind, label) {
    dom.saveStatus.classList.remove('saving', 'error');
    if (kind) dom.saveStatus.classList.add(kind);
    dom.saveStatus.lastChild.textContent = ` ${label}`;
  }

  function persistNow(showFeedback = false) {
    clearTimeout(state.saveTimer);
    state.saveTimer = 0;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ app: 'LOOM/89', version: Core.BACKUP_VERSION, notes: state.notes }),
      );
      localStorage.setItem(SELECTED_KEY, state.selectedId);
      setSaveStatus('', '已保存');
      if (showFeedback) notify('已保存到当前浏览器');
      return true;
    } catch (_error) {
      setSaveStatus('error', '保存失败');
      notify('浏览器存储空间不足，请先导出备份再清理空间');
      return false;
    }
  }

  function scheduleSave() {
    setSaveStatus('saving', '正在保存…');
    clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => persistNow(false), 420);
  }

  function scheduleRelatedRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = window.setTimeout(() => {
      renderList();
      renderContext();
      if (state.mode === 'preview') renderPreview();
    }, 160);
  }

  function notify(message) {
    clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    state.toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), 3100);
  }

  function cleanSnippet(content) {
    return content
      .replace(/```[\s\S]*?```/g, ' 代码片段 ')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || '空白笔记';
  }

  function formatShortDate(value) {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '.');
  }

  function renderTags() {
    const counts = new Map();
    state.notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
    dom.tagFilters.replaceChildren();

    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = `tag-chip${state.tag ? '' : ' active'}`;
    allButton.textContent = '全部';
    allButton.dataset.tag = '';
    dom.tagFilters.append(allButton);

    tags.forEach(([tag, count]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tag-chip${state.tag === tag ? ' active' : ''}`;
      button.textContent = `#${tag} ${count}`;
      button.dataset.tag = tag;
      dom.tagFilters.append(button);
    });
  }

  function renderList() {
    const filtered = Core.searchNotes(state.notes, state.query, state.tag);
    dom.noteCount.textContent = String(state.notes.length);
    dom.noteList.replaceChildren();
    dom.noteList.hidden = filtered.length === 0;
    dom.emptyList.hidden = filtered.length !== 0;
    dom.clearSearchButton.hidden = !state.query && !state.tag;
    dom.resultCount.textContent = state.query || state.tag
      ? `${filtered.length} 个结果`
      : '最近更新';

    filtered.forEach((note) => {
      const item = document.createElement('li');
      item.className = `note-item${note.id === state.selectedId ? ' active' : ''}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'note-card';
      button.dataset.noteId = note.id;
      button.setAttribute('aria-current', note.id === state.selectedId ? 'page' : 'false');

      const top = document.createElement('span');
      top.className = 'note-card-top';
      const title = document.createElement('strong');
      title.textContent = note.title;
      const time = document.createElement('time');
      time.dateTime = note.updatedAt;
      time.textContent = formatShortDate(note.updatedAt);
      top.append(title, time);

      const snippet = document.createElement('span');
      snippet.className = 'note-snippet';
      snippet.textContent = cleanSnippet(note.content);

      const meta = document.createElement('span');
      meta.className = 'note-meta';
      const tags = document.createElement('span');
      tags.className = 'note-tags';
      tags.textContent = note.tags.length ? note.tags.map((tag) => `#${tag}`).join(' · ') : '无标签';
      const links = document.createElement('span');
      links.textContent = `${Core.extractWikiLinks(note.content).length} LINKS`;
      meta.append(tags, links);

      button.append(top, snippet, meta);
      item.append(button);
      dom.noteList.append(item);
    });
  }

  function renderEditor() {
    const note = currentNote();
    if (!note) return;
    dom.titleInput.value = note.title;
    dom.tagsInput.value = note.tags.join(', ');
    dom.contentInput.value = note.content;
    dom.pathTitle.textContent = note.title;
    renderDocumentStats();
    renderPreview();
    setMode(state.mode);
  }

  function renderDocumentStats() {
    const note = currentNote();
    if (!note) return;
    const words = note.content.replace(/\s/g, '').length;
    const links = Core.extractWikiLinks(note.content).length;
    dom.documentStats.textContent = `${words} 字 · ${links} 条连接`;
  }

  function renderPreview() {
    const note = currentNote();
    if (!note) return;
    dom.preview.innerHTML = note.content.trim()
      ? Core.renderMarkdown(note.content)
      : '<p class="connection-empty">这是一张空白页。切回编辑模式，写下第一个想法。</p>';
  }

  function makeConnectionItem({ title, note, missing }, relation) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = missing ? 'missing-button' : 'connection-button';
    if (note) button.dataset.noteId = note.id;
    else button.dataset.missingTitle = title;

    const label = document.createElement('span');
    label.textContent = title;
    const detail = document.createElement('small');
    detail.textContent = missing ? '+ 创建' : relation;
    button.append(label, detail);
    item.append(button);
    return item;
  }

  function renderConnectionList(element, entries, emptyCopy, relation) {
    element.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'connection-empty';
      empty.textContent = emptyCopy;
      element.append(empty);
      return;
    }
    entries.forEach((entry) => element.append(makeConnectionItem(entry, relation)));
  }

  function renderContext() {
    const note = currentNote();
    if (!note) return;
    const outgoing = Core.getOutgoingLinks(state.notes, note);
    const backlinks = Core.getBacklinks(state.notes, note);

    dom.outgoingCount.textContent = String(outgoing.length);
    dom.backlinkCount.textContent = String(backlinks.length);
    dom.connectionCount.textContent = `${outgoing.length + backlinks.length} 条线`;
    renderConnectionList(dom.outgoingList, outgoing, '还没有出链。输入 [[笔记标题]] 建立第一条。', '出链');
    renderConnectionList(
      dom.backlinkList,
      backlinks.map((source) => ({ title: source.title, note: source, missing: false })),
      '暂时没有其他页面提到这里。',
      '反链',
    );

    const fullGraph = Core.buildGraph(state.notes);
    const neighborIds = new Set([note.id]);
    fullGraph.links.forEach((link) => {
      if (link.source === note.id) neighborIds.add(link.target);
      if (link.target === note.id) neighborIds.add(link.source);
    });
    const localGraph = {
      nodes: fullGraph.nodes.filter((node) => neighborIds.has(node.id)).slice(0, 7),
      links: fullGraph.links.filter((link) => neighborIds.has(link.source) && neighborIds.has(link.target)),
    };
    renderGraph(dom.miniGraph, localGraph, note.id, 280, 180, true);
  }

  function graphPositions(nodes, selectedId, width, height, mini) {
    const positions = new Map();
    const selected = nodes.find((node) => node.id === selectedId);
    const ordered = selected ? [selected, ...nodes.filter((node) => node !== selected)] : nodes;
    const cx = width / 2;
    const cy = height / 2;
    if (!ordered.length) return positions;
    positions.set(ordered[0].id, { x: cx, y: cy });

    const rest = ordered.slice(1);
    const firstRing = mini ? 6 : Math.min(12, rest.length);
    rest.forEach((node, index) => {
      const ring = index < firstRing ? 0 : Math.floor((index - firstRing) / 18) + 1;
      const ringStart = ring === 0 ? 0 : firstRing + (ring - 1) * 18;
      const ringCount = ring === 0 ? Math.max(firstRing, rest.length) : Math.min(18, rest.length - ringStart);
      const ringIndex = ring === 0 ? index : index - ringStart;
      const radius = mini ? 62 : Math.min(width, height) * (ring === 0 ? 0.29 : 0.44);
      const angle = -Math.PI / 2 + (Math.PI * 2 * ringIndex) / Math.max(1, ringCount);
      positions.set(node.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
    return positions;
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function renderGraph(svg, graph, selectedId, width, height, mini = false) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (!graph.nodes.length) return;
    const positions = graphPositions(graph.nodes, selectedId, width, height, mini);

    graph.links.forEach((link) => {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      if (!source || !target) return;
      const line = svgElement('line', {
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        class: `graph-edge${link.source === selectedId || link.target === selectedId ? ' active' : ''}`,
      });
      svg.append(line);
    });

    graph.nodes.forEach((node) => {
      const point = positions.get(node.id);
      if (!point) return;
      const group = svgElement('g', {
        class: `graph-node${node.id === selectedId ? ' current' : ''}${node.missing ? ' missing' : ''}`,
        transform: `translate(${point.x} ${point.y})`,
        role: 'button',
        tabindex: '0',
        'aria-label': node.missing ? `创建页面 ${node.label}` : `打开笔记 ${node.label}`,
      });
      const circle = svgElement('circle', { r: node.id === selectedId ? (mini ? 15 : 24) : (mini ? 10 : 17) });
      const text = svgElement('text', { x: 0, y: mini ? 25 : 34, 'text-anchor': 'middle' });
      const max = mini ? 8 : 16;
      text.textContent = node.label.length > max ? `${node.label.slice(0, max)}…` : node.label;
      group.append(circle, text);
      const activate = () => openGraphNode(node);
      group.addEventListener('click', activate);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
      svg.append(group);
    });
  }

  function renderFullGraph() {
    const graph = Core.buildGraph(state.notes);
    dom.graphSummary.textContent = `${state.notes.length} 则笔记 · ${graph.links.length} 条连接`;
    renderGraph(dom.graphCanvas, graph, state.selectedId, 1040, 640, false);
  }

  function renderAll() {
    renderTags();
    renderList();
    renderEditor();
    renderContext();
  }

  function setMode(mode) {
    state.mode = mode === 'preview' ? 'preview' : 'edit';
    const editing = state.mode === 'edit';
    dom.editorStage.hidden = !editing;
    dom.formatToolbar.hidden = !editing;
    dom.preview.hidden = editing;
    dom.editModeButton.classList.toggle('active', editing);
    dom.previewModeButton.classList.toggle('active', !editing);
    dom.editModeButton.setAttribute('aria-pressed', String(editing));
    dom.previewModeButton.setAttribute('aria-pressed', String(!editing));
    if (!editing) renderPreview();
  }

  function selectNote(noteId, options = {}) {
    if (!state.notes.some((note) => note.id === noteId)) return;
    state.selectedId = noteId;
    localStorage.setItem(SELECTED_KEY, noteId);
    hideSuggestions();
    renderList();
    renderEditor();
    renderContext();
    if (options.closeGraph && dom.graphDialog.open) dom.graphDialog.close();
    if (options.focusTitle) {
      dom.titleInput.focus();
      dom.titleInput.select();
    }
    if (window.innerWidth <= 620) byId('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function newNote(requestedTitle = '') {
    const title = requestedTitle.trim() || Core.createUniqueTitle(state.notes, '未命名笔记');
    const existing = state.notes.find((note) => Core.titleKey(note.title) === Core.titleKey(title));
    if (existing) {
      selectNote(existing.id, { closeGraph: true });
      notify('已打开同名笔记');
      return existing;
    }
    const note = Core.createNote({
      title,
      content: requestedTitle ? `# ${title}\n\n从这里开始记录。` : '',
      tags: [],
    });
    state.notes = [note, ...state.notes];
    state.selectedId = note.id;
    state.query = '';
    state.tag = '';
    dom.searchInput.value = '';
    scheduleSave();
    renderAll();
    if (dom.graphDialog.open) dom.graphDialog.close();
    dom.titleInput.focus();
    if (!requestedTitle) dom.titleInput.select();
    notify(requestedTitle ? `已创建“${title}”` : '已创建一张空白笔记');
    return note;
  }

  function duplicateCurrent() {
    const source = currentNote();
    if (!source) return;
    const note = Core.createNote({
      title: Core.createUniqueTitle(state.notes, `${source.title} 副本`),
      content: source.content,
      tags: source.tags,
    });
    state.notes = [note, ...state.notes];
    state.selectedId = note.id;
    scheduleSave();
    renderAll();
    notify('已复制当前笔记');
  }

  function confirmDelete() {
    const note = currentNote();
    if (!note) return;
    if (state.notes.length === 1) {
      notify('知识库至少需要保留一则笔记');
      return;
    }
    dom.deleteDialogCopy.textContent = `删除“${note.title}”后，其他笔记中的双链会变成待创建页面。此操作无法撤销。`;
    dom.deleteDialog.showModal();
  }

  function deleteCurrent() {
    const note = currentNote();
    if (!note || state.notes.length === 1) return;
    const index = state.notes.findIndex((item) => item.id === note.id);
    state.notes = state.notes.filter((item) => item.id !== note.id);
    state.selectedId = state.notes[Math.min(index, state.notes.length - 1)].id;
    scheduleSave();
    renderAll();
    notify(`已删除“${note.title}”`);
  }

  function commitTitle() {
    const note = currentNote();
    if (!note) return;
    const nextTitle = dom.titleInput.value.trim();
    if (!nextTitle) {
      dom.titleInput.value = note.title;
      notify('标题不能为空');
      return;
    }
    if (nextTitle === note.title) return;
    try {
      state.notes = Core.renameNote(state.notes, note.id, nextTitle);
      dom.pathTitle.textContent = nextTitle;
      scheduleSave();
      renderTags();
      renderList();
      renderContext();
      notify('标题与关联双链已更新');
    } catch (error) {
      dom.titleInput.value = note.title;
      notify(error.message);
    }
  }

  function updateContent() {
    const note = currentNote();
    if (!note) return;
    const content = dom.contentInput.value;
    const updatedAt = new Date().toISOString();
    state.notes = state.notes.map((item) => item.id === note.id ? { ...item, content, updatedAt } : item);
    renderDocumentStats();
    showLinkSuggestions();
    scheduleSave();
    scheduleRelatedRender();
  }

  function updateTags() {
    const note = currentNote();
    if (!note) return;
    const tags = Core.normalizeTags(dom.tagsInput.value);
    dom.tagsInput.value = tags.join(', ');
    state.notes = state.notes.map((item) => item.id === note.id
      ? { ...item, tags, updatedAt: new Date().toISOString() }
      : item);
    scheduleSave();
    renderTags();
    renderList();
    renderContext();
  }

  function findLinkQuery() {
    const cursor = dom.contentInput.selectionStart;
    const before = dom.contentInput.value.slice(0, cursor);
    const open = before.lastIndexOf('[[');
    if (open < 0 || before.slice(open + 2).includes(']]') || before.slice(open + 2).includes('\n')) return null;
    return { start: open, cursor, query: before.slice(open + 2) };
  }

  function showLinkSuggestions() {
    const match = findLinkQuery();
    if (!match) return hideSuggestions();
    const query = Core.titleKey(match.query);
    const matches = state.notes
      .filter((note) => note.id !== state.selectedId && (!query || Core.titleKey(note.title).includes(query)))
      .slice(0, 6);
    if (!matches.length) return hideSuggestions();

    state.suggestion = { ...match, notes: matches, index: 0 };
    dom.linkSuggestions.replaceChildren();
    matches.forEach((note, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `suggestion-button${index === 0 ? ' active' : ''}`;
      button.dataset.suggestionIndex = String(index);
      const label = document.createElement('span');
      label.textContent = note.title;
      const hint = document.createElement('small');
      hint.textContent = note.tags[0] ? `#${note.tags[0]}` : '笔记';
      button.append(label, hint);
      dom.linkSuggestions.append(button);
    });
    dom.linkSuggestions.hidden = false;
  }

  function hideSuggestions() {
    state.suggestion = null;
    dom.linkSuggestions.hidden = true;
    dom.linkSuggestions.replaceChildren();
  }

  function chooseSuggestion(index) {
    if (!state.suggestion) return;
    const note = state.suggestion.notes[index];
    if (!note) return;
    const { start, cursor } = state.suggestion;
    const source = dom.contentInput.value;
    dom.contentInput.value = `${source.slice(0, start)}[[${note.title}]]${source.slice(cursor)}`;
    const nextCursor = start + note.title.length + 4;
    dom.contentInput.setSelectionRange(nextCursor, nextCursor);
    hideSuggestions();
    updateContent();
    dom.contentInput.focus();
  }

  function handleSuggestionKeys(event) {
    if (!state.suggestion) return;
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return hideSuggestions();
    if (event.key === 'Enter') return chooseSuggestion(state.suggestion.index);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const length = state.suggestion.notes.length;
    state.suggestion.index = (state.suggestion.index + direction + length) % length;
    [...dom.linkSuggestions.children].forEach((button, index) =>
      button.classList.toggle('active', index === state.suggestion.index),
    );
  }

  function insertFormat(kind) {
    const formats = {
      heading: { prefix: '## ', suffix: '', placeholder: '小标题', line: true },
      bold: { prefix: '**', suffix: '**', placeholder: '重点内容' },
      italic: { prefix: '*', suffix: '*', placeholder: '强调内容' },
      list: { prefix: '- ', suffix: '', placeholder: '列表项目', line: true },
      quote: { prefix: '> ', suffix: '', placeholder: '引用内容', line: true },
      wiki: { prefix: '[[', suffix: ']]', placeholder: '笔记标题' },
    };
    const format = formats[kind];
    if (!format) return;
    const input = dom.contentInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = input.value.slice(start, end) || format.placeholder;
    const needsLineBreak = format.line && start > 0 && input.value[start - 1] !== '\n';
    const prefix = `${needsLineBreak ? '\n' : ''}${format.prefix}`;
    const insertion = `${prefix}${selected}${format.suffix}`;
    input.setRangeText(insertion, start, end, 'end');
    if (start === end) {
      const selectStart = start + prefix.length;
      input.setSelectionRange(selectStart, selectStart + selected.length);
    }
    input.focus();
    updateContent();
  }

  function openWikiTitle(title) {
    const existing = state.notes.find((note) => Core.titleKey(note.title) === Core.titleKey(title));
    if (existing) selectNote(existing.id);
    else newNote(title);
  }

  function openGraphNode(node) {
    if (node.missing) newNote(node.label);
    else selectNote(node.id, { closeGraph: dom.graphDialog.open });
  }

  function safeFilename(value) {
    return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'note';
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    persistNow(false);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`loom89-backup-${stamp}.json`, Core.exportBackup(state.notes), 'application/json;charset=utf-8');
    closeMoreMenu();
    notify(`已导出 ${state.notes.length} 则笔记`);
  }

  function exportMarkdown() {
    const note = currentNote();
    if (!note) return;
    const frontmatter = note.tags.length ? `---\ntags: [${note.tags.join(', ')}]\n---\n\n` : '';
    downloadFile(`${safeFilename(note.title)}.md`, `${frontmatter}${note.content}`, 'text/markdown;charset=utf-8');
    closeMoreMenu();
    notify('已导出当前 Markdown');
  }

  async function importBackup(event) {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = Core.importBackup(await file.text());
      const shouldReplace = window.confirm(`导入会替换当前 ${state.notes.length} 则笔记。是否继续导入 ${imported.notes.length} 则笔记？`);
      if (!shouldReplace) return;
      state.notes = imported.notes;
      state.selectedId = state.notes[0].id;
      state.query = '';
      state.tag = '';
      dom.searchInput.value = '';
      persistNow(false);
      renderAll();
      notify(`已导入 ${state.notes.length} 则笔记`);
    } catch (error) {
      notify(error.message);
    } finally {
      closeMoreMenu();
    }
  }

  function toggleMoreMenu() {
    const nextOpen = dom.moreMenu.hidden;
    dom.moreMenu.hidden = !nextOpen;
    dom.moreButton.setAttribute('aria-expanded', String(nextOpen));
  }

  function closeMoreMenu() {
    dom.moreMenu.hidden = true;
    dom.moreButton.setAttribute('aria-expanded', 'false');
  }

  function openGuide() {
    closeMoreMenu();
    dom.guideDialog.showModal();
  }

  function bindEvents() {
    dom.newNoteButton.addEventListener('click', () => newNote());
    dom.emptyNewButton.addEventListener('click', () => newNote());
    dom.duplicateButton.addEventListener('click', duplicateCurrent);
    dom.deleteButton.addEventListener('click', confirmDelete);
    dom.confirmDeleteButton.addEventListener('click', deleteCurrent);

    dom.searchInput.addEventListener('input', () => {
      state.query = dom.searchInput.value.trim();
      renderList();
    });
    dom.clearSearchButton.addEventListener('click', () => {
      state.query = '';
      state.tag = '';
      dom.searchInput.value = '';
      renderTags();
      renderList();
      dom.searchInput.focus();
    });
    dom.tagFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (!button) return;
      state.tag = button.dataset.tag;
      renderTags();
      renderList();
    });
    dom.noteList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-note-id]');
      if (button) selectNote(button.dataset.noteId);
    });

    dom.titleInput.addEventListener('input', () => {
      dom.pathTitle.textContent = dom.titleInput.value.trim() || '未命名笔记';
      setSaveStatus('saving', '标题待确认…');
    });
    dom.titleInput.addEventListener('change', commitTitle);
    dom.titleInput.addEventListener('blur', commitTitle);
    dom.tagsInput.addEventListener('change', updateTags);
    dom.contentInput.addEventListener('input', updateContent);
    dom.contentInput.addEventListener('keydown', handleSuggestionKeys);
    dom.linkSuggestions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-suggestion-index]');
      if (button) chooseSuggestion(Number(button.dataset.suggestionIndex));
    });
    dom.formatToolbar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-format]');
      if (button) insertFormat(button.dataset.format);
    });

    dom.editModeButton.addEventListener('click', () => setMode('edit'));
    dom.previewModeButton.addEventListener('click', () => setMode('preview'));
    dom.preview.addEventListener('click', (event) => {
      const link = event.target.closest('[data-note-title]');
      if (link) openWikiTitle(link.dataset.noteTitle);
    });

    [dom.outgoingList, dom.backlinkList].forEach((list) => list.addEventListener('click', (event) => {
      const noteButton = event.target.closest('[data-note-id]');
      const missingButton = event.target.closest('[data-missing-title]');
      if (noteButton) selectNote(noteButton.dataset.noteId);
      if (missingButton) newNote(missingButton.dataset.missingTitle);
    }));

    dom.refreshGraphButton.addEventListener('click', () => {
      renderContext();
      notify('关系图已刷新');
    });
    dom.openGraphButton.addEventListener('click', () => {
      renderFullGraph();
      dom.graphDialog.showModal();
    });
    dom.closeGraphButton.addEventListener('click', () => dom.graphDialog.close());

    dom.moreButton.addEventListener('click', toggleMoreMenu);
    dom.exportBackupButton.addEventListener('click', exportBackup);
    dom.exportMarkdownButton.addEventListener('click', exportMarkdown);
    dom.importInput.addEventListener('change', importBackup);
    dom.openGuideButton.addEventListener('click', openGuide);
    dom.showShortcutsButton.addEventListener('click', openGuide);
    dom.closeGuideButton.addEventListener('click', () => dom.guideDialog.close());

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.menu-wrap')) closeMoreMenu();
      if (!event.target.closest('#linkSuggestions') && event.target !== dom.contentInput) hideSuggestions();
    });

    [dom.graphDialog, dom.deleteDialog, dom.guideDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    document.addEventListener('keydown', (event) => {
      const command = event.ctrlKey || event.metaKey;
      if (!command) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dom.searchInput.focus();
        dom.searchInput.select();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newNote();
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        commitTitle();
        updateTags();
        persistNow(true);
      }
    });

    window.addEventListener('beforeunload', () => persistNow(false));
    window.addEventListener('resize', () => {
      clearTimeout(state.renderTimer);
      state.renderTimer = window.setTimeout(() => {
        renderContext();
        if (dom.graphDialog.open) renderFullGraph();
      }, 120);
    });
  }

  function init() {
    loadState();
    bindEvents();
    renderAll();
    document.body.classList.add('ready');
  }

  window.__LOOM89__ = Object.freeze({
    flush: () => persistNow(false),
    getState: () => JSON.parse(JSON.stringify({ notes: state.notes, selectedId: state.selectedId })),
    openNote: (id) => selectNote(id),
  });

  init();
})();
