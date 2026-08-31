(function startPortfolio() {
  'use strict';

  const Core = window.PortfolioCore;
  const FEATURED_FALLBACK_PROJECTS = [
    [1, '百应用挑战追踪器', '进度、筛选与挑战数据备份', 1, '../../index.html'],
    [37, '个人博客', 'Markdown 写作、全文检索与标签归档', 3, '../037-personal-blog/'],
    [40, '图片压缩工具', 'Canvas 本地批量压缩与下载', 3, '../040-image-compressor/'],
    [52, '在线脑图编辑器', '分支编辑、折叠、撤销与导出', 3, '../052-mind-map-editor/'],
    [60, '在线图片编辑器', '本地裁剪、调色、文字与导出', 3, '../060-image-editor/'],
    [62, 'AI聊天助手', '流式对话、多会话与临时密钥', 4, '../062-ai-chat/'],
    [68, '智能客服机器人', '意图路由、知识引用与人工接管', 4, '../068-customer-support/'],
    [72, '全栈电商 Demo', '选品、结算、取货与订单履约', 4, '../072-fullstack-shop/'],
    [76, '订阅管理', '续费时间线、多币种预算与提醒', 4, '../076-subscription-manager/'],
    [78, '私人网盘', '文件入库、预览、分享与回收站', 4, '../078-private-cloud/'],
    [80, '视频网站 Demo', '公开片单、弹幕与进度恢复', 4, '../080-video-site/'],
    [100, '个人作品集网站', '100 Apps 的项目索引与交付档案', 5, './'],
  ].map(([id, name, description, level, link]) => ({
    id,
    code: String(id).padStart(3, '0'),
    name,
    description,
    level,
    link: new URL(link, window.location.href).href,
    status: 'done',
  }));

  function readEmbeddedCatalog() {
    const rows = window.PORTFOLIO_CATALOG;
    if (!Array.isArray(rows) || rows.length !== Core.MAX_PROJECTS) return FEATURED_FALLBACK_PROJECTS;
    const doneIds = new Set(rows.flatMap((row, index) => row[4] === 'done' ? [index + 1] : []));
    return Core.normalizeProjects(rows.map((row) => row.slice(0, 4)), doneIds);
  }

  const EMBEDDED_PROJECTS = readEmbeddedCatalog();

  const state = {
    projects: EMBEDDED_PROJECTS,
    filteredProjects: EMBEDDED_PROJECTS,
    selectedId: 100,
    filters: { query: '', level: 'all', status: 'all' },
    source: EMBEDDED_PROJECTS.length === Core.MAX_PROJECTS ? 'embedded' : 'featured-fallback',
    lastExport: null,
  };

  const dom = Object.fromEntries([
    'tone-button', 'done-count', 'total-count', 'linked-count', 'punchboard', 'readout-code',
    'readout-status', 'readout-name', 'readout-description', 'readout-link', 'data-status',
    'featured-list', 'archive-controls', 'search-input', 'level-filter', 'status-filter',
    'clear-filters', 'export-button', 'result-count', 'archive-list', 'empty-state',
    'empty-clear', 'project-dialog', 'dialog-code', 'dialog-close', 'dialog-status',
    'dialog-title', 'dialog-description', 'dialog-level', 'dialog-delivery', 'dialog-link',
    'dialog-unavailable',
  ].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

  const toneLabel = dom.toneButton.querySelector('.tone-label');
  let lastDialogTrigger = null;

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function statusLabel(project) {
    return project.status === 'done' ? '已完成' : '计划中';
  }

  function projectById(id) {
    return state.projects.find((project) => project.id === Number(id));
  }

  function renderSummary() {
    const summary = Core.summarizeProjects(state.projects);
    dom.doneCount.textContent = summary.done;
    dom.totalCount.textContent = summary.total || 100;
    dom.linkedCount.textContent = summary.linked;
    document.documentElement.style.setProperty('--completion', `${summary.percent}%`);
  }

  function renderBoard() {
    const fragment = document.createDocumentFragment();
    dom.punchboard.replaceChildren();
    state.projects.forEach((project) => {
      const link = create('a', 'project-cell');
      link.href = project.link;
      link.dataset.projectId = project.id;
      link.dataset.status = project.status;
      link.setAttribute('role', 'gridcell');
      link.setAttribute('aria-label', `运行 App ${project.code}：${project.name}，${statusLabel(project)}`);
      link.title = `${project.code} · ${project.name} · 点击运行`;
      link.textContent = project.id % 10 === 0 ? project.id : '';
      link.addEventListener('mouseenter', () => selectProject(project.id));
      link.addEventListener('focus', () => selectProject(project.id));
      link.addEventListener('click', () => selectProject(project.id));
      fragment.appendChild(link);
    });
    dom.punchboard.appendChild(fragment);
    selectProject(projectById(state.selectedId) ? state.selectedId : state.projects.at(-1)?.id);
  }

  function selectProject(id) {
    const project = projectById(id);
    if (!project) return;
    state.selectedId = project.id;
    dom.punchboard.querySelectorAll('.project-cell[aria-current="true"]').forEach((cell) => cell.removeAttribute('aria-current'));
    const currentCell = dom.punchboard.querySelector(`[data-project-id="${project.id}"]`);
    if (currentCell) currentCell.setAttribute('aria-current', 'true');
    dom.readoutCode.textContent = `APP ${project.code} · L${project.level}`;
    dom.readoutStatus.textContent = statusLabel(project);
    dom.readoutStatus.dataset.status = project.status;
    dom.readoutName.textContent = project.name;
    dom.readoutDescription.textContent = project.description;
    dom.readoutLink.hidden = !project.link;
    if (project.link) {
      dom.readoutLink.href = project.link;
      dom.readoutLink.removeAttribute('target');
      dom.readoutLink.removeAttribute('rel');
      dom.readoutLink.firstChild.textContent = '打开线上项目 ';
    }
  }

  function renderFeatured() {
    const featured = Core.pickFeaturedProjects(state.projects, [62, 68, 72, 78, 80, 52, 60, 40], 3);
    const fragment = document.createDocumentFragment();
    dom.featuredList.replaceChildren();
    featured.forEach((project, index) => {
      const article = create('article', 'featured-item');
      const marker = create('p', 'featured-marker', `0${index + 1} / APP ${project.code}`);
      const copy = create('div', 'featured-copy');
      copy.append(create('h3', '', project.name), create('p', '', project.description));
      const meta = create('div', 'featured-meta');
      meta.append(create('span', '', `LEVEL ${project.level}`), create('span', '', 'LIVE BUILD'));
      const link = create('a', 'featured-link', '查看项目 ↗');
      link.href = project.link;
      link.setAttribute('aria-label', `打开 ${project.name}`);
      article.append(marker, copy, meta, link);
      fragment.appendChild(article);
    });
    dom.featuredList.appendChild(fragment);
  }

  function createArchiveItem(project) {
    const item = create('li', 'archive-item');
    const button = create('button', 'archive-item-button');
    button.type = 'button';
    button.dataset.projectId = project.id;
    button.setAttribute('aria-label', `查看 App ${project.code} ${project.name} 详情`);
    const code = create('span', 'archive-code', project.code);
    const title = create('span', 'archive-name', project.name);
    const description = create('span', 'archive-description', project.description);
    const meta = create('span', 'archive-meta');
    meta.append(create('span', '', `L${project.level}`), create('span', `status-chip status-${project.status}`, statusLabel(project)), create('span', 'archive-arrow', '↗'));
    button.append(code, title, description, meta);
    button.addEventListener('click', () => openProject(project.id, button));
    item.appendChild(button);
    return item;
  }

  function renderArchive() {
    state.filteredProjects = Core.filterProjects(state.projects, state.filters);
    const fragment = document.createDocumentFragment();
    state.filteredProjects.forEach((project) => fragment.appendChild(createArchiveItem(project)));
    dom.archiveList.replaceChildren(fragment);
    dom.resultCount.textContent = `显示 ${state.filteredProjects.length} / ${state.projects.length} 个项目`;
    dom.emptyState.hidden = state.filteredProjects.length > 0;
    dom.archiveList.hidden = state.filteredProjects.length === 0;
  }

  function renderAll() {
    renderSummary();
    renderBoard();
    renderFeatured();
    renderArchive();
  }

  function openProject(id, trigger) {
    const project = projectById(id);
    if (!project) return;
    lastDialogTrigger = trigger || document.activeElement;
    dom.dialogCode.textContent = `APP ${project.code}`;
    dom.dialogStatus.textContent = statusLabel(project);
    dom.dialogStatus.dataset.status = project.status;
    dom.dialogTitle.textContent = project.name;
    dom.dialogDescription.textContent = project.description;
    dom.dialogLevel.textContent = `Level ${project.level}`;
    dom.dialogDelivery.textContent = project.link ? '公开链接可访问' : '等待公开链接';
    dom.dialogLink.hidden = !project.link;
    dom.dialogUnavailable.hidden = Boolean(project.link);
    if (project.link) dom.dialogLink.href = project.link;
    if (!dom.projectDialog.open) dom.projectDialog.showModal();
  }

  function closeProject() {
    dom.projectDialog.close();
    if (lastDialogTrigger && document.contains(lastDialogTrigger)) lastDialogTrigger.focus();
  }

  function readFilters() {
    state.filters = {
      query: dom.searchInput.value,
      level: dom.levelFilter.value,
      status: dom.statusFilter.value,
    };
    renderArchive();
  }

  function clearFilters({ focus = true } = {}) {
    dom.searchInput.value = '';
    dom.levelFilter.value = 'all';
    dom.statusFilter.value = 'all';
    readFilters();
    if (focus) dom.searchInput.focus();
  }

  function exportCatalog() {
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      source: state.source,
      projects: state.projects,
    }, null, 2);
    state.lastExport = payload;
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = create('a');
    link.href = url;
    link.download = 'index-100-portfolio.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    dom.dataStatus.textContent = '作品清单已下载。';
  }

  function applyTone(tone, persist = true) {
    const isInk = tone === 'ink';
    document.documentElement.dataset.theme = isInk ? 'ink' : 'blueprint';
    dom.toneButton.setAttribute('aria-pressed', String(isInk));
    toneLabel.textContent = isInk ? '日读' : '夜读';
    if (persist) {
      try { localStorage.setItem('index100-tone', isInk ? 'ink' : 'blueprint'); } catch {}
    }
  }

  function showEmbeddedCatalog() {
    state.projects = EMBEDDED_PROJECTS;
    state.filteredProjects = EMBEDDED_PROJECTS;
    state.source = EMBEDDED_PROJECTS.length === Core.MAX_PROJECTS ? 'embedded' : 'featured-fallback';
    state.selectedId = 100;
    dom.dataStatus.textContent = EMBEDDED_PROJECTS.length === Core.MAX_PROJECTS
      ? '已装入内置目录 · 100 个项目可直接运行 · 正在后台核对追踪器'
      : `完整目录不可用 · 当前展示 ${EMBEDDED_PROJECTS.length} 个精选项目`;
    renderAll();
    document.body.classList.add('ready');
  }

  async function loadCatalog() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(new URL('../../index.html', window.location.href), {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const projects = Core.parseTrackerSource(await response.text());
      if (projects.length !== 100) throw new Error(`只读取到 ${projects.length} 个项目`);
      state.projects = projects;
      state.source = 'tracker';
      state.selectedId = 100;
      dom.dataStatus.textContent = '已核对根追踪器 · 100 个项目可直接运行';
      renderAll();
    } catch (error) {
      dom.dataStatus.textContent = EMBEDDED_PROJECTS.length === Core.MAX_PROJECTS
        ? '根追踪器暂未响应 · 已使用内置的 100 项完整目录'
        : `追踪器暂不可读 · 当前展示 ${EMBEDDED_PROJECTS.length} 个精选项目`;
      console.warn('INDEX/100 tracker refresh skipped:', error.name === 'AbortError' ? 'timeout' : error.message);
    } finally {
      window.clearTimeout(timeoutId);
    }
    return state.projects;
  }

  dom.toneButton.addEventListener('click', () => applyTone(document.documentElement.dataset.theme === 'ink' ? 'blueprint' : 'ink'));
  dom.archiveControls.addEventListener('input', readFilters);
  dom.archiveControls.addEventListener('change', readFilters);
  dom.archiveControls.addEventListener('submit', (event) => event.preventDefault());
  dom.clearFilters.addEventListener('click', () => clearFilters());
  dom.emptyClear.addEventListener('click', () => clearFilters());
  dom.exportButton.addEventListener('click', exportCatalog);
  dom.dialogClose.addEventListener('click', closeProject);
  dom.projectDialog.addEventListener('click', (event) => {
    if (event.target === dom.projectDialog) closeProject();
  });
  dom.projectDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeProject();
  });

  let initialTone = 'blueprint';
  try { initialTone = localStorage.getItem('index100-tone') || 'blueprint'; } catch {}
  applyTone(initialTone, false);

  window.__INDEX100__ = Object.freeze({
    getState: () => ({ ...state, projects: [...state.projects], filteredProjects: [...state.filteredProjects], filters: { ...state.filters } }),
    selectProject,
    openProject,
    clearFilters,
    exportCatalog,
    reloadCatalog: loadCatalog,
  });

  showEmbeddedCatalog();
  void loadCatalog();
})();
