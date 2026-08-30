(function startLockbox() {
  'use strict';

  const Core = window.VaultCore;
  const STORAGE_KEY = 'lockbox53.vault.v1';
  const AUTO_LOCK_KEY = 'lockbox53.autoLockMinutes';
  const AUTO_LOCK_OPTIONS = new Set([1, 5, 15, 30]);
  const MAX_IMPORT_BYTES = Math.ceil((Core.LIMITS.vaultBytes * 4) / 3) + 8192;
  const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const listDateFormatter = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

  const byId = (id) => document.getElementById(id);
  const elements = {
    compatibilityWarning: byId('compatibilityWarning'),
    lockedView: byId('lockedView'),
    createPanel: byId('createPanel'),
    unlockPanel: byId('unlockPanel'),
    createVaultForm: byId('createVaultForm'),
    createMaster: byId('createMaster'),
    createMasterToggle: byId('createMasterToggle'),
    confirmMaster: byId('confirmMaster'),
    createError: byId('createError'),
    createStrengthBar: byId('createStrengthBar'),
    createStrengthText: byId('createStrengthText'),
    unlockVaultForm: byId('unlockVaultForm'),
    unlockMaster: byId('unlockMaster'),
    unlockMasterToggle: byId('unlockMasterToggle'),
    unlockError: byId('unlockError'),
    unlockSubmit: byId('unlockSubmit'),
    storedVaultTime: byId('storedVaultTime'),
    exportLockedButton: byId('exportLockedButton'),
    headerLamp: byId('headerLamp'),
    headerStatus: byId('headerStatus'),
    lockButton: byId('lockButton'),
    vaultView: byId('vaultView'),
    saveState: byId('saveState'),
    entryCount: byId('entryCount'),
    statusEntryCount: byId('statusEntryCount'),
    searchInput: byId('searchInput'),
    clearSearchButton: byId('clearSearchButton'),
    newEntryButton: byId('newEntryButton'),
    entryList: byId('entryList'),
    listEmpty: byId('listEmpty'),
    ticketTitle: byId('ticketTitle'),
    ticketStamp: byId('ticketStamp'),
    entryPlaceholder: byId('entryPlaceholder'),
    entryForm: byId('entryForm'),
    entryId: byId('entryId'),
    entryTitle: byId('entryTitle'),
    entryUsername: byId('entryUsername'),
    entryPassword: byId('entryPassword'),
    entryUrl: byId('entryUrl'),
    entryNotes: byId('entryNotes'),
    entryError: byId('entryError'),
    entryPasswordToggle: byId('entryPasswordToggle'),
    entryStrengthBar: byId('entryStrengthBar'),
    entryStrengthText: byId('entryStrengthText'),
    copyUsernameButton: byId('copyUsernameButton'),
    copyPasswordButton: byId('copyPasswordButton'),
    openSiteLink: byId('openSiteLink'),
    deleteEntryButton: byId('deleteEntryButton'),
    cancelEntryButton: byId('cancelEntryButton'),
    saveEntryButton: byId('saveEntryButton'),
    generatorLength: byId('generatorLength'),
    generatorLengthOutput: byId('generatorLengthOutput'),
    useLowercase: byId('useLowercase'),
    useUppercase: byId('useUppercase'),
    useDigits: byId('useDigits'),
    useSymbols: byId('useSymbols'),
    excludeAmbiguous: byId('excludeAmbiguous'),
    generatedPassword: byId('generatedPassword'),
    generatedPasswordToggle: byId('generatedPasswordToggle'),
    generatePasswordButton: byId('generatePasswordButton'),
    useGeneratedButton: byId('useGeneratedButton'),
    copyGeneratedButton: byId('copyGeneratedButton'),
    lastSavedAt: byId('lastSavedAt'),
    lockCountdown: byId('lockCountdown'),
    autoLockSelect: byId('autoLockSelect'),
    exportButton: byId('exportButton'),
    confirmDialog: byId('confirmDialog'),
    confirmTitle: byId('confirmTitle'),
    confirmMessage: byId('confirmMessage'),
    confirmActionButton: byId('confirmActionButton'),
    importDialog: byId('importDialog'),
    importForm: byId('importForm'),
    importFile: byId('importFile'),
    importMaster: byId('importMaster'),
    importError: byId('importError'),
    cancelImportButton: byId('cancelImportButton'),
    resetDialog: byId('resetDialog'),
    resetForm: byId('resetForm'),
    resetConfirmInput: byId('resetConfirmInput'),
    resetError: byId('resetError'),
    cancelResetButton: byId('cancelResetButton'),
    toast: byId('toast'),
  };

  const state = {
    envelope: null,
    key: null,
    data: null,
    selectedId: null,
    storageCorrupt: false,
    storageReady: true,
    cryptoReady: Boolean(window.isSecureContext && window.crypto && window.crypto.subtle),
    autoLockMinutes: 5,
    lastActivity: 0,
    activityThrottleAt: 0,
    autoLockTimer: 0,
    busy: false,
    toastTimer: 0,
  };

  function setText(element, value) {
    element.textContent = value;
  }

  function showToast(message, type = 'success') {
    window.clearTimeout(state.toastTimer);
    setText(elements.toast, message);
    elements.toast.classList.toggle('error', type === 'error');
    elements.toast.classList.add('show');
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 3200);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : dateTimeFormatter.format(date);
  }

  function formatListDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--/--' : listDateFormatter.format(date);
  }

  function storageWrite(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      throw new Core.VaultError('STORAGE_FAILED', '浏览器拒绝保存。请检查存储空间并立即导出备份。', error);
    }
  }

  function loadPreferences() {
    try {
      const minutes = Number(window.localStorage.getItem(AUTO_LOCK_KEY));
      if (AUTO_LOCK_OPTIONS.has(minutes)) state.autoLockMinutes = minutes;
    } catch {
      state.storageReady = false;
    }
    elements.autoLockSelect.value = String(state.autoLockMinutes);
  }

  function loadEnvelope() {
    let raw = null;
    try {
      const probeKey = 'lockbox53.storageProbe';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      state.storageReady = false;
      return;
    }
    if (!raw) return;
    try {
      state.envelope = Core.validateVaultEnvelope(JSON.parse(raw));
    } catch {
      state.storageCorrupt = true;
    }
  }

  function setCompatibleState() {
    const ready = state.cryptoReady && state.storageReady;
    elements.compatibilityWarning.hidden = ready;
    for (const form of [elements.createVaultForm, elements.unlockVaultForm, elements.importForm]) {
      for (const control of form.elements) control.disabled = !ready;
    }
    if (!state.storageReady) {
      setText(
        elements.compatibilityWarning.querySelector('span'),
        '浏览器本地存储不可用。请退出隐私限制模式或允许本站存储数据后重试。',
      );
    }
  }

  function renderAuth() {
    elements.lockedView.hidden = false;
    elements.vaultView.hidden = true;
    elements.lockButton.hidden = true;
    elements.headerLamp.classList.remove('active');
    setText(elements.headerStatus, '保险箱已锁定');

    const hasStoredVault = Boolean(state.envelope || state.storageCorrupt);
    elements.createPanel.hidden = hasStoredVault;
    elements.unlockPanel.hidden = !hasStoredVault;
    elements.exportLockedButton.disabled = !state.envelope;
    elements.unlockSubmit.disabled = state.storageCorrupt || !state.cryptoReady || !state.storageReady;

    if (state.storageCorrupt) {
      setText(elements.storedVaultTime, '本机密文格式已损坏。请导入可用备份或删除后重建。');
      setText(elements.unlockError, '损坏的保险箱无法解锁');
    } else if (state.envelope) {
      setText(elements.storedVaultTime, `上次封存：${formatDateTime(state.envelope.updatedAt)}`);
      setText(elements.unlockError, '');
    } else {
      setText(elements.createError, '');
    }
  }

  function clearSession() {
    state.key = null;
    state.data = null;
    state.selectedId = null;
    state.lastActivity = 0;
    elements.entryForm.reset();
    elements.entryPassword.type = 'password';
    elements.generatedPassword.type = 'password';
    elements.searchInput.value = '';
  }

  function lockVault(message = '保险箱已锁定') {
    if (!state.data) return;
    clearSession();
    closeOpenDialogs();
    renderAuth();
    showToast(message);
    window.setTimeout(() => elements.unlockMaster.focus(), 30);
  }

  function showUnlocked() {
    elements.lockedView.hidden = true;
    elements.vaultView.hidden = false;
    elements.lockButton.hidden = false;
    elements.headerLamp.classList.add('active');
    setText(elements.headerStatus, '保险箱已解锁');
    state.lastActivity = Date.now();
    state.selectedId = state.data.entries[0] ? state.data.entries[0].id : null;
    elements.searchInput.value = '';
    renderVault();
    if (state.selectedId) showEntry(state.selectedId);
    else showEntryPlaceholder();
    generatePassword();
    startAutoLockTimer();
  }

  function setFormBusy(form, busy) {
    state.busy = busy;
    elements.lockedView.classList.toggle('is-busy', busy);
    for (const control of form.elements) control.disabled = busy;
  }

  function setSaveStatus(message, active = true) {
    const lamp = elements.saveState.querySelector('.status-lamp');
    const label = elements.saveState.querySelector('span:last-child');
    lamp.classList.toggle('active', active);
    setText(label, message);
  }

  function updateStrength(password, bar, label, emptyMessage) {
    const strength = Core.evaluatePasswordStrength(password);
    bar.dataset.score = password ? String(strength.score) : '0';
    if (!password) {
      setText(label, emptyMessage);
      return strength;
    }
    const hint = strength.suggestions[0] || '';
    setText(label, `${strength.label} · ${hint}`);
    return strength;
  }

  function configureSecretToggle(button, input) {
    button.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      setText(button, reveal ? '隐藏' : '显示');
      button.setAttribute('aria-label', reveal ? '隐藏密码' : '显示密码');
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (state.busy || !state.cryptoReady || !state.storageReady) return;
    setText(elements.createError, '');
    const masterPassword = elements.createMaster.value;
    const validation = Core.validateMasterPassword(masterPassword);
    if (!validation.valid) {
      setText(elements.createError, validation.message);
      elements.createMaster.focus();
      return;
    }
    if (masterPassword !== elements.confirmMaster.value) {
      setText(elements.createError, '两次输入的主密码不一致');
      elements.confirmMaster.focus();
      return;
    }

    setFormBusy(elements.createVaultForm, true);
    try {
      const now = new Date().toISOString();
      const data = { entries: [], createdAt: now, updatedAt: now };
      const created = await Core.createVault(masterPassword, data);
      storageWrite(STORAGE_KEY, JSON.stringify(created.envelope));
      state.envelope = created.envelope;
      state.key = created.key;
      state.data = data;
      state.storageCorrupt = false;
      elements.createVaultForm.reset();
      updateStrength('', elements.createStrengthBar, elements.createStrengthText, '至少 12 个字符，推荐使用长口令');
      showUnlocked();
      showToast('新保险箱已创建并加密');
    } catch (error) {
      setText(elements.createError, error.message || '创建保险箱失败');
    } finally {
      setFormBusy(elements.createVaultForm, false);
    }
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (state.busy || !state.envelope) return;
    setText(elements.unlockError, '');
    setFormBusy(elements.unlockVaultForm, true);
    try {
      const unlocked = await Core.unlockVault(elements.unlockMaster.value, state.envelope);
      state.key = unlocked.key;
      state.data = unlocked.data;
      state.envelope = unlocked.envelope;
      elements.unlockVaultForm.reset();
      showUnlocked();
      showToast('保险箱已解锁');
    } catch (error) {
      setText(elements.unlockError, error.message || '无法解锁保险箱');
      elements.unlockMaster.select();
    } finally {
      setFormBusy(elements.unlockVaultForm, false);
    }
  }

  function searchableText(entry) {
    return [entry.title, entry.username, entry.url, entry.notes].join('\n').toLocaleLowerCase('zh-CN');
  }

  function sortedEntries(entries) {
    return [...entries].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN', {
      sensitivity: 'base',
      numeric: true,
    }));
  }

  function createEntryButton(entry) {
    const button = document.createElement('button');
    button.className = 'key-tag';
    button.type = 'button';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-pressed', String(entry.id === state.selectedId));
    if (entry.id === state.selectedId) button.classList.add('selected');

    const icon = document.createElement('span');
    icon.className = 'key-icon';
    icon.setAttribute('aria-hidden', 'true');
    setText(icon, Array.from(entry.title)[0].toLocaleUpperCase('zh-CN'));

    const copy = document.createElement('span');
    copy.className = 'key-copy';
    const title = document.createElement('b');
    setText(title, entry.title);
    const username = document.createElement('span');
    setText(username, entry.username || '未填写用户名');
    copy.append(title, username);

    const time = document.createElement('time');
    time.dateTime = entry.updatedAt;
    setText(time, formatListDate(entry.updatedAt));
    button.append(icon, copy, time);
    button.addEventListener('click', () => showEntry(entry.id));
    return button;
  }

  function renderEntryList() {
    const query = elements.searchInput.value.trim().toLocaleLowerCase('zh-CN');
    const entries = sortedEntries(state.data.entries).filter((entry) => !query || searchableText(entry).includes(query));
    elements.entryList.replaceChildren(...entries.map(createEntryButton));
    elements.listEmpty.hidden = entries.length > 0;
    if (entries.length === 0) {
      const title = elements.listEmpty.querySelector('b');
      const message = elements.listEmpty.querySelector('span');
      if (query) {
        setText(title, '没有匹配的账号');
        setText(message, '换一个标题、用户名、网址或备注关键词。');
      } else {
        setText(title, '钥匙轨道还是空的');
        setText(message, '创建第一条账号记录，保存后会立即加密。');
      }
    }
  }

  function renderVault() {
    const count = state.data.entries.length;
    setText(elements.entryCount, String(count));
    setText(elements.statusEntryCount, String(count));
    setText(elements.lastSavedAt, formatDateTime(state.envelope.updatedAt));
    renderEntryList();
  }

  function setOpenLink(value) {
    const safeUrl = Core.toSafeHttpUrl(value);
    elements.openSiteLink.hidden = !safeUrl;
    if (safeUrl) elements.openSiteLink.href = safeUrl;
    else elements.openSiteLink.removeAttribute('href');
  }

  function showEntryPlaceholder() {
    state.selectedId = null;
    elements.entryPlaceholder.hidden = false;
    elements.entryForm.hidden = true;
    setText(elements.ticketTitle, '选择一枚账号钥匙');
    setText(elements.ticketStamp, 'STANDBY');
    renderEntryList();
  }

  function fillEntryForm(entry) {
    elements.entryId.value = entry ? entry.id : '';
    elements.entryTitle.value = entry ? entry.title : '';
    elements.entryUsername.value = entry ? entry.username : '';
    elements.entryPassword.value = entry ? entry.password : '';
    elements.entryPassword.type = 'password';
    setText(elements.entryPasswordToggle, '显示');
    elements.entryUrl.value = entry ? entry.url : '';
    elements.entryNotes.value = entry ? entry.notes : '';
    elements.deleteEntryButton.hidden = !entry;
    setText(elements.entryError, '');
    setOpenLink(elements.entryUrl.value);
    updateStrength(
      elements.entryPassword.value,
      elements.entryStrengthBar,
      elements.entryStrengthText,
      '尚未填写密码',
    );
  }

  function showEntry(id) {
    const entry = state.data.entries.find((item) => item.id === id);
    if (!entry) {
      showEntryPlaceholder();
      return;
    }
    state.selectedId = id;
    elements.entryPlaceholder.hidden = true;
    elements.entryForm.hidden = false;
    setText(elements.ticketTitle, entry.title);
    setText(elements.ticketStamp, 'OPEN');
    fillEntryForm(entry);
    renderEntryList();
  }

  function startNewEntry() {
    state.selectedId = null;
    elements.entryPlaceholder.hidden = true;
    elements.entryForm.hidden = false;
    setText(elements.ticketTitle, '新账号工单');
    setText(elements.ticketStamp, 'NEW');
    fillEntryForm(null);
    renderEntryList();
    elements.entryTitle.focus();
  }

  async function persistData(nextData) {
    if (!state.key || state.busy) throw new Core.VaultError('LOCKED', '保险箱当前未解锁');
    const sessionKey = state.key;
    state.busy = true;
    setSaveStatus('正在重新加密…', false);
    try {
      const envelope = await Core.sealVault(sessionKey, nextData, state.envelope.kdf);
      storageWrite(STORAGE_KEY, JSON.stringify(envelope));
      if (state.key === sessionKey) {
        state.data = nextData;
        state.envelope = envelope;
        setSaveStatus('密文已保存', true);
      }
      return envelope;
    } catch (error) {
      setSaveStatus('保存失败', false);
      throw error;
    } finally {
      state.busy = false;
    }
  }

  async function handleEntrySave(event) {
    event.preventDefault();
    if (!state.data || state.busy) return;
    setText(elements.entryError, '');
    const existing = state.data.entries.find((entry) => entry.id === elements.entryId.value);
    const now = new Date().toISOString();
    let normalized;
    try {
      normalized = Core.normalizeEntry({
        title: elements.entryTitle.value,
        username: elements.entryUsername.value,
        password: elements.entryPassword.value,
        url: elements.entryUrl.value,
        notes: elements.entryNotes.value,
      }, {
        id: existing ? existing.id : Core.createEntryId(),
        createdAt: existing ? existing.createdAt : now,
        now,
      });
    } catch (error) {
      setText(elements.entryError, error.message || '账号记录格式不正确');
      return;
    }

    const entries = existing
      ? state.data.entries.map((entry) => (entry.id === existing.id ? normalized : entry))
      : [...state.data.entries, normalized];
    const nextData = { ...state.data, entries, updatedAt: now };
    elements.saveEntryButton.disabled = true;
    try {
      await persistData(nextData);
      state.selectedId = normalized.id;
      renderVault();
      showEntry(normalized.id);
      showToast(existing ? '账号记录已更新并加密' : '新账号已保存并加密');
    } catch (error) {
      setText(elements.entryError, error.message || '保存账号记录失败');
    } finally {
      elements.saveEntryButton.disabled = false;
    }
  }

  function askConfirmation({ title, message, confirmText = '确认' }) {
    setText(elements.confirmTitle, title);
    setText(elements.confirmMessage, message);
    setText(elements.confirmActionButton, confirmText);
    elements.confirmDialog.returnValue = 'cancel';
    elements.confirmDialog.showModal();
    return new Promise((resolve) => {
      elements.confirmDialog.addEventListener('close', () => {
        resolve(elements.confirmDialog.returnValue === 'confirm');
      }, { once: true });
    });
  }

  async function deleteSelectedEntry() {
    const entry = state.data && state.data.entries.find((item) => item.id === state.selectedId);
    if (!entry || state.busy) return;
    const confirmed = await askConfirmation({
      title: `删除“${entry.title}”？`,
      message: '删除后会立即重写本机密文。除非另有备份，否则这条记录无法恢复。',
      confirmText: '删除记录',
    });
    if (!confirmed || !state.data) return;
    const now = new Date().toISOString();
    const nextData = {
      ...state.data,
      entries: state.data.entries.filter((item) => item.id !== entry.id),
      updatedAt: now,
    };
    elements.deleteEntryButton.disabled = true;
    try {
      await persistData(nextData);
      state.selectedId = null;
      renderVault();
      showEntryPlaceholder();
      showToast('账号记录已删除，密文已更新');
    } catch (error) {
      setText(elements.entryError, error.message || '删除账号记录失败');
    } finally {
      elements.deleteEntryButton.disabled = false;
    }
  }

  async function copySecret(value, label) {
    if (!value) {
      showToast(`${label}为空，没有可复制内容`, 'error');
      return;
    }
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      showToast(`${label}已复制，请留意系统剪贴板历史`);
    } catch {
      showToast('浏览器拒绝访问剪贴板，请检查站点权限', 'error');
    }
  }

  function generatorSettings() {
    return {
      length: Number(elements.generatorLength.value),
      lowercase: elements.useLowercase.checked,
      uppercase: elements.useUppercase.checked,
      digits: elements.useDigits.checked,
      symbols: elements.useSymbols.checked,
      excludeAmbiguous: elements.excludeAmbiguous.checked,
    };
  }

  function generatePassword() {
    setText(elements.generatorLengthOutput, elements.generatorLength.value);
    try {
      elements.generatedPassword.value = Core.generatePassword(generatorSettings());
    } catch (error) {
      showToast(error.message || '无法生成密码', 'error');
    }
  }

  function useGeneratedPassword() {
    if (!state.data) return;
    if (elements.entryForm.hidden) startNewEntry();
    elements.entryPassword.value = elements.generatedPassword.value;
    updateStrength(
      elements.entryPassword.value,
      elements.entryStrengthBar,
      elements.entryStrengthText,
      '尚未填写密码',
    );
    elements.entryPassword.focus();
    showToast('已填入当前工单，保存后才会加密写入');
  }

  function exportEnvelope() {
    if (!state.envelope) {
      showToast('没有可导出的有效保险箱', 'error');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`${JSON.stringify(state.envelope, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lockbox-53-backup-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('加密备份已导出，请妥善保存主密码');
  }

  function openImportDialog() {
    if (!state.cryptoReady || !state.storageReady) {
      showToast('当前环境无法安全导入保险箱', 'error');
      return;
    }
    elements.importForm.reset();
    setText(elements.importError, '');
    elements.importDialog.showModal();
  }

  async function handleImport(event) {
    event.preventDefault();
    if (state.busy) return;
    setText(elements.importError, '');
    const file = elements.importFile.files[0];
    if (!file) {
      setText(elements.importError, '请选择一个 JSON 备份文件');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setText(elements.importError, '备份文件超过允许的容量上限');
      return;
    }

    setFormBusy(elements.importForm, true);
    try {
      const candidate = Core.validateVaultEnvelope(JSON.parse(await file.text()));
      const unlocked = await Core.unlockVault(elements.importMaster.value, candidate);
      elements.importMaster.value = '';
      elements.importDialog.close();

      const replacing = Boolean(state.envelope || state.storageCorrupt);
      if (replacing) {
        const confirmed = await askConfirmation({
          title: '替换本机保险箱？',
          message: `备份已验证，可解锁 ${unlocked.data.entries.length} 条记录。继续会替换当前本机密文。`,
          confirmText: '替换并解锁',
        });
        if (!confirmed) return;
      }

      storageWrite(STORAGE_KEY, JSON.stringify(candidate));
      clearSession();
      state.envelope = candidate;
      state.key = unlocked.key;
      state.data = unlocked.data;
      state.storageCorrupt = false;
      showUnlocked();
      showToast('加密备份已验证、导入并解锁');
    } catch (error) {
      if (!elements.importDialog.open) elements.importDialog.showModal();
      setText(elements.importError, error.message || '备份无法读取或解锁');
    } finally {
      setFormBusy(elements.importForm, false);
      setCompatibleState();
    }
  }

  function openResetDialog() {
    elements.resetForm.reset();
    setText(elements.resetError, '');
    elements.resetDialog.showModal();
    window.setTimeout(() => elements.resetConfirmInput.focus(), 30);
  }

  function handleReset(event) {
    event.preventDefault();
    if (elements.resetConfirmInput.value.trim() !== '删除') {
      setText(elements.resetError, '请输入“删除”两个字');
      return;
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      setText(elements.resetError, '浏览器拒绝删除本机存储');
      return;
    }
    clearSession();
    state.envelope = null;
    state.storageCorrupt = false;
    elements.resetDialog.close();
    renderAuth();
    showToast('本机保险箱已永久删除');
  }

  function closeOpenDialogs() {
    for (const dialog of [elements.confirmDialog, elements.importDialog, elements.resetDialog]) {
      if (dialog.open) dialog.close();
    }
  }

  function recordActivity() {
    if (!state.data) return;
    const now = Date.now();
    if (now - state.activityThrottleAt < 1000) return;
    state.activityThrottleAt = now;
    state.lastActivity = now;
  }

  function updateLockCountdown() {
    if (!state.data) return;
    const deadline = state.lastActivity + state.autoLockMinutes * 60000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lockVault('已因无操作自动锁定');
      return;
    }
    const seconds = Math.ceil(remaining / 1000);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    setText(elements.lockCountdown, `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`);
  }

  function startAutoLockTimer() {
    if (state.autoLockTimer) return;
    state.autoLockTimer = window.setInterval(updateLockCountdown, 1000);
    updateLockCountdown();
  }

  function updateAutoLockSetting() {
    const minutes = Number(elements.autoLockSelect.value);
    if (!AUTO_LOCK_OPTIONS.has(minutes)) return;
    state.autoLockMinutes = minutes;
    state.lastActivity = Date.now();
    try {
      storageWrite(AUTO_LOCK_KEY, String(minutes));
    } catch (error) {
      showToast(error.message, 'error');
    }
    updateLockCountdown();
  }

  function bindEvents() {
    configureSecretToggle(elements.createMasterToggle, elements.createMaster);
    configureSecretToggle(elements.unlockMasterToggle, elements.unlockMaster);
    configureSecretToggle(elements.entryPasswordToggle, elements.entryPassword);
    configureSecretToggle(elements.generatedPasswordToggle, elements.generatedPassword);

    elements.createVaultForm.addEventListener('submit', handleCreate);
    elements.unlockVaultForm.addEventListener('submit', handleUnlock);
    elements.createMaster.addEventListener('input', () => updateStrength(
      elements.createMaster.value,
      elements.createStrengthBar,
      elements.createStrengthText,
      '至少 12 个字符，推荐使用长口令',
    ));
    elements.lockButton.addEventListener('click', () => lockVault());
    elements.newEntryButton.addEventListener('click', startNewEntry);
    elements.searchInput.addEventListener('input', renderEntryList);
    elements.clearSearchButton.addEventListener('click', () => {
      elements.searchInput.value = '';
      renderEntryList();
      elements.searchInput.focus();
    });
    elements.entryForm.addEventListener('submit', handleEntrySave);
    elements.cancelEntryButton.addEventListener('click', () => {
      if (state.selectedId) showEntry(state.selectedId);
      else showEntryPlaceholder();
    });
    elements.deleteEntryButton.addEventListener('click', deleteSelectedEntry);
    elements.entryPassword.addEventListener('input', () => updateStrength(
      elements.entryPassword.value,
      elements.entryStrengthBar,
      elements.entryStrengthText,
      '尚未填写密码',
    ));
    elements.entryUrl.addEventListener('input', () => setOpenLink(elements.entryUrl.value));
    elements.copyUsernameButton.addEventListener('click', () => copySecret(elements.entryUsername.value, '用户名'));
    elements.copyPasswordButton.addEventListener('click', () => copySecret(elements.entryPassword.value, '密码'));

    elements.generatorLength.addEventListener('input', () => {
      setText(elements.generatorLengthOutput, elements.generatorLength.value);
    });
    elements.generatePasswordButton.addEventListener('click', generatePassword);
    elements.useGeneratedButton.addEventListener('click', useGeneratedPassword);
    elements.copyGeneratedButton.addEventListener('click', () => copySecret(elements.generatedPassword.value, '生成的密码'));
    elements.autoLockSelect.addEventListener('change', updateAutoLockSetting);
    elements.exportButton.addEventListener('click', exportEnvelope);
    elements.exportLockedButton.addEventListener('click', exportEnvelope);
    for (const button of document.querySelectorAll('.open-import')) button.addEventListener('click', openImportDialog);
    for (const button of document.querySelectorAll('.open-reset')) button.addEventListener('click', openResetDialog);

    elements.importForm.addEventListener('submit', handleImport);
    elements.cancelImportButton.addEventListener('click', () => elements.importDialog.close());
    elements.resetForm.addEventListener('submit', handleReset);
    elements.cancelResetButton.addEventListener('click', () => elements.resetDialog.close());

    for (const eventName of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) {
      document.addEventListener(eventName, recordActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateLockCountdown();
    });
    document.addEventListener('keydown', (event) => {
      if (state.data && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        startNewEntry();
      }
    });
  }

  function initialize() {
    if (!Core) throw new Error('VaultCore failed to load');
    loadPreferences();
    loadEnvelope();
    bindEvents();
    setCompatibleState();
    renderAuth();
    updateStrength('', elements.createStrengthBar, elements.createStrengthText, '至少 12 个字符，推荐使用长口令');
  }

  initialize();
}());

