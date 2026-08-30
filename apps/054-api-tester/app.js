(function startPort54() {
  'use strict';

  const core = window.ApiCore;
  if (!core) throw new Error('ApiCore failed to load');

  const STORAGE_KEY = 'port54.history.v1';
  const MASK = '••••••••';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const textBytes = (value) => new TextEncoder().encode(String(value || '')).byteLength;

  const elements = {
    form: $('#requestForm'),
    method: $('#requestMethod'),
    url: $('#requestUrl'),
    timeout: $('#timeoutSeconds'),
    send: $('#sendButton'),
    cancel: $('#cancelButton'),
    finalUrl: $('#finalUrl'),
    urlMessage: $('#urlMessage'),
    requestBadge: $('#requestBadge'),
    queryRows: $('#queryRows'),
    headerRows: $('#headerRows'),
    queryCount: $('#queryCount'),
    headerCount: $('#headerCount'),
    bodyMode: $('#bodyMode'),
    body: $('#requestBody'),
    bodyNotice: $('#bodyMethodNotice'),
    bodyStatus: $('#bodyStatus'),
    bodyBytes: $('#bodyBytes'),
    formatBody: $('#formatBody'),
    pulseRail: $('#pulseRail'),
    responseEmpty: $('#responseEmpty'),
    responseResult: $('#responseResult'),
    responseStatus: $('#responseStatus'),
    responseStatusText: $('#responseStatusText'),
    responseTime: $('#responseTime'),
    responseSize: $('#responseSize'),
    responseKind: $('#responseKind'),
    responseHeaderCount: $('#responseHeaderCount'),
    responseContentType: $('#responseContentType'),
    responseLines: $('#responseLines'),
    responseBody: $('#responseBody'),
    responseHeaders: $('#responseHeaders'),
    requestSnapshot: $('#requestSnapshot'),
    copyResponse: $('#copyResponse'),
    downloadResponse: $('#downloadResponse'),
    historyOpen: $('#historyOpen'),
    historyClose: $('#historyClose'),
    historyDrawer: $('#historyDrawer'),
    historyCount: $('#historyCount'),
    historyList: $('#historyList'),
    clearHistory: $('#clearHistory'),
    drawerScrim: $('#drawerScrim'),
    confirmDialog: $('#confirmDialog'),
    confirmCancel: $('#confirmCancel'),
    confirmClear: $('#confirmClear'),
    toast: $('#toast'),
    liveRegion: $('#liveRegion'),
  };

  let rowSequence = 0;
  let toastTimer = 0;
  let lastDrawerFocus = null;
  const state = {
    queryRows: [],
    headerRows: [createRow('Accept', 'application/json')],
    history: loadHistory(),
    bodyMode: 'none',
    responseTab: 'body',
    response: null,
    activeController: null,
    abortReason: '',
  };

  const EXAMPLES = {
    todo: {
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/todos/1',
      queryRows: [],
      headerRows: [createRow('Accept', 'application/json')],
      bodyMode: 'none',
      body: '',
      message: '已装载单条任务示例',
    },
    post: {
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      queryRows: [],
      headerRows: [createRow('Accept', 'application/json')],
      bodyMode: 'json',
      body: '{\n  "title": "PORT/54 request",\n  "body": "Inspect every byte.",\n  "userId": 54\n}',
      message: '已装载 JSON POST 示例',
    },
    repo: {
      method: 'GET',
      url: 'https://api.github.com/repos/jokerlixing/100apps',
      queryRows: [],
      headerRows: [
        createRow('Accept', 'application/vnd.github+json'),
        createRow('X-GitHub-Api-Version', '2022-11-28'),
      ],
      bodyMode: 'none',
      body: '',
      message: '已装载 GitHub 仓库示例',
    },
  };

  function createRow(key = '', value = '', enabled = true) {
    rowSequence += 1;
    return { id: `row-${Date.now()}-${rowSequence}`, key, value, enabled };
  }

  function normalizeStoredRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 30).map((row) => createRow(
      String(row && row.key || '').slice(0, 120),
      String(row && row.value || '').slice(0, 4000),
      Boolean(row && row.enabled),
    ));
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return core.trimHistory(parsed.filter((record) => (
        record && typeof record === 'object' && typeof record.method === 'string' && typeof record.url === 'string'
      )));
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    } catch {
      showToast('浏览器未能保存历史；请求结果仍可继续查看。', true);
    }
    renderHistory();
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    window.setTimeout(() => { elements.liveRegion.textContent = message; }, 20);
  }

  function renderRows(kind) {
    const rows = kind === 'query' ? state.queryRows : state.headerRows;
    const container = kind === 'query' ? elements.queryRows : elements.headerRows;
    container.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'kv-empty';
      empty.textContent = kind === 'query' ? '还没有查询参数。需要时添加一行。' : '还没有自定义请求头。';
      container.append(empty);
      updateRequestPreview();
      return;
    }

    rows.forEach((row, index) => {
      const line = document.createElement('div');
      line.className = `kv-row${row.enabled ? '' : ' disabled'}`;
      line.dataset.rowId = row.id;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'row-toggle';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = row.enabled;
      toggle.dataset.field = 'enabled';
      toggle.setAttribute('aria-label', `${row.enabled ? '停用' : '启用'}第 ${index + 1} 行`);
      toggleLabel.append(toggle);

      const key = document.createElement('input');
      key.className = 'kv-input kv-key';
      key.value = row.key;
      key.dataset.field = 'key';
      key.placeholder = kind === 'query' ? '参数名' : 'Header-Name';
      key.autocomplete = 'off';
      key.spellcheck = false;
      key.setAttribute('aria-label', `第 ${index + 1} 行${kind === 'query' ? '参数名' : '请求头名称'}`);

      const value = document.createElement('input');
      value.className = 'kv-input kv-value';
      value.value = row.value;
      value.dataset.field = 'value';
      value.placeholder = kind === 'query' ? '参数值' : '请求头值';
      value.autocomplete = 'off';
      value.spellcheck = false;
      value.setAttribute('aria-label', `第 ${index + 1} 行值`);

      const remove = document.createElement('button');
      remove.className = 'remove-row';
      remove.type = 'button';
      remove.dataset.removeRow = row.id;
      remove.setAttribute('aria-label', `移除第 ${index + 1} 行`);
      remove.textContent = '×';

      line.append(toggleLabel, key, value, remove);
      container.append(line);
    });
    updateRequestPreview();
  }

  function updateRow(kind, event) {
    const line = event.target.closest('.kv-row');
    if (!line || !event.target.dataset.field) return;
    const rows = kind === 'query' ? state.queryRows : state.headerRows;
    const row = rows.find((item) => item.id === line.dataset.rowId);
    if (!row) return;
    const field = event.target.dataset.field;
    row[field] = field === 'enabled' ? event.target.checked : event.target.value;
    line.classList.toggle('disabled', !row.enabled);
    updateRequestPreview();
  }

  function removeRow(kind, id) {
    const key = kind === 'query' ? 'queryRows' : 'headerRows';
    state[key] = state[key].filter((row) => row.id !== id);
    renderRows(kind);
    announce('已移除一行');
  }

  function addRow(kind) {
    const key = kind === 'query' ? 'queryRows' : 'headerRows';
    state[key].push(createRow());
    renderRows(kind);
    const container = kind === 'query' ? elements.queryRows : elements.headerRows;
    const latest = container.querySelector('.kv-row:last-child .kv-key');
    if (latest) latest.focus();
  }

  function updateRequestPreview() {
    const method = elements.method.value;
    const supportsBody = !['GET', 'HEAD'].includes(method);
    const enabledQueries = state.queryRows.filter((row) => row.enabled && row.key.trim()).length;
    const enabledHeaders = state.headerRows.filter((row) => row.enabled && row.key.trim()).length;
    elements.queryCount.textContent = String(enabledQueries);
    elements.headerCount.textContent = String(enabledHeaders);
    elements.requestBadge.textContent = `${method} · ${supportsBody && state.bodyMode !== 'none' ? state.bodyMode.toUpperCase() : 'NO BODY'}`;
    elements.bodyNotice.hidden = supportsBody;
    elements.body.disabled = !supportsBody || state.bodyMode === 'none';
    elements.formatBody.disabled = !supportsBody || state.bodyMode !== 'json';

    const bodyLength = textBytes(elements.body.value);
    elements.bodyBytes.textContent = core.formatBytes(bodyLength);
    if (!supportsBody) elements.bodyStatus.textContent = `${method} 不发送正文`;
    else if (state.bodyMode === 'none') elements.bodyStatus.textContent = '未设置正文';
    else elements.bodyStatus.textContent = state.bodyMode === 'json' ? 'JSON 正文' : '纯文本正文';

    try {
      const url = core.buildRequestUrl(elements.url.value, state.queryRows);
      elements.finalUrl.textContent = url;
      elements.urlMessage.textContent = '最终 URL';
      elements.urlMessage.classList.remove('error');
      elements.url.removeAttribute('aria-invalid');
    } catch (error) {
      elements.finalUrl.textContent = error.message;
      elements.urlMessage.textContent = 'URL 需修正';
      elements.urlMessage.classList.add('error');
      elements.url.setAttribute('aria-invalid', 'true');
    }
  }

  function switchTabs(group, selected) {
    const isRequest = group === 'request';
    const buttonSelector = isRequest ? '[data-request-tab]' : '[data-response-tab]';
    const panelSelector = isRequest ? '[data-request-panel]' : '[data-response-panel]';
    const dataKey = isRequest ? 'requestTab' : 'responseTab';
    const panelKey = isRequest ? 'requestPanel' : 'responsePanel';

    $$(buttonSelector).forEach((button) => {
      const active = button.dataset[dataKey] === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$(panelSelector).forEach((panel) => { panel.hidden = panel.dataset[panelKey] !== selected; });
    if (!isRequest) state.responseTab = selected;
  }

  function installTabKeyboard(strip) {
    strip.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = $$('[role="tab"]', strip);
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].click();
      tabs[next].focus();
    });
  }

  function formatRequestSnapshot(method, url, headers, bodyInfo) {
    const maskedRows = core.maskSensitiveHeaders(Object.entries(headers).map(([key, value]) => ({ key, value, enabled: true })));
    const safeHeaders = core.sanitizeHeaderRows(maskedRows);
    const lines = [`${method} ${url}`];
    Object.entries(safeHeaders).forEach(([key, value]) => lines.push(`${key}: ${value}`));
    if (bodyInfo && !Object.keys(safeHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      lines.push(`Content-Type: ${bodyInfo.contentType}`);
    }
    if (bodyInfo) lines.push('', bodyInfo.body);
    return lines.join('\n');
  }

  function renderResponse(result) {
    state.response = result;
    elements.responseEmpty.hidden = true;
    elements.responseResult.hidden = false;
    elements.responseResult.dataset.tone = result.tone;
    elements.responseStatus.textContent = String(result.status);
    elements.responseStatusText.textContent = result.statusText;
    elements.responseTime.textContent = Number.isFinite(result.elapsed) ? String(Math.round(result.elapsed)) : '—';
    elements.responseSize.textContent = core.formatBytes(result.bytes);
    elements.responseKind.textContent = result.kind.toUpperCase();
    elements.responseHeaderCount.textContent = String(result.headers.length);
    elements.responseContentType.textContent = result.contentType || '无 Content-Type';
    elements.responseLines.textContent = `${result.displayText ? result.displayText.split('\n').length : 0} 行`;
    elements.responseBody.textContent = result.displayText || '(空响应正文)';
    elements.responseHeaders.textContent = result.headers.length
      ? result.headers.map(([key, value]) => `${key}: ${value}`).join('\n')
      : '(浏览器未提供可读取的响应头)';
    elements.requestSnapshot.textContent = result.requestSnapshot;
    elements.copyResponse.disabled = false;
    elements.downloadResponse.disabled = !result.downloadable;
    switchTabs('response', 'body');
  }

  function classifyFetchError(error, timeoutSeconds) {
    if (error && error.name === 'AbortError' && state.abortReason === 'timeout') {
      return {
        status: 'TIMEOUT',
        statusText: `${timeoutSeconds} 秒超时`,
        message: `请求在 ${timeoutSeconds} 秒后超时。\n\n检查目标服务是否可访问，或提高上方超时秒数后重试。`,
      };
    }
    if (error && error.name === 'AbortError') {
      return {
        status: 'STOP',
        statusText: '已手动停止',
        message: '请求已由你停止。没有新的响应数据被保存。',
      };
    }
    if (error instanceof TypeError) {
      return {
        status: 'CORS',
        statusText: '浏览器未能读取响应',
        message: '浏览器未能读取这个响应。\n\n常见原因：目标服务未允许当前 Origin、HTTPS 页面请求了 HTTP 地址、DNS 失败或网络中断。可先检查开发者工具的 Network 面板；若是 CORS，请在目标服务配置允许来源，或通过你控制的服务端代理请求。',
      };
    }
    return {
      status: 'ERROR',
      statusText: '请求失败',
      message: `请求失败：${error && error.message ? error.message : '未知错误'}`,
    };
  }

  function buildHistoryRecord(request, result) {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      method: request.method,
      url: request.baseUrl,
      finalUrl: request.url,
      timeout: request.timeout,
      queryRows: state.queryRows.map(({ key, value, enabled }) => ({ key, value, enabled })),
      headerRows: core.maskSensitiveHeaders(state.headerRows.map(({ key, value, enabled }) => ({ key, value, enabled }))),
      bodyMode: state.bodyMode,
      body: elements.body.value.slice(0, 20000),
      status: String(result.status),
      statusText: result.statusText,
      elapsed: Math.round(result.elapsed),
    };
  }

  function addHistory(request, result) {
    state.history = core.trimHistory([buildHistoryRecord(request, result), ...state.history]);
    saveHistory();
  }

  async function sendRequest(event) {
    event.preventDefault();
    if (state.activeController) return;

    const method = elements.method.value;
    const timeout = Math.min(60, Math.max(3, Number(elements.timeout.value) || 15));
    elements.timeout.value = String(timeout);

    let url;
    let bodyInfo;
    let headers;
    try {
      url = core.buildRequestUrl(elements.url.value, state.queryRows);
      bodyInfo = core.prepareRequestBody(method, state.bodyMode, elements.body.value);
      headers = core.sanitizeHeaderRows(state.headerRows);
      if (bodyInfo && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = bodyInfo.contentType;
      }
    } catch (error) {
      showToast(error.message, true);
      announce(error.message);
      if (/URL/.test(error.message)) elements.url.focus();
      else switchTabs('request', 'body');
      return;
    }

    const request = {
      method,
      baseUrl: elements.url.value.trim(),
      url,
      timeout,
      headers,
      bodyInfo,
      snapshot: formatRequestSnapshot(method, url, headers, bodyInfo),
    };
    const controller = new AbortController();
    state.activeController = controller;
    state.abortReason = '';
    setBusy(true);
    elements.pulseRail.dataset.state = 'sending';
    announce(`正在发送 ${method} 请求`);

    const timer = window.setTimeout(() => {
      state.abortReason = 'timeout';
      controller.abort();
    }, timeout * 1000);
    const started = performance.now();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyInfo ? bodyInfo.body : undefined,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
      });
      const rawText = await response.text();
      const elapsed = performance.now() - started;
      const responseHeaders = Array.from(response.headers.entries());
      const contentType = response.headers.get('content-type') || '';
      const kind = core.detectResponseKind(contentType, rawText);
      let displayText = rawText;
      if (kind === 'json' && rawText.trim()) {
        try { displayText = JSON.stringify(JSON.parse(rawText), null, 2); } catch { /* keep raw response */ }
      }
      const result = {
        status: response.status,
        statusText: response.statusText || (response.ok ? 'OK' : 'HTTP 响应'),
        elapsed,
        bytes: textBytes(rawText),
        kind,
        contentType,
        rawText,
        displayText,
        headers: responseHeaders,
        requestSnapshot: request.snapshot,
        tone: response.ok ? 'success' : 'error',
        downloadable: true,
      };
      renderResponse(result);
      addHistory(request, result);
      elements.pulseRail.dataset.state = response.ok ? 'success' : 'error';
      announce(`请求完成，状态 ${response.status}`);
    } catch (error) {
      const elapsed = performance.now() - started;
      const classified = classifyFetchError(error, timeout);
      const result = {
        ...classified,
        elapsed,
        bytes: textBytes(classified.message),
        kind: 'text',
        contentType: '浏览器请求错误',
        rawText: '',
        displayText: classified.message,
        headers: [],
        requestSnapshot: request.snapshot,
        tone: 'error',
        downloadable: false,
      };
      renderResponse(result);
      addHistory(request, result);
      elements.pulseRail.dataset.state = 'error';
      announce(classified.statusText);
    } finally {
      window.clearTimeout(timer);
      state.activeController = null;
      state.abortReason = '';
      setBusy(false);
    }
  }

  function setBusy(busy) {
    elements.send.hidden = busy;
    elements.cancel.hidden = !busy;
    elements.method.disabled = busy;
    elements.url.disabled = busy;
    elements.timeout.disabled = busy;
    elements.cancel.disabled = false;
  }

  function cancelRequest() {
    if (!state.activeController) return;
    state.abortReason = 'manual';
    elements.cancel.disabled = true;
    state.activeController.abort();
  }

  function loadExample(name) {
    const example = EXAMPLES[name];
    if (!example || state.activeController) return;
    elements.method.value = example.method;
    elements.url.value = example.url;
    state.queryRows = example.queryRows.map((row) => createRow(row.key, row.value, row.enabled));
    state.headerRows = example.headerRows.map((row) => createRow(row.key, row.value, row.enabled));
    state.bodyMode = example.bodyMode;
    elements.bodyMode.value = example.bodyMode;
    elements.body.value = example.body;
    renderRows('query');
    renderRows('headers');
    updateRequestPreview();
    if (example.bodyMode !== 'none') switchTabs('request', 'body');
    elements.url.focus();
    showToast(example.message);
  }

  function loadHistoryRecord(record) {
    if (state.activeController) return;
    elements.method.value = record.method;
    elements.url.value = record.url;
    elements.timeout.value = String(record.timeout || 15);
    state.queryRows = normalizeStoredRows(record.queryRows);
    state.headerRows = normalizeStoredRows(record.headerRows).map((row) => {
      if (row.value === MASK) return { ...row, value: '', enabled: false };
      return row;
    });
    state.bodyMode = ['none', 'json', 'text'].includes(record.bodyMode) ? record.bodyMode : 'none';
    elements.bodyMode.value = state.bodyMode;
    elements.body.value = String(record.body || '').slice(0, 20000);
    renderRows('query');
    renderRows('headers');
    updateRequestPreview();
    closeHistory();
    showToast('已恢复请求；敏感请求头不会自动填回');
    elements.url.focus();
  }

  function renderHistory() {
    elements.historyCount.textContent = String(state.history.length);
    elements.clearHistory.disabled = state.history.length === 0;
    elements.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = '还没有请求记录。发送一次请求后，这里会保存可复用的配置。';
      elements.historyList.append(empty);
      return;
    }

    state.history.forEach((record) => {
      const button = document.createElement('button');
      button.className = 'history-item';
      button.type = 'button';
      button.dataset.historyId = record.id;

      const method = document.createElement('span');
      method.className = 'history-method';
      method.textContent = record.method;

      const main = document.createElement('span');
      main.className = 'history-main';
      const url = document.createElement('b');
      url.textContent = record.finalUrl || record.url;
      const meta = document.createElement('small');
      const date = new Date(record.createdAt);
      meta.textContent = `${Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { hour12: false })} · ${record.elapsed || 0} ms`;
      main.append(url, meta);

      const status = document.createElement('span');
      status.className = `history-status${/^2\d\d$/.test(record.status) ? '' : ' error'}`;
      status.textContent = record.status;
      button.append(method, main, status);
      elements.historyList.append(button);
    });
  }

  function openHistory() {
    lastDrawerFocus = document.activeElement;
    elements.drawerScrim.hidden = false;
    elements.historyDrawer.classList.add('open');
    elements.historyDrawer.setAttribute('aria-hidden', 'false');
    elements.historyOpen.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => elements.historyClose.focus(), 20);
  }

  function closeHistory() {
    elements.historyDrawer.classList.remove('open');
    elements.historyDrawer.setAttribute('aria-hidden', 'true');
    elements.historyOpen.setAttribute('aria-expanded', 'false');
    elements.drawerScrim.hidden = true;
    if (lastDrawerFocus && document.contains(lastDrawerFocus)) lastDrawerFocus.focus();
  }

  function openConfirm() {
    elements.confirmDialog.hidden = false;
    elements.confirmCancel.focus();
  }

  function closeConfirm() {
    elements.confirmDialog.hidden = true;
    elements.clearHistory.focus();
  }

  function clearHistory() {
    state.history = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing else to clear */ }
    renderHistory();
    closeConfirm();
    showToast('历史记录已清空');
  }

  function activeResponseText() {
    if (!state.response) return '';
    if (state.responseTab === 'headers') return elements.responseHeaders.textContent;
    if (state.responseTab === 'request') return elements.requestSnapshot.textContent;
    return elements.responseBody.textContent;
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('copy failed');
  }

  async function copyResponse() {
    const value = activeResponseText();
    if (!value) return;
    try {
      await copyText(value);
      showToast('当前响应视图已复制');
    } catch {
      showToast('浏览器未允许复制，请手动选择内容。', true);
    }
  }

  function downloadResponse() {
    if (!state.response || !state.response.downloadable) return;
    const extension = { json: 'json', html: 'html', xml: 'xml', text: 'txt' }[state.response.kind] || 'txt';
    const blob = new Blob([state.response.rawText], { type: state.response.contentType || 'text/plain;charset=UTF-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `port54-response-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('响应文件已下载');
  }

  function formatBody() {
    if (state.bodyMode !== 'json') return;
    try {
      const parsed = core.prepareRequestBody('POST', 'json', elements.body.value);
      if (!parsed) {
        showToast('先输入 JSON 正文', true);
        return;
      }
      elements.body.value = parsed.body;
      updateRequestPreview();
      showToast('JSON 已格式化');
    } catch (error) {
      showToast(error.message, true);
    }
  }

  elements.form.addEventListener('submit', sendRequest);
  elements.cancel.addEventListener('click', cancelRequest);
  elements.url.addEventListener('input', updateRequestPreview);
  elements.method.addEventListener('change', updateRequestPreview);
  elements.timeout.addEventListener('change', () => {
    elements.timeout.value = String(Math.min(60, Math.max(3, Number(elements.timeout.value) || 15)));
  });
  elements.bodyMode.addEventListener('change', () => {
    state.bodyMode = elements.bodyMode.value;
    updateRequestPreview();
  });
  elements.body.addEventListener('input', updateRequestPreview);
  elements.formatBody.addEventListener('click', formatBody);

  elements.queryRows.addEventListener('input', (event) => updateRow('query', event));
  elements.queryRows.addEventListener('change', (event) => updateRow('query', event));
  elements.headerRows.addEventListener('input', (event) => updateRow('headers', event));
  elements.headerRows.addEventListener('change', (event) => updateRow('headers', event));
  elements.queryRows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-row]');
    if (button) removeRow('query', button.dataset.removeRow);
  });
  elements.headerRows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-row]');
    if (button) removeRow('headers', button.dataset.removeRow);
  });

  $$('[data-add-row]').forEach((button) => button.addEventListener('click', () => addRow(button.dataset.addRow)));
  $$('[data-request-tab]').forEach((button) => button.addEventListener('click', () => switchTabs('request', button.dataset.requestTab)));
  $$('[data-response-tab]').forEach((button) => button.addEventListener('click', () => switchTabs('response', button.dataset.responseTab)));
  $$('.tab-strip').forEach(installTabKeyboard);
  $$('[data-example]').forEach((button) => button.addEventListener('click', () => loadExample(button.dataset.example)));

  elements.copyResponse.addEventListener('click', copyResponse);
  elements.downloadResponse.addEventListener('click', downloadResponse);
  elements.historyOpen.addEventListener('click', openHistory);
  elements.historyClose.addEventListener('click', closeHistory);
  elements.drawerScrim.addEventListener('click', closeHistory);
  elements.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-id]');
    if (!button) return;
    const record = state.history.find((item) => item.id === button.dataset.historyId);
    if (record) loadHistoryRecord(record);
  });
  elements.clearHistory.addEventListener('click', openConfirm);
  elements.confirmCancel.addEventListener('click', closeConfirm);
  elements.confirmClear.addEventListener('click', clearHistory);
  elements.confirmDialog.addEventListener('click', (event) => {
    if (event.target === elements.confirmDialog) closeConfirm();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!elements.confirmDialog.hidden) closeConfirm();
    else if (elements.historyDrawer.classList.contains('open')) closeHistory();
  });

  renderRows('query');
  renderRows('headers');
  renderHistory();
  updateRequestPreview();
})();
