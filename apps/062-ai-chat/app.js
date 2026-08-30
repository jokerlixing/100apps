(function startWire62() {
  'use strict';

  const Core = window.ChatCore;
  if (!Core) throw new Error('WIRE/62 core is unavailable.');

  const STORAGE_KEY = 'wire62.state.v1';
  const MAX_CONTEXT_CHARS = 48000;
  const DEFAULT_SETTINGS = Core.sanitizeSettings({
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    systemPrompt: '请用清晰、可靠的中文回答。信息不足时先说明假设，不要编造事实。',
    temperature: 0.7
  });

  const elements = {
    body: document.body,
    topStatus: document.querySelector('#topStatus'),
    topModel: document.querySelector('#topModel'),
    channelNumber: document.querySelector('#channelNumber'),
    conversationTitle: document.querySelector('#conversationTitle'),
    conversationList: document.querySelector('#conversationList'),
    newConversation: document.querySelector('#newConversation'),
    manageConversation: document.querySelector('#manageConversation'),
    messageViewport: document.querySelector('#messageViewport'),
    emptyState: document.querySelector('#emptyState'),
    messageList: document.querySelector('#messageList'),
    messageTemplate: document.querySelector('#messageTemplate'),
    messageError: document.querySelector('#messageError'),
    messageErrorText: document.querySelector('#messageErrorText'),
    dismissError: document.querySelector('#dismissError'),
    composerForm: document.querySelector('#composerForm'),
    promptInput: document.querySelector('#promptInput'),
    characterCount: document.querySelector('#characterCount'),
    sendButton: document.querySelector('#sendButton'),
    stopButton: document.querySelector('#stopButton'),
    settingsForm: document.querySelector('#settingsForm'),
    endpointInput: document.querySelector('#endpointInput'),
    modelInput: document.querySelector('#modelInput'),
    apiKeyInput: document.querySelector('#apiKeyInput'),
    toggleKey: document.querySelector('#toggleKey'),
    keyState: document.querySelector('#keyState'),
    temperatureInput: document.querySelector('#temperatureInput'),
    temperatureOutput: document.querySelector('#temperatureOutput'),
    systemPromptInput: document.querySelector('#systemPromptInput'),
    settingsError: document.querySelector('#settingsError'),
    connectionMeter: document.querySelector('#connectionMeter'),
    connectionLabel: document.querySelector('#connectionLabel'),
    sessionPanel: document.querySelector('#sessionPanel'),
    connectionPanel: document.querySelector('#connectionPanel'),
    openSessions: document.querySelector('#openSessions'),
    openSettings: document.querySelector('#openSettings'),
    drawerBackdrop: document.querySelector('#drawerBackdrop'),
    manageDialog: document.querySelector('#manageDialog'),
    manageForm: document.querySelector('#manageForm'),
    renameInput: document.querySelector('#renameInput'),
    deleteConversation: document.querySelector('#deleteConversation'),
    toast: document.querySelector('#toast'),
    politeStatus: document.querySelector('#politeStatus'),
    urgentStatus: document.querySelector('#urgentStatus')
  };

  let apiKey = '';
  let activeAbort = null;
  let activeStreamMessageId = '';
  let toastTimer = 0;
  let saveFailed = false;
  let state = loadState();

  function makeId(prefix) {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
    return `${prefix}_${suffix}`;
  }

  function loadState() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (_error) {
      stored = null;
    }

    const storedSettings = stored && stored.settings
      ? Core.sanitizeSettings(stored.settings)
      : DEFAULT_SETTINGS;
    const conversations = stored && Array.isArray(stored.conversations)
      ? stored.conversations.map(Core.sanitizeConversation).filter(Boolean)
      : [];
    if (!conversations.length) conversations.push(Core.createConversation());

    const requestedActiveId = stored && typeof stored.activeId === 'string' ? stored.activeId : '';
    const activeId = conversations.some((conversation) => conversation.id === requestedActiveId)
      ? requestedActiveId
      : conversations[0].id;

    return {
      settings: storedSettings,
      conversations,
      activeId
    };
  }

  function serializableState() {
    return {
      version: 1,
      settings: {
        endpoint: state.settings.endpoint,
        model: state.settings.model,
        systemPrompt: state.settings.systemPrompt,
        temperature: state.settings.temperature
      },
      conversations: state.conversations,
      activeId: state.activeId
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState()));
      saveFailed = false;
    } catch (_error) {
      if (!saveFailed) showToast('浏览器存储已满，对话暂时无法保存。');
      saveFailed = true;
    }
  }

  function currentConversation() {
    let conversation = state.conversations.find((item) => item.id === state.activeId);
    if (!conversation) {
      conversation = Core.createConversation();
      state.conversations.unshift(conversation);
      state.activeId = conversation.id;
    }
    return conversation;
  }

  function createMessage(role, content, status) {
    return {
      id: makeId('msg'),
      role,
      content,
      status: status || 'complete',
      createdAt: new Date().toISOString()
    };
  }

  function touchConversation(conversation) {
    conversation.updatedAt = new Date().toISOString();
    const firstUser = conversation.messages.find((message) => message.role === 'user');
    if (firstUser && conversation.title === '新对话') conversation.title = Core.deriveTitle(firstUser.content);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function sessionStamp(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '未知时间';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    if (sameDay) return `今天 ${formatTime(value)}`;
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
  }

  function announce(message, urgent) {
    const target = urgent ? elements.urgentStatus : elements.politeStatus;
    target.textContent = '';
    window.setTimeout(() => { target.textContent = message; }, 20);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2200);
  }

  function showMessageError(message) {
    elements.messageErrorText.textContent = message;
    elements.messageError.hidden = false;
    announce(message, true);
  }

  function hideMessageError() {
    elements.messageError.hidden = true;
    elements.messageErrorText.textContent = '';
  }

  function renderConnection() {
    const mode = activeAbort ? 'streaming' : (apiKey ? 'ready' : 'offline');
    const labels = {
      offline: '等待临时密钥',
      ready: '线路已接通',
      streaming: '接收报文中'
    };
    elements.body.dataset.streaming = String(mode === 'streaming');
    elements.topStatus.dataset.state = mode;
    elements.topStatus.lastChild.textContent = labels[mode];
    elements.connectionMeter.dataset.state = mode;
    elements.connectionLabel.textContent = labels[mode];
    elements.topModel.textContent = state.settings.model || '未选择模型';
    elements.keyState.textContent = apiKey
      ? '密钥已载入页面内存；刷新后自动清除'
      : '尚未载入；不会保存到浏览器存储';
    elements.stopButton.hidden = mode !== 'streaming';
    elements.sendButton.hidden = mode === 'streaming';
    elements.sendButton.disabled = mode === 'streaming';
  }

  function renderSessions() {
    elements.conversationList.replaceChildren();
    const sorted = [...state.conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    let previousGroup = '';

    sorted.forEach((conversation) => {
      const day = new Date(conversation.updatedAt).toDateString();
      if (day !== previousGroup) {
        const label = document.createElement('p');
        label.className = 'session-date';
        label.textContent = day === new Date().toDateString() ? 'TODAY / 今日' : 'EARLIER / 更早';
        elements.conversationList.append(label);
        previousGroup = day;
      }

      const item = document.createElement('div');
      item.className = `session-item${conversation.id === state.activeId ? ' active' : ''}`;
      item.dataset.id = conversation.id;

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'session-select';
      select.dataset.sessionAction = 'select';
      select.setAttribute('aria-current', conversation.id === state.activeId ? 'page' : 'false');
      const title = document.createElement('strong');
      title.textContent = conversation.title;
      const meta = document.createElement('small');
      meta.textContent = `${sessionStamp(conversation.updatedAt)} · ${conversation.messages.length} 条`;
      select.append(title, meta);

      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'session-manage';
      manage.dataset.sessionAction = 'manage';
      manage.setAttribute('aria-label', `管理会话：${conversation.title}`);
      manage.textContent = '•••';

      item.append(select, manage);
      elements.conversationList.append(item);
    });
  }

  function statusLabel(status) {
    return {
      streaming: '接收中',
      stopped: '已停止',
      error: '中断',
      complete: '已送达'
    }[status] || '';
  }

  function renderMessages(options) {
    const conversation = currentConversation();
    const messages = conversation.messages;
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    elements.emptyState.hidden = messages.length > 0;
    elements.messageList.replaceChildren();

    messages.forEach((message) => {
      const fragment = elements.messageTemplate.content.cloneNode(true);
      const article = fragment.querySelector('.message');
      article.dataset.messageId = message.id;
      article.classList.add(message.role, message.status || 'complete');
      if (lastAssistant && lastAssistant.id === message.id) article.classList.add('last-assistant');
      fragment.querySelector('.message-role').textContent = message.role === 'user' ? 'YOU / 发报' : 'WIRE / 回报';
      const time = fragment.querySelector('time');
      time.dateTime = message.createdAt;
      time.textContent = formatTime(message.createdAt);
      fragment.querySelector('.message-state').textContent = statusLabel(message.status);
      fragment.querySelector('.message-content').textContent = message.content || (message.status === 'streaming' ? '等待首个数据块…' : '');
      const copy = fragment.querySelector('[data-message-action="copy"]');
      copy.disabled = !message.content;
      elements.messageList.append(fragment);
    });

    if (!options || options.scroll !== false) scrollToBottom(false);
  }

  function renderHeader() {
    const conversation = currentConversation();
    const sorted = [...state.conversations].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const channelIndex = Math.max(0, sorted.findIndex((item) => item.id === conversation.id));
    elements.channelNumber.textContent = String(channelIndex + 1).padStart(2, '0');
    elements.conversationTitle.textContent = conversation.title;
  }

  function renderAll(options) {
    renderHeader();
    renderSessions();
    renderMessages(options);
    renderConnection();
  }

  function fillSettings() {
    elements.endpointInput.value = state.settings.endpoint;
    elements.modelInput.value = state.settings.model;
    elements.systemPromptInput.value = state.settings.systemPrompt;
    elements.temperatureInput.value = String(state.settings.temperature);
    elements.temperatureOutput.value = String(state.settings.temperature);
    elements.temperatureOutput.textContent = String(state.settings.temperature);
  }

  function isNearBottom() {
    return elements.messageViewport.scrollHeight - elements.messageViewport.scrollTop - elements.messageViewport.clientHeight < 130;
  }

  function scrollToBottom(smooth) {
    elements.messageViewport.scrollTo({
      top: elements.messageViewport.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  function updateStreamingMessage(message, shouldFollow) {
    const article = elements.messageList.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (!article) {
      renderMessages();
      return;
    }
    article.querySelector('.message-content').textContent = message.content || '等待首个数据块…';
    if (shouldFollow) scrollToBottom(false);
  }

  function autoResizeComposer() {
    elements.promptInput.style.height = 'auto';
    elements.promptInput.style.height = `${Math.min(elements.promptInput.scrollHeight, 150)}px`;
    elements.characterCount.textContent = `${elements.promptInput.value.length} / 12000`;
  }

  function ensureConnection() {
    elements.settingsError.textContent = '';
    if (!state.settings.endpoint || !state.settings.model || !apiKey) {
      const missing = !state.settings.endpoint
        ? '请填写有效的接口地址。'
        : (!state.settings.model ? '请填写模型名称。' : '请先载入临时密钥。');
      elements.settingsError.textContent = missing;
      openDrawer(elements.connectionPanel);
      const target = !state.settings.endpoint
        ? elements.endpointInput
        : (!state.settings.model ? elements.modelInput : elements.apiKeyInput);
      window.setTimeout(() => target.focus(), 80);
      announce(missing, true);
      return false;
    }
    return true;
  }

  async function providerError(response) {
    let detail = '';
    try {
      const text = (await response.text()).slice(0, 1200);
      const parsed = JSON.parse(text);
      detail = parsed && parsed.error && typeof parsed.error.message === 'string'
        ? parsed.error.message
        : text;
    } catch (_error) {
      detail = '';
    }

    const known = {
      400: '请求参数不被接口接受，请检查模型名称与兼容性。',
      401: '鉴权失败，请换用有效的临时密钥。',
      403: '当前密钥无权访问该模型或接口。',
      404: '接口路径或模型不存在，请检查连接设置。',
      408: '接口响应超时，请稍后重试。',
      429: '请求过于频繁或额度不足，请稍后重试。'
    };
    const summary = known[response.status] || (response.status >= 500
      ? '模型服务暂时不可用，请稍后重试。'
      : `接口返回 HTTP ${response.status}。`);
    return detail ? `${summary} 服务端信息：${detail}` : summary;
  }

  function browserNetworkError(error) {
    if (error && error.name === 'AbortError') return '生成已停止。';
    if (error instanceof Core.ChatCoreError) return error.message;
    if (error instanceof TypeError) {
      return '浏览器无法连接接口。请检查地址、网络和服务端 CORS 设置。';
    }
    if (error && typeof error.message === 'string' && error.message.trim()) return error.message;
    return '浏览器无法连接接口。请检查地址、网络和服务端 CORS 设置。';
  }

  async function generateAssistant() {
    if (activeAbort || !ensureConnection()) return;
    const conversation = currentConversation();
    if (!conversation.messages.some((message) => message.role === 'user')) return;

    hideMessageError();
    const assistant = createMessage('assistant', '', 'streaming');
    conversation.messages.push(assistant);
    activeStreamMessageId = assistant.id;
    touchConversation(conversation);
    saveState();
    renderAll();

    const controller = new AbortController();
    activeAbort = controller;
    renderConnection();
    const secretForRequest = apiKey;
    let malformedEvents = 0;
    let providerDone = false;

    try {
      const requestMessages = Core.buildRequestMessages(
        conversation.messages,
        state.settings.systemPrompt,
        MAX_CONTEXT_CHARS
      );
      const body = Core.buildRequestBody(state.settings, requestMessages);
      const response = await fetch(Core.normalizeEndpoint(state.settings.endpoint), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretForRequest}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store'
      });

      if (!response.ok) throw new Error(await providerError(response));
      if (!response.body || typeof response.body.getReader !== 'function') {
        throw new Error('接口没有返回可读取的流。');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = Core.createSSEParser({
        onEvent(payload) {
          if (payload && payload.error) {
            const message = typeof payload.error.message === 'string' ? payload.error.message : '模型服务报告错误。';
            throw new Error(`模型服务报告错误：${message}`);
          }
          const delta = Core.extractDeltaText(payload);
          if (!delta) return;
          const follow = isNearBottom();
          assistant.content += delta;
          updateStreamingMessage(assistant, follow);
        },
        onDone() { providerDone = true; },
        onError() { malformedEvents += 1; }
      });

      while (true) {
        const result = await reader.read();
        if (result.done) break;
        parser.push(decoder.decode(result.value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.finish();

      if (!assistant.content.trim()) {
        const suffix = malformedEvents ? `（忽略了 ${malformedEvents} 个无法解析的数据块）` : '';
        throw new Error(`接口未返回可显示文本${suffix}。`);
      }

      assistant.status = 'complete';
      touchConversation(conversation);
      announce(providerDone ? '回答已完整送达。' : '数据流已结束。', false);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        if (assistant.content.trim()) {
          assistant.status = 'stopped';
          announce('生成已停止，已保留收到的内容。', false);
        } else {
          conversation.messages = conversation.messages.filter((message) => message.id !== assistant.id);
          announce('生成已停止。', false);
        }
      } else {
        const message = browserNetworkError(error);
        if (assistant.content.trim()) assistant.status = 'error';
        else conversation.messages = conversation.messages.filter((item) => item.id !== assistant.id);
        showMessageError(message);
      }
    } finally {
      activeAbort = null;
      activeStreamMessageId = '';
      touchConversation(conversation);
      saveState();
      renderAll({ scroll: false });
      scrollToBottom(false);
      elements.promptInput.focus();
    }
  }

  async function sendPrompt(text) {
    if (activeAbort || !ensureConnection()) return;
    const content = String(text == null ? elements.promptInput.value : text).trim();
    if (!content) {
      elements.promptInput.focus();
      return;
    }

    const conversation = currentConversation();
    conversation.messages.push(createMessage('user', content, 'complete'));
    touchConversation(conversation);
    elements.promptInput.value = '';
    autoResizeComposer();
    saveState();
    renderAll();
    await generateAssistant();
  }

  async function retryMessage(messageId) {
    if (activeAbort || !ensureConnection()) return;
    const conversation = currentConversation();
    const index = conversation.messages.findIndex((message) => message.id === messageId && message.role === 'assistant');
    if (index < 0) return;
    conversation.messages.splice(index);
    touchConversation(conversation);
    saveState();
    renderAll();
    await generateAssistant();
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    showToast('已复制到剪贴板');
  }

  function newConversation() {
    if (activeAbort) {
      showToast('请先停止当前生成');
      return;
    }
    const conversation = Core.createConversation();
    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    hideMessageError();
    saveState();
    renderAll();
    closeDrawers();
    elements.promptInput.focus();
    announce('已建立新会话。', false);
  }

  function selectConversation(id) {
    if (activeAbort) {
      showToast('请先停止当前生成');
      return;
    }
    if (!state.conversations.some((conversation) => conversation.id === id)) return;
    state.activeId = id;
    hideMessageError();
    saveState();
    renderAll();
    closeDrawers();
  }

  function openManageDialog(id) {
    if (id && state.conversations.some((conversation) => conversation.id === id)) {
      state.activeId = id;
      saveState();
      renderAll({ scroll: false });
    }
    const conversation = currentConversation();
    elements.renameInput.value = conversation.title;
    elements.manageDialog.showModal();
    window.setTimeout(() => elements.renameInput.select(), 30);
  }

  function saveConversationName() {
    const title = elements.renameInput.value.trim().slice(0, 60);
    if (!title) return;
    const conversation = currentConversation();
    conversation.title = title;
    touchConversation(conversation);
    saveState();
    renderHeader();
    renderSessions();
    showToast('会话名称已保存');
  }

  function removeCurrentConversation() {
    if (activeAbort) return;
    const removingId = state.activeId;
    state.conversations = state.conversations.filter((conversation) => conversation.id !== removingId);
    if (!state.conversations.length) state.conversations.push(Core.createConversation());
    state.activeId = state.conversations[0].id;
    elements.manageDialog.close();
    hideMessageError();
    saveState();
    renderAll();
    showToast('会话已从本机删除');
    announce('会话已删除。', false);
  }

  function openDrawer(panel) {
    if (window.matchMedia('(min-width: 901px)').matches) return;
    const other = panel === elements.sessionPanel ? elements.connectionPanel : elements.sessionPanel;
    panel.classList.add('open');
    other.classList.remove('open');
    elements.drawerBackdrop.hidden = false;
    elements.openSessions.setAttribute('aria-expanded', String(panel === elements.sessionPanel));
    elements.openSettings.setAttribute('aria-expanded', String(panel === elements.connectionPanel));
  }

  function closeDrawers() {
    elements.sessionPanel.classList.remove('open');
    elements.connectionPanel.classList.remove('open');
    elements.drawerBackdrop.hidden = true;
    elements.openSessions.setAttribute('aria-expanded', 'false');
    elements.openSettings.setAttribute('aria-expanded', 'false');
  }

  elements.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    elements.settingsError.textContent = '';
    try {
      const endpoint = Core.normalizeEndpoint(elements.endpointInput.value);
      const model = elements.modelInput.value.trim();
      if (!model) throw new Core.ChatCoreError('请输入模型名称。', 'MODEL_REQUIRED');
      const candidateKey = elements.apiKeyInput.value.trim();
      if (candidateKey) apiKey = candidateKey;
      if (!apiKey) throw new Core.ChatCoreError('请输入临时密钥。', 'KEY_REQUIRED');

      state.settings = Core.sanitizeSettings({
        endpoint,
        model,
        systemPrompt: elements.systemPromptInput.value,
        temperature: elements.temperatureInput.value
      });
      elements.endpointInput.value = state.settings.endpoint;
      elements.apiKeyInput.value = '';
      elements.apiKeyInput.type = 'password';
      elements.toggleKey.textContent = '显示';
      elements.toggleKey.setAttribute('aria-pressed', 'false');
      elements.toggleKey.setAttribute('aria-label', '显示密钥');
      saveState();
      renderConnection();
      closeDrawers();
      showToast('线路配置已保存，临时密钥只留在页面内存');
      announce('线路已接通。', false);
    } catch (error) {
      elements.settingsError.textContent = error instanceof Error ? error.message : '连接设置无效。';
    }
  });

  elements.composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendPrompt();
  });

  elements.promptInput.addEventListener('input', autoResizeComposer);
  elements.promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      elements.composerForm.requestSubmit();
    }
  });

  elements.temperatureInput.addEventListener('input', () => {
    elements.temperatureOutput.value = elements.temperatureInput.value;
    elements.temperatureOutput.textContent = elements.temperatureInput.value;
  });

  elements.toggleKey.addEventListener('click', () => {
    const showing = elements.apiKeyInput.type === 'text';
    elements.apiKeyInput.type = showing ? 'password' : 'text';
    elements.toggleKey.textContent = showing ? '显示' : '隐藏';
    elements.toggleKey.setAttribute('aria-pressed', String(!showing));
    elements.toggleKey.setAttribute('aria-label', showing ? '显示密钥' : '隐藏密钥');
  });

  elements.stopButton.addEventListener('click', () => {
    if (activeAbort) activeAbort.abort();
  });

  elements.newConversation.addEventListener('click', newConversation);
  elements.manageConversation.addEventListener('click', () => openManageDialog());
  elements.dismissError.addEventListener('click', hideMessageError);
  elements.openSessions.addEventListener('click', () => openDrawer(elements.sessionPanel));
  elements.openSettings.addEventListener('click', () => openDrawer(elements.connectionPanel));
  elements.drawerBackdrop.addEventListener('click', closeDrawers);
  document.querySelectorAll('[data-close-drawer]').forEach((button) => button.addEventListener('click', closeDrawers));

  elements.conversationList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-session-action]');
    const item = event.target.closest('[data-id]');
    if (!button || !item) return;
    if (button.dataset.sessionAction === 'select') selectConversation(item.dataset.id);
    if (button.dataset.sessionAction === 'manage') openManageDialog(item.dataset.id);
  });

  elements.messageList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-message-action]');
    const article = event.target.closest('[data-message-id]');
    if (!button || !article) return;
    const message = currentConversation().messages.find((item) => item.id === article.dataset.messageId);
    if (!message) return;
    if (button.dataset.messageAction === 'copy') void copyText(message.content);
    if (button.dataset.messageAction === 'retry') void retryMessage(message.id);
  });

  document.querySelectorAll('[data-starter]').forEach((button) => {
    button.addEventListener('click', () => {
      elements.promptInput.value = button.dataset.starter;
      autoResizeComposer();
      elements.promptInput.focus();
      elements.promptInput.setSelectionRange(elements.promptInput.value.length, elements.promptInput.value.length);
    });
  });

  elements.manageForm.addEventListener('submit', (event) => {
    if (event.submitter && event.submitter.value === 'cancel') return;
    event.preventDefault();
    if (!elements.renameInput.value.trim()) {
      elements.renameInput.focus();
      return;
    }
    saveConversationName();
    elements.manageDialog.close();
  });

  elements.deleteConversation.addEventListener('click', removeCurrentConversation);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.manageDialog.open) closeDrawers();
  });
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 901px)').matches) closeDrawers();
  });
  window.addEventListener('beforeunload', () => {
    if (activeAbort) activeAbort.abort();
    apiKey = '';
  });

  Object.defineProperty(window, '__WIRE62_TEST__', {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      snapshot() {
        return {
          hasKey: Boolean(apiKey),
          streaming: Boolean(activeAbort),
          activeStreamMessageId,
          state: JSON.parse(JSON.stringify(serializableState()))
        };
      },
      storageKey: STORAGE_KEY
    })
  });

  fillSettings();
  autoResizeComposer();
  renderAll({ scroll: false });
})();
