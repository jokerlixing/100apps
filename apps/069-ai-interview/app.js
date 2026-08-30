(function startPanel69() {
  'use strict';

  const Core = window.InterviewCore;
  if (!Core) throw new Error('InterviewCore failed to load.');

  const STORE_KEY = 'panel69.state.v1';
  const OFFLINE = new URLSearchParams(window.location.search).get('offline') === '1';
  const LEVEL_LABELS = { junior: '初级', mid: '中级', senior: '资深' };
  const TYPE_LABELS = { comprehensive: '综合面', technical: '专业面', behavioral: '行为面', case: '情境面' };
  const CATEGORY_LABELS = { intro: '开场问题', behavioral: '行为问题', role: '专业问题', scenario: '情境问题' };
  const DIMENSION_KEYS = ['relevance', 'structure', 'evidence', 'depth'];

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const setupScreen = $('#setup-screen');
  const interviewScreen = $('#interview-screen');
  const reviewScreen = $('#review-screen');
  const setupForm = $('#setup-form');
  const answerInput = $('#answer-input');
  const feedbackSheet = $('#feedback-sheet');
  const answerStation = $('.answer-station');
  const historyDialog = $('#history-dialog');
  const confirmDialog = $('#confirm-dialog');
  const liveRegion = $('#live-region');
  const toastElement = $('#toast');
  let toastTimer = null;
  let saveDraftTimer = null;

  const state = {
    history: [],
    inProgress: null,
    currentReview: null,
  };

  function setText(selector, value, parent = document) {
    const element = typeof selector === 'string' ? $(selector, parent) : selector;
    if (element) element.textContent = value == null ? '' : String(value);
  }

  function announce(message) {
    liveRegion.textContent = '';
    window.setTimeout(() => { liveRegion.textContent = message; }, 20);
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.classList.add('show');
    toastTimer = window.setTimeout(() => toastElement.classList.remove('show'), 2400);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function roleLabel(role) {
    return Core.ROLE_LABELS[role] || Core.ROLE_LABELS.frontend;
  }

  function getCurrentType() {
    return setupForm.elements.type.value || 'comprehensive';
  }

  function readSetup() {
    return Core.normalizeConfig({
      role: $('#role').value,
      level: $('#level').value,
      type: getCurrentType(),
      questionCount: $('#question-count').value,
      focus: $('#focus').value,
      jobDescription: $('#job-description').value,
      aiEnabled: $('#ai-enabled').checked,
    });
  }

  function updateSetupPreview() {
    const config = readSetup();
    setText('#setup-preview', `${roleLabel(config.role)} · ${LEVEL_LABELS[config.level]} · ${TYPE_LABELS[config.type]} · ${config.questionCount} 题`);
  }

  function safeQuestion(raw, config, index) {
    const list = Core.sanitizeAIQuestions({ questions: [raw] }, { ...config, questionCount: 3 });
    if (!list.length) return null;
    return { ...list[0], id: Core.sanitizeText(raw.id, 80) || `stored-${index}` };
  }

  function hydrateAnswers(rawAnswers, plan, config) {
    if (!Array.isArray(rawAnswers)) return [];
    return rawAnswers.slice(0, plan.length).map((raw, index) => {
      const question = plan.find((item) => item.id === raw?.question?.id) || plan[index];
      if (!question) return null;
      const answer = Core.sanitizeText(raw?.answer, 6000);
      const evaluation = Core.scoreAnswer(question, answer, config);
      return {
        question,
        answer,
        evaluation,
        followUp: Core.sanitizeText(raw?.followUp, 240) || Core.buildFollowUp(question, evaluation),
        followUpAnswer: Core.sanitizeText(raw?.followUpAnswer, 1600),
        durationSeconds: Math.max(0, Math.min(7200, Math.round(Number(raw?.durationSeconds) || 0))),
        skipped: !answer,
        source: raw?.source === 'ai' ? 'ai' : 'local',
      };
    }).filter(Boolean);
  }

  function hydrateSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const config = Core.normalizeConfig(raw.config);
    const plan = Array.isArray(raw.plan)
      ? raw.plan.map((item, index) => safeQuestion(item, config, index)).filter(Boolean).slice(0, config.questionCount)
      : [];
    if (plan.length < 1) return null;
    const answers = hydrateAnswers(raw.answers, plan, config);
    const currentIndex = Math.max(0, Math.min(plan.length - 1, Math.round(Number(raw.currentIndex) || 0)));
    const stage = raw.stage === 'feedback' && answers.length ? 'feedback' : 'interview';
    return {
      config,
      plan,
      currentIndex,
      answers,
      startedAt: Number(raw.startedAt) || Date.now(),
      questionStartedAt: Number(raw.questionStartedAt) || Date.now(),
      stage,
      draft: Core.sanitizeText(raw.draft, 6000),
      planSource: raw.planSource === 'ai' ? 'ai' : 'local',
    };
  }

  function hydrateRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const config = Core.normalizeConfig(raw.config);
    const plan = Array.isArray(raw.plan)
      ? raw.plan.map((item, index) => safeQuestion(item, config, index)).filter(Boolean)
      : [];
    const answers = hydrateAnswers(raw.answers, plan, config);
    if (!plan.length || !answers.length) return null;
    const createdAt = Number(raw.createdAt) || Date.now();
    const startedAt = Number(raw.startedAt) || createdAt;
    const finishedAt = Number(raw.finishedAt) || createdAt;
    return {
      id: Core.sanitizeText(raw.id, 80) || `session-${createdAt}`,
      createdAt,
      startedAt,
      finishedAt,
      config,
      plan,
      answers,
      summary: Core.summarizeSession({ config, answers, startedAt, finishedAt }),
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      state.inProgress = hydrateSession(parsed.inProgress);
      state.history = Array.isArray(parsed.history) ? parsed.history.map(hydrateRecord).filter(Boolean).slice(0, 3) : [];
    } catch (_error) {
      state.inProgress = null;
      state.history = [];
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ inProgress: state.inProgress, history: state.history.slice(0, 3) }));
    } catch (_error) {
      toast('浏览器无法保存本轮进度，当前页面仍可继续练习。');
    }
  }

  function showScreen(name) {
    const screens = { setup: setupScreen, interview: interviewScreen, review: reviewScreen };
    Object.entries(screens).forEach(([key, screen]) => {
      const active = key === name;
      screen.hidden = !active;
      screen.classList.toggle('is-active', active);
    });
    if (name === 'setup') {
      setText('#session-status', OFFLINE ? '候场 · 强制本地模式' : '候场 · 本地教练就绪');
      $('#beam-light').className = 'beam-light';
    } else if (name === 'interview') {
      const source = state.inProgress?.planSource === 'ai' ? 'AI 增强题单' : '本地题单';
      setText('#session-status', `面试中 · ${source}`);
      $('#beam-light').className = 'beam-light live';
    } else {
      setText('#session-status', '复盘完成 · 已保存到本机');
      $('#beam-light').className = 'beam-light done';
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function updateHistoryCount() {
    setText('#history-count', state.history.length);
  }

  function renderResumeNotice() {
    const notice = $('#resume-notice');
    if (!state.inProgress) {
      notice.hidden = true;
      return;
    }
    notice.hidden = false;
    setText('#resume-title', `${roleLabel(state.inProgress.config.role)} · 第 ${state.inProgress.currentIndex + 1} / ${state.inProgress.plan.length} 题`);
  }

  function startInterview(event) {
    event.preventDefault();
    setText('#setup-error', '');
    const config = readSetup();
    const seed = `${config.role}:${config.level}:${config.type}:${Date.now()}`;
    const plan = Core.buildQuestionPlan(config, seed);
    if (plan.length < config.questionCount) {
      setText('#setup-error', '本地题库暂时无法组成这轮面试，请调整面试类型后重试。');
      return;
    }
    state.inProgress = {
      config,
      plan,
      currentIndex: 0,
      answers: [],
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
      stage: 'interview',
      draft: '',
      planSource: 'local',
    };
    saveState();
    renderInterview();
    announce(`面试开始，共 ${plan.length} 题。`);
    maybeEnhancePlan();
  }

  function currentQuestion() {
    return state.inProgress?.plan[state.inProgress.currentIndex] || null;
  }

  function renderInterview() {
    const session = state.inProgress;
    if (!session) return;
    const question = currentQuestion();
    if (!question) return;
    showScreen('interview');
    const number = session.currentIndex + 1;
    setText('#question-progress', `问题 ${number} / ${session.plan.length}`);
    $('#progress-fill').style.width = `${(number / session.plan.length) * 100}%`;
    setText('#interviewer-role', `${roleLabel(session.config.role)} · ${TYPE_LABELS[session.config.type]}`);
    setText('#question-category', CATEGORY_LABELS[question.category] || '面试问题');
    setText('#question-source', session.planSource === 'ai' ? 'AI 定制题单' : '本地题库');
    setText('#question-title', question.prompt);
    setText('#hint-panel', question.hint);
    $('#hint-panel').hidden = true;
    $('#show-hint').hidden = session.stage === 'feedback';
    $('#show-hint').setAttribute('aria-expanded', 'false');
    answerInput.value = session.draft || '';
    updateAnswerCount();
    setText('#answer-error', '');
    renderTape();
    updateElapsed();

    if (session.stage === 'feedback') {
      answerStation.hidden = true;
      renderFeedback(session.answers[session.answers.length - 1]);
    } else {
      answerStation.hidden = false;
      feedbackSheet.hidden = true;
      window.setTimeout(() => answerInput.focus(), 50);
    }
  }

  function updateElapsed() {
    if (!state.inProgress) return;
    setText('#elapsed-time', formatClock((Date.now() - state.inProgress.startedAt) / 1000));
  }

  function updateAnswerCount() {
    setText('#answer-count', `${answerInput.value.length} / 6000`);
  }

  function showHint() {
    const panel = $('#hint-panel');
    const expanded = !panel.hidden;
    panel.hidden = expanded;
    $('#show-hint').setAttribute('aria-expanded', String(!expanded));
    if (!expanded) announce('回答思路已展开。');
  }

  function submitAnswer() {
    const session = state.inProgress;
    const question = currentQuestion();
    if (!session || !question || session.stage !== 'interview') return;
    const answer = Core.sanitizeText(answerInput.value, 6000);
    if (answer.length < 4) {
      setText('#answer-error', '至少写下一句完整回答；如果不会，可以选择跳过。');
      answerInput.focus();
      return;
    }
    const evaluation = Core.scoreAnswer(question, answer, session.config);
    const entry = {
      question,
      answer,
      evaluation,
      followUp: Core.buildFollowUp(question, evaluation),
      followUpAnswer: '',
      durationSeconds: Math.max(1, Math.round((Date.now() - session.questionStartedAt) / 1000)),
      skipped: false,
      source: 'local',
    };
    session.answers.push(entry);
    session.stage = 'feedback';
    session.draft = '';
    saveState();
    renderInterview();
    announce(`回答已评分，${evaluation.score} 分。`);
    maybeEnhanceEvaluation(entry);
  }

  function skipQuestion() {
    const session = state.inProgress;
    const question = currentQuestion();
    if (!session || !question || session.stage !== 'interview') return;
    const evaluation = Core.scoreAnswer(question, '', session.config);
    session.answers.push({
      question,
      answer: '',
      evaluation,
      followUp: Core.buildFollowUp(question, evaluation),
      followUpAnswer: '',
      durationSeconds: Math.max(0, Math.round((Date.now() - session.questionStartedAt) / 1000)),
      skipped: true,
      source: 'local',
    });
    session.stage = 'feedback';
    session.draft = '';
    saveState();
    renderInterview();
    announce('本题已标记为跳过，复盘中会保留练习建议。');
  }

  function scoreColor(score) {
    if (score >= 75) return '#248361';
    if (score >= 55) return '#f3c969';
    return '#e85d4a';
  }

  function renderTape() {
    const answers = state.inProgress?.answers || [];
    const list = $('#tape-list');
    list.replaceChildren();
    $('#tape-empty').hidden = answers.length > 0;
    setText('#answered-count', `${answers.length} 段`);
    answers.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'tape-segment';
      item.style.setProperty('--segment-color', scoreColor(entry.evaluation.score));
      const header = document.createElement('header');
      const number = document.createElement('span');
      number.textContent = `TAPE ${String(index + 1).padStart(2, '0')}`;
      const score = document.createElement('strong');
      score.textContent = entry.skipped ? '跳过' : `${entry.evaluation.score}分 · ${formatClock(entry.durationSeconds)}`;
      header.append(number, score);
      const prompt = document.createElement('p');
      prompt.textContent = entry.question.prompt;
      const scale = document.createElement('div');
      scale.className = 'mini-scale';
      DIMENSION_KEYS.forEach((key) => {
        const bar = document.createElement('i');
        bar.style.setProperty('--score', `${entry.evaluation.dimensions[key]}%`);
        bar.title = `${Core.DIMENSION_LABELS[key]} ${entry.evaluation.dimensions[key]}`;
        scale.append(bar);
      });
      item.append(header, prompt, scale);
      list.append(item);
    });
  }

  function renderStringList(selector, items) {
    const list = $(selector);
    list.replaceChildren();
    items.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    });
  }

  function renderFeedback(entry) {
    if (!entry) return;
    feedbackSheet.hidden = false;
    setText('#answer-score', entry.evaluation.score);
    const grid = $('#dimension-grid');
    grid.replaceChildren();
    DIMENSION_KEYS.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'dimension-item';
      const label = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = Core.DIMENSION_LABELS[key];
      const value = document.createElement('strong');
      value.textContent = entry.evaluation.dimensions[key];
      label.append(name, value);
      const bar = document.createElement('i');
      bar.style.setProperty('--score', `${entry.evaluation.dimensions[key]}%`);
      item.append(label, bar);
      grid.append(item);
    });
    renderStringList('#strength-list', entry.evaluation.strengths);
    renderStringList('#improvement-list', entry.evaluation.improvements);
    setText('#followup-question', entry.followUp);
    $('#followup-input').value = entry.followUpAnswer || '';
    setText('#next-question', state.inProgress.currentIndex >= state.inProgress.plan.length - 1 ? '完成面试，进入复盘' : '进入下一题');
    window.setTimeout(() => feedbackSheet.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function nextQuestion() {
    const session = state.inProgress;
    if (!session || session.stage !== 'feedback') return;
    const currentEntry = session.answers[session.answers.length - 1];
    currentEntry.followUpAnswer = Core.sanitizeText($('#followup-input').value, 1600);
    if (session.currentIndex >= session.plan.length - 1) {
      finishSession();
      return;
    }
    session.currentIndex += 1;
    session.questionStartedAt = Date.now();
    session.stage = 'interview';
    session.draft = '';
    saveState();
    renderInterview();
    announce(`进入第 ${session.currentIndex + 1} 题。`);
  }

  function finishSession() {
    const session = state.inProgress;
    if (!session) return;
    if (!session.answers.length) {
      state.inProgress = null;
      saveState();
      renderResumeNotice();
      showScreen('setup');
      toast('本轮没有已提交回答，未生成复盘。');
      return;
    }
    const finishedAt = Date.now();
    const record = {
      id: `panel-${finishedAt}`,
      createdAt: finishedAt,
      startedAt: session.startedAt,
      finishedAt,
      config: session.config,
      plan: session.plan,
      answers: session.answers,
      summary: Core.summarizeSession({
        config: session.config,
        answers: session.answers,
        startedAt: session.startedAt,
        finishedAt,
      }),
    };
    state.currentReview = record;
    state.history = [record, ...state.history.filter((item) => item.id !== record.id)].slice(0, 3);
    state.inProgress = null;
    saveState();
    updateHistoryCount();
    renderResumeNotice();
    renderReview(record);
    announce(`面试完成，本轮 ${record.summary.score} 分。`);
  }

  function renderReview(record) {
    if (!record) return;
    state.currentReview = record;
    showScreen('review');
    const summary = record.summary;
    setText('#review-meta', `${roleLabel(record.config.role)} · ${record.answers.length} 题 · ${formatClock(summary.durationSeconds)}`);
    setText('#summary-score', summary.score);
    setText('#summary-label', summary.label);
    const dimensions = $('#summary-dimensions');
    dimensions.replaceChildren();
    DIMENSION_KEYS.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'summary-dimension';
      const label = document.createElement('span');
      label.textContent = Core.DIMENSION_LABELS[key];
      const bar = document.createElement('i');
      bar.style.setProperty('--score', `${summary.dimensions[key]}%`);
      const score = document.createElement('strong');
      score.textContent = summary.dimensions[key];
      item.append(label, bar, score);
      dimensions.append(item);
    });
    setText('#summary-note', `本轮完成 ${summary.answeredCount}/${summary.totalQuestions} 题，优势是${Core.DIMENSION_LABELS[summary.strongestDimension]}，优先补强${Core.DIMENSION_LABELS[summary.weakestDimension]}。`);
    renderStringList('#next-actions', summary.nextActions);
    renderTranscript(record);
  }

  function renderTranscript(record) {
    const list = $('#transcript-list');
    list.replaceChildren();
    record.answers.forEach((entry, index) => {
      const details = document.createElement('details');
      details.className = 'transcript-item';
      if (index === 0) details.open = true;
      const summary = document.createElement('summary');
      const number = document.createElement('span');
      number.className = 'transcript-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const prompt = document.createElement('span');
      prompt.className = 'transcript-question';
      prompt.textContent = entry.question.prompt;
      const score = document.createElement('strong');
      score.className = 'transcript-score';
      score.textContent = entry.skipped ? '跳过' : entry.evaluation.score;
      summary.append(number, prompt, score);

      const body = document.createElement('div');
      body.className = 'transcript-body';
      const answerTitle = document.createElement('h3');
      answerTitle.textContent = `你的回答 · ${formatClock(entry.durationSeconds)}`;
      const answer = document.createElement('p');
      answer.textContent = entry.answer || '本题跳过。';
      const improveTitle = document.createElement('h3');
      improveTitle.textContent = '下一遍补上';
      const improvements = document.createElement('ul');
      entry.evaluation.improvements.forEach((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        improvements.append(item);
      });
      const followTitle = document.createElement('h3');
      followTitle.textContent = '追问';
      const follow = document.createElement('p');
      follow.textContent = entry.followUpAnswer ? `${entry.followUp}\n补答：${entry.followUpAnswer}` : entry.followUp;
      body.append(answerTitle, answer, improveTitle, improvements, followTitle, follow);
      details.append(summary, body);
      list.append(details);
    });
  }

  function buildReport(record) {
    const lines = [
      'PANEL/69 模拟面试复盘',
      `岗位：${roleLabel(record.config.role)} · ${LEVEL_LABELS[record.config.level]} · ${TYPE_LABELS[record.config.type]}`,
      `总分：${record.summary.score}/100（${record.summary.label}）`,
      `完成：${record.summary.answeredCount}/${record.summary.totalQuestions} 题 · 用时 ${formatClock(record.summary.durationSeconds)}`,
      '',
      '四维评分',
      ...DIMENSION_KEYS.map((key) => `- ${Core.DIMENSION_LABELS[key]}：${record.summary.dimensions[key]}`),
      '',
      '下一轮动作',
      ...record.summary.nextActions.map((item, index) => `${index + 1}. ${item}`),
      '',
      '逐题复盘',
    ];
    record.answers.forEach((entry, index) => {
      lines.push(
        '',
        `${index + 1}. ${entry.question.prompt}`,
        `得分：${entry.skipped ? '跳过' : `${entry.evaluation.score}/100`} · 用时 ${formatClock(entry.durationSeconds)}`,
        `回答：${entry.answer || '本题跳过。'}`,
        `改进：${entry.evaluation.improvements.join('；')}`,
        `追问：${entry.followUp}`,
        entry.followUpAnswer ? `补答：${entry.followUpAnswer}` : '',
      );
    });
    lines.push('', record.summary.disclaimer);
    return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
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
    if (!copied) throw new Error('copy failed');
  }

  async function copyReport() {
    if (!state.currentReview) return;
    try {
      await copyText(buildReport(state.currentReview));
      toast('复盘报告已复制。');
    } catch (_error) {
      toast('浏览器阻止了复制，请展开逐题复盘后手动复制。');
    }
  }

  function newSession() {
    state.currentReview = null;
    showScreen('setup');
    renderResumeNotice();
    window.setTimeout(() => $('#role').focus(), 50);
  }

  function renderHistory() {
    const list = $('#history-list');
    list.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = '还没有本地复盘。完成一轮面试后会保留最近三次结果。';
      list.append(empty);
      return;
    }
    state.history.forEach((record) => {
      const item = document.createElement('article');
      item.className = 'history-item';
      const copy = document.createElement('div');
      const date = document.createElement('p');
      date.textContent = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(record.createdAt));
      const title = document.createElement('strong');
      title.textContent = `${roleLabel(record.config.role)} · ${record.answers.length} 题 · ${formatClock(record.summary.durationSeconds)}`;
      copy.append(date, title);
      const score = document.createElement('span');
      score.textContent = record.summary.score;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '打开这轮复盘';
      button.addEventListener('click', () => {
        closeDialog(historyDialog);
        renderReview(record);
      });
      item.append(copy, score, button);
      list.append(item);
    });
  }

  function openHistory() {
    renderHistory();
    openDialog(historyDialog);
  }

  function clearHistory() {
    if (!state.history.length) return;
    state.history = [];
    state.currentReview = null;
    saveState();
    updateHistoryCount();
    renderHistory();
    toast('本地复盘已清除。');
  }

  async function requestCoach(payload) {
    if (OFFLINE) throw new Error('offline');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('unavailable');
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function maybeEnhancePlan() {
    const session = state.inProgress;
    if (!session?.config.aiEnabled || OFFLINE) return;
    setText('#session-status', '面试中 · 正在尝试 AI 定制题单');
    try {
      const payload = await requestCoach({ action: 'plan', config: session.config });
      const questions = Core.sanitizeAIQuestions(payload, session.config);
      if (state.inProgress === session && session.currentIndex === 0 && session.answers.length === 0 && questions.length >= session.config.questionCount) {
        session.plan = questions.slice(0, session.config.questionCount);
        session.planSource = 'ai';
        saveState();
        renderInterview();
        announce('AI 定制题单已就绪。');
      }
    } catch (_error) {
      if (state.inProgress === session) setText('#session-status', '面试中 · 本地题单（AI 增强未连接）');
    }
  }

  async function maybeEnhanceEvaluation(entry) {
    const session = state.inProgress;
    if (!session?.config.aiEnabled || OFFLINE || entry.skipped) return;
    try {
      const payload = await requestCoach({
        action: 'evaluate',
        config: session.config,
        question: entry.question,
        answer: entry.answer,
      });
      const evaluation = Core.sanitizeAIEvaluation(payload);
      const latest = session.answers[session.answers.length - 1];
      if (evaluation && state.inProgress === session && latest === entry && session.stage === 'feedback') {
        entry.evaluation = evaluation;
        entry.followUp = evaluation.followUp;
        entry.source = 'ai';
        saveState();
        renderTape();
        renderFeedback(entry);
        setText('#session-status', '面试中 · AI 教练反馈已更新');
        announce('AI 教练反馈已更新。');
      }
    } catch (_error) {
      if (state.inProgress === session) setText('#session-status', '面试中 · 本地反馈（AI 增强未连接）');
    }
  }

  function resumeSession() {
    if (!state.inProgress) return;
    renderInterview();
    announce('已恢复未完成的面试。');
  }

  function discardSession() {
    state.inProgress = null;
    saveState();
    renderResumeNotice();
    toast('未完成面试已从本机移除。');
  }

  function handleDraft() {
    updateAnswerCount();
    setText('#answer-error', '');
    if (!state.inProgress || state.inProgress.stage !== 'interview') return;
    state.inProgress.draft = answerInput.value.slice(0, 6000);
    window.clearTimeout(saveDraftTimer);
    saveDraftTimer = window.setTimeout(saveState, 260);
  }

  function bindEvents() {
    setupForm.addEventListener('submit', startInterview);
    setupForm.addEventListener('input', updateSetupPreview);
    setupForm.addEventListener('change', updateSetupPreview);
    $('#show-hint').addEventListener('click', showHint);
    answerInput.addEventListener('input', handleDraft);
    $('#submit-answer').addEventListener('click', submitAnswer);
    $('#skip-question').addEventListener('click', skipQuestion);
    $('#next-question').addEventListener('click', nextQuestion);
    $('#followup-input').addEventListener('input', () => {
      const session = state.inProgress;
      const latest = session?.answers[session.answers.length - 1];
      if (latest && session.stage === 'feedback') {
        latest.followUpAnswer = $('#followup-input').value.slice(0, 1600);
        window.clearTimeout(saveDraftTimer);
        saveDraftTimer = window.setTimeout(saveState, 260);
      }
    });
    $('#end-session').addEventListener('click', () => openDialog(confirmDialog));
    $('#cancel-end').addEventListener('click', () => closeDialog(confirmDialog));
    $('#confirm-end').addEventListener('click', () => { closeDialog(confirmDialog); finishSession(); });
    $('#open-history').addEventListener('click', openHistory);
    $('#review-history').addEventListener('click', openHistory);
    $('#close-history').addEventListener('click', () => closeDialog(historyDialog));
    $('#done-history').addEventListener('click', () => closeDialog(historyDialog));
    $('#clear-history').addEventListener('click', clearHistory);
    $('#copy-report').addEventListener('click', copyReport);
    $('#new-session').addEventListener('click', newSession);
    $('#resume-session').addEventListener('click', resumeSession);
    $('#discard-session').addEventListener('click', discardSession);
    historyDialog.addEventListener('click', (event) => {
      if (event.target === historyDialog) closeDialog(historyDialog);
    });
    confirmDialog.addEventListener('click', (event) => {
      if (event.target === confirmDialog) closeDialog(confirmDialog);
    });
    window.addEventListener('beforeunload', () => {
      if (state.inProgress?.stage === 'interview') state.inProgress.draft = answerInput.value.slice(0, 6000);
      saveState();
    });
  }

  function boot() {
    loadState();
    bindEvents();
    updateSetupPreview();
    updateHistoryCount();
    renderResumeNotice();
    showScreen('setup');
    window.setInterval(updateElapsed, 1000);
  }

  boot();
})();
