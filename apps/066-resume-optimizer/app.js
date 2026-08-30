(function () {
  'use strict';

  const Core = window.ResumeCore;
  if (!Core) throw new Error('ResumeCore failed to load');

  const SAMPLE_RESUME = `林晓然
产品经理｜上海｜lin@example.com

个人简介
5 年 B2C 产品经验，关注用户增长与数据驱动决策。

工作经历
- 主导新用户激活流程改版，通过 6 轮用户访谈和 A/B 测试，将 7 日留存率提升 12%
- 使用 SQL 分析 20 万条行为数据，定位注册漏斗断点，推动注册转化率从 62% 提升至 71%
- 负责会员中心相关工作，参与跨部门需求沟通
- 跟进版本迭代和日常数据报表

项目经历
- 设计流失用户召回实验，覆盖 8 万用户，单月带回 1,600 名付费会员

技能
SQL、A/B 测试、数据分析、用户研究、Figma、项目管理

教育经历
华东某大学｜信息管理｜本科`;

  const SAMPLE_JOB = `增长产品经理

岗位职责
1. 负责新用户增长策略、激活与留存产品设计；
2. 通过用户研究、数据分析和 A/B 测试发现增长机会；
3. 联动研发、设计、运营进行跨团队协作，推进项目交付；
4. 建立转化率、留存率与 ROI 指标体系。

任职要求
- 3 年以上产品经验，熟练使用 SQL；
- 有用户增长、商业分析或会员产品经验；
- 目标感强，能清楚呈现量化成果。`;

  const state = {
    analysis: null,
    selectedId: '',
    filter: 'all',
    settings: null,
    pendingAi: false,
    toastTimer: 0,
    controller: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const refs = {
    resume: $('#resume-input'),
    job: $('#job-input'),
    resumeFile: $('#resume-file'),
    resumeCount: $('#resume-count'),
    jobCount: $('#job-count'),
    analyze: $('#analyze-button'),
    analysis: $('#analysis'),
    analysisContent: $('#analysis-content'),
    totalScore: $('#total-score'),
    scoreFill: $('#score-fill'),
    scoreSummary: $('#score-summary'),
    evidenceList: $('#evidence-list'),
    matchedKeywords: $('#matched-keywords'),
    missingKeywords: $('#missing-keywords'),
    selectedStrength: $('#selected-strength'),
    selectedOriginal: $('#selected-original'),
    selectedIssues: $('#selected-issues'),
    rewriteTitle: $('#rewrite-title'),
    rewriteOutput: $('#rewrite-output'),
    applyRewrite: $('#apply-rewrite'),
    copyRewrite: $('#copy-rewrite'),
    aiRewrite: $('#ai-rewrite'),
    aiStatus: $('#ai-status'),
    dialog: $('#settings-dialog'),
    settingsForm: $('#settings-form'),
    endpoint: $('#endpoint-input'),
    model: $('#model-input'),
    key: $('#key-input'),
    settingsError: $('#settings-error'),
    toast: $('#toast'),
    announcer: $('#announcer'),
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function updateCounts() {
    refs.resumeCount.textContent = `${Core.normalizeText(refs.resume.value).length} 字`;
    refs.jobCount.textContent = `${Core.normalizeText(refs.job.value).length} 字`;
  }

  function announce(message) {
    refs.announcer.textContent = '';
    window.setTimeout(() => { refs.announcer.textContent = message; }, 20);
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-visible'), 2600);
  }

  function loadSample(runAnalysis = false) {
    refs.resume.value = SAMPLE_RESUME;
    refs.job.value = SAMPLE_JOB;
    updateCounts();
    showToast('示例材料已放上校样台');
    if (runAnalysis) analyze();
    else refs.resume.focus();
  }

  function clearInputs() {
    refs.resume.value = '';
    refs.job.value = '';
    state.analysis = null;
    state.selectedId = '';
    refs.analysis.dataset.state = 'empty';
    refs.analysisContent.hidden = true;
    updateCounts();
    refs.resume.focus();
    announce('简历和岗位说明已清空');
  }

  function renderChips(container, values, variant) {
    container.replaceChildren();
    if (!values.length) {
      container.append(make('span', 'empty-chip', variant === 'is-matched' ? '暂无覆盖' : '没有待核对词'));
      return;
    }
    values.forEach((value) => container.append(make('span', `keyword-chip ${variant}`, value)));
  }

  function evidenceVisible(bullet) {
    if (state.filter === 'issues') return bullet.issues.length > 0;
    if (state.filter === 'strong') return bullet.strength >= 75;
    return true;
  }

  function renderEvidenceList() {
    refs.evidenceList.replaceChildren();
    if (!state.analysis) return;
    const visible = state.analysis.bullets.filter(evidenceVisible);
    if (!visible.length) {
      refs.evidenceList.append(make('p', 'evidence-empty', state.analysis.bullets.length ? '这个筛选下没有经历。' : '未识别到经历条目，请用短横线列出成果后重新分析。'));
      return;
    }

    visible.forEach((bullet) => {
      const button = make('button', `evidence-item${bullet.id === state.selectedId ? ' is-selected' : ''}${bullet.strength >= 75 ? ' is-strong' : ''}`);
      button.type = 'button';
      button.dataset.evidenceId = bullet.id;
      button.setAttribute('aria-pressed', String(bullet.id === state.selectedId));
      const copy = make('span', 'evidence-copy');
      copy.append(make('strong', '', bullet.text));
      const meta = make('span', 'evidence-meta');
      meta.append(make('span', '', bullet.hasMetric ? '✓ 有量化结果' : '○ 待补结果'));
      meta.append(make('span', '', bullet.matchedKeywords.length ? `岗位词 ${bullet.matchedKeywords.join(' / ')}` : '未命中岗位词'));
      copy.append(meta);
      const note = make('span', 'evidence-note');
      note.append(make('span', '', bullet.issues[0]?.label || '证据结构完整'));
      const bar = make('span', 'strength-bar');
      const fill = make('i');
      fill.style.width = `${bullet.strength}%`;
      bar.append(fill);
      note.append(bar);
      note.append(make('span', '', `证据强度 ${bullet.strength}`));
      button.append(copy, note);
      refs.evidenceList.append(button);
    });
  }

  function selectedBullet() {
    return state.analysis?.bullets.find((bullet) => bullet.id === state.selectedId) || null;
  }

  function selectEvidence(id, focusInspector = false) {
    const bullet = state.analysis?.bullets.find((item) => item.id === id);
    if (!bullet) return;
    state.selectedId = id;
    renderEvidenceList();
    refs.selectedStrength.textContent = `${bullet.strength}/100`;
    refs.rewriteTitle.textContent = bullet.issues[0]?.label || '这条经历已有清晰证据';
    refs.selectedOriginal.textContent = bullet.text;
    refs.selectedIssues.replaceChildren();
    if (bullet.issues.length) {
      bullet.issues.forEach((issue) => {
        const item = make('div', 'issue-note');
        item.append(make('b', '', issue.label), make('span', '', issue.detail));
        refs.selectedIssues.append(item);
      });
    } else {
      refs.selectedIssues.append(make('div', 'issue-pass', '动作、岗位语言和结果证据已形成闭环。'));
    }
    refs.rewriteOutput.value = Core.createLocalRewrite(bullet.text, state.analysis.missingKeywords);
    refs.applyRewrite.disabled = false;
    refs.copyRewrite.disabled = false;
    refs.aiRewrite.disabled = false;
    refs.aiStatus.textContent = state.settings
      ? `已配置 ${state.settings.model}；密钥仅驻留本页内存。`
      : '尚未配置接口；点击后可设置。';
    if (focusInspector) $('#rewrite-inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderAnalysis(result) {
    state.analysis = result;
    refs.analysis.dataset.state = 'ready';
    refs.analysisContent.hidden = false;
    refs.totalScore.textContent = result.score;
    refs.scoreFill.style.width = `${result.score}%`;
    refs.scoreSummary.textContent = result.summary;
    $('#score-match').textContent = result.scores.match;
    $('#score-evidence').textContent = result.scores.evidence;
    $('#score-clarity').textContent = result.scores.clarity;
    $('#score-structure').textContent = result.scores.structure;
    $('#stat-bullets').textContent = result.stats.bullets;
    $('#stat-quantified').textContent = result.stats.quantified;
    $('#stat-keywords').textContent = `${result.stats.matched}/${result.stats.totalKeywords}`;
    $('#stat-issues').textContent = result.issueCount;
    renderChips(refs.matchedKeywords, result.matchedKeywords, 'is-matched');
    renderChips(refs.missingKeywords, result.missingKeywords, 'is-missing');
    state.selectedId = (result.bullets.find((bullet) => bullet.issues.length) || result.bullets[0])?.id || '';
    renderEvidenceList();
    if (state.selectedId) selectEvidence(state.selectedId);
    else resetInspector();
  }

  function resetInspector() {
    refs.selectedStrength.textContent = '--';
    refs.rewriteTitle.textContent = '没有可改写的经历';
    refs.selectedOriginal.textContent = '在工作或项目经历中使用短横线列出每项成果，然后重新分析。';
    refs.selectedIssues.replaceChildren();
    refs.rewriteOutput.value = '';
    refs.applyRewrite.disabled = true;
    refs.copyRewrite.disabled = true;
    refs.aiRewrite.disabled = true;
  }

  function analyze() {
    const resumeText = Core.normalizeText(refs.resume.value);
    const jobText = Core.normalizeText(refs.job.value);
    if (resumeText.length < 20) {
      showToast('请先粘贴至少 20 字的简历正文');
      refs.resume.focus();
      return;
    }
    if (jobText.length < 12) {
      showToast('请粘贴目标岗位说明，分析才有比较基准');
      refs.job.focus();
      return;
    }
    const result = Core.analyzeResume(resumeText, jobText);
    renderAnalysis(result);
    announce(`分析完成，编辑就绪度 ${result.score} 分，发现 ${result.issueCount} 条批注。`);
    refs.analysis.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function readResumeFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLocaleLowerCase('en-US');
    if (!['txt', 'md'].includes(extension)) {
      showToast('首版只读取 UTF-8 的 TXT 或 MD 文件');
      refs.resumeFile.value = '';
      return;
    }
    if (file.size > 512 * 1024) {
      showToast('文件超过 512 KB，请先精简后再导入');
      refs.resumeFile.value = '';
      return;
    }
    try {
      refs.resume.value = await file.text();
      updateCounts();
      showToast(`已读取 ${file.name}`);
      refs.job.focus();
    } catch {
      showToast('文件读取失败，请确认它是 UTF-8 文本');
    } finally {
      refs.resumeFile.value = '';
    }
  }

  async function copyText(value, successMessage) {
    const text = Core.normalizeText(value);
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.append(helper);
        helper.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
        helper.remove();
      }
      showToast(successMessage);
    } catch {
      showToast('自动复制失败，请在改写框中手动复制');
      refs.rewriteOutput.focus();
      refs.rewriteOutput.select();
    }
  }

  function applyRewrite() {
    const bullet = selectedBullet();
    const replacement = Core.normalizeText(refs.rewriteOutput.value);
    if (!bullet || !replacement) return;
    const source = refs.resume.value;
    const index = source.indexOf(bullet.text);
    if (index < 0) {
      showToast('原经历已变化，请重新运行分析');
      return;
    }
    refs.resume.value = `${source.slice(0, index)}${replacement}${source.slice(index + bullet.text.length)}`;
    updateCounts();
    analyze();
    showToast('改写已替换到简历，并重新分析');
  }

  function downloadReport() {
    if (!state.analysis) return;
    const result = state.analysis;
    const lines = [
      'PROOF/66 简历证据校样报告',
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      `编辑就绪度：${result.score}/100`,
      `岗位匹配：${result.scores.match}｜成果证据：${result.scores.evidence}｜表达清晰：${result.scores.clarity}｜结构完整：${result.scores.structure}`,
      result.summary,
      '',
      `已覆盖岗位词：${result.matchedKeywords.join('、') || '无'}`,
      `待核对岗位词：${result.missingKeywords.join('、') || '无'}`,
      '',
      '逐条批注',
      ...result.bullets.flatMap((bullet, index) => [
        `${index + 1}. ${bullet.text}`,
        `   证据强度 ${bullet.strength}/100；${bullet.issues.map((issue) => issue.label).join('、') || '证据结构完整'}`,
        `   本地改写模板：${Core.createLocalRewrite(bullet.text, result.missingKeywords)}`,
      ]),
      '',
      '说明：分数用于编辑导航，不代表 ATS 或招聘结果；请勿补写无法验证的事实。',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'proof-66-resume-report.txt';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('校样报告已下载');
  }

  function openSettings(forAi = false) {
    state.pendingAi = forAi;
    refs.settingsError.textContent = '';
    if (state.settings) {
      refs.endpoint.value = state.settings.endpoint;
      refs.model.value = state.settings.model;
      refs.key.value = state.settings.key;
    }
    refs.dialog.showModal();
    window.setTimeout(() => refs.endpoint.focus(), 30);
  }

  function saveSettings(event) {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') {
      state.pendingAi = false;
      refs.dialog.close('cancel');
      return;
    }
    try {
      const endpoint = Core.validateEndpoint(refs.endpoint.value);
      const model = Core.normalizeText(refs.model.value).slice(0, 120);
      const key = refs.key.value.trim();
      if (!model) throw new Error('请输入模型名称。');
      if (!key) throw new Error('请输入 API Key。');
      state.settings = { endpoint, model, key };
      refs.settingsError.textContent = '';
      refs.dialog.close('saved');
      refs.aiStatus.textContent = `已配置 ${model}；密钥仅驻留本页内存。`;
      showToast('接口设置仅在本次页面中生效');
      if (state.pendingAi && selectedBullet()) runAiRewrite();
      state.pendingAi = false;
    } catch (error) {
      refs.settingsError.textContent = error.message;
    }
  }

  function responseText(payload) {
    return Core.normalizeText(
      payload?.choices?.[0]?.message?.content
      || payload?.choices?.[0]?.text
      || payload?.output_text
      || payload?.response
      || '',
    );
  }

  async function runAiRewrite() {
    const bullet = selectedBullet();
    if (!bullet) return;
    if (!state.settings) {
      openSettings(true);
      return;
    }
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    const timeout = window.setTimeout(() => state.controller.abort(), 30_000);
    const originalLabel = refs.aiRewrite.innerHTML;
    refs.aiRewrite.disabled = true;
    refs.aiRewrite.textContent = '正在校对这一条…';
    refs.aiStatus.textContent = `正在请求 ${state.settings.model}，最多等待 30 秒。`;
    try {
      const body = Core.buildAiRequest({
        model: state.settings.model,
        bullet: bullet.text,
        jobText: refs.job.value,
        matchedKeywords: bullet.matchedKeywords,
        missingKeywords: state.analysis.missingKeywords,
      });
      const response = await fetch(state.settings.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.settings.key}`,
        },
        body: JSON.stringify(body),
        signal: state.controller.signal,
      });
      if (!response.ok) {
        const detail = Core.normalizeText((await response.text()).slice(0, 240));
        throw new Error(`接口返回 ${response.status}${detail ? `：${detail}` : ''}`);
      }
      const payload = await response.json();
      const content = responseText(payload);
      if (!content) throw new Error('接口响应中没有可用的改写文本。');
      refs.rewriteOutput.value = content;
      refs.aiStatus.textContent = `已由 ${state.settings.model} 精修；应用前请核对每个事实。`;
      showToast('AI 改写已放入草稿框，请先核对事实');
      refs.rewriteOutput.focus();
    } catch (error) {
      const message = error.name === 'AbortError' ? '请求超时或已取消。' : error.message;
      refs.aiStatus.textContent = message;
      showToast(message);
    } finally {
      window.clearTimeout(timeout);
      refs.aiRewrite.disabled = false;
      refs.aiRewrite.innerHTML = originalLabel;
      state.controller = null;
    }
  }

  function bindEvents() {
    refs.resume.addEventListener('input', updateCounts);
    refs.job.addEventListener('input', updateCounts);
    refs.resumeFile.addEventListener('change', () => readResumeFile(refs.resumeFile.files[0]));
    $('#load-sample').addEventListener('click', () => loadSample(false));
    $('#empty-sample').addEventListener('click', () => loadSample(true));
    $('#clear-inputs').addEventListener('click', clearInputs);
    refs.analyze.addEventListener('click', analyze);
    $('#download-report').addEventListener('click', downloadReport);
    $('#open-settings').addEventListener('click', () => openSettings(false));
    refs.settingsForm.addEventListener('submit', saveSettings);
    refs.evidenceList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-evidence-id]');
      if (button) selectEvidence(button.dataset.evidenceId, window.innerWidth < 821);
    });
    document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter-button').forEach((item) => item.classList.toggle('is-active', item === button));
      renderEvidenceList();
    }));
    refs.copyRewrite.addEventListener('click', () => copyText(refs.rewriteOutput.value, '改写草稿已复制'));
    refs.applyRewrite.addEventListener('click', applyRewrite);
    refs.aiRewrite.addEventListener('click', runAiRewrite);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !refs.dialog.open) {
        event.preventDefault();
        analyze();
      }
    });
  }

  function init() {
    bindEvents();
    updateCounts();
    refs.analysisContent.hidden = true;
    document.body.classList.add('ready');
  }

  init();
}());
