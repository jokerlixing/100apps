(function initializePopup() {
  'use strict';

  const Core = globalThis.MarginCore;
  const SETTINGS_KEY = 'margin84Settings';
  const HISTORY_KEY = 'margin84History';
  const CACHE_KEY = 'margin84Cache';
  const defaults = { sourceLanguage: 'auto', targetLanguage: 'zh-CN', autoTranslate: false, paused: false };
  const elements = {
    source: document.getElementById('sourceLanguage'),
    target: document.getElementById('targetLanguage'),
    auto: document.getElementById('autoTranslate'),
    paused: document.getElementById('paused'),
    stamp: document.getElementById('stateStamp'),
    history: document.getElementById('historyList'),
    clear: document.getElementById('clearHistory'),
    saveState: document.getElementById('saveState'),
  };

  function addLanguageOptions(select, includeAuto) {
    Object.entries(Core.SUPPORTED_LANGUAGES).forEach(([code, value]) => {
      if (!includeAuto && code === 'auto') return;
      const option = document.createElement('option');
      option.value = code;
      option.textContent = value.label;
      select.append(option);
    });
  }

  function renderHistory(historyValue) {
    const history = Array.isArray(historyValue) ? historyValue : [];
    elements.history.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = '尚无翻译记录。';
      elements.history.append(empty);
      return;
    }
    history.slice(0, 6).forEach((item) => {
      const row = document.createElement('li');
      row.className = 'history-item';
      const direction = document.createElement('span');
      direction.className = 'direction';
      direction.textContent = `${item.sourceLanguage}\n↓\n${item.targetLanguage}`;
      const copy = document.createElement('span');
      const source = document.createElement('b');
      source.textContent = item.sourceText;
      const translated = document.createElement('small');
      translated.textContent = item.translatedText;
      copy.append(source, translated);
      row.append(direction, copy);
      elements.history.append(row);
    });
  }

  function currentSettings() {
    return {
      sourceLanguage: elements.source.value,
      targetLanguage: elements.target.value,
      autoTranslate: elements.auto.checked,
      paused: elements.paused.checked,
    };
  }

  function renderStatus(settings) {
    elements.stamp.textContent = settings.paused ? 'PAUSED' : 'ACTIVE';
    elements.stamp.style.background = settings.paused ? '#d6523c' : '#e9c75d';
    elements.stamp.style.color = settings.paused ? '#fcfcf8' : '#17212b';
  }

  async function save() {
    const settings = currentSettings();
    const pair = Core.validateLanguagePair(settings.sourceLanguage, settings.targetLanguage);
    if (!pair.ok) {
      elements.saveState.textContent = pair.message;
      return;
    }
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    renderStatus(settings);
    elements.saveState.textContent = '设置已同步';
  }

  async function load() {
    const stored = await chrome.storage.local.get([SETTINGS_KEY, HISTORY_KEY]);
    const settings = { ...defaults, ...(stored[SETTINGS_KEY] || {}) };
    elements.source.value = settings.sourceLanguage;
    elements.target.value = settings.targetLanguage;
    elements.auto.checked = settings.autoTranslate;
    elements.paused.checked = settings.paused;
    renderStatus(settings);
    renderHistory(stored[HISTORY_KEY]);
  }

  addLanguageOptions(elements.source, true);
  addLanguageOptions(elements.target, false);
  [elements.source, elements.target, elements.auto, elements.paused].forEach((control) => {
    control.addEventListener('change', save);
  });
  elements.clear.addEventListener('click', async () => {
    await chrome.storage.local.remove([HISTORY_KEY, CACHE_KEY]);
    renderHistory([]);
    elements.saveState.textContent = '历史与缓存已清空';
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[HISTORY_KEY]) renderHistory(changes[HISTORY_KEY].newValue);
  });
  load().catch(() => { elements.saveState.textContent = '无法读取扩展设置'; });
})();
