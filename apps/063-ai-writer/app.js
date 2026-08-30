(function startMarginApp() {
  'use strict';

  const Core = window.WriterCore;
  if (!Core) throw new Error('WriterCore failed to load');

  const STORAGE = Object.freeze({
    provider: 'margin63.provider.v1',
    history: 'margin63.history.v1',
  });

  const EXAMPLE = '我们花了一周把新功能做完了。我觉得其实这个功能非常非常重要, 因为它能让用户更快找到需要的内容. 现在准备上线，希望大家会喜欢。';
  const elements = {
    source: document.querySelector('#source-text'),
    revision: document.querySelector('#revision-text'),
    diff: document.querySelector('#diff-output'),
    emptyProof: document.querySelector('#empty-proof'),
    generate: document.querySelector('#generate-button'),
    generateIcon: document.querySelector('.generate-icon'),
    generateLabel: document.querySelector('.generate-label'),
    seamCaption: document.querySelector('#seam-caption'),
    status: document.querySelector('#status-message'),
    providerLabel: document.querySelector('#provider-label'),
    providerFootnote: document.querySelector('#provider-footnote'),
    historyCount: document.querySelector('#history-count'),
    sourceCharacters: document.querySelector('#source-characters'),
    sourceWords: document.querySelector('#source-words'),
    sourceReading: document.querySelector('#source-reading'),
    revisionCharacters: document.querySelector('#revision-characters'),
    changeRate: document.querySelector('#change-rate'),
    strength: document.querySelector('#strength-select'),
    language: document.querySelector('#language-select'),
    style: document.querySelector('#style-select'),
    preserve: document.querySelector('#preserve-terms'),
    notes: document.querySelector('#extra-notes'),
    languageControl: document.querySelector('#language-control'),
    styleControl: document.querySelector('#style-control'),
    copy: document.querySelector('#copy-output'),
    download: document.querySelector('#download-output'),
    reuse: document.querySelector('#reuse-output'),
    settingsDialog: document.querySelector('#settings-dialog'),
    historyDialog: document.querySelector('#history-dialog'),
    remoteFields: document.querySelector('#remote-fields'),
    endpoint: document.querySelector('#endpoint-input'),
    model: document.querySelector('#model-input'),
    apiKey: document.querySelector('#api-key-input'),
    settingsError: document.querySelector('#settings-error'),
    historyList: document.querySelector('#history-list'),
    clearHistory: document.querySelector('#clear-history'),
    toast: document.querySelector('#toast'),
  };

  const state = {
    mode: 'polish',
    view: 'final',
    provider: 'demo',
    endpoint: '',
    model: '',
    apiKey: '',
    running: false,
    controller: null,
    output: '',
    sourceSnapshot: '',
    history: [],
    toastTimer: null,
  };

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      showToast('浏览器未允许本地保存；本次操作仍可继续。');
      return false;
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
  }

  function setStatus(message, appState) {
    elements.status.textContent = message;
    document.body.dataset.state = appState || document.body.dataset.state || 'idle';
  }

  function currentOptions() {
    return {
      text: elements.source.value,
      mode: state.mode,
      strength: elements.strength.value,
      targetLanguage: elements.language.value,
      style: elements.style.value,
      preserveTerms: elements.preserve.value,
      notes: elements.notes.value,
    };
  }

  function updateSourceMetrics() {
    const metrics = Core.countTextMetrics(elements.source.value);
    elements.sourceCharacters.textContent = metrics.characters;
    elements.sourceWords.textContent = metrics.words;
    elements.sourceReading.textContent = metrics.readingMinutes;
  }

  function updateRevisionMetrics() {
    state.output = elements.revision.value;
    const sourceMetrics = Core.countTextMetrics(state.sourceSnapshot || elements.source.value);
    const revisionMetrics = Core.countTextMetrics(state.output);
    const rate = sourceMetrics.characters
      ? Math.round(((revisionMetrics.characters - sourceMetrics.characters) / sourceMetrics.characters) * 100)
      : 0;
    elements.revisionCharacters.textContent = revisionMetrics.characters;
    elements.changeRate.textContent = `${rate > 0 ? '+' : ''}${rate}%`;
    const hasOutput = Boolean(state.output.trim());
    elements.emptyProof.hidden = hasOutput;
    elements.copy.disabled = !hasOutput;
    elements.download.disabled = !hasOutput;
    elements.reuse.disabled = !hasOutput;
    renderDiff();
  }

  function renderDiff() {
    const source = state.sourceSnapshot || elements.source.value;
    const segments = Core.diffText(source, state.output);
    const fragment = document.createDocumentFragment();
    segments.forEach((segment) => {
      const span = document.createElement('span');
      span.textContent = segment.text;
      if (segment.type === 'add') span.className = 'diff-add';
      if (segment.type === 'delete') span.className = 'diff-delete';
      fragment.append(span);
    });
    elements.diff.replaceChildren(fragment);
  }

  function setMode(mode) {
    if (!Core.MODE_LABELS[mode]) return;
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.languageControl.hidden = mode !== 'translate';
    elements.styleControl.hidden = mode !== 'style';
    elements.seamCaption.textContent = `${Core.MODE_LABELS[mode]} · 原稿保持不动`;
    if (!state.running) setStatus(`已选择${Core.MODE_LABELS[mode]}。按 Ctrl + Enter 开始。`, 'idle');
  }

  function setView(view) {
    state.view = view === 'diff' ? 'diff' : 'final';
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.revision.hidden = state.view === 'diff';
    elements.diff.hidden = state.view !== 'diff';
    elements.emptyProof.hidden = state.view === 'diff' || Boolean(state.output.trim());
    if (state.view === 'diff') renderDiff();
  }

  function updateProviderUI() {
    const remote = state.provider === 'remote';
    document.body.dataset.provider = remote ? 'remote' : 'demo';
    elements.providerLabel.textContent = remote ? (state.model || '真实 AI') : '本地演示';
    elements.providerFootnote.textContent = remote ? `真实接口 · ${state.model || '待配置模型'}` : '本地演示模式';
    if (remote) {
      setStatus('真实接口已启用。API Key 只存在当前页面内存。', 'idle');
    } else {
      setStatus('准备就绪。原稿不会被生成内容覆盖。', 'idle');
    }
  }

  function setRunning(running) {
    state.running = running;
    elements.generateIcon.textContent = running ? '■' : '↗';
    elements.generateLabel.innerHTML = running ? '停止<br>生成' : '开始<br>改写';
    elements.seamCaption.textContent = running ? '修订缝线正在推进' : `${Core.MODE_LABELS[state.mode]} · 原稿保持不动`;
    if (running) document.body.dataset.state = 'running';
  }

  function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, milliseconds);
      signal.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  async function runDemo(promptOptions, signal) {
    const output = Core.createDemoRewrite(promptOptions);
    const characters = Array.from(output);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let assembled = '';
    for (let index = 0; index < characters.length; index += 4) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      assembled += characters.slice(index, index + 4).join('');
      elements.revision.value = assembled;
      updateRevisionMetrics();
      if (!reducedMotion) await delay(18, signal);
    }
    return assembled;
  }

  function remoteRequestBody(prompt) {
    return {
      model: state.model.trim(),
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: true,
      temperature: 0.55,
    };
  }

  async function readSSE(response, signal) {
    if (!response.body) throw new Error('接口没有返回可读取的数据流');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    let finished = false;

    while (!finished) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = await reader.read();
      finished = chunk.done;
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !finished });
      const parsed = Core.parseSSEBuffer(finished ? `${buffer}\n\n` : buffer);
      buffer = parsed.remainder;
      parsed.events.forEach((event) => {
        if (event?.error) throw new Error(event.error.message || '接口返回生成错误');
        output += Core.extractResponseText(event);
      });
      if (output) {
        elements.revision.value = output;
        updateRevisionMetrics();
      }
      if (parsed.done) break;
    }
    return output;
  }

  async function runRemote(prompt, signal) {
    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
    if (state.apiKey) headers.Authorization = `Bearer ${state.apiKey}`;
    const response = await fetch(state.endpoint.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify(remoteRequestBody(prompt)),
      signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`接口返回 ${response.status}${detail ? `：${detail}` : ''}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) return readSSE(response, signal);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error.message || '接口返回生成错误');
    const output = Core.extractResponseText(payload);
    elements.revision.value = output;
    updateRevisionMetrics();
    return output;
  }

  function saveHistory() {
    if (!state.output.trim()) return;
    const record = {
      id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      mode: state.mode,
      source: state.sourceSnapshot,
      output: state.output,
      strength: elements.strength.value,
      targetLanguage: elements.language.value,
      style: elements.style.value,
    };
    state.history = [record, ...state.history].slice(0, 8);
    writeJSON(STORAGE.history, state.history);
    renderHistory();
  }

  async function generate() {
    if (state.running) {
      state.controller?.abort();
      return;
    }

    const options = currentOptions();
    let prompt;
    try {
      prompt = Core.buildPrompt(options);
    } catch (error) {
      setStatus(error.message, 'error');
      showToast(error.message);
      elements.source.focus();
      return;
    }

    const validation = Core.validateProviderSettings({
      provider: state.provider,
      endpoint: state.endpoint,
      model: state.model,
    });
    if (!validation.valid) {
      setStatus(validation.errors.join('；'), 'error');
      showToast('先完成真实接口设置。');
      openSettings();
      return;
    }

    state.controller = new AbortController();
    state.sourceSnapshot = elements.source.value.trim();
    state.output = '';
    elements.revision.value = '';
    setView('final');
    updateRevisionMetrics();
    setRunning(true);
    setStatus(state.provider === 'remote' ? '正在接收模型输出，可以随时停止。' : '正在运行本地演示，结果会明确标注。', 'running');

    try {
      const output = state.provider === 'remote'
        ? await runRemote(prompt, state.controller.signal)
        : await runDemo(options, state.controller.signal);
      state.output = output.trim();
      elements.revision.value = state.output;
      updateRevisionMetrics();
      if (!state.output) throw new Error('接口没有返回可用文字');
      saveHistory();
      setStatus(state.provider === 'remote' ? '真实 AI 修订完成，原稿仍保留在左侧。' : '本地演示完成；连接真实接口可获得完整 AI 成稿。', 'done');
      showToast('修订稿已完成并保存到本机记录。');
    } catch (error) {
      if (error.name === 'AbortError') {
        state.output = elements.revision.value.trim();
        updateRevisionMetrics();
        if (state.output) saveHistory();
        setStatus('生成已停止，已产生的文字仍保留。', 'stopped');
      } else {
        setStatus(error.message || '生成失败，请检查接口设置。', 'error');
        showToast(error.message || '生成失败，请检查接口设置。');
      }
    } finally {
      setRunning(false);
      state.controller = null;
    }
  }

  function openSettings() {
    const selected = elements.settingsDialog.querySelector(`input[name="provider"][value="${state.provider}"]`);
    if (selected) selected.checked = true;
    elements.endpoint.value = state.endpoint;
    elements.model.value = state.model;
    elements.apiKey.value = state.apiKey;
    elements.settingsError.textContent = '';
    toggleRemoteFields();
    elements.settingsDialog.showModal();
  }

  function toggleRemoteFields() {
    const selected = elements.settingsDialog.querySelector('input[name="provider"]:checked')?.value || 'demo';
    elements.remoteFields.hidden = selected !== 'remote';
  }

  function saveSettings() {
    const provider = elements.settingsDialog.querySelector('input[name="provider"]:checked')?.value || 'demo';
    const next = {
      provider,
      endpoint: elements.endpoint.value.trim(),
      model: elements.model.value.trim(),
    };
    const validation = Core.validateProviderSettings(next);
    if (!validation.valid) {
      elements.settingsError.textContent = validation.errors.join('；');
      return;
    }

    state.provider = next.provider;
    state.endpoint = next.endpoint;
    state.model = next.model;
    state.apiKey = elements.apiKey.value.trim();
    writeJSON(STORAGE.provider, next);
    elements.settingsDialog.close();
    updateProviderUI();
    showToast(provider === 'remote' ? '真实接口已启用；密钥不会写入本地存储。' : '已切换到本地演示。');
  }

  function renderHistory() {
    elements.historyCount.textContent = state.history.length;
    elements.clearHistory.disabled = state.history.length === 0;
    if (!state.history.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = '还没有修订记录。完成一次改写后，原稿和成稿会保存在当前浏览器。';
      elements.historyList.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    state.history.forEach((record) => {
      const article = document.createElement('article');
      article.className = 'history-item';
      const header = document.createElement('header');
      const title = document.createElement('b');
      title.textContent = Core.MODE_LABELS[record.mode] || '修订';
      const time = document.createElement('time');
      time.dateTime = record.createdAt;
      time.textContent = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(record.createdAt));
      header.append(title, time);

      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.textContent = '恢复';
      restore.addEventListener('click', () => restoreHistory(record));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '删除';
      remove.addEventListener('click', () => deleteHistory(record.id));
      actions.append(restore, remove);

      const preview = document.createElement('p');
      preview.textContent = record.output.replace(/\s+/g, ' ').slice(0, 120);
      article.append(header, actions, preview);
      fragment.append(article);
    });
    elements.historyList.replaceChildren(fragment);
  }

  function restoreHistory(record) {
    setMode(record.mode || 'polish');
    elements.strength.value = record.strength || 'balanced';
    elements.language.value = record.targetLanguage || 'English';
    elements.style.value = record.style || 'professional';
    elements.source.value = record.source || '';
    elements.revision.value = record.output || '';
    state.sourceSnapshot = record.source || '';
    updateSourceMetrics();
    updateRevisionMetrics();
    setView('final');
    elements.historyDialog.close();
    setStatus('已恢复本机修订记录。', 'done');
    showToast('修订记录已恢复。');
  }

  function deleteHistory(id) {
    state.history = state.history.filter((record) => record.id !== id);
    writeJSON(STORAGE.history, state.history);
    renderHistory();
  }

  function clearHistory() {
    if (!state.history.length) return;
    if (!window.confirm('清空当前浏览器中的全部修订记录？')) return;
    state.history = [];
    writeJSON(STORAGE.history, state.history);
    renderHistory();
    showToast('本机修订记录已清空。');
  }

  async function copyOutput() {
    if (!state.output) return;
    try {
      await navigator.clipboard.writeText(state.output);
    } catch {
      elements.revision.focus();
      elements.revision.select();
      document.execCommand('copy');
    }
    showToast('成稿已复制。');
  }

  function downloadOutput() {
    if (!state.output) return;
    const blob = new Blob([state.output], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `MARGIN-63-${state.mode}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('TXT 已生成。');
  }

  function reuseOutput() {
    if (!state.output) return;
    elements.source.value = state.output;
    state.sourceSnapshot = state.output;
    updateSourceMetrics();
    elements.source.focus();
    elements.source.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setStatus('修订稿已成为新原稿，可以继续加工。', 'idle');
  }

  function bindEvents() {
    document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    elements.source.addEventListener('input', updateSourceMetrics);
    elements.revision.addEventListener('input', updateRevisionMetrics);
    elements.generate.addEventListener('click', generate);
    document.querySelector('#load-example').addEventListener('click', () => {
      elements.source.value = EXAMPLE;
      updateSourceMetrics();
      setStatus('样稿已载入，选择模式后即可改写。', 'idle');
      elements.source.focus();
    });

    document.querySelector('#open-settings').addEventListener('click', openSettings);
    document.querySelector('#close-settings').addEventListener('click', () => elements.settingsDialog.close());
    document.querySelector('#save-settings').addEventListener('click', saveSettings);
    elements.settingsDialog.querySelectorAll('input[name="provider"]').forEach((radio) => radio.addEventListener('change', toggleRemoteFields));
    elements.settingsDialog.addEventListener('click', (event) => {
      if (event.target === elements.settingsDialog) elements.settingsDialog.close();
    });

    document.querySelector('#open-history').addEventListener('click', () => elements.historyDialog.showModal());
    document.querySelector('#close-history').addEventListener('click', () => elements.historyDialog.close());
    elements.historyDialog.addEventListener('click', (event) => {
      if (event.target === elements.historyDialog) elements.historyDialog.close();
    });
    elements.clearHistory.addEventListener('click', clearHistory);
    elements.copy.addEventListener('click', copyOutput);
    elements.download.addEventListener('click', downloadOutput);
    elements.reuse.addEventListener('click', reuseOutput);

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        generate();
      }
      if (event.key === 'Escape' && state.running) state.controller?.abort();
    });
  }

  function initialize() {
    const provider = readJSON(STORAGE.provider, {});
    if (provider && ['demo', 'remote'].includes(provider.provider)) state.provider = provider.provider;
    state.endpoint = typeof provider.endpoint === 'string' ? provider.endpoint : '';
    state.model = typeof provider.model === 'string' ? provider.model : '';
    const history = readJSON(STORAGE.history, []);
    state.history = Array.isArray(history) ? history.filter((item) => item && item.source && item.output).slice(0, 8) : [];
    bindEvents();
    setMode('polish');
    setView('final');
    updateSourceMetrics();
    updateRevisionMetrics();
    renderHistory();
    updateProviderUI();
    document.body.classList.add('ready');
  }

  initialize();
}());
