(function initTalkback() {
  'use strict';

  const Core = window.CoachCore;
  if (!Core) throw new Error('CoachCore failed to load.');

  const STORAGE_KEY = 'talkback70.state.v1';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  const dom = {
    scenarioList: document.querySelector('#scenario-list'),
    level: document.querySelector('#practice-level'),
    autoSpeak: document.querySelector('#auto-speak'),
    newSession: document.querySelector('#new-session'),
    scenarioTitle: document.querySelector('#current-scenario-title'),
    scenarioEnglish: document.querySelector('#current-scenario-english'),
    scenarioGoal: document.querySelector('#current-scenario-goal'),
    stepReadout: document.querySelector('#step-readout'),
    progress: document.querySelector('#lesson-progress'),
    coachPrompt: document.querySelector('#coach-prompt'),
    speakPrompt: document.querySelector('#speak-prompt'),
    stopSpeaking: document.querySelector('#stop-speaking'),
    conversationRail: document.querySelector('#conversation-rail'),
    turnCount: document.querySelector('#turn-count'),
    recognitionStatus: document.querySelector('#recognition-status'),
    interim: document.querySelector('#interim-text'),
    timer: document.querySelector('#speech-timer'),
    answer: document.querySelector('#answer-input'),
    toggleListening: document.querySelector('#toggle-listening'),
    listenLabel: document.querySelector('#listen-button-label'),
    demo: document.querySelector('#load-demo-answer'),
    submit: document.querySelector('#submit-answer'),
    speechLamp: document.querySelector('#speech-lamp'),
    speechStatus: document.querySelector('#speech-support-status'),
    coachMode: document.querySelector('#coach-mode-status'),
    feedbackSource: document.querySelector('#feedback-source'),
    metricScore: document.querySelector('#metric-score'),
    metricWpm: document.querySelector('#metric-wpm'),
    metricFillers: document.querySelector('#metric-fillers'),
    metricVariety: document.querySelector('#metric-variety'),
    feedbackStrength: document.querySelector('#feedback-strength'),
    feedbackSuggestions: document.querySelector('#feedback-suggestions'),
    targetPhrases: document.querySelector('#target-phrases'),
    targetCount: document.querySelector('#target-count'),
    rewriteBlock: document.querySelector('#rewrite-block'),
    aiRewrite: document.querySelector('#ai-rewrite'),
    confidenceNote: document.querySelector('#confidence-note'),
    openReport: document.querySelector('#open-report'),
    aiDialog: document.querySelector('#ai-settings-dialog'),
    openAi: document.querySelector('#open-ai-settings'),
    closeAi: document.querySelector('#close-ai-settings'),
    aiForm: document.querySelector('#ai-settings-form'),
    aiEndpoint: document.querySelector('#ai-endpoint'),
    aiModel: document.querySelector('#ai-model'),
    aiKey: document.querySelector('#ai-key'),
    aiError: document.querySelector('#ai-form-error'),
    disconnectAi: document.querySelector('#disconnect-ai'),
    reportDialog: document.querySelector('#report-dialog'),
    closeReport: document.querySelector('#close-report'),
    reportContent: document.querySelector('#report-content'),
    copyReport: document.querySelector('#copy-report'),
    downloadReport: document.querySelector('#download-report'),
    practiceAgain: document.querySelector('#practice-again'),
    toast: document.querySelector('#toast'),
    live: document.querySelector('#live-region')
  };

  let state = loadState();
  let temporaryApiKey = '';
  let recognition = null;
  let isListening = false;
  let recognitionStartedAt = 0;
  let lastSpeechDuration = null;
  let lastRecognitionConfidence = null;
  let timerHandle = 0;
  let toastHandle = 0;
  let reportCache = null;

  if (!state.startedAt) state.startedAt = new Date().toISOString();
  if (!state.settings.endpoint) state.settings.endpoint = 'https://api.openai.com/v1';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Core.sanitizeSession(raw ? JSON.parse(raw) : {
        scenarioId: 'coffee',
        settings: { level: 'B1', autoSpeak: true },
        reports: []
      });
    } catch {
      return Core.sanitizeSession({ scenarioId: 'coffee', settings: { level: 'B1', autoSpeak: true } });
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Core.sanitizeSession(state)));
    } catch {
      showToast('浏览器未能保存进度；当前页面仍可继续练习。');
    }
  }

  function currentScenario() {
    return Core.getScenario(state.scenarioId);
  }

  function currentPrompt() {
    const scenario = currentScenario();
    return scenario.prompts[Math.max(0, Math.min(4, state.stepIndex))];
  }

  function showToast(message) {
    window.clearTimeout(toastHandle);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    toastHandle = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 3200);
  }

  function announce(message) {
    dom.live.textContent = '';
    window.setTimeout(() => { dom.live.textContent = message; }, 30);
  }

  function setRecognitionStatus(message) {
    dom.recognitionStatus.textContent = message;
  }

  function renderScenarioCards() {
    dom.scenarioList.replaceChildren();
    for (const scenario of Core.SCENARIOS) {
      const label = document.createElement('label');
      label.className = 'scenario-card';
      label.htmlFor = `scenario-${scenario.id}`;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'scenario';
      input.id = `scenario-${scenario.id}`;
      input.value = scenario.id;
      input.checked = scenario.id === state.scenarioId;

      const copy = document.createElement('span');
      copy.className = 'scenario-copy';
      const title = document.createElement('strong');
      title.textContent = scenario.title;
      const detail = document.createElement('small');
      detail.textContent = scenario.goal;
      copy.append(title, detail);

      const level = document.createElement('span');
      level.className = 'scenario-level';
      level.textContent = scenario.level;

      label.append(input, copy, level);
      dom.scenarioList.append(label);
    }
  }

  function renderLesson() {
    const scenario = currentScenario();
    const prompt = currentPrompt();
    dom.scenarioTitle.textContent = scenario.title;
    dom.scenarioEnglish.textContent = scenario.englishTitle;
    dom.scenarioGoal.textContent = scenario.goal;
    dom.level.value = state.settings.level;
    dom.autoSpeak.checked = state.settings.autoSpeak;
    dom.stepReadout.textContent = state.completed ? 'SESSION COMPLETE' : `STEP ${state.stepIndex + 1} / 5`;
    dom.progress.value = state.completed ? 5 : state.stepIndex + 1;
    dom.coachPrompt.textContent = state.completed
      ? `You completed “${scenario.englishTitle}”. Open the report or choose a new lesson.`
      : prompt.coach;
    dom.answer.disabled = state.completed;
    dom.submit.disabled = state.completed;
    dom.demo.disabled = state.completed;
    dom.toggleListening.disabled = state.completed || !SpeechRecognition;
    dom.openReport.disabled = !state.turns.length;
    renderTargets();
  }

  function sourceLabel(source) {
    if (source === 'speech') return '真实语音';
    if (source === 'demo') return '演示回答';
    return '键入回答';
  }

  function renderConversation() {
    dom.conversationRail.replaceChildren();
    if (!state.turns.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-turn';
      empty.textContent = '完成第一轮后，练习卡会沿导轨归档在这里。';
      dom.conversationRail.append(empty);
    } else {
      state.turns.forEach((turn, index) => {
        const item = document.createElement('li');
        item.className = 'turn-card';

        const meta = document.createElement('div');
        meta.className = 'turn-meta';
        const number = document.createElement('span');
        number.textContent = `TURN ${String(index + 1).padStart(2, '0')} · ${sourceLabel(turn.source)}`;
        const score = document.createElement('span');
        score.textContent = `${turn.analysis.score} / 100${turn.aiEnhanced ? ' · AI ENHANCED' : ''}`;
        if (turn.aiEnhanced) score.className = 'ai-mark';
        meta.append(number, score);

        const coach = document.createElement('p');
        coach.className = 'coach-line';
        coach.textContent = turn.coach;
        const user = document.createElement('p');
        user.className = 'user-line';
        user.textContent = turn.user;
        const reply = document.createElement('p');
        reply.className = 'coach-line';
        reply.textContent = turn.coachReply;
        item.append(meta, coach, user, reply);
        dom.conversationRail.append(item);
      });
      window.requestAnimationFrame(() => {
        dom.conversationRail.scrollTop = dom.conversationRail.scrollHeight;
      });
    }
    dom.turnCount.textContent = `${state.turns.length} 个回答`;
  }

  function renderTargets() {
    const scenario = currentScenario();
    const latestIndex = state.turns.length ? Math.min(state.turns.length - 1, 4) : Math.min(state.stepIndex, 4);
    const prompt = scenario.prompts[latestIndex];
    const latest = state.turns[state.turns.length - 1];
    const used = latest && state.turns.length - 1 === latestIndex
      ? new Set(Core.calculatePhraseCoverage(latest.user, prompt.targetPhrases).found)
      : new Set();
    dom.targetPhrases.replaceChildren();
    for (const phrase of prompt.targetPhrases) {
      const chip = document.createElement('span');
      chip.className = `target-chip${used.has(phrase) ? ' is-used' : ''}`;
      chip.textContent = used.has(phrase) ? `✓ ${phrase}` : phrase;
      dom.targetPhrases.append(chip);
    }
    dom.targetCount.textContent = `${used.size} / ${prompt.targetPhrases.length}`;
  }

  function renderFeedback() {
    const latest = state.turns[state.turns.length - 1];
    if (!latest) {
      dom.feedbackSource.textContent = '等待回答';
      dom.feedbackSource.classList.remove('is-ai');
      dom.metricScore.textContent = '—';
      dom.metricWpm.textContent = '—';
      dom.metricFillers.textContent = '—';
      dom.metricVariety.textContent = '—';
      dom.feedbackStrength.textContent = '完成一轮后，这里会指出一个有证据的优点。';
      replaceList(dom.feedbackSuggestions, ['先直接回答问题，再补充一个具体细节。']);
      dom.rewriteBlock.hidden = true;
      dom.confidenceNote.textContent = '浏览器转写置信度仅作清晰度参考，不是发音分数。';
      return;
    }

    const analysis = latest.analysis;
    dom.feedbackSource.textContent = latest.aiEnhanced ? 'AI 增强 · 本地指标' : '本地分析';
    dom.feedbackSource.classList.toggle('is-ai', latest.aiEnhanced);
    dom.metricScore.textContent = analysis.score;
    dom.metricWpm.textContent = analysis.wpm === null ? '未测' : analysis.wpm;
    dom.metricFillers.textContent = analysis.fillerCount;
    dom.metricVariety.textContent = Math.round((analysis.lexicalDiversity || 0) * 100);
    dom.feedbackStrength.textContent = analysis.strength || '你完成了这轮回答。';
    replaceList(dom.feedbackSuggestions, analysis.suggestions.length ? analysis.suggestions : ['继续下一轮，保持回答完整。']);
    dom.rewriteBlock.hidden = !latest.rewrite;
    dom.aiRewrite.textContent = latest.rewrite || '';
    dom.confidenceNote.textContent = analysis.transcriptConfidence === null
      ? `${sourceLabel(latest.source)}未提供真实语音计时或转写置信度，因此不显示相关分数。`
      : `浏览器转写清晰度参考：${analysis.transcriptConfidence}%。这不是音素级发音分数。`;
  }

  function replaceList(list, items) {
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
  }

  function renderAll() {
    renderScenarioCards();
    renderLesson();
    renderConversation();
    renderFeedback();
  }

  function confirmReset() {
    return !state.turns.length || window.confirm('当前练习还没有保存为独立文件。确定清空这轮并开始新练习吗？');
  }

  function startScenario(id, shouldSpeak = false) {
    if (isListening) stopListening();
    stopSpeech();
    state = Core.sanitizeSession({
      scenarioId: id,
      stepIndex: 0,
      startedAt: new Date().toISOString(),
      completed: false,
      turns: [],
      settings: state.settings,
      reports: state.reports
    });
    clearAnswer();
    saveState();
    renderAll();
    setRecognitionStatus('新场景已载入。点“开始说话”或直接键入回答。');
    announce(`${currentScenario().title}练习已开始。`);
    if (shouldSpeak && state.settings.autoSpeak) speakCurrentPrompt();
  }

  function clearAnswer() {
    dom.answer.value = '';
    dom.answer.dataset.source = 'typed';
    dom.interim.textContent = '';
    dom.timer.textContent = '00:00';
    lastSpeechDuration = null;
    lastRecognitionConfidence = null;
  }

  function formatTimer(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function startTimer() {
    window.clearInterval(timerHandle);
    dom.timer.textContent = '00:00';
    timerHandle = window.setInterval(() => {
      dom.timer.textContent = formatTimer(Date.now() - recognitionStartedAt);
    }, 250);
  }

  function stopTimer() {
    window.clearInterval(timerHandle);
    timerHandle = 0;
    if (recognitionStartedAt) dom.timer.textContent = formatTimer(Date.now() - recognitionStartedAt);
  }

  function createRecognition() {
    if (!SpeechRecognition) return null;
    const instance = new SpeechRecognition();
    instance.lang = 'en-US';
    instance.interimResults = true;
    instance.continuous = false;
    instance.maxAlternatives = 1;

    instance.addEventListener('start', () => {
      isListening = true;
      recognitionStartedAt = Date.now();
      lastSpeechDuration = null;
      lastRecognitionConfidence = null;
      dom.answer.value = '';
      dom.answer.dataset.source = 'speech';
      dom.toggleListening.classList.add('is-listening');
      dom.listenLabel.textContent = '停止并使用转写';
      setRecognitionStatus('正在聆听英文回答…说完后点停止。');
      startTimer();
      announce('语音识别已开始。');
    });

    instance.addEventListener('result', (event) => {
      let finalText = '';
      let interimText = '';
      let confidence = null;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0] ? result[0].transcript : '';
        if (result.isFinal) {
          finalText += transcript;
          if (Number.isFinite(result[0].confidence) && result[0].confidence > 0) confidence = result[0].confidence;
        } else {
          interimText += transcript;
        }
      }
      if (finalText.trim()) dom.answer.value = `${dom.answer.value} ${finalText}`.trim();
      dom.interim.textContent = interimText ? `正在识别：${interimText}` : '';
      if (confidence !== null) lastRecognitionConfidence = confidence;
    });

    instance.addEventListener('error', (event) => {
      const messages = {
        'not-allowed': '麦克风权限被拒绝。请在浏览器地址栏允许权限，或改用键入回答。',
        'service-not-allowed': '浏览器禁用了语音识别服务。请改用键入或演示回答。',
        'audio-capture': '没有找到可用麦克风。请检查设备，或改用键入回答。',
        network: '语音识别网络服务暂时不可用。当前文本会保留，可改用键入回答。',
        'no-speech': '没有检测到语音。请靠近麦克风重试，或键入回答。'
      };
      setRecognitionStatus(messages[event.error] || '语音识别中断。当前文本已保留，可以继续键入。');
    });

    instance.addEventListener('end', () => {
      if (recognitionStartedAt) lastSpeechDuration = Math.max(1000, Date.now() - recognitionStartedAt);
      isListening = false;
      dom.toggleListening.classList.remove('is-listening');
      dom.listenLabel.textContent = '开始说话';
      dom.interim.textContent = '';
      stopTimer();
      if (dom.answer.value.trim()) setRecognitionStatus('转写已放入回答框。请核对后提交。');
      else if (!dom.recognitionStatus.textContent.includes('权限') && !dom.recognitionStatus.textContent.includes('没有')) setRecognitionStatus('没有获得最终转写，可重试或键入回答。');
    });
    return instance;
  }

  function startListening() {
    if (!SpeechRecognition) {
      setRecognitionStatus('当前浏览器不支持语音识别，请使用 Chrome/Edge 或键入回答。');
      return;
    }
    stopSpeech();
    recognition = createRecognition();
    try {
      recognition.start();
    } catch {
      setRecognitionStatus('语音识别尚未结束，请稍后再试。');
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      try { recognition.stop(); } catch { /* already stopping */ }
    }
  }

  function toggleListening() {
    if (isListening) stopListening();
    else startListening();
  }

  function speakCurrentPrompt() {
    if (!('speechSynthesis' in window)) {
      showToast('当前浏览器不支持文字朗读。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(dom.coachPrompt.textContent);
    utterance.lang = 'en-US';
    utterance.rate = state.settings.level === 'A2' ? 0.88 : state.settings.level === 'B2' ? 1.03 : 0.96;
    utterance.addEventListener('start', () => {
      dom.stopSpeaking.disabled = false;
      dom.speakPrompt.disabled = true;
    });
    utterance.addEventListener('end', resetSpeechButtons);
    utterance.addEventListener('error', resetSpeechButtons);
    window.speechSynthesis.speak(utterance);
  }

  function resetSpeechButtons() {
    dom.stopSpeaking.disabled = true;
    dom.speakPrompt.disabled = false;
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    resetSpeechButtons();
  }

  function demoAnswer() {
    if (state.completed) return;
    const prompt = currentPrompt();
    dom.answer.value = prompt.modelAnswer;
    dom.answer.dataset.source = 'demo';
    lastSpeechDuration = null;
    lastRecognitionConfidence = null;
    dom.timer.textContent = '00:00';
    setRecognitionStatus('已载入明确标注的演示回答；提交后只做文本反馈，不计算真实语速。');
    dom.answer.focus();
  }

  function submitAnswer() {
    if (state.completed) return;
    if (isListening) stopListening();
    const text = Core.cleanText(dom.answer.value);
    if (Core.tokenizeEnglish(text).length < 2) {
      setRecognitionStatus('请至少输入两个英文单词，再提交回答。');
      dom.answer.focus();
      return;
    }

    const prompt = currentPrompt();
    const source = dom.answer.dataset.source === 'speech' ? 'speech' : dom.answer.dataset.source === 'demo' ? 'demo' : 'typed';
    const analysis = Core.analyzeTurn({
      text,
      durationMs: source === 'speech' ? lastSpeechDuration : null,
      confidence: source === 'speech' ? lastRecognitionConfidence : null,
      targetPhrases: prompt.targetPhrases,
      expectedKeywords: prompt.expectedKeywords
    });
    const local = Core.advanceLocalScenario(state.scenarioId, state.stepIndex, analysis);
    const turn = {
      coach: prompt.coach,
      user: text,
      durationMs: source === 'speech' && lastSpeechDuration ? lastSpeechDuration : 1000,
      source,
      analysis,
      coachReply: local.coachReply,
      rewrite: '',
      aiEnhanced: false
    };

    state.turns.push(turn);
    state.stepIndex = local.nextStep;
    state.completed = local.completed;
    if (state.completed) archiveCurrentReport();
    saveState();
    clearAnswer();
    renderAll();
    setRecognitionStatus(state.completed ? '五轮练习已完成，可以查看训练报告。' : '本轮已归档。准备好后继续回答下一题。');
    announce(state.completed ? '练习完成，训练报告已生成。' : `第 ${state.turns.length} 轮已完成。`);

    const turnIndex = state.turns.length - 1;
    if (temporaryApiKey && state.settings.endpoint && state.settings.model) enhanceTurn(turnIndex, analysis);
    if (!state.completed && state.settings.autoSpeak) speakCurrentPrompt();
  }

  async function enhanceTurn(turnIndex, analysis) {
    const turn = state.turns[turnIndex];
    if (!turn) return;
    dom.feedbackSource.textContent = 'AI 正在增强…';
    dom.feedbackSource.classList.add('is-ai');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16000);
    try {
      const request = Core.buildAIRequest({
        endpoint: state.settings.endpoint,
        model: state.settings.model,
        scenario: currentScenario(),
        turns: state.turns.map((item) => ({ coach: item.coach, user: item.user })),
        analysis
      });
      const response = await fetch(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${temporaryApiKey}`
        },
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('密钥或权限无效');
        if (response.status === 429) throw new Error('接口请求过于频繁');
        throw new Error(`接口返回 ${response.status}`);
      }
      const payload = await response.json();
      const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content
        : null;
      const enhanced = Core.sanitizeAIReply(content);
      if (!enhanced) throw new Error('AI 返回格式无法识别');
      const activeTurn = state.turns[turnIndex];
      if (!activeTurn) return;
      activeTurn.coachReply = enhanced.coachReply;
      activeTurn.rewrite = enhanced.rewrite;
      activeTurn.aiEnhanced = true;
      if (enhanced.tips.length) activeTurn.analysis.suggestions = enhanced.tips;
      saveState();
      renderConversation();
      renderFeedback();
      showToast('AI 增强已加入本轮批注。');
    } catch (error) {
      const detail = error && error.name === 'AbortError' ? '连接超时' : Core.cleanText(error && error.message, 100) || '连接失败';
      renderFeedback();
      showToast(`AI 增强未完成：${detail}。已保留本地反馈。`);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function archiveCurrentReport() {
    const report = Core.summarizeSession(state);
    state.reports = [...state.reports, report].slice(-10);
    reportCache = report;
  }

  function getReport() {
    reportCache = Core.summarizeSession(state);
    return reportCache;
  }

  function renderReport() {
    const report = getReport();
    dom.reportContent.replaceChildren();

    const intro = document.createElement('p');
    intro.textContent = `${report.scenarioTitle} · ${report.englishTitle} · ${report.turnCount} 轮回答`;

    const summary = document.createElement('div');
    summary.className = 'report-summary';
    const metrics = [
      ['平均得分', `${report.averageScore}`],
      ['真实语速', report.averageWpm === null ? '未测' : `${report.averageWpm}`],
      ['停顿词', `${report.totalFillers}`],
      ['目标表达', `${report.targetPhrasesUsed}`]
    ];
    for (const [label, value] of metrics) {
      const cell = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = label;
      const data = document.createElement('strong');
      data.textContent = value;
      cell.append(name, data);
      summary.append(cell);
    }

    const heading = document.createElement('h3');
    heading.textContent = '下一轮训练目标';
    const goals = document.createElement('ol');
    goals.className = 'report-goals';
    for (const goal of report.goals) {
      const li = document.createElement('li');
      li.textContent = goal;
      goals.append(li);
    }
    dom.reportContent.append(intro, summary, heading, goals);
  }

  function formatReportText() {
    const report = getReport();
    const lines = [
      'TALKBACK/70 口语训练报告',
      `场景：${report.scenarioTitle} / ${report.englishTitle}`,
      `完成时间：${new Date(report.completedAt).toLocaleString('zh-CN')}`,
      `回答轮数：${report.turnCount}`,
      `平均得分：${report.averageScore} / 100`,
      `真实语音平均语速：${report.averageWpm === null ? '未测量' : `${report.averageWpm} WPM`}`,
      `停顿词总数：${report.totalFillers}`,
      `使用目标表达：${report.targetPhrasesUsed} 个`,
      '',
      '下一轮训练目标：',
      ...report.goals.map((goal, index) => `${index + 1}. ${goal}`),
      '',
      '说明：本地评分来自回答文本、真实语音计时、目标表达与浏览器转写置信度，不是音素级发音诊断。'
    ];
    return lines.join('\n');
  }

  async function copyReport() {
    const text = formatReportText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('训练报告已复制。');
    } catch {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.append(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
      showToast('训练报告已复制。');
    }
  }

  function downloadReport() {
    const blob = new Blob([`\uFEFF${formatReportText()}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `talkback70-${state.scenarioId}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('训练报告已下载。');
  }

  function openReport() {
    if (!state.turns.length) return;
    renderReport();
    dom.reportDialog.showModal();
  }

  function openAiSettings() {
    dom.aiEndpoint.value = state.settings.endpoint || 'https://api.openai.com/v1';
    dom.aiModel.value = state.settings.model || '';
    dom.aiKey.value = '';
    dom.aiError.textContent = '';
    dom.aiDialog.showModal();
  }

  function saveAiSettings(event) {
    event.preventDefault();
    dom.aiError.textContent = '';
    try {
      const endpoint = Core.normalizeEndpoint(dom.aiEndpoint.value);
      const model = Core.cleanText(dom.aiModel.value, 120);
      const key = Core.cleanText(dom.aiKey.value, 500);
      if (!model) throw new Error('请输入模型名称。');
      if (!key) throw new Error('请输入只用于本次页面的临时密钥。');
      state.settings.endpoint = endpoint;
      state.settings.model = model;
      temporaryApiKey = key;
      saveState();
      dom.aiKey.value = '';
      dom.coachMode.textContent = `AI 增强已连接 · ${model}`;
      dom.aiDialog.close();
      showToast('临时 AI 教练已连接；密钥不会持久化。');
    } catch (error) {
      dom.aiError.textContent = Core.cleanText(error && error.message, 160) || 'AI 设置无效。';
    }
  }

  function disconnectAi() {
    temporaryApiKey = '';
    dom.aiKey.value = '';
    dom.coachMode.textContent = '本地教练已就绪';
    dom.aiDialog.close();
    showToast('临时密钥已从当前页面内存清除。');
  }

  function setupCapabilities() {
    if (SpeechRecognition) {
      dom.speechLamp.classList.add('is-ready');
      dom.speechStatus.textContent = '浏览器语音识别可用';
    } else {
      dom.speechLamp.classList.add('is-warning');
      dom.speechStatus.textContent = '语音识别不可用 · 可键入';
      dom.toggleListening.title = '当前浏览器不支持 SpeechRecognition，请使用键入回答';
    }
    if (!('speechSynthesis' in window)) {
      dom.speakPrompt.disabled = true;
      dom.stopSpeaking.disabled = true;
    }
  }

  dom.scenarioList.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'scenario') return;
    const requested = event.target.value;
    if (requested === state.scenarioId) return;
    if (!confirmReset()) {
      renderScenarioCards();
      return;
    }
    startScenario(requested, true);
  });

  dom.level.addEventListener('change', () => {
    state.settings.level = dom.level.value;
    saveState();
    showToast(`反馈难度已切换为 ${state.settings.level}。`);
  });

  dom.autoSpeak.addEventListener('change', () => {
    state.settings.autoSpeak = dom.autoSpeak.checked;
    saveState();
  });

  dom.newSession.addEventListener('click', () => {
    if (confirmReset()) startScenario(state.scenarioId, true);
  });
  dom.toggleListening.addEventListener('click', toggleListening);
  dom.demo.addEventListener('click', demoAnswer);
  dom.submit.addEventListener('click', submitAnswer);
  dom.speakPrompt.addEventListener('click', speakCurrentPrompt);
  dom.stopSpeaking.addEventListener('click', stopSpeech);
  dom.openAi.addEventListener('click', openAiSettings);
  dom.closeAi.addEventListener('click', () => dom.aiDialog.close());
  dom.aiForm.addEventListener('submit', saveAiSettings);
  dom.disconnectAi.addEventListener('click', disconnectAi);
  dom.openReport.addEventListener('click', openReport);
  dom.closeReport.addEventListener('click', () => dom.reportDialog.close());
  dom.copyReport.addEventListener('click', copyReport);
  dom.downloadReport.addEventListener('click', downloadReport);
  dom.practiceAgain.addEventListener('click', () => {
    const index = Core.SCENARIOS.findIndex((scenario) => scenario.id === state.scenarioId);
    const next = Core.SCENARIOS[(index + 1) % Core.SCENARIOS.length];
    dom.reportDialog.close();
    startScenario(next.id, true);
  });

  dom.answer.addEventListener('input', () => {
    if (!isListening) {
      dom.answer.dataset.source = 'typed';
      lastSpeechDuration = null;
      lastRecognitionConfidence = null;
      dom.timer.textContent = '00:00';
    }
  });

  dom.answer.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitAnswer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isListening) stopListening();
    stopSpeech();
  });

  window.addEventListener('beforeunload', () => {
    if (recognition && isListening) {
      try { recognition.abort(); } catch { /* page is closing */ }
    }
    stopSpeech();
    temporaryApiKey = '';
  });

  setupCapabilities();
  renderAll();
  saveState();
  if (state.completed) setRecognitionStatus('已恢复一轮完成的练习，可以查看报告或开始新场景。');
  document.body.classList.add('ready');
})();
