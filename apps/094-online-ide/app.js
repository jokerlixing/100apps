(() => {
  'use strict';

  const Core = window.IdeCore;
  if (!Core) throw new Error('BENCH/94 core failed to load');

  const STORAGE_KEY = 'bench94_workspace_v1';
  const WEB_MESSAGE_SOURCE = 'bench94-preview';
  const RUN_TIMEOUT = 8_000;
  const PYTHON_LOAD_TIMEOUT = 30_000;
  const modeButtons = [...document.querySelectorAll('.mode-button')];
  const stageItems = [...document.querySelectorAll('#stageTape [data-stage]')];
  const elements = {
    fileList: document.querySelector('#fileList'),
    modeShortLabel: document.querySelector('#modeShortLabel'),
    modeDescription: document.querySelector('#modeDescription'),
    fileOrdinal: document.querySelector('#fileOrdinal'),
    editorHeading: document.querySelector('#editorHeading'),
    saveState: document.querySelector('#saveState'),
    lineCount: document.querySelector('#lineCount'),
    characterCount: document.querySelector('#characterCount'),
    lineNumbers: document.querySelector('#lineNumbers'),
    codeEditor: document.querySelector('#codeEditor'),
    runButton: document.querySelector('#runButton'),
    stopButton: document.querySelector('#stopButton'),
    downloadButton: document.querySelector('#downloadButton'),
    resetButton: document.querySelector('#resetButton'),
    resetDialog: document.querySelector('#resetDialog'),
    previewTab: document.querySelector('#previewTab'),
    consoleTab: document.querySelector('#consoleTab'),
    previewPanel: document.querySelector('#previewPanel'),
    consolePanel: document.querySelector('#consolePanel'),
    previewFrame: document.querySelector('#previewFrame'),
    previewEmpty: document.querySelector('#previewEmpty'),
    consoleLog: document.querySelector('#consoleLog'),
    clearConsoleButton: document.querySelector('#clearConsoleButton'),
    logCount: document.querySelector('#logCount'),
    engineStatus: document.querySelector('#engineStatus'),
    engineValue: document.querySelector('#engineValue'),
    lastRunTime: document.querySelector('#lastRunTime'),
    durationValue: document.querySelector('#durationValue'),
    resultStamp: document.querySelector('#resultStamp'),
    historyList: document.querySelector('#historyList'),
    toast: document.querySelector('#toast'),
    liveStatus: document.querySelector('#liveStatus')
  };

  let state = loadState();
  let saveTimer;
  let toastTimer;
  let runSequence = 0;
  let logCount = 0;
  let currentRun = null;

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return Core.normalizeWorkspace(stored ? JSON.parse(stored) : null);
    } catch {
      return Core.normalizeWorkspace(null);
    }
  }

  function saveState(immediate = false) {
    clearTimeout(saveTimer);
    const persist = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        elements.saveState.textContent = '已保存';
        elements.saveState.classList.remove('dirty');
      } catch {
        elements.saveState.textContent = '无法保存';
        elements.saveState.classList.add('dirty');
        showToast('浏览器存储不可用，草稿仅保留在当前页面。');
      }
    };
    if (immediate) persist();
    else saveTimer = setTimeout(persist, 280);
  }

  function activeMode() {
    return Core.MODES[state.mode];
  }

  function activeFile() {
    return state.activeFiles[state.mode];
  }

  function activeCode() {
    return state.workspaces[state.mode][activeFile()];
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2_600);
  }

  function announce(message) {
    elements.liveStatus.textContent = message;
  }

  function renderMode() {
    const mode = activeMode();
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.modeShortLabel.textContent = `${mode.shortLabel} / ${mode.files.length} FILE${mode.files.length > 1 ? 'S' : ''}`;
    elements.modeDescription.textContent = mode.description;
    elements.engineValue.textContent = state.mode === 'web' ? 'IFRAME' : state.mode === 'javascript' ? 'JS WORKER' : 'PYODIDE';
    elements.previewTab.disabled = state.mode !== 'web';
    renderFiles();
    renderEditor();
    selectOutputTab(state.mode === 'web' ? 'preview' : 'console');
    setEngineStatus(state.mode === 'web' ? '预览待命' : state.mode === 'javascript' ? 'Worker 待命' : 'Python 按需加载');
  }

  function renderFiles() {
    const mode = activeMode();
    elements.fileList.replaceChildren();
    mode.files.forEach((file, index) => {
      const button = document.createElement('button');
      const number = document.createElement('span');
      button.type = 'button';
      button.className = `file-button${activeFile() === file ? ' active' : ''}`;
      button.dataset.file = file;
      button.setAttribute('aria-pressed', String(activeFile() === file));
      number.textContent = String(index + 1).padStart(2, '0');
      button.append(number, document.createTextNode(file));
      elements.fileList.append(button);
    });
  }

  function renderEditor() {
    const mode = activeMode();
    const file = activeFile();
    const code = state.workspaces[state.mode][file];
    elements.editorHeading.textContent = file;
    elements.fileOrdinal.textContent = String(mode.files.indexOf(file) + 1).padStart(2, '0');
    elements.codeEditor.value = code;
    updateEditorReadout();
    elements.codeEditor.scrollTop = 0;
    elements.codeEditor.scrollLeft = 0;
    elements.lineNumbers.scrollTop = 0;
  }

  function updateEditorReadout() {
    const stats = Core.countCode(elements.codeEditor.value);
    elements.lineNumbers.textContent = Core.makeLineNumbers(elements.codeEditor.value);
    elements.lineCount.textContent = stats.lines;
    elements.characterCount.textContent = stats.characters.toLocaleString('zh-CN');
  }

  function switchMode(modeId) {
    if (!Core.MODE_IDS.includes(modeId) || modeId === state.mode) return;
    if (currentRun) stopRun('已切换运行语言');
    state.mode = modeId;
    setStage('edit');
    setStamp('idle', 'READY');
    renderMode();
    saveState(true);
    announce(`已切换到 ${activeMode().label}`);
  }

  function switchFile(fileId) {
    const file = Core.normalizeFileId(state.mode, fileId);
    if (file === activeFile()) return;
    state.activeFiles[state.mode] = file;
    renderFiles();
    renderEditor();
    saveState(true);
    announce(`正在编辑 ${file}`);
  }

  function handleEditorInput() {
    const safeCode = elements.codeEditor.value.slice(0, Core.MAX_CODE_LENGTH);
    if (safeCode !== elements.codeEditor.value) {
      elements.codeEditor.value = safeCode;
      showToast('单个文件最多保留 200,000 个字符。');
    }
    state.workspaces[state.mode][activeFile()] = safeCode;
    elements.saveState.textContent = '保存中';
    elements.saveState.classList.add('dirty');
    updateEditorReadout();
    setStage('edit');
    setStamp('idle', 'EDIT');
    saveState();
  }

  function insertTab(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const editor = elements.codeEditor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setStage(stage, failed = false) {
    const order = ['edit', 'check', 'run', 'result'];
    const currentIndex = order.indexOf(stage);
    stageItems.forEach((item, index) => {
      item.classList.toggle('passed', index < currentIndex);
      item.classList.toggle('current', index === currentIndex && !failed);
      item.classList.toggle('failed', index === currentIndex && failed);
    });
  }

  function setStamp(kind, label) {
    elements.resultStamp.className = `result-stamp ${kind}`;
    elements.resultStamp.textContent = label;
  }

  function setEngineStatus(label, kind = '') {
    elements.engineStatus.className = `engine-status${kind ? ` ${kind}` : ''}`;
    elements.engineStatus.querySelector('span').textContent = label;
  }

  function selectOutputTab(tab) {
    const preview = tab === 'preview' && state.mode === 'web';
    elements.previewTab.setAttribute('aria-selected', String(preview));
    elements.consoleTab.setAttribute('aria-selected', String(!preview));
    elements.previewPanel.hidden = !preview;
    elements.consolePanel.hidden = preview;
  }

  function clearConsole(addSystemLine = false) {
    elements.consoleLog.replaceChildren();
    logCount = 0;
    elements.logCount.textContent = '0';
    if (addSystemLine) appendLog('system', '实验输出已清空。');
  }

  function appendLog(level, text) {
    const safeLevel = ['log', 'info', 'warn', 'error', 'table', 'result', 'system'].includes(level) ? level : 'log';
    const line = document.createElement('div');
    const label = document.createElement('span');
    const content = document.createElement('pre');
    line.className = `log-line ${safeLevel}`;
    label.textContent = safeLevel === 'log' ? 'OUT' : safeLevel.toUpperCase();
    content.textContent = Array.from(String(text ?? '')).slice(0, 2_000).join('');
    line.append(label, content);
    elements.consoleLog.append(line);
    logCount += 1;
    elements.logCount.textContent = String(logCount);
    elements.consoleLog.scrollTop = elements.consoleLog.scrollHeight;
    if (currentRun) currentRun.outputLines += 1;
  }

  function makeRunId() {
    runSequence += 1;
    return `run_${Date.now().toString(36)}_${runSequence}`;
  }

  function sourceForCurrentRun() {
    if (state.mode === 'web') return Object.values(state.workspaces.web).join('\n').trim();
    return activeCode().trim();
  }

  function runCode() {
    if (!sourceForCurrentRun()) {
      showToast('当前模式没有可运行的代码。');
      announce('运行已取消：代码为空');
      elements.codeEditor.focus();
      return;
    }
    if (currentRun) stopRun('已开始新的运行', false);

    const id = makeRunId();
    currentRun = {
      id,
      mode: state.mode,
      startedAt: Date.now(),
      worker: null,
      timeout: null,
      outputLines: 0,
      hadError: false,
      finished: false
    };
    clearConsole();
    appendLog('system', `${activeMode().label} 实验开始。`);
    document.body.classList.add('running');
    elements.runButton.disabled = true;
    elements.stopButton.disabled = false;
    setStage('check');
    setStamp('running', 'CHECK');
    setEngineStatus('正在检查代码', 'loading');
    elements.lastRunTime.textContent = new Date(currentRun.startedAt).toLocaleTimeString('zh-CN', { hour12: false });
    elements.durationValue.textContent = 'RUNNING';
    announce(`${activeMode().label} 代码开始运行`);

    if (state.mode === 'web') runWeb(currentRun);
    else runWorker(currentRun);
  }

  function resetRunTimeout(run, milliseconds, reason) {
    clearTimeout(run.timeout);
    run.timeout = setTimeout(() => {
      if (!currentRun || currentRun.id !== run.id) return;
      appendLog('error', reason);
      finishRun('timeout', reason);
    }, milliseconds);
  }

  function buildWebDocument(files, runId) {
    const parsed = new DOMParser().parseFromString(files['index.html'], 'text/html');
    const bodyMarkup = parsed.body.innerHTML;
    const title = parsed.title ? parsed.title.replace(/[<>]/g, '') : 'BENCH/94 Preview';
    const css = files['styles.css'].replace(/<\/style/gi, '<\\/style');
    const userScript = files['script.js'].replace(/<\/script/gi, '<\\/script');
    const bridge = `(() => {
      const runId = ${JSON.stringify(runId)};
      const seen = new WeakSet();
      const text = (value) => {
        if (typeof value === 'string') return value.slice(0, 2000);
        if (value instanceof Error) return (value.stack || value.message).slice(0, 2000);
        if (typeof value === 'undefined') return 'undefined';
        if (typeof value === 'bigint') return String(value) + 'n';
        try { return JSON.stringify(value, (key, current) => {
          if (typeof current === 'bigint') return String(current) + 'n';
          if (current && typeof current === 'object') { if (seen.has(current)) return '[Circular]'; seen.add(current); }
          return current;
        }, 2).slice(0, 2000); } catch { return String(value).slice(0, 2000); }
      };
      const send = (type, payload = {}) => parent.postMessage({ source: '${WEB_MESSAGE_SOURCE}', runId, type, ...payload }, '*');
      for (const level of ['log', 'info', 'warn', 'error', 'table']) {
        const original = console[level]?.bind(console);
        console[level] = (...values) => { original?.(...values); send('log', { level, text: values.map(text).join(' ') }); };
      }
      addEventListener('error', (event) => send('error', { text: text(event.error || event.message) }));
      addEventListener('unhandledrejection', (event) => send('error', { text: text(event.reason) }));
      addEventListener('DOMContentLoaded', () => send('ready'));
    })();`.replace(/<\/script/gi, '<\\/script');

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https:; media-src data: blob: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <title>${title}</title>
  <script>${bridge}<\/script>
  <style>${css}</style>
</head>
<body>
${bodyMarkup}
<script>${userScript}<\/script>
</body>
</html>`;
  }

  function runWeb(run) {
    selectOutputTab('preview');
    setStage('run');
    setStamp('running', 'RUN');
    setEngineStatus('隔离预览运行中', 'loading');
    elements.previewEmpty.hidden = true;
    elements.previewFrame.classList.add('visible');
    elements.previewFrame.srcdoc = buildWebDocument(state.workspaces.web, run.id);
    resetRunTimeout(run, RUN_TIMEOUT, 'Web 预览 8 秒内没有完成加载，已停止。');
  }

  function runWorker(run) {
    selectOutputTab('console');
    const python = run.mode === 'python';
    const worker = new Worker(python ? 'python-worker.mjs' : 'js-worker.js', python ? { type: 'module' } : undefined);
    run.worker = worker;
    worker.addEventListener('message', (event) => handleWorkerMessage(run, event.data));
    worker.addEventListener('error', (event) => {
      if (!currentRun || currentRun.id !== run.id) return;
      const message = event.message || (python ? 'Python 运行时加载失败。' : 'JavaScript Worker 启动失败。');
      appendLog('error', message);
      finishRun('error', message);
    });
    worker.postMessage({ type: 'run', id: run.id, code: activeCode() });
    setEngineStatus(python ? '准备加载 Python' : 'Worker 正在检查', 'loading');
    resetRunTimeout(run, python ? PYTHON_LOAD_TIMEOUT : RUN_TIMEOUT, python ? 'Python 运行时 30 秒内未完成加载，已停止。' : 'JavaScript 运行超过 8 秒，已停止。');
  }

  function handleWorkerMessage(run, message) {
    if (!currentRun || currentRun.id !== run.id || !message || message.id !== run.id) return;
    if (message.type === 'log') {
      appendLog(message.level, message.text);
      return;
    }
    if (message.type === 'clear') {
      clearConsole();
      return;
    }
    if (message.type === 'stage') {
      if (message.stage === 'loading') {
        setStage('run');
        setStamp('running', 'LOAD');
        setEngineStatus(message.detail || '加载运行时', 'loading');
        resetRunTimeout(run, PYTHON_LOAD_TIMEOUT, 'Python 运行时 30 秒内未完成加载，已停止。');
      } else if (message.stage === 'check') {
        setStage('check');
        setStamp('running', 'CHECK');
      } else if (message.stage === 'run') {
        setStage('run');
        setStamp('running', 'RUN');
        setEngineStatus(message.detail || '代码运行中', 'loading');
        resetRunTimeout(run, RUN_TIMEOUT, `${activeMode().label} 执行超过 8 秒，已停止。`);
      }
      return;
    }
    if (message.type === 'done') {
      if (message.result) appendLog('result', message.result);
      if (message.error) appendLog('error', message.error);
      finishRun(message.status === 'success' ? 'success' : 'error', message.error || '', message.duration);
    }
  }

  function handlePreviewMessage(event) {
    const message = event.data;
    if (!currentRun || currentRun.mode !== 'web' || event.source !== elements.previewFrame.contentWindow) return;
    if (!message || message.source !== WEB_MESSAGE_SOURCE || message.runId !== currentRun.id) return;
    if (message.type === 'log') {
      appendLog(message.level, message.text);
    } else if (message.type === 'error') {
      currentRun.hadError = true;
      appendLog('error', message.text);
    } else if (message.type === 'ready') {
      finishRun(currentRun.hadError ? 'error' : 'success', currentRun.hadError ? '预览脚本包含运行错误。' : '');
    }
  }

  function stopRun(reason = '用户停止运行', record = true) {
    if (!currentRun) return;
    if (record) appendLog('warn', reason);
    finishRun('stopped', reason, undefined, record);
  }

  function finishRun(status, detail = '', durationOverride, record = true) {
    const run = currentRun;
    if (!run || run.finished) return;
    run.finished = true;
    clearTimeout(run.timeout);
    if (run.worker) run.worker.terminate();
    const duration = Math.max(0, Math.round(Number.isFinite(durationOverride) ? durationOverride : performance.now() - (run.startedAt - performance.timeOrigin)));
    currentRun = null;
    document.body.classList.remove('running');
    elements.runButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.durationValue.textContent = `${duration} ms`;
    setStage('result', status !== 'success');

    const labels = {
      success: ['success', 'PASS', '运行完成'],
      error: ['error', 'ERROR', '运行失败'],
      stopped: ['idle', 'STOP', '运行已停止'],
      timeout: ['error', 'TIME', '运行超时']
    };
    const [stampKind, stampLabel, engineLabel] = labels[status] || labels.error;
    setStamp(stampKind, stampLabel);
    setEngineStatus(engineLabel, status === 'error' || status === 'timeout' ? 'error' : '');
    announce(`${activeMode().label}${engineLabel}`);

    if (record) {
      const summary = detail || (run.outputLines ? `${run.outputLines} 行输出` : status === 'success' ? '无输出，执行完成' : engineLabel);
      state.history = Core.normalizeHistory([...state.history, {
        id: run.id,
        mode: run.mode,
        status,
        startedAt: run.startedAt,
        duration,
        summary
      }]);
      renderHistory();
      saveState(true);
    }
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = '还没有运行记录。第一次结果会盖在这里。';
      elements.historyList.append(empty);
      return;
    }
    [...state.history].reverse().forEach((record) => {
      const item = document.createElement('li');
      const header = document.createElement('header');
      const mode = document.createElement('span');
      const status = document.createElement('span');
      const summary = document.createElement('p');
      const meta = document.createElement('small');
      item.className = `history-item ${record.status}`;
      mode.textContent = Core.MODES[record.mode].shortLabel;
      status.textContent = record.status.toUpperCase();
      summary.textContent = record.summary || '无输出';
      meta.textContent = `${new Date(record.startedAt).toLocaleTimeString('zh-CN', { hour12: false })} · ${record.duration} ms`;
      header.append(mode, status);
      item.append(header, summary, meta);
      elements.historyList.append(item);
    });
  }

  function resetCurrentMode() {
    if (currentRun) stopRun('重置模板前已停止运行');
    state.workspaces[state.mode] = Core.cloneTemplates(state.mode);
    state.activeFiles[state.mode] = activeMode().files[0];
    renderFiles();
    renderEditor();
    saveState(true);
    setStage('edit');
    setStamp('idle', 'READY');
    showToast(`${activeMode().label} 已恢复官方模板。`);
    announce(`${activeMode().label} 已恢复官方模板`);
  }

  function downloadCurrentFile() {
    const blob = new Blob([activeCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = activeFile();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast(`${activeFile()} 已下载。`);
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => switchMode(button.dataset.mode)));
  elements.fileList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-file]');
    if (button) switchFile(button.dataset.file);
  });
  elements.codeEditor.addEventListener('input', handleEditorInput);
  elements.codeEditor.addEventListener('keydown', insertTab);
  elements.codeEditor.addEventListener('scroll', () => { elements.lineNumbers.scrollTop = elements.codeEditor.scrollTop; });
  elements.runButton.addEventListener('click', runCode);
  elements.stopButton.addEventListener('click', () => stopRun());
  elements.downloadButton.addEventListener('click', downloadCurrentFile);
  elements.resetButton.addEventListener('click', () => elements.resetDialog.showModal());
  elements.resetDialog.addEventListener('close', () => { if (elements.resetDialog.returnValue === 'confirm') resetCurrentMode(); });
  elements.previewTab.addEventListener('click', () => selectOutputTab('preview'));
  elements.consoleTab.addEventListener('click', () => selectOutputTab('console'));
  elements.clearConsoleButton.addEventListener('click', () => clearConsole(true));
  window.addEventListener('message', handlePreviewMessage);
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    if (currentRun?.worker) currentRun.worker.terminate();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runCode();
    } else if (event.key === 'Escape' && currentRun) {
      event.preventDefault();
      stopRun();
    }
  });

  renderMode();
  renderHistory();
  setStage('edit');
  setStamp('idle', 'READY');
  document.body.classList.add('ready');
})();

