(function initializeMarginDemo() {
  'use strict';

  const Core = window.MarginCore;
  const STORAGE_KEY = 'margin84_demo_v1';
  const state = {
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    autoTranslate: false,
    history: [],
    selection: null,
    lastResult: null,
  };

  const elements = {
    reader: document.getElementById('readingCopy'),
    sourceLanguage: document.getElementById('sourceLanguage'),
    targetLanguage: document.getElementById('targetLanguage'),
    autoTranslate: document.getElementById('autoTranslate'),
    selectionAction: document.getElementById('selectionAction'),
    selectionBytes: document.getElementById('selectionBytes'),
    proofEmpty: document.getElementById('proofEmpty'),
    proofResult: document.getElementById('proofResult'),
    proofProvider: document.getElementById('proofProvider'),
    proofTiming: document.getElementById('proofTiming'),
    sourceStamp: document.getElementById('sourceStamp'),
    targetStamp: document.getElementById('targetStamp'),
    sourceOutput: document.getElementById('sourceOutput'),
    translationOutput: document.getElementById('translationOutput'),
    resultNote: document.getElementById('resultNote'),
    copyTranslation: document.getElementById('copyTranslation'),
    speakTranslation: document.getElementById('speakTranslation'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistory'),
    toast: document.getElementById('toast'),
  };

  let autoTimer = null;
  let toastTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== 'object') return;
      const pair = Core.validateLanguagePair(saved.sourceLanguage, saved.targetLanguage);
      if (pair.ok) {
        state.sourceLanguage = pair.source;
        state.targetLanguage = pair.target;
      }
      state.autoTranslate = Boolean(saved.autoTranslate);
      state.history = Array.isArray(saved.history) ? saved.history.slice(0, Core.DEFAULT_HISTORY_LIMIT) : [];
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
      autoTranslate: state.autoTranslate,
      history: state.history,
    }));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
  }

  function languageLabel(code) {
    const language = Core.SUPPORTED_LANGUAGES[code];
    return language ? language.label : code;
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-history';
      empty.innerHTML = '还没有批注。<br>从右侧选择一整句开始。';
      elements.historyList.append(empty);
      return;
    }

    state.history.forEach((item) => {
      const row = document.createElement('li');
      row.className = 'history-item';
      const direction = document.createElement('span');
      direction.className = 'lang';
      direction.textContent = `${item.sourceLanguage}\n↓\n${item.targetLanguage}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.historyId = item.id;
      const source = document.createElement('b');
      source.textContent = item.sourceText;
      const translated = document.createElement('small');
      translated.textContent = item.translatedText;
      button.append(source, translated);
      row.append(direction, button);
      elements.historyList.append(row);
    });
  }

  function showResult(entry, timing) {
    state.lastResult = entry;
    elements.proofEmpty.hidden = true;
    elements.proofResult.hidden = false;
    elements.proofProvider.textContent = entry.provider === 'local-phrasebook' ? 'LOCAL PHRASE' : 'SAVED NOTE';
    elements.proofTiming.textContent = `${timing || 0} ms`;
    elements.sourceStamp.textContent = entry.sourceLanguage.toUpperCase();
    elements.targetStamp.textContent = entry.targetLanguage.toUpperCase();
    elements.sourceOutput.textContent = entry.sourceText;
    elements.translationOutput.textContent = entry.translatedText;
    elements.resultNote.textContent = entry.provider === 'local-phrasebook'
      ? '来源：内置示例短语 · 仅用于公开演示，不代表通用离线翻译能力'
      : '来源：本机最近批注 · 未发送网络请求';
  }

  function showFailure(result, sourceText) {
    elements.proofEmpty.hidden = true;
    elements.proofResult.hidden = false;
    elements.proofProvider.textContent = 'NO LOCAL MATCH';
    elements.proofTiming.textContent = '0 ms';
    elements.sourceStamp.textContent = state.sourceLanguage.toUpperCase();
    elements.targetStamp.textContent = state.targetLanguage.toUpperCase();
    elements.sourceOutput.textContent = sourceText;
    elements.translationOutput.textContent = '这段文字不在演示短语库中。';
    elements.resultNote.textContent = result.message;
    state.lastResult = null;
  }

  function translateSelection(selection) {
    const started = performance.now();
    const text = selection && selection.text;
    const source = selection && selection.sourceLanguage ? selection.sourceLanguage : state.sourceLanguage;
    const target = selection && selection.targetLanguage ? selection.targetLanguage : state.targetLanguage;
    const pair = Core.validateLanguagePair(source, target);
    if (!pair.ok) {
      showToast(pair.message);
      return;
    }
    const result = Core.localTranslate(text, pair.source, pair.target);
    elements.selectionAction.hidden = true;
    if (!result.ok) {
      showFailure(result, text);
      showToast('本地短语未命中；安装版会尝试在线翻译。');
      return;
    }

    const entry = Core.createHistoryEntry({
      sourceText: text,
      translatedText: result.text,
      sourceLanguage: result.detectedSource || pair.source,
      targetLanguage: pair.target,
      provider: result.source,
    });
    state.history = Core.mergeHistory(state.history, entry);
    showResult(state.history[0], Math.max(1, Math.round(performance.now() - started)));
    renderHistory();
    saveState();
  }

  function positionAction(rect) {
    const width = 172;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + (rect.width / 2) - (width / 2)));
    const below = rect.bottom + 10;
    const top = below + 54 < window.innerHeight ? below : Math.max(12, rect.top - 54);
    elements.selectionAction.style.left = `${left}px`;
    elements.selectionAction.style.top = `${top}px`;
  }

  function captureNativeSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!elements.reader.contains(range.commonAncestorContainer)) return;
    const validation = Core.validateSelection(selection.toString());
    if (!validation.ok) {
      if (validation.code === 'selection-too-long') showToast(validation.message);
      elements.selectionAction.hidden = true;
      return;
    }
    state.selection = { text: validation.text };
    elements.selectionBytes.textContent = `${validation.bytes} B`;
    positionAction(range.getBoundingClientRect());
    elements.selectionAction.hidden = false;
    if (state.autoTranslate) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(() => translateSelection(state.selection), 260);
    }
  }

  function useDemoSentence(button) {
    const text = button.dataset.text;
    const sourceLanguage = button.dataset.source || state.sourceLanguage;
    const targetLanguage = button.dataset.target || state.targetLanguage;
    state.sourceLanguage = sourceLanguage;
    state.targetLanguage = targetLanguage;
    elements.sourceLanguage.value = sourceLanguage;
    elements.targetLanguage.value = targetLanguage;
    state.selection = { text, sourceLanguage, targetLanguage };
    saveState();
    translateSelection(state.selection);
  }

  async function copyLastResult() {
    if (!state.lastResult) {
      showToast('当前没有可复制的译文。');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.lastResult.translatedText);
      showToast('译文已复制。');
    } catch (_) {
      const field = document.createElement('textarea');
      field.value = state.lastResult.translatedText;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      showToast(copied ? '译文已复制。' : '浏览器阻止了复制，请手动选择译文。');
    }
  }

  function speakLastResult() {
    if (!state.lastResult || !('speechSynthesis' in window)) {
      showToast('当前浏览器无法朗读这段译文。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.lastResult.translatedText);
    utterance.lang = state.lastResult.targetLanguage;
    window.speechSynthesis.speak(utterance);
    showToast(`正在朗读：${languageLabel(state.lastResult.targetLanguage)}`);
  }

  loadState();
  elements.sourceLanguage.value = state.sourceLanguage;
  elements.targetLanguage.value = state.targetLanguage;
  elements.autoTranslate.checked = state.autoTranslate;
  renderHistory();

  elements.reader.addEventListener('mouseup', () => setTimeout(captureNativeSelection));
  elements.reader.addEventListener('keyup', (event) => {
    if (event.key.startsWith('Arrow') || event.key === 'Shift') setTimeout(captureNativeSelection);
  });
  elements.selectionAction.addEventListener('click', () => translateSelection(state.selection));
  elements.sourceLanguage.addEventListener('change', (event) => {
    state.sourceLanguage = event.target.value;
    saveState();
  });
  elements.targetLanguage.addEventListener('change', (event) => {
    state.targetLanguage = event.target.value;
    saveState();
  });
  elements.autoTranslate.addEventListener('change', (event) => {
    state.autoTranslate = event.target.checked;
    saveState();
    showToast(state.autoTranslate ? '选完后会立即翻译。' : '选完后由批注签触发。');
  });
  document.querySelectorAll('.select-sentence').forEach((button) => {
    button.addEventListener('click', () => useDemoSentence(button));
  });
  elements.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-id]');
    if (!button) return;
    const entry = state.history.find((item) => item.id === button.dataset.historyId);
    if (entry) showResult(entry, 0);
  });
  elements.clearHistory.addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistory();
    showToast('最近批注已清空。');
  });
  elements.copyTranslation.addEventListener('click', copyLastResult);
  elements.speakTranslation.addEventListener('click', speakLastResult);
  document.addEventListener('pointerdown', (event) => {
    if (!elements.selectionAction.contains(event.target) && !elements.reader.contains(event.target)) {
      elements.selectionAction.hidden = true;
    }
  });
  window.addEventListener('scroll', () => { elements.selectionAction.hidden = true; }, { passive: true });
  window.addEventListener('resize', () => { elements.selectionAction.hidden = true; });
})();
