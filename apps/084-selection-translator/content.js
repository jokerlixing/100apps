(function initializeMarginContent() {
  'use strict';

  if (window.top !== window.self || document.documentElement.dataset.margin84Loaded) return;
  document.documentElement.dataset.margin84Loaded = 'true';

  const Core = globalThis.MarginCore;
  const SETTINGS_KEY = 'margin84Settings';
  const state = {
    settings: { sourceLanguage: 'auto', targetLanguage: 'zh-CN', autoTranslate: false, paused: false },
    selection: null,
    result: null,
  };

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'margin84-action';
  action.setAttribute('aria-label', '翻译当前选区');
  action.hidden = true;
  action.innerHTML = '<span aria-hidden="true">译</span><b>翻译选区</b><small>0 B</small>';

  const card = document.createElement('section');
  card.className = 'margin84-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'MARGIN 翻译批注');
  card.hidden = true;
  card.innerHTML = `
    <header class="margin84-card-head">
      <span><b>MARGIN / 84</b><small class="margin84-provider">READY</small></span>
      <button type="button" class="margin84-close" aria-label="关闭翻译批注">×</button>
    </header>
    <div class="margin84-card-body">
      <p class="margin84-direction">AUTO <i aria-hidden="true"></i> ZH-CN</p>
      <blockquote class="margin84-source"></blockquote>
      <div class="margin84-rule" aria-hidden="true"><span></span></div>
      <p class="margin84-output" aria-live="polite"></p>
      <p class="margin84-note"></p>
    </div>
    <footer class="margin84-card-actions">
      <button type="button" class="margin84-copy">复制译文</button>
      <button type="button" class="margin84-speak">朗读</button>
    </footer>`;

  document.documentElement.append(action, card);

  const ui = {
    bytes: action.querySelector('small'),
    provider: card.querySelector('.margin84-provider'),
    direction: card.querySelector('.margin84-direction'),
    source: card.querySelector('.margin84-source'),
    output: card.querySelector('.margin84-output'),
    note: card.querySelector('.margin84-note'),
    close: card.querySelector('.margin84-close'),
    copy: card.querySelector('.margin84-copy'),
    speak: card.querySelector('.margin84-speak'),
  };

  let autoTimer = null;

  function isEditable(node) {
    const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return Boolean(element && element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
  }

  function positionElement(element, rect, width, estimatedHeight) {
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + (rect.width / 2) - (width / 2)));
    const below = rect.bottom + 10;
    const top = below + estimatedHeight < window.innerHeight ? below : Math.max(10, rect.top - estimatedHeight - 10);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  function captureSelection() {
    if (state.settings.paused) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (isEditable(range.commonAncestorContainer) || card.contains(range.commonAncestorContainer)) return;
    const validated = Core.validateSelection(selection.toString());
    if (!validated.ok) {
      action.hidden = true;
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    state.selection = { text: validated.text, rect };
    ui.bytes.textContent = `${validated.bytes} B`;
    positionElement(action, rect, 170, 48);
    action.hidden = false;
    card.hidden = true;
    if (state.settings.autoTranslate) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(translateCurrentSelection, 220);
    }
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, code: 'runtime-unavailable', message: '扩展已更新，请刷新当前页面后再试。' });
            return;
          }
          resolve(response || { ok: false, code: 'empty-response', message: '翻译后台没有返回结果。' });
        });
      } catch (_) {
        resolve({ ok: false, code: 'runtime-unavailable', message: '扩展已更新，请刷新当前页面后再试。' });
      }
    });
  }

  function setDirection(source, target) {
    ui.direction.replaceChildren();
    ui.direction.append(document.createTextNode(String(source || 'auto').toUpperCase()));
    const line = document.createElement('i');
    line.setAttribute('aria-hidden', 'true');
    ui.direction.append(line, document.createTextNode(String(target || state.settings.targetLanguage).toUpperCase()));
  }

  function showCardShell() {
    action.hidden = true;
    card.hidden = false;
    positionElement(card, state.selection.rect, 340, 330);
    ui.source.textContent = state.selection.text;
    setDirection(state.settings.sourceLanguage, state.settings.targetLanguage);
  }

  async function translateCurrentSelection() {
    if (!state.selection || state.settings.paused) return;
    showCardShell();
    ui.provider.textContent = 'TRANSLATING';
    ui.output.textContent = '正在沿校对线传递语境…';
    ui.note.textContent = '只发送这段明确选择的文字。';
    ui.copy.disabled = true;
    ui.speak.disabled = true;

    const result = await sendMessage({
      type: 'MARGIN_TRANSLATE',
      text: state.selection.text,
      sourceLanguage: state.settings.sourceLanguage,
      targetLanguage: state.settings.targetLanguage,
    });
    if (!result.ok) {
      state.result = null;
      ui.provider.textContent = String(result.code || 'ERROR').replaceAll('-', ' ').toUpperCase();
      ui.output.textContent = '这次没有生成译文。';
      ui.note.textContent = result.message || '请稍后重试。';
      return;
    }

    state.result = result;
    ui.provider.textContent = result.provider === 'remote' ? 'MYMEMORY' : result.provider.toUpperCase().replaceAll('-', ' ');
    setDirection(result.detectedSource || state.settings.sourceLanguage, result.targetLanguage);
    ui.output.textContent = result.text;
    ui.note.textContent = result.note;
    ui.copy.disabled = false;
    ui.speak.disabled = false;
  }

  async function copyResult() {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(state.result.text);
      ui.copy.textContent = '已复制';
      setTimeout(() => { ui.copy.textContent = '复制译文'; }, 1400);
    } catch (_) {
      ui.note.textContent = '当前页面阻止了剪贴板访问，请手动选择译文。';
    }
  }

  function speakResult() {
    if (!state.result || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.result.text);
    utterance.lang = state.result.targetLanguage;
    speechSynthesis.speak(utterance);
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get([SETTINGS_KEY]);
      state.settings = { ...state.settings, ...(stored[SETTINGS_KEY] || {}) };
    } catch (_) {
      state.settings.paused = true;
    }
  }

  action.addEventListener('click', translateCurrentSelection);
  ui.close.addEventListener('click', () => { card.hidden = true; });
  ui.copy.addEventListener('click', copyResult);
  ui.speak.addEventListener('click', speakResult);
  document.addEventListener('mouseup', () => setTimeout(captureSelection), true);
  document.addEventListener('keyup', (event) => {
    if (event.key.startsWith('Arrow') || event.key === 'Shift') setTimeout(captureSelection);
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (!action.contains(event.target) && !card.contains(event.target)) action.hidden = true;
  }, true);
  window.addEventListener('scroll', () => { action.hidden = true; }, { passive: true });
  window.addEventListener('resize', () => { action.hidden = true; card.hidden = true; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) {
      state.settings = { ...state.settings, ...(changes[SETTINGS_KEY].newValue || {}) };
      if (state.settings.paused) {
        action.hidden = true;
        card.hidden = true;
      }
    }
  });

  loadSettings();
})();
