(function attachWorkflowCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkflowCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildWorkflowCore() {
  'use strict';

  const VERSION = 1;
  const MAX_WORKFLOWS = 40;
  const MAX_HISTORY = 60;
  const FORBIDDEN_PATHS = new Set(['__proto__', 'prototype', 'constructor']);
  const TRIGGER_TYPES = new Set(['manual', 'event', 'interval']);
  const CONDITION_OPERATORS = new Set([
    'equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'contains', 'notContains',
    'oneOf', 'exists', 'notExists', 'startsWith', 'endsWith',
  ]);
  const ACTION_TYPES = new Set(['notification', 'log', 'setField', 'webhookPreview']);

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback = '', max = 180) {
    const result = String(value ?? '').trim();
    return (result || fallback).slice(0, max);
  }

  function createId(prefix = 'item') {
    const time = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${time}-${random}`;
  }

  function normalizeId(value, prefix) {
    const candidate = text(value, '', 72).toLowerCase();
    return /^[a-z][a-z0-9-]{2,71}$/.test(candidate) ? candidate : createId(prefix);
  }

  function pathSegments(path) {
    const segments = String(path ?? '')
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (!segments.length || segments.some((segment) => FORBIDDEN_PATHS.has(segment))) return [];
    return segments;
  }

  function getPath(source, path) {
    const segments = pathSegments(path);
    if (!segments.length) return undefined;
    let cursor = source;
    for (const segment of segments) {
      if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
      cursor = cursor[segment];
    }
    return cursor;
  }

  function setPath(target, path, value) {
    const segments = pathSegments(path);
    if (!segments.length) throw new Error('字段路径无效，请使用安全的点号路径。');
    let cursor = target;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        cursor[segment] = value;
        return;
      }
      const current = cursor[segment];
      if (!current || typeof current !== 'object' || Array.isArray(current)) cursor[segment] = {};
      cursor = cursor[segment];
    });
    return target;
  }

  function parseLiteral(value, actual) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (typeof actual === 'number' && trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
    if (typeof actual === 'boolean' && /^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed);
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return JSON.parse(trimmed); } catch (_) { return trimmed; }
    }
    return trimmed;
  }

  function valuesEqual(actual, expected) {
    const parsed = parseLiteral(expected, actual);
    if (typeof actual === 'number' && typeof parsed === 'number') return actual === parsed;
    if (typeof actual === 'boolean' && typeof parsed === 'boolean') return actual === parsed;
    if (actual === null || actual === undefined || parsed === null || parsed === undefined) return actual === parsed;
    return String(actual) === String(parsed);
  }

  function evaluateCondition(condition, payload) {
    const actual = getPath(payload, condition.path);
    const operator = CONDITION_OPERATORS.has(condition.operator) ? condition.operator : 'equals';
    const expected = condition.value;
    const numericActual = Number(actual);
    const numericExpected = Number(expected);

    switch (operator) {
      case 'equals': return valuesEqual(actual, expected);
      case 'notEquals': return !valuesEqual(actual, expected);
      case 'gt': return Number.isFinite(numericActual) && Number.isFinite(numericExpected) && numericActual > numericExpected;
      case 'gte': return Number.isFinite(numericActual) && Number.isFinite(numericExpected) && numericActual >= numericExpected;
      case 'lt': return Number.isFinite(numericActual) && Number.isFinite(numericExpected) && numericActual < numericExpected;
      case 'lte': return Number.isFinite(numericActual) && Number.isFinite(numericExpected) && numericActual <= numericExpected;
      case 'contains':
        if (Array.isArray(actual)) return actual.some((item) => valuesEqual(item, expected));
        return actual !== null && actual !== undefined && String(actual).includes(String(expected));
      case 'notContains':
        if (Array.isArray(actual)) return !actual.some((item) => valuesEqual(item, expected));
        return actual === null || actual === undefined || !String(actual).includes(String(expected));
      case 'oneOf': return String(expected).split(',').map((item) => item.trim()).some((item) => valuesEqual(actual, item));
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      case 'notExists': return actual === undefined || actual === null || actual === '';
      case 'startsWith': return actual !== null && actual !== undefined && String(actual).startsWith(String(expected));
      case 'endsWith': return actual !== null && actual !== undefined && String(actual).endsWith(String(expected));
      default: return false;
    }
  }

  function normalizeTrigger(trigger) {
    const type = TRIGGER_TYPES.has(trigger && trigger.type) ? trigger.type : 'manual';
    const config = trigger && trigger.config && typeof trigger.config === 'object' ? trigger.config : {};
    if (type === 'event') return { type, config: { event: text(config.event, 'event.received', 80) } };
    if (type === 'interval') {
      const seconds = Math.min(86400, Math.max(5, Number(config.seconds) || 60));
      return { type, config: { seconds } };
    }
    return { type, config: {} };
  }

  function normalizeCondition(condition) {
    const source = condition && typeof condition === 'object' ? condition : {};
    return {
      id: normalizeId(source.id, 'condition'),
      path: text(source.path, 'value', 120),
      operator: CONDITION_OPERATORS.has(source.operator) ? source.operator : 'equals',
      value: typeof source.value === 'string' ? source.value.slice(0, 500) : String(source.value ?? ''),
    };
  }

  function normalizeAction(action) {
    if (!action || typeof action !== 'object' || !ACTION_TYPES.has(action.type)) return null;
    const config = action.config && typeof action.config === 'object' ? action.config : {};
    const normalized = { id: normalizeId(action.id, 'action'), type: action.type, config: {} };
    if (action.type === 'notification' || action.type === 'log') {
      normalized.config.message = text(config.message, action.type === 'notification' ? '工作流已执行' : '记录 {{value}}', 500);
    } else if (action.type === 'setField') {
      normalized.config.path = text(config.path, 'result.value', 120);
      normalized.config.value = typeof config.value === 'string' ? config.value.slice(0, 500) : String(config.value ?? '');
    } else if (action.type === 'webhookPreview') {
      normalized.config.url = text(config.url, 'https://example.com/webhook', 500);
      normalized.config.method = ['POST', 'PUT', 'PATCH'].includes(String(config.method).toUpperCase())
        ? String(config.method).toUpperCase()
        : 'POST';
    }
    return normalized;
  }

  function normalizeWorkflow(workflow) {
    const source = workflow && typeof workflow === 'object' ? workflow : {};
    const actions = Array.isArray(source.actions)
      ? source.actions.slice(0, 8).map(normalizeAction).filter(Boolean)
      : [];
    return {
      id: normalizeId(source.id, 'wf'),
      name: text(source.name, '未命名工作流', 80),
      description: text(source.description, '等待补充这条线路的用途。', 220),
      enabled: Boolean(source.enabled),
      trigger: normalizeTrigger(source.trigger),
      conditionMode: source.conditionMode === 'any' ? 'any' : 'all',
      conditions: Array.isArray(source.conditions)
        ? source.conditions.filter((item) => item && typeof item === 'object').slice(0, 8).map(normalizeCondition)
        : [],
      actions: actions.length ? actions : [normalizeAction({ type: 'log', config: { message: '工作流 {{workflow.name}} 已执行' } })],
      stats: {
        runs: Math.max(0, Number(source.stats && source.stats.runs) || 0),
        passed: Math.max(0, Number(source.stats && source.stats.passed) || 0),
        failed: Math.max(0, Number(source.stats && source.stats.failed) || 0),
        lastRunAt: text(source.stats && source.stats.lastRunAt, '', 50),
      },
      createdAt: text(source.createdAt, new Date().toISOString(), 50),
      updatedAt: text(source.updatedAt, new Date().toISOString(), 50),
    };
  }

  function matchTrigger(trigger, meta = {}) {
    const normalized = normalizeTrigger(trigger);
    if (normalized.type !== meta.source) return false;
    if (normalized.type === 'event') return normalized.config.event === text(meta.event, '', 80);
    return true;
  }

  function renderTemplate(template, context) {
    return String(template ?? '').replace(/{{\s*([\w.-]+)\s*}}/g, (_, path) => {
      const value = getPath(context, path);
      if (value === undefined || value === null) return '—';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }

  function runAction(action, context) {
    if (action.type === 'setField') {
      const rendered = renderTemplate(action.config.value, context);
      const value = parseLiteral(rendered);
      setPath(context, action.config.path, value);
      return { id: action.id, type: action.type, status: 'success', path: action.config.path, value: clone(value) };
    }
    if (action.type === 'notification' || action.type === 'log') {
      return { id: action.id, type: action.type, status: 'success', message: renderTemplate(action.config.message, context) };
    }
    if (action.type === 'webhookPreview') {
      let url;
      try { url = new URL(renderTemplate(action.config.url, context)); } catch (_) { throw new Error('Webhook 地址不是有效 URL。'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Webhook 地址只支持 HTTP 或 HTTPS。');
      return {
        id: action.id,
        type: action.type,
        status: 'success',
        request: { url: url.toString(), method: action.config.method, body: clone(context) },
      };
    }
    throw new Error('动作类型不受支持。');
  }

  function executeWorkflow(workflow, payload = {}, meta = {}) {
    const subject = normalizeWorkflow(workflow);
    const startedAt = text(meta.now, new Date().toISOString(), 50);
    const base = {
      id: createId('run'),
      workflowId: subject.id,
      workflowName: subject.name,
      trigger: subject.trigger.type,
      startedAt,
      finishedAt: startedAt,
      input: clone(payload && typeof payload === 'object' ? payload : {}),
      output: clone(payload && typeof payload === 'object' ? payload : {}),
      conditions: [],
      actions: [],
      status: 'ignored',
      message: '触发器未匹配。',
    };
    if (!matchTrigger(subject.trigger, meta)) return base;

    base.conditions = subject.conditions.map((condition) => ({
      id: condition.id,
      path: condition.path,
      operator: condition.operator,
      expected: condition.value,
      actual: clone(getPath(base.output, condition.path)),
      passed: evaluateCondition(condition, base.output),
    }));
    const cleared = !base.conditions.length || (subject.conditionMode === 'all'
      ? base.conditions.every((item) => item.passed)
      : base.conditions.some((item) => item.passed));
    if (!cleared) {
      base.status = 'skipped';
      base.message = '条件未通过，动作未执行。';
      return base;
    }

    try {
      for (const action of subject.actions) base.actions.push(runAction(action, base.output));
      base.status = 'success';
      base.message = `已完成 ${base.actions.length} 个动作。`;
    } catch (error) {
      base.status = 'error';
      base.message = error instanceof Error ? error.message : '动作执行失败。';
    }
    return base;
  }

  function normalizeHistoryEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const status = ['success', 'skipped', 'error', 'ignored'].includes(source.status) ? source.status : 'error';
    return {
      ...clone(source),
      id: normalizeId(source.id, 'run'),
      workflowId: text(source.workflowId, '', 72),
      workflowName: text(source.workflowName, '未知工作流', 80),
      status,
      startedAt: text(source.startedAt, '', 50),
      message: text(source.message, '', 220),
    };
  }

  function appendHistory(history, run, max = MAX_HISTORY) {
    const limit = Math.max(1, Math.min(MAX_HISTORY, Number(max) || MAX_HISTORY));
    return [normalizeHistoryEntry(run), ...(Array.isArray(history) ? history.map(normalizeHistoryEntry) : [])].slice(0, limit);
  }

  function normalizeBackup(backup) {
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('备份内容不是有效对象。');
    if (Number(backup.version) !== VERSION) throw new Error('备份版本不受支持。');
    if (!Array.isArray(backup.workflows)) throw new Error('备份缺少工作流列表。');
    return {
      version: VERSION,
      exportedAt: text(backup.exportedAt, new Date().toISOString(), 50),
      workflows: backup.workflows.slice(0, MAX_WORKFLOWS).map(normalizeWorkflow),
      history: Array.isArray(backup.history) ? backup.history.slice(0, MAX_HISTORY).map(normalizeHistoryEntry) : [],
    };
  }

  function createBackup(workflows, history) {
    return normalizeBackup({ version: VERSION, exportedAt: new Date().toISOString(), workflows, history });
  }

  return {
    VERSION,
    MAX_WORKFLOWS,
    MAX_HISTORY,
    TRIGGER_TYPES: [...TRIGGER_TYPES],
    CONDITION_OPERATORS: [...CONDITION_OPERATORS],
    ACTION_TYPES: [...ACTION_TYPES],
    createId,
    getPath,
    setPath,
    parseLiteral,
    evaluateCondition,
    normalizeTrigger,
    normalizeCondition,
    normalizeAction,
    normalizeWorkflow,
    matchTrigger,
    renderTemplate,
    executeWorkflow,
    appendHistory,
    normalizeBackup,
    createBackup,
  };
});
