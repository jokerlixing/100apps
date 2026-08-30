(function startFitroom() {
  'use strict';

  const Core = window.ResumeCore;
  if (!Core) throw new Error('ResumeCore failed to load');

  const params = new URLSearchParams(window.location.search);
  const storeSuffix = (params.get('store') || 'default').replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'default';
  const STORAGE_KEY = `fitroom92:workspace:${storeSuffix}`;
  const STATUS_LABELS = {
    draft: '草稿', ready: '可投递', applied: '已投递', interview: '面试中', offer: '已录用', closed: '已结束',
  };

  const elements = {
    masterForm: document.querySelector('#master-form'),
    saveState: document.querySelector('#save-state'),
    experienceList: document.querySelector('#experience-list'),
    projectList: document.querySelector('#project-list'),
    targetForm: document.querySelector('#target-form'),
    targetCompany: document.querySelector('#target-company'),
    targetRole: document.querySelector('#target-role'),
    targetJob: document.querySelector('#target-job'),
    targetError: document.querySelector('#target-error'),
    liveScore: document.querySelector('#live-score'),
    liveSummary: document.querySelector('#live-summary'),
    versionList: document.querySelector('#version-list'),
    versionCount: document.querySelector('#version-count'),
    emptyRack: document.querySelector('#empty-rack'),
    versionTitle: document.querySelector('#version-title'),
    versionStatus: document.querySelector('#version-status'),
    recutButton: document.querySelector('#recut-button'),
    copyButton: document.querySelector('#copy-button'),
    printButton: document.querySelector('#print-button'),
    deleteVersionButton: document.querySelector('#delete-version-button'),
    fitRuler: document.querySelector('.fit-ruler'),
    scoreGauge: document.querySelector('#score-gauge'),
    fitScore: document.querySelector('#fit-score'),
    matchedCount: document.querySelector('#matched-count'),
    missingCount: document.querySelector('#missing-count'),
    matchedKeywords: document.querySelector('#matched-keywords'),
    missingKeywords: document.querySelector('#missing-keywords'),
    resumeSheet: document.querySelector('#resume-sheet'),
    previewEmpty: document.querySelector('#preview-empty'),
    resumeTarget: document.querySelector('#resume-target'),
    resumeName: document.querySelector('#resume-name'),
    resumeHeadline: document.querySelector('#resume-headline'),
    resumeContact: document.querySelector('#resume-contact'),
    resumeSummary: document.querySelector('#resume-summary'),
    resumeSummarySection: document.querySelector('#resume-summary-section'),
    resumeSkills: document.querySelector('#resume-skills'),
    resumeExperiences: document.querySelector('#resume-experiences'),
    resumeProjects: document.querySelector('#resume-projects'),
    resumeEducation: document.querySelector('#resume-education'),
    resumeTime: document.querySelector('#resume-time'),
    exportButton: document.querySelector('#export-button'),
    importButton: document.querySelector('#import-button'),
    importFile: document.querySelector('#import-file'),
    resetButton: document.querySelector('#reset-button'),
    entryDialog: document.querySelector('#entry-dialog'),
    entryForm: document.querySelector('#entry-form'),
    entryKind: document.querySelector('#entry-kind'),
    entryId: document.querySelector('#entry-id'),
    entryKicker: document.querySelector('#entry-kicker'),
    entryTitle: document.querySelector('#entry-title'),
    entryPrimaryLabel: document.querySelector('#entry-primary-label'),
    entrySecondaryLabel: document.querySelector('#entry-secondary-label'),
    entryPrimary: document.querySelector('#entry-primary'),
    entrySecondary: document.querySelector('#entry-secondary'),
    entryPeriod: document.querySelector('#entry-period'),
    entryPeriodField: document.querySelector('#entry-period-field'),
    entryTags: document.querySelector('#entry-tags'),
    entryTagsField: document.querySelector('#entry-tags-field'),
    entryBullets: document.querySelector('#entry-bullets'),
    entryError: document.querySelector('#entry-error'),
    confirmDialog: document.querySelector('#confirm-dialog'),
    confirmTitle: document.querySelector('#confirm-title'),
    confirmCopy: document.querySelector('#confirm-copy'),
    confirmAction: document.querySelector('#confirm-action'),
    toast: document.querySelector('#toast'),
  };

  let toastTimer = 0;
  let saveTimer = 0;
  let pendingConfirmation = null;
  let lastExport = '';

  function demoProfile() {
    return Core.normalizeProfile({
      name: '林星',
      headline: '产品经理 / B2B 增长方向',
      email: 'star.lin@example.com',
      phone: '+86 138 0000 0092',
      location: '上海',
      website: 'starlin.work',
      summary: '5 年 B2B 产品经验，负责过从 0 到 1 的协作产品与规模化增长。习惯从用户研究出发，用数据分析和实验验证产品决策。',
      skills: ['产品策略', '用户研究', '数据分析', 'SQL', 'A/B 测试', '路线图', 'Figma', '沟通协作'],
      education: '海岸大学 · 信息管理与信息系统 · 本科 · 2013 — 2017',
      experiences: [
        {
          id: 'experience-northstar', role: '高级产品经理', company: '北斗科技', period: '2022 — 至今',
          bullets: [
            '负责 B2B SaaS 协作产品的策略与路线图，服务 1,800 家付费团队。',
            '通过 24 场用户研究重构新手激活路径，试用转付费率提升 18%。',
            '使用 SQL 搭建核心漏斗，并以 17 组 A/B 测试验证增长假设。',
            '推动产品、设计、研发和客户成功建立统一季度规划机制。',
          ],
        },
        {
          id: 'experience-harbor', role: '产品经理', company: '港湾云', period: '2019 — 2022',
          bullets: [
            '从 0 到 1 交付企业知识库，首年覆盖 120 家客户与 3.4 万名用户。',
            '梳理 6 类权限场景，把关键任务完成时间从 11 分钟缩短到 4 分钟。',
            '维护跨团队路线图和版本复盘，连续 8 个季度准时交付重点能力。',
          ],
        },
      ],
      projects: [
        {
          id: 'project-growth-lab', name: '增长实验台', role: '项目负责人', tags: ['数据分析', 'A/B 测试', 'SQL'],
          bullets: ['统一 6 条业务线的实验口径与显著性标准。', '把实验复盘周期从两周缩短到三天，并沉淀 42 个可复用实验。'],
        },
        {
          id: 'project-research-library', name: '用户证据库', role: '产品设计', tags: ['用户研究', 'Figma'],
          bullets: ['将访谈、工单与行为数据按决策主题关联，供 35 名产品成员检索。', '每月重复调研时长减少约 28 小时。'],
        },
      ],
    });
  }

  function seedWorkspace() {
    const profile = demoProfile();
    const growth = Core.generateVersion(profile, {
      company: '星轨数据',
      role: '增长产品经理',
      status: 'ready',
      jobText: '负责 B2B SaaS 产品策略与增长策略；熟悉用户研究、数据分析、SQL 和 A/B 测试；具备团队管理经验。',
    }, { id: 'demo-growth', now: '2026-08-31T01:30:00.000Z' });
    const platform = Core.generateVersion(profile, {
      company: '山岚协作',
      role: '平台产品经理',
      status: 'applied',
      jobText: '规划企业协作平台路线图，负责需求分析、用户研究、项目管理和跨部门沟通协作；有 B2B SaaS 经验优先。',
    }, { id: 'demo-platform', now: '2026-08-30T15:20:00.000Z' });
    return Core.normalizeWorkspace({ profile, versions: [growth, platform], activeVersionId: growth.id });
  }

  function loadWorkspace() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return seedWorkspace();
    try {
      return Core.importWorkspace(stored);
    } catch (error) {
      console.warn('FITROOM ignored an invalid local workspace:', error.message);
      return seedWorkspace();
    }
  }

  let state = loadWorkspace();

  function currentVersion() {
    return state.versions.find((version) => version.id === state.activeVersionId) || null;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
  }

  function setSavedFeedback() {
    elements.saveState.textContent = '保存中';
    elements.saveState.classList.add('is-saving');
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      elements.saveState.textContent = '已保存';
      elements.saveState.classList.remove('is-saving');
    }, 360);
  }

  function saveWorkspace(options = {}) {
    state = Core.normalizeWorkspace(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (!options.silent) setSavedFeedback();
    } catch {
      showToast('浏览器空间不足，当前修改尚未保存。请先导出备份。');
    }
  }

  function fillMasterForm() {
    const profile = state.profile;
    for (const name of ['name', 'headline', 'email', 'phone', 'location', 'website', 'summary', 'education']) {
      const field = elements.masterForm.elements.namedItem(name);
      if (field) field.value = profile[name] || '';
    }
    elements.masterForm.elements.namedItem('skills').value = profile.skills.join('，');
  }

  function readMasterForm() {
    const data = new FormData(elements.masterForm);
    state.profile = Core.normalizeProfile({
      ...state.profile,
      name: data.get('name'),
      headline: data.get('headline'),
      email: data.get('email'),
      phone: data.get('phone'),
      location: data.get('location'),
      website: data.get('website'),
      summary: data.get('summary'),
      skills: data.get('skills'),
      education: data.get('education'),
    });
  }

  function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function renderRecords(kind) {
    const isExperience = kind === 'experience';
    const list = isExperience ? state.profile.experiences : state.profile.projects;
    const container = isExperience ? elements.experienceList : elements.projectList;
    container.replaceChildren();
    if (!list.length) {
      container.append(textElement('p', isExperience ? '还没有工作经历。添加一项，版本生成器才有证据可选。' : '还没有项目经历。添加最能证明能力的一项。', 'record-empty'));
      return;
    }
    list.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'record-card';
      const copy = document.createElement('div');
      copy.append(textElement('h4', isExperience ? item.role || '未命名职位' : item.name || '未命名项目'));
      copy.append(textElement('p', isExperience ? [item.company, item.period].filter(Boolean).join(' · ') : [item.role, ...item.tags].filter(Boolean).join(' · ')));
      copy.append(textElement('small', `${item.bullets.length} 条事实证据`));
      const actions = document.createElement('div');
      actions.className = 'record-actions';
      const edit = textElement('button', '编辑');
      edit.type = 'button';
      edit.dataset.edit = kind;
      edit.dataset.id = item.id;
      edit.setAttribute('aria-label', `编辑${isExperience ? item.role : item.name}`);
      const remove = textElement('button', '删除');
      remove.type = 'button';
      remove.dataset.remove = kind;
      remove.dataset.id = item.id;
      remove.setAttribute('aria-label', `删除${isExperience ? item.role : item.name}`);
      actions.append(edit, remove);
      card.append(copy, actions);
      container.append(card);
    });
  }

  function openEntry(kind, id = '') {
    const isExperience = kind === 'experience';
    const list = isExperience ? state.profile.experiences : state.profile.projects;
    const item = list.find((entry) => entry.id === id) || {};
    elements.entryKind.value = kind;
    elements.entryId.value = item.id || '';
    elements.entryKicker.textContent = isExperience ? 'WORK HISTORY' : 'SELECTED WORK';
    elements.entryTitle.textContent = `${item.id ? '编辑' : '添加'}${isExperience ? '工作经历' : '项目经历'}`;
    elements.entryPrimaryLabel.textContent = isExperience ? '职位' : '项目名称';
    elements.entrySecondaryLabel.textContent = isExperience ? '公司' : '项目角色';
    elements.entryPrimary.value = isExperience ? (item.role || '') : (item.name || '');
    elements.entrySecondary.value = isExperience ? (item.company || '') : (item.role || '');
    elements.entryPeriod.value = item.period || '';
    elements.entryTags.value = Array.isArray(item.tags) ? item.tags.join('，') : '';
    elements.entryBullets.value = Array.isArray(item.bullets) ? item.bullets.join('\n') : '';
    elements.entryPeriodField.hidden = !isExperience;
    elements.entryTagsField.hidden = isExperience;
    elements.entryError.hidden = true;
    elements.entryDialog.showModal();
    window.setTimeout(() => elements.entryPrimary.focus(), 0);
  }

  function makeLocalId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}`;
  }

  function saveEntry(event) {
    event.preventDefault();
    const kind = elements.entryKind.value;
    const isExperience = kind === 'experience';
    const primary = elements.entryPrimary.value.trim();
    if (!primary) {
      elements.entryError.textContent = isExperience ? '请填写职位名称。' : '请填写项目名称。';
      elements.entryError.hidden = false;
      elements.entryPrimary.focus();
      return;
    }
    const id = elements.entryId.value || makeLocalId(kind);
    const record = isExperience ? {
      id, role: primary, company: elements.entrySecondary.value, period: elements.entryPeriod.value, bullets: elements.entryBullets.value,
    } : {
      id, name: primary, role: elements.entrySecondary.value, tags: elements.entryTags.value, bullets: elements.entryBullets.value,
    };
    const key = isExperience ? 'experiences' : 'projects';
    const existingIndex = state.profile[key].findIndex((item) => item.id === id);
    const next = [...state.profile[key]];
    if (existingIndex >= 0) next[existingIndex] = record;
    else next.push(record);
    state.profile = Core.normalizeProfile({ ...state.profile, [key]: next });
    saveWorkspace();
    renderRecords(kind);
    renderLiveMatch();
    elements.entryDialog.close();
    showToast(`${isExperience ? '工作经历' : '项目经历'}已保存。`);
  }

  function openConfirmation({ title, copy, action, label = '确认删除' }) {
    elements.confirmTitle.textContent = title;
    elements.confirmCopy.textContent = copy;
    elements.confirmAction.textContent = label;
    pendingConfirmation = action;
    elements.confirmDialog.returnValue = '';
    elements.confirmDialog.showModal();
  }

  function removeRecord(kind, id) {
    const key = kind === 'experience' ? 'experiences' : 'projects';
    const item = state.profile[key].find((entry) => entry.id === id);
    if (!item) return;
    const label = kind === 'experience' ? item.role : item.name;
    openConfirmation({
      title: `删除“${label}”？`,
      copy: '已生成的历史版本仍保留这份快照；未来新版本不再使用它。',
      action: () => {
        state.profile = Core.normalizeProfile({ ...state.profile, [key]: state.profile[key].filter((entry) => entry.id !== id) });
        saveWorkspace();
        renderRecords(kind);
        renderLiveMatch();
        showToast('母版记录已删除。');
      },
    });
  }

  function renderLiveMatch() {
    const jobText = elements.targetJob.value;
    const result = Core.scoreProfile(state.profile, jobText);
    elements.liveScore.textContent = String(result.score);
    if (!jobText.trim()) {
      elements.liveSummary.textContent = '贴入职位描述后，这里会显示母版已覆盖与仍缺少的关键词。';
    } else if (!result.total) {
      elements.liveSummary.textContent = '没有识别到明确技能词。可以补充工具、方法或岗位能力要求。';
    } else {
      const matched = result.matched.slice(0, 4).join('、') || '暂无';
      const missing = result.missing.slice(0, 3).join('、') || '无明显缺口';
      elements.liveSummary.textContent = `已覆盖：${matched}。仍缺少：${missing}。`;
    }
  }

  function renderVersionList() {
    elements.versionList.replaceChildren();
    elements.versionCount.value = `${state.versions.length} 版`;
    elements.versionCount.textContent = `${state.versions.length} 版`;
    elements.emptyRack.hidden = state.versions.length > 0;
    state.versions.forEach((version) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'version-card';
      button.dataset.versionId = version.id;
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-current', String(version.id === state.activeVersionId));
      const copy = document.createElement('span');
      copy.append(textElement('strong', version.title || version.role || '未命名版本'));
      copy.append(textElement('small', `${STATUS_LABELS[version.status]} · ${formatDate(version.updatedAt)}`));
      const score = textElement('output', String(version.score));
      score.setAttribute('aria-label', `岗位覆盖 ${version.score}%`);
      button.append(copy, score);
      elements.versionList.append(button);
    });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未记录';
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
  }

  function formatFullDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function renderKeywords(container, keywords, emptyText) {
    container.replaceChildren();
    if (!keywords.length) {
      container.append(textElement('span', emptyText, 'keyword-empty'));
      return;
    }
    keywords.forEach((keyword) => container.append(textElement('span', keyword)));
  }

  function appendHighlighted(container, text, keywords) {
    container.replaceChildren();
    const content = String(text || '');
    const useful = [...new Set(keywords.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!useful.length || !content) {
      container.textContent = content;
      return;
    }
    const escaped = useful.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
    let cursor = 0;
    for (const match of content.matchAll(pattern)) {
      if (match.index > cursor) container.append(document.createTextNode(content.slice(cursor, match.index)));
      container.append(textElement('mark', match[0]));
      cursor = match.index + match[0].length;
    }
    if (cursor < content.length) container.append(document.createTextNode(content.slice(cursor)));
  }

  function renderResumeItems(container, items, keywords, kind) {
    container.replaceChildren();
    if (!items.length) {
      container.append(textElement('p', kind === 'experience' ? '母版中暂无工作经历。' : '母版中暂无项目经历。'));
      return;
    }
    items.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'resume-item';
      const heading = document.createElement('div');
      heading.className = 'resume-item-heading';
      const title = document.createElement('h4');
      const primary = kind === 'experience' ? item.role : item.name;
      const secondary = kind === 'experience' ? item.company : item.role;
      title.append(document.createTextNode(primary || '未命名'));
      if (secondary) title.append(document.createTextNode(' '), textElement('span', `· ${secondary}`));
      heading.append(title);
      if (kind === 'experience' && item.period) heading.append(textElement('time', item.period));
      const bullets = document.createElement('ul');
      item.bullets.forEach((bullet) => {
        const row = document.createElement('li');
        appendHighlighted(row, bullet, keywords);
        bullets.append(row);
      });
      article.append(heading, bullets);
      container.append(article);
    });
  }

  function setPreviewDisabled(disabled) {
    [elements.versionTitle, elements.versionStatus, elements.recutButton, elements.copyButton, elements.printButton, elements.deleteVersionButton]
      .forEach((control) => { control.disabled = disabled; });
  }

  function renderPreview() {
    const version = currentVersion();
    const hasVersion = Boolean(version);
    elements.previewEmpty.hidden = hasVersion;
    elements.resumeSheet.hidden = !hasVersion;
    elements.fitRuler.hidden = !hasVersion;
    setPreviewDisabled(!hasVersion);
    if (!version) {
      elements.versionTitle.value = '';
      return;
    }

    const profile = version.profile;
    elements.versionTitle.value = version.title;
    elements.versionStatus.value = version.status;
    elements.scoreGauge.style.setProperty('--score', String(version.score));
    elements.fitScore.textContent = String(version.score);
    elements.matchedCount.value = String(version.matchedKeywords.length);
    elements.matchedCount.textContent = String(version.matchedKeywords.length);
    elements.missingCount.value = String(version.missingKeywords.length);
    elements.missingCount.textContent = String(version.missingKeywords.length);
    renderKeywords(elements.matchedKeywords, version.matchedKeywords, '尚无明确命中');
    renderKeywords(elements.missingKeywords, version.missingKeywords, '没有明显缺口');

    elements.resumeTarget.textContent = [version.company || '目标岗位', version.role].filter(Boolean).join(' / ');
    elements.resumeName.textContent = profile.name || '未填写姓名';
    elements.resumeHeadline.textContent = profile.headline;
    elements.resumeContact.textContent = [profile.email, profile.phone, profile.location, profile.website].filter(Boolean).join('\n');
    appendHighlighted(elements.resumeSummary, profile.summary, version.matchedKeywords);
    elements.resumeSummarySection.hidden = !profile.summary;
    elements.resumeSkills.replaceChildren();
    profile.skills.forEach((skill) => {
      const chip = textElement('span', skill);
      if (version.matchedKeywords.some((keyword) => keyword.toLocaleLowerCase() === skill.toLocaleLowerCase())) chip.classList.add('is-match');
      elements.resumeSkills.append(chip);
    });
    renderResumeItems(elements.resumeExperiences, profile.experiences, version.matchedKeywords, 'experience');
    renderResumeItems(elements.resumeProjects, profile.projects, version.matchedKeywords, 'project');
    elements.resumeEducation.textContent = profile.education || '母版中暂无教育经历。';
    elements.resumeTime.textContent = `UPDATED ${formatFullDate(version.updatedAt)}`;
  }

  function renderAll() {
    renderRecords('experience');
    renderRecords('project');
    renderVersionList();
    renderPreview();
    renderLiveMatch();
  }

  function generateFromTarget(event) {
    if (event) event.preventDefault();
    elements.targetError.hidden = true;
    try {
      const version = Core.generateVersion(state.profile, {
        company: elements.targetCompany.value,
        role: elements.targetRole.value,
        jobText: elements.targetJob.value,
      });
      state.versions = [version, ...state.versions].slice(0, 50);
      state.activeVersionId = version.id;
      saveWorkspace();
      renderVersionList();
      renderPreview();
      showToast(`已生成“${version.title}”，请检查事实与缺口。`);
      if (window.innerWidth < 980) document.querySelector('.preview-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return version;
    } catch (error) {
      elements.targetError.textContent = error.message;
      elements.targetError.hidden = false;
      return null;
    }
  }

  async function copyCurrentVersion() {
    const version = currentVersion();
    if (!version) return;
    const text = Core.resumeToText(version);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast('当前版本已复制为纯文本。');
  }

  function recutCurrentVersion() {
    const version = currentVersion();
    if (!version) return;
    try {
      const next = Core.recutVersion(version, state.profile);
      state.versions = state.versions.map((item) => item.id === next.id ? next : item);
      saveWorkspace();
      renderVersionList();
      renderPreview();
      showToast(`“${next.title}”已使用最新母版重新裁版。`);
    } catch (error) {
      showToast(error.message);
    }
  }

  function exportBackup() {
    const now = new Date().toISOString();
    lastExport = Core.exportWorkspace(state, now);
    const blob = new Blob([lastExport], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fitroom-92-backup-${now.slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('工作台备份已导出。');
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const next = Core.importWorkspace(await file.text());
      state = next;
      saveWorkspace();
      fillMasterForm();
      renderAll();
      showToast(`备份已导入，共 ${state.versions.length} 个版本。`);
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.importFile.value = '';
    }
  }

  elements.masterForm.addEventListener('input', () => {
    readMasterForm();
    saveWorkspace();
    renderLiveMatch();
  });
  elements.targetForm.addEventListener('submit', generateFromTarget);
  elements.targetJob.addEventListener('input', renderLiveMatch);
  elements.versionList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-version-id]');
    if (!button) return;
    state.activeVersionId = button.dataset.versionId;
    saveWorkspace({ silent: true });
    renderVersionList();
    renderPreview();
  });
  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) openEntry(add.dataset.add);
    const edit = event.target.closest('[data-edit]');
    if (edit) openEntry(edit.dataset.edit, edit.dataset.id);
    const remove = event.target.closest('[data-remove]');
    if (remove) removeRecord(remove.dataset.remove, remove.dataset.id);
  });
  elements.entryForm.addEventListener('submit', saveEntry);
  elements.versionTitle.addEventListener('change', () => {
    const version = currentVersion();
    if (!version) return;
    version.title = elements.versionTitle.value.trim() || [version.company, version.role].filter(Boolean).join(' · ');
    version.updatedAt = new Date().toISOString();
    saveWorkspace();
    renderVersionList();
    renderPreview();
    showToast('版本名称已更新。');
  });
  elements.versionStatus.addEventListener('change', () => {
    const version = currentVersion();
    if (!version) return;
    version.status = elements.versionStatus.value;
    version.updatedAt = new Date().toISOString();
    saveWorkspace();
    renderVersionList();
    renderPreview();
    showToast(`投递状态已更新为“${STATUS_LABELS[version.status]}”。`);
  });
  elements.recutButton.addEventListener('click', recutCurrentVersion);
  elements.copyButton.addEventListener('click', copyCurrentVersion);
  elements.printButton.addEventListener('click', () => window.print());
  elements.deleteVersionButton.addEventListener('click', () => {
    const version = currentVersion();
    if (!version) return;
    openConfirmation({
      title: `删除“${version.title}”？`,
      copy: '这会删除该岗位的简历快照；母版资料不会受到影响。',
      action: () => {
        state.versions = state.versions.filter((item) => item.id !== version.id);
        state.activeVersionId = state.versions[0]?.id || '';
        saveWorkspace();
        renderVersionList();
        renderPreview();
        showToast('定制版本已删除。');
      },
    });
  });
  elements.confirmDialog.addEventListener('close', () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    if (elements.confirmDialog.returnValue === 'confirm' && action) action();
  });
  elements.exportButton.addEventListener('click', exportBackup);
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => importBackup(elements.importFile.files[0]));
  elements.resetButton.addEventListener('click', () => openConfirmation({
    title: '重置为示例资料？',
    copy: '当前母版和所有定制版本都会被替换。建议先导出备份。',
    label: '确认重置',
    action: () => {
      state = seedWorkspace();
      saveWorkspace();
      fillMasterForm();
      elements.targetForm.reset();
      renderAll();
      showToast('工作台已重置为示例资料。');
    },
  }));

  fillMasterForm();
  renderAll();
  window.__FITROOM92__ = {
    getState: () => JSON.parse(JSON.stringify(state)),
    generate: () => generateFromTarget(),
    recut: recutCurrentVersion,
    exportWorkspace: () => Core.exportWorkspace(state),
    getLastExport: () => lastExport,
    storageKey: STORAGE_KEY,
  };
  window.requestAnimationFrame(() => document.body.classList.add('ready'));
})();
