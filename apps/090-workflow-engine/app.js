(function startSwitchyard() {
  'use strict';

  const Core = window.WorkflowCore;
  const STORAGE_KEY = 'switchyard-90-state-v1';
  const TRIGGER_LABELS = { manual: '手动扳道', event: '命名事件', interval: '间隔时钟' };
  const OPERATOR_LABELS = {
    equals: '等于', notEquals: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于',
    contains: '包含', notContains: '不包含', oneOf: '属于其中之一', exists: '存在', notExists: '不存在',
    startsWith: '开头是', endsWith: '结尾是',
  };
  const ACTION_LABELS = {
    notification: '站内通知', log: '写入调度日志', setField: '设置载荷字段', webhookPreview: '生成 Webhook 预览',
  };
  const STATUS_LABELS = { success: '执行成功', skipped: '条件拦截', error: '执行失败', ignored: '触发未匹配' };

  const templates = [
    {
      id: 'wf-morning-brief', name: '晨间运营简报', description: '每隔一段时间检查待办数量，为值班人员生成一条运营摘要。', enabled: false,
      trigger: { type: 'interval', config: { seconds: 30 } }, conditionMode: 'all',
      conditions: [{ id: 'condition-open', path: 'tasks.open', operator: 'gt', value: '0' }],
      actions: [
        { id: 'action-brief-log', type: 'log', config: { message: '待办 {{tasks.open}} 项，最高优先级 {{tasks.priority}}' } },
        { id: 'action-brief-notify', type: 'notification', config: { message: '晨间简报已生成：{{tasks.open}} 项待办' } },
      ],
      sample: { team: '增长运营', tasks: { open: 7, priority: 'P1' }, owner: '林晓' },
      code: 'CLOCK → CHECK → BRIEF',
    },
    {
      id: 'wf-lead-intake', name: '高价值线索分流', description: '收到新线索事件后，按预算判断优先级，并形成销售通知。', enabled: true,
      trigger: { type: 'event', config: { event: 'lead.created' } }, conditionMode: 'all',
      conditions: [{ id: 'condition-budget', path: 'lead.budget', operator: 'gte', value: '5000' }],
      actions: [
        { id: 'action-priority', type: 'setField', config: { path: 'route.priority', value: 'high' } },
        { id: 'action-sales', type: 'notification', config: { message: '高价值线索：{{lead.name}} · ¥{{lead.budget}}' } },
        { id: 'action-sales-log', type: 'log', config: { message: '{{lead.name}} 已进入 {{route.priority}} 优先队列' } },
      ],
      sample: { lead: { name: '北岸设计', budget: 6800, source: '官网表单' }, route: {} },
      code: 'EVENT → QUALIFY → ROUTE',
    },
    {
      id: 'wf-stock-watch', name: '低库存补货哨兵', description: '手动载入库存快照，低于安全线时标记补货级别并生成请求预览。', enabled: true,
      trigger: { type: 'manual', config: {} }, conditionMode: 'all',
      conditions: [{ id: 'condition-stock', path: 'item.stock', operator: 'lte', value: '8' }],
      actions: [
        { id: 'action-stock-level', type: 'setField', config: { path: 'reorder.level', value: 'urgent' } },
        { id: 'action-stock-log', type: 'log', config: { message: '{{item.sku}} 库存仅 {{item.stock}}，标记 {{reorder.level}}' } },
        { id: 'action-stock-hook', type: 'webhookPreview', config: { url: 'https://example.com/hooks/reorder', method: 'POST' } },
      ],
      sample: { item: { sku: 'INK-BLUE-04', stock: 6, warehouse: 'SHA-2' }, reorder: {} },
      code: 'MANUAL → STOCK → REQUEST',
    },
  ];

  const elements = {
    summary: document.querySelector('#system-summary'),
    count: document.querySelector('#workflow-count'),
    search: document.querySelector('#workflow-search'),
    filters: document.querySelector('#workflow-filters'),
    list: document.querySelector('#workflow-list'),
    newWorkflow: document.querySelector('#new-workflow'),
    editor: document.querySelector('#workflow-editor'),
    editorEmpty: document.querySelector('#editor-empty'),
    payload: document.querySelector('#payload-input'),
    payloadError: document.querySelector('#payload-error'),
    run: document.querySelector('#run-workflow'),
    runSource: document.querySelector('#run-source'),
    latest: document.querySelector('#latest-run'),
    metricRuns: document.querySelector('#metric-runs'),
    metricPassed: document.querySelector('#metric-passed'),
    metricFailed: document.querySelector('#metric-failed'),
    history: document.querySelector('#history-list'),
    clearHistory: document.querySelector('#clear-history'),
    clock: document.querySelector('#console-clock'),
    templatesButton: document.querySelector('#open-templates'),
    templateDialog: document.querySelector('#template-dialog'),
    templateGrid: document.querySelector('#template-grid'),
    guideButton: document.querySelector('#open-guide'),
    guideDialog: document.querySelector('#guide-dialog'),
    resetDemo: document.querySelector('#reset-demo'),
    importButton: document.querySelector('#import-button'),
    importFile: document.querySelector('#import-file'),
    exportButton: document.querySelector('#export-button'),
    confirmDialog: document.querySelector('#confirm-dialog'),
    confirmMessage: document.querySelector('#confirm-message'),
    confirmAccept: document.querySelector('#confirm-accept'),
    toast: document.querySelector('#toast'),
  };

  let state = loadState();
  let selectedId = state.selectedId && state.workflows.some((item) => item.id === state.selectedId)
    ? state.selectedId
    : state.workflows[0] && state.workflows[0].id;
  let rosterFilter = 'all';
  let rosterQuery = '';
  let lastRun = state.history.find((item) => item.workflowId === selectedId) || null;
  let confirmCallback = null;
  let toastTimer = 0;
  const scheduleTimers = new Map();

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function makeSeedState() {
    const workflows = templates.map((item) => {
      const copy = clone(item);
      delete copy.sample;
      delete copy.code;
      return Core.normalizeWorkflow(copy);
    });
    return {
      version: Core.VERSION,
      workflows,
      history: [],
      payloads: Object.fromEntries(templates.map((item) => [item.id, JSON.stringify(item.sample, null, 2)])),
      selectedId: 'wf-lead-intake',
    };
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const normalized = Core.normalizeBackup(raw);
      return {
        ...normalized,
        payloads: raw.payloads && typeof raw.payloads === 'object' ? raw.payloads : {},
        selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : '',
      };
    } catch (_) {
      return makeSeedState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: Core.VERSION,
        exportedAt: new Date().toISOString(),
        workflows: state.workflows,
        history: state.history,
        payloads: state.payloads,
        selectedId,
      }));
    } catch (_) {
      showToast('本地存储空间不足，最新修改未能保存。', true);
    }
  }

  function selectedWorkflow() {
    return state.workflows.find((item) => item.id === selectedId) || null;
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function showConfirm(message, label, callback) {
    confirmCallback = callback;
    elements.confirmMessage.textContent = message;
    elements.confirmAccept.textContent = label;
    elements.confirmDialog.showModal();
  }

  function createElement(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = textContent;
    return node;
  }

  function setOptions(select, entries, value) {
    entries.forEach(([optionValue, label]) => {
      const option = createElement('option', '', label);
      option.value = optionValue;
      option.selected = optionValue === value;
      select.append(option);
    });
  }

  function controlField(label, control, className = '') {
    const wrapper = createElement('label', `control-field ${className}`.trim());
    wrapper.append(createElement('span', '', label), control);
    return wrapper;
  }

  function formatTime(value, withDate = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      month: withDate ? '2-digit' : undefined,
      day: withDate ? '2-digit' : undefined,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
  }

  function renderRoster() {
    const enabled = state.workflows.filter((item) => item.enabled).length;
    elements.summary.textContent = `${state.workflows.length} 条线路 · ${enabled} 条启用`;
    elements.count.textContent = String(state.workflows.length).padStart(2, '0');
    elements.list.replaceChildren();

    const query = rosterQuery.trim().toLocaleLowerCase('zh-CN');
    const filtered = state.workflows.filter((workflow) => {
      const statusMatch = rosterFilter === 'all' || (rosterFilter === 'enabled' ? workflow.enabled : !workflow.enabled);
      const queryMatch = !query || `${workflow.name} ${workflow.description}`.toLocaleLowerCase('zh-CN').includes(query);
      return statusMatch && queryMatch;
    });

    if (!filtered.length) {
      elements.list.append(createElement('div', 'workflow-empty', '没有符合当前筛选的线路。'));
      return;
    }

    filtered.forEach((workflow, index) => {
      const card = createElement('article', `workflow-card${workflow.id === selectedId ? ' is-selected' : ''}`);
      const main = createElement('button', 'workflow-main');
      main.type = 'button';
      main.setAttribute('aria-current', workflow.id === selectedId ? 'true' : 'false');
      main.setAttribute('aria-label', `编辑 ${workflow.name}`);
      const number = createElement('span', 'route-index', String(index + 1).padStart(2, '0'));
      const copy = createElement('span', 'workflow-copy');
      copy.append(createElement('strong', '', workflow.name));
      copy.append(createElement('small', '', `${TRIGGER_LABELS[workflow.trigger.type]} · ${workflow.actions.length} 个动作`));
      main.append(number, copy);
      main.addEventListener('click', () => selectWorkflow(workflow.id));

      const toggle = createElement('button', `workflow-toggle${workflow.enabled ? ' is-on' : ''}`);
      toggle.type = 'button';
      toggle.setAttribute('aria-label', `${workflow.enabled ? '停用' : '启用'} ${workflow.name}`);
      toggle.setAttribute('aria-pressed', String(workflow.enabled));
      toggle.addEventListener('click', () => toggleWorkflow(workflow.id));
      card.append(main, toggle);
      elements.list.append(card);
    });
  }

  function currentRouteState(workflow) {
    const run = lastRun && lastRun.workflowId === workflow.id ? lastRun : null;
    if (!run) return { trigger: '', condition: '', action: '', firstRail: '', secondRail: '' };
    if (run.status === 'success') return { trigger: 'is-clear', condition: 'is-clear', action: 'is-clear', firstRail: 'is-clear', secondRail: 'is-clear' };
    if (run.status === 'skipped') return { trigger: 'is-clear', condition: 'is-blocked', action: 'is-blocked', firstRail: 'is-clear', secondRail: 'is-blocked' };
    if (run.status === 'error') return { trigger: 'is-clear', condition: 'is-clear', action: 'is-error', firstRail: 'is-clear', secondRail: 'is-error' };
    return { trigger: 'is-blocked', condition: '', action: '', firstRail: 'is-blocked', secondRail: '' };
  }

  function renderEditor() {
    const workflow = selectedWorkflow();
    elements.editor.hidden = !workflow;
    elements.editorEmpty.hidden = Boolean(workflow);
    elements.editor.replaceChildren();
    if (!workflow) return;

    const header = createElement('header', 'editor-header');
    const identity = createElement('div', 'identity-fields');
    const nameLabel = createElement('label');
    nameLabel.append(createElement('span', '', `线路 ${String(state.workflows.indexOf(workflow) + 1).padStart(2, '0')} / ${workflow.id}`));
    const nameInput = createElement('input', 'workflow-name');
    nameInput.value = workflow.name;
    nameInput.maxLength = 80;
    nameInput.setAttribute('aria-label', '工作流名称');
    nameInput.addEventListener('input', () => { workflow.name = nameInput.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
    nameInput.addEventListener('change', () => { normalizeSelected(); renderRoster(); });
    nameLabel.append(nameInput);
    const description = createElement('textarea', 'workflow-description');
    description.value = workflow.description;
    description.maxLength = 220;
    description.rows = 2;
    description.setAttribute('aria-label', '工作流说明');
    description.addEventListener('input', () => { workflow.description = description.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
    description.addEventListener('change', () => { normalizeSelected(); renderRoster(); });
    identity.append(nameLabel, description);

    const tools = createElement('div', 'workflow-tools');
    const enable = createElement('button', `button enable-button${workflow.enabled ? ' is-on' : ''}`, workflow.enabled ? '● 线路已启用' : '○ 线路已停用');
    enable.type = 'button';
    enable.addEventListener('click', () => toggleWorkflow(workflow.id));
    const duplicate = createElement('button', 'button button-ghost', '复制');
    duplicate.type = 'button';
    duplicate.addEventListener('click', duplicateWorkflow);
    const remove = createElement('button', 'button button-ghost', '删除');
    remove.type = 'button';
    remove.addEventListener('click', () => showConfirm(`删除“${workflow.name}”及其载荷配置？已有运行历史会保留。`, '删除线路', deleteSelectedWorkflow));
    tools.append(enable, duplicate, remove);
    header.append(identity, tools);

    const routeState = currentRouteState(workflow);
    const rail = createElement('section', 'rail-map');
    rail.setAttribute('aria-label', '当前工作流执行线路');
    rail.append(
      routeNode('trigger-config', '触发器', TRIGGER_LABELS[workflow.trigger.type], routeState.trigger),
      createElement('span', `rail-segment ${routeState.firstRail}`.trim()),
      routeNode('condition-config', '条件转辙', workflow.conditions.length ? `${workflow.conditions.length} 条 · ${workflow.conditionMode === 'all' ? '全部' : '任一'}` : '直接通行', routeState.condition),
      createElement('span', `rail-segment ${routeState.secondRail}`.trim()),
      routeNode('action-config', '到站动作', `${workflow.actions.length} 个动作`, routeState.action),
    );

    const configs = createElement('div', 'config-stack');
    configs.append(renderTriggerConfig(workflow), renderConditionConfig(workflow), renderActionConfig(workflow));
    const boundary = createElement('div', 'route-boundary');
    boundary.append(createElement('strong', '', '运行边界'), createElement('span', '', '调度只在此页面打开时执行；所有载荷、配置与历史保存在本机。Webhook 动作只生成请求预览。'));
    elements.editor.append(header, rail, configs, boundary);
  }

  function routeNode(targetId, title, detail, statusClass) {
    const node = createElement('button', `route-node ${statusClass}`.trim());
    node.type = 'button';
    node.append(createElement('span', 'signal-lamp'), (() => {
      const copy = createElement('span');
      copy.append(createElement('b', '', title), createElement('small', '', detail));
      return copy;
    })());
    node.addEventListener('click', () => document.querySelector(`#${targetId}`).scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return node;
  }

  function configShell(id, number, title, subtitle) {
    const block = createElement('section', 'config-block');
    block.id = id;
    const head = createElement('header', 'config-block-head');
    const titleBox = createElement('div', 'config-title');
    titleBox.append(createElement('span', 'config-number', number));
    const copy = createElement('div');
    copy.append(createElement('h2', '', title), createElement('p', '', subtitle));
    titleBox.append(copy);
    head.append(titleBox);
    const body = createElement('div', 'config-body');
    block.append(head, body);
    return { block, head, body };
  }

  function renderTriggerConfig(workflow) {
    const { block, body } = configShell('trigger-config', '01', '触发器', '定义事件从哪里进入调度场');
    const grid = createElement('div', 'control-grid');
    const type = createElement('select');
    setOptions(type, Object.entries(TRIGGER_LABELS), workflow.trigger.type);
    type.addEventListener('change', () => {
      workflow.trigger = Core.normalizeTrigger({ type: type.value, config: {} });
      workflow.updatedAt = new Date().toISOString();
      saveState(); rebuildSchedules(); renderEditor(); renderConsole(); renderRoster();
    });
    grid.append(controlField('触发方式', type));

    if (workflow.trigger.type === 'event') {
      const event = createElement('input');
      event.value = workflow.trigger.config.event;
      event.placeholder = '例如 lead.created';
      event.maxLength = 80;
      event.addEventListener('input', () => { workflow.trigger.config.event = event.value; saveState(); elements.runSource.textContent = event.value || '命名事件'; });
      event.addEventListener('change', normalizeSelected);
      grid.append(controlField('事件名称', event));
    } else if (workflow.trigger.type === 'interval') {
      const seconds = createElement('input');
      seconds.type = 'number'; seconds.min = '5'; seconds.max = '86400'; seconds.step = '5'; seconds.value = String(workflow.trigger.config.seconds);
      seconds.addEventListener('change', () => {
        workflow.trigger.config.seconds = Math.min(86400, Math.max(5, Number(seconds.value) || 60));
        workflow.updatedAt = new Date().toISOString();
        saveState(); rebuildSchedules(); renderEditor(); renderConsole();
      });
      grid.append(controlField('间隔秒数', seconds));
    } else {
      const note = createElement('div', 'route-boundary');
      note.append(createElement('strong', '', 'MANUAL'), createElement('span', '', '只在点击右侧“发送测试事件”时执行，适合调试和按需任务。'));
      grid.append(note);
    }
    body.append(grid);
    return block;
  }

  function renderConditionConfig(workflow) {
    const { block, head, body } = configShell('condition-config', '02', '条件转辙', '只有通过的事件才会驶向动作');
    const mode = createElement('select', 'mode-select');
    setOptions(mode, [['all', '全部条件通过'], ['any', '任一条件通过']], workflow.conditionMode);
    mode.setAttribute('aria-label', '条件组合方式');
    mode.addEventListener('change', () => { workflow.conditionMode = mode.value; workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor(); });
    head.append(mode);

    const list = createElement('div', 'condition-list');
    if (!workflow.conditions.length) list.append(createElement('div', 'inline-empty', '没有条件：所有匹配触发器的事件都会直接通行。'));
    workflow.conditions.forEach((condition, index) => list.append(renderConditionRow(workflow, condition, index)));
    const add = createElement('button', 'add-row', '＋ 添加一条条件');
    add.type = 'button';
    add.disabled = workflow.conditions.length >= 8;
    add.addEventListener('click', () => {
      workflow.conditions.push(Core.normalizeCondition({ path: 'value', operator: 'equals', value: '' }));
      workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor();
    });
    body.append(list, add);
    return block;
  }

  function renderConditionRow(workflow, condition, index) {
    const row = createElement('div', 'condition-row');
    row.append(createElement('span', 'row-number', `C${String(index + 1).padStart(2, '0')}`));
    const path = createElement('input');
    path.value = condition.path; path.placeholder = '例如 lead.budget'; path.maxLength = 120;
    path.addEventListener('input', () => { condition.path = path.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
    path.addEventListener('change', normalizeSelected);
    const operator = createElement('select');
    setOptions(operator, Object.entries(OPERATOR_LABELS), condition.operator);
    operator.addEventListener('change', () => { condition.operator = operator.value; workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor(); });
    const value = createElement('input');
    value.value = condition.value; value.placeholder = ['exists', 'notExists'].includes(condition.operator) ? '无需填写' : '比较值';
    value.disabled = ['exists', 'notExists'].includes(condition.operator);
    value.maxLength = 500;
    value.addEventListener('input', () => { condition.value = value.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
    value.addEventListener('change', normalizeSelected);
    const remove = createElement('button', 'row-delete', '×');
    remove.type = 'button'; remove.setAttribute('aria-label', `删除条件 ${index + 1}`);
    remove.addEventListener('click', () => { workflow.conditions.splice(index, 1); workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor(); });
    row.append(controlField('载荷路径', path), controlField('判断', operator), controlField('比较值', value), remove);
    return row;
  }

  function renderActionConfig(workflow) {
    const { block, body } = configShell('action-config', '03', '到站动作', '按从上到下的顺序执行，字段修改会传给下一步');
    const list = createElement('div', 'action-list');
    workflow.actions.forEach((action, index) => list.append(renderActionRow(workflow, action, index)));
    const add = createElement('button', 'add-row', '＋ 添加一个动作');
    add.type = 'button'; add.disabled = workflow.actions.length >= 8;
    add.addEventListener('click', () => {
      workflow.actions.push(Core.normalizeAction({ type: 'log', config: { message: '记录 {{value}}' } }));
      workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor();
    });
    body.append(list, add);
    return block;
  }

  function renderActionRow(workflow, action, index) {
    const row = createElement('div', 'action-row');
    row.append(createElement('span', 'row-number', `A${String(index + 1).padStart(2, '0')}`));
    const type = createElement('select');
    setOptions(type, Object.entries(ACTION_LABELS), action.type);
    type.addEventListener('change', () => {
      workflow.actions[index] = Core.normalizeAction({ type: type.value, config: {} });
      workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor();
    });
    row.append(controlField('动作类型', type));

    const config = createElement('div', 'action-config control-grid');
    if (action.type === 'notification' || action.type === 'log') {
      const message = createElement('input');
      message.value = action.config.message; message.maxLength = 500; message.placeholder = '支持 {{lead.name}} 模板';
      message.addEventListener('input', () => { action.config.message = message.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
      message.addEventListener('change', normalizeSelected);
      config.classList.add('single');
      config.append(controlField(action.type === 'notification' ? '通知内容' : '日志内容', message));
    } else if (action.type === 'setField') {
      const path = createElement('input');
      path.value = action.config.path; path.maxLength = 120; path.placeholder = '例如 route.priority';
      path.addEventListener('input', () => { action.config.path = path.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
      path.addEventListener('change', normalizeSelected);
      const value = createElement('input');
      value.value = action.config.value; value.maxLength = 500; value.placeholder = '例如 high';
      value.addEventListener('input', () => { action.config.value = value.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
      value.addEventListener('change', normalizeSelected);
      config.append(controlField('字段路径', path), controlField('写入值', value));
    } else {
      const url = createElement('input');
      url.type = 'url'; url.value = action.config.url; url.maxLength = 500; url.placeholder = 'https://example.com/webhook';
      url.addEventListener('input', () => { action.config.url = url.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
      url.addEventListener('change', normalizeSelected);
      const method = createElement('select');
      setOptions(method, [['POST', 'POST'], ['PUT', 'PUT'], ['PATCH', 'PATCH']], action.config.method);
      method.addEventListener('change', () => { action.config.method = method.value; workflow.updatedAt = new Date().toISOString(); saveState(); });
      config.append(controlField('请求地址（仅预览）', url), controlField('方法', method));
    }
    row.append(config);
    const remove = createElement('button', 'row-delete', '×');
    remove.type = 'button'; remove.setAttribute('aria-label', `删除动作 ${index + 1}`);
    remove.disabled = workflow.actions.length <= 1;
    remove.addEventListener('click', () => { workflow.actions.splice(index, 1); workflow.updatedAt = new Date().toISOString(); saveState(); renderEditor(); });
    row.append(remove);
    return row;
  }

  function renderConsole() {
    const workflow = selectedWorkflow();
    elements.payload.disabled = !workflow;
    elements.run.disabled = !workflow;
    if (!workflow) {
      elements.payload.value = '{}'; elements.runSource.textContent = '没有线路';
      elements.metricRuns.textContent = '0'; elements.metricPassed.textContent = '0'; elements.metricFailed.textContent = '0';
      renderLatest(); renderHistory(); return;
    }
    if (!Object.prototype.hasOwnProperty.call(state.payloads, workflow.id)) state.payloads[workflow.id] = '{}';
    elements.payload.value = state.payloads[workflow.id];
    elements.runSource.textContent = workflow.trigger.type === 'event'
      ? workflow.trigger.config.event
      : workflow.trigger.type === 'interval'
        ? `模拟 ${workflow.trigger.config.seconds} 秒间隔`
        : '手动触发';
    elements.metricRuns.textContent = String(workflow.stats.runs);
    elements.metricPassed.textContent = String(workflow.stats.passed);
    elements.metricFailed.textContent = String(workflow.stats.failed);
    validatePayload();
    renderLatest();
    renderHistory();
  }

  function validatePayload() {
    try {
      const value = JSON.parse(elements.payload.value || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('最外层需要是 JSON 对象。');
      elements.payloadError.hidden = true;
      elements.run.disabled = !selectedWorkflow();
      return value;
    } catch (error) {
      elements.payloadError.textContent = error.message;
      elements.payloadError.hidden = false;
      elements.run.disabled = true;
      return null;
    }
  }

  function renderLatest() {
    elements.latest.replaceChildren();
    const workflow = selectedWorkflow();
    const run = lastRun && workflow && lastRun.workflowId === workflow.id ? lastRun : null;
    if (!run) {
      const empty = createElement('div', 'empty-run');
      empty.append(createElement('span', '', '○'));
      const copy = createElement('p');
      copy.append(document.createTextNode('还没有运行记录'), document.createElement('br'), createElement('small', '', '发送测试事件查看每一步结果'));
      empty.append(copy); elements.latest.append(empty); return;
    }
    const card = createElement('article', `run-result status-${run.status}`);
    const header = createElement('header');
    header.append(createElement('strong', '', STATUS_LABELS[run.status]), createElement('time', '', formatTime(run.startedAt)));
    card.append(header, createElement('p', '', run.message));
    const steps = createElement('div', 'run-steps');
    const conditionClass = run.status === 'skipped' ? 'blocked' : run.status === 'ignored' ? '' : 'ok';
    const actionClass = run.status === 'success' ? 'ok' : run.status === 'error' ? 'error' : run.status === 'skipped' ? 'blocked' : '';
    steps.append(createElement('span', run.status === 'ignored' ? 'blocked' : 'ok', '触发'), createElement('span', conditionClass, '条件'), createElement('span', actionClass, '动作'));
    card.append(steps); elements.latest.append(card);
  }

  function renderHistory() {
    elements.history.replaceChildren();
    if (!state.history.length) {
      elements.history.append(createElement('div', 'history-empty', '调度记录会显示在这里。'));
      return;
    }
    state.history.slice(0, 10).forEach((run) => {
      const item = createElement('article', 'history-item');
      item.append(createElement('span', `history-status ${run.status}`));
      const copy = createElement('div');
      copy.append(createElement('strong', '', run.workflowName), createElement('small', '', STATUS_LABELS[run.status] || run.status));
      item.append(copy, createElement('time', '', formatTime(run.startedAt, true)));
      elements.history.append(item);
    });
  }

  function renderTemplates() {
    elements.templateGrid.replaceChildren();
    templates.forEach((template) => {
      const button = createElement('button', 'template-card');
      button.type = 'button';
      button.append(createElement('span', 'template-code', template.code), createElement('h3', '', template.name), createElement('p', '', template.description));
      const route = createElement('span', 'template-route');
      route.append(createElement('i'), document.createTextNode(`${TRIGGER_LABELS[template.trigger.type]} · ${template.conditions.length} 条条件 · ${template.actions.length} 个动作`));
      button.append(route);
      button.addEventListener('click', () => addFromTemplate(template));
      elements.templateGrid.append(button);
    });
  }

  function renderAll() {
    renderRoster(); renderEditor(); renderConsole();
  }

  function normalizeSelected() {
    const index = state.workflows.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    state.workflows[index] = Core.normalizeWorkflow(state.workflows[index]);
    selectedId = state.workflows[index].id;
    saveState();
  }

  function selectWorkflow(id) {
    normalizeSelected();
    selectedId = id;
    state.selectedId = id;
    lastRun = state.history.find((item) => item.workflowId === id) || null;
    saveState(); renderAll();
  }

  function toggleWorkflow(id) {
    const workflow = state.workflows.find((item) => item.id === id);
    if (!workflow) return;
    workflow.enabled = !workflow.enabled;
    workflow.updatedAt = new Date().toISOString();
    saveState(); rebuildSchedules(); renderRoster();
    if (id === selectedId) renderEditor();
    showToast(`${workflow.name} 已${workflow.enabled ? '启用' : '停用'}。`);
  }

  function createBlankWorkflow() {
    const workflow = Core.normalizeWorkflow({
      name: '未命名调度线路', description: '说明这条线路要替你完成什么重复工作。', enabled: false,
      trigger: { type: 'manual', config: {} }, conditions: [],
      actions: [{ type: 'log', config: { message: '收到 {{value}}' } }],
    });
    state.workflows.unshift(workflow);
    state.payloads[workflow.id] = JSON.stringify({ value: '第一趟测试事件' }, null, 2);
    selectedId = workflow.id; state.selectedId = selectedId; lastRun = null;
    saveState(); renderAll();
    window.setTimeout(() => elements.editor.querySelector('.workflow-name')?.select(), 0);
    showToast('空白线路已创建。');
  }

  function addFromTemplate(template) {
    const copy = clone(template);
    const sample = copy.sample;
    delete copy.sample; delete copy.code;
    copy.id = Core.createId('wf'); copy.enabled = false; copy.name = `${copy.name} · 副本`;
    copy.stats = { runs: 0, passed: 0, failed: 0, lastRunAt: '' };
    const workflow = Core.normalizeWorkflow(copy);
    state.workflows.unshift(workflow);
    state.payloads[workflow.id] = JSON.stringify(sample, null, 2);
    selectedId = workflow.id; state.selectedId = selectedId; lastRun = null;
    saveState(); elements.templateDialog.close(); renderAll();
    showToast(`已调入“${template.name}”模板。`);
  }

  function duplicateWorkflow() {
    const source = selectedWorkflow();
    if (!source) return;
    const copy = clone(source);
    copy.id = Core.createId('wf'); copy.name = `${source.name} · 副本`; copy.enabled = false;
    copy.stats = { runs: 0, passed: 0, failed: 0, lastRunAt: '' };
    copy.actions.forEach((action) => { action.id = Core.createId('action'); });
    copy.conditions.forEach((condition) => { condition.id = Core.createId('condition'); });
    const workflow = Core.normalizeWorkflow(copy);
    state.workflows.unshift(workflow);
    state.payloads[workflow.id] = state.payloads[source.id] || '{}';
    selectedId = workflow.id; state.selectedId = selectedId; lastRun = null;
    saveState(); renderAll(); showToast('线路副本已创建并保持停用。');
  }

  function deleteSelectedWorkflow() {
    const index = state.workflows.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    const [removed] = state.workflows.splice(index, 1);
    delete state.payloads[removed.id];
    selectedId = (state.workflows[index] || state.workflows[index - 1] || {}).id || '';
    state.selectedId = selectedId; lastRun = state.history.find((item) => item.workflowId === selectedId) || null;
    saveState(); rebuildSchedules(); renderAll(); showToast(`已删除“${removed.name}”。`);
  }

  function runWorkflow(id, sourceOverride) {
    const workflow = state.workflows.find((item) => item.id === id);
    if (!workflow) return;
    let payload;
    try {
      payload = JSON.parse(state.payloads[id] || '{}');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('载荷需要是 JSON 对象。');
    } catch (error) {
      if (id === selectedId) showToast(`无法执行：${error.message}`, true);
      return;
    }
    const source = sourceOverride || workflow.trigger.type;
    const meta = { source, now: new Date().toISOString() };
    if (source === 'event') meta.event = workflow.trigger.config.event;
    const run = Core.executeWorkflow(workflow, payload, meta);
    workflow.stats.runs += 1;
    if (run.status === 'success') workflow.stats.passed += 1;
    if (run.status === 'error') workflow.stats.failed += 1;
    workflow.stats.lastRunAt = run.startedAt;
    workflow.updatedAt = run.startedAt;
    state.history = Core.appendHistory(state.history, run);
    lastRun = run;
    saveState();

    const notice = run.actions && run.actions.find((item) => item.type === 'notification');
    if (notice && window.Notification && Notification.permission === 'granted') new Notification(workflow.name, { body: notice.message });
    if (id === selectedId) {
      renderEditor(); renderConsole();
      showToast(run.status === 'success' ? run.message : `${STATUS_LABELS[run.status]}：${run.message}`, run.status === 'error');
    } else {
      renderRoster(); renderHistory();
    }
  }

  function rebuildSchedules() {
    scheduleTimers.forEach((timer) => window.clearInterval(timer));
    scheduleTimers.clear();
    state.workflows.filter((item) => item.enabled && item.trigger.type === 'interval').forEach((workflow) => {
      const milliseconds = Math.max(5, workflow.trigger.config.seconds) * 1000;
      scheduleTimers.set(workflow.id, window.setInterval(() => runWorkflow(workflow.id, 'interval'), milliseconds));
    });
  }

  function exportBackup() {
    const backup = {
      ...Core.createBackup(state.workflows, state.history),
      payloads: state.payloads,
      selectedId,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `switchyard-90-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('备份已导出。');
  }

  async function importBackup(file) {
    try {
      const raw = JSON.parse(await file.text());
      const backup = Core.normalizeBackup(raw);
      showConfirm(`导入文件包含 ${backup.workflows.length} 条线路和 ${backup.history.length} 条记录。继续会替换当前本地数据。`, '替换并导入', () => {
        state = {
          ...backup,
          payloads: raw.payloads && typeof raw.payloads === 'object' ? raw.payloads : {},
          selectedId: raw.selectedId,
        };
        selectedId = state.workflows.some((item) => item.id === raw.selectedId) ? raw.selectedId : state.workflows[0]?.id || '';
        lastRun = state.history.find((item) => item.workflowId === selectedId) || null;
        saveState(); rebuildSchedules(); renderAll(); showToast('备份已导入。');
      });
    } catch (error) {
      showToast(`导入失败：${error.message}`, true);
    } finally {
      elements.importFile.value = '';
    }
  }

  function resetDemoData() {
    state = makeSeedState(); selectedId = state.selectedId; lastRun = null;
    saveState(); rebuildSchedules(); renderAll(); elements.guideDialog.close();
    showToast('示例数据已恢复。');
  }

  elements.search.addEventListener('input', () => { rosterQuery = elements.search.value; renderRoster(); });
  elements.filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    rosterFilter = button.dataset.filter;
    elements.filters.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderRoster();
  });
  elements.newWorkflow.addEventListener('click', createBlankWorkflow);
  elements.payload.addEventListener('input', () => {
    const workflow = selectedWorkflow();
    if (!workflow) return;
    state.payloads[workflow.id] = elements.payload.value;
    saveState(); validatePayload();
  });
  elements.payload.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = elements.payload.selectionStart;
      elements.payload.setRangeText('  ', start, elements.payload.selectionEnd, 'end');
      elements.payload.dispatchEvent(new Event('input'));
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!elements.run.disabled) runWorkflow(selectedId);
    }
  });
  elements.run.addEventListener('click', () => runWorkflow(selectedId));
  elements.clearHistory.addEventListener('click', () => {
    if (!state.history.length) return;
    showConfirm('清空所有线路的本地运行记录？工作流配置不会改变。', '清空记录', () => {
      state.history = []; lastRun = null; saveState(); renderEditor(); renderConsole(); showToast('运行记录已清空。');
    });
  });
  elements.templatesButton.addEventListener('click', () => elements.templateDialog.showModal());
  document.querySelector('[data-action="empty-template"]').addEventListener('click', () => elements.templateDialog.showModal());
  elements.guideButton.addEventListener('click', () => elements.guideDialog.showModal());
  elements.resetDemo.addEventListener('click', () => showConfirm('恢复三条示例线路会覆盖当前本地配置与运行记录。', '恢复示例', resetDemoData));
  elements.exportButton.addEventListener('click', exportBackup);
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => { if (elements.importFile.files[0]) importBackup(elements.importFile.files[0]); });
  elements.confirmAccept.addEventListener('click', () => {
    const callback = confirmCallback;
    confirmCallback = null;
    if (callback) callback();
  });
  elements.confirmDialog.addEventListener('close', () => { confirmCallback = null; });
  document.querySelectorAll('.modal').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }));
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    if (!state.workflows.some((item) => item.id === selectedId)) selectedId = state.workflows[0]?.id || '';
    lastRun = state.history.find((item) => item.workflowId === selectedId) || null;
    rebuildSchedules(); renderAll(); showToast('已同步另一标签页的本地修改。');
  });
  window.addEventListener('beforeunload', () => scheduleTimers.forEach((timer) => window.clearInterval(timer)));

  renderTemplates();
  renderAll();
  rebuildSchedules();
  elements.clock.textContent = formatTime(new Date().toISOString());
  window.setInterval(() => { elements.clock.textContent = formatTime(new Date().toISOString()); }, 1000);
})();
