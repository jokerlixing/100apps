(function attachBoardCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BoardCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createBoardCore() {
  'use strict';

  const VERSION = 1;
  const STATUSES = Object.freeze(['inbox', 'planned', 'doing', 'done']);
  const PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
  const STATUS_LABELS = Object.freeze({ inbox: '收件箱', planned: '已排期', doing: '进行中', done: '已完成' });
  const PRIORITY_LABELS = Object.freeze({ low: '低', medium: '普通', high: '高', urgent: '紧急' });
  const ACTIVITY_LIMIT = 80;

  function nowValue(options) {
    return String(options && options.now ? options.now : new Date().toISOString());
  }

  function makeId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).trim().slice(0, maxLength);
  }

  function cleanId(value) {
    const id = cleanText(value, 64);
    return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
  }

  function cleanDate(value) {
    const date = cleanText(value, 10);
    if (!date) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date;
  }

  function cleanColor(value, fallback) {
    const color = cleanText(value, 7);
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : fallback;
  }

  function initialsFor(name) {
    const words = cleanText(name, 40).split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.slice(0, 2).map((word) => [...word][0]).join('').toUpperCase();
    return [...(words[0] || '?')].slice(0, 2).join('').toUpperCase();
  }

  function copyState(state) {
    return {
      version: VERSION,
      project: { ...state.project },
      members: state.members.map((member) => ({ ...member })),
      tasks: state.tasks.map((task) => ({ ...task, tags: [...task.tags] })),
      activity: state.activity.map((entry) => ({ ...entry })),
    };
  }

  function normalizeOrders(tasks) {
    const orderById = new Map();
    STATUSES.forEach((status) => {
      tasks
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => task.status === status)
        .sort((a, b) => a.task.order - b.task.order || a.index - b.index)
        .forEach(({ task }, order) => orderById.set(task.id, order));
    });
    return tasks.map((task) => ({ ...task, order: orderById.get(task.id) ?? 0 }));
  }

  function addActivity(state, entry, options) {
    const at = nowValue(options);
    const activity = {
      id: cleanId(options && options.activityId) || makeId('activity'),
      type: cleanText(entry.type, 24) || 'updated',
      message: cleanText(entry.message, 160),
      taskId: cleanId(entry.taskId),
      at,
    };
    return { ...state, activity: [...state.activity, activity].slice(-ACTIVITY_LIMIT) };
  }

  function defaultMembers() {
    return [
      { id: 'member-lin', name: '林青', role: '产品负责人', initials: '林青', color: '#2F6E9C' },
      { id: 'member-qiao', name: '乔然', role: '视觉设计', initials: '乔然', color: '#B85632' },
      { id: 'member-zhou', name: '周屿', role: '前端开发', initials: '周屿', color: '#4C7B61' },
      { id: 'member-an', name: '安澜', role: '内容运营', initials: '安澜', color: '#7D5A8C' },
    ];
  }

  function defaultTasks(now) {
    return [
      ['route-research', '整理三条周末骑行路线', '对照坡度、补给点和公共交通接驳。', 'inbox', 'high', 'member-lin', '2026-09-04', ['路线']],
      ['safety-copy', '补齐夜骑安全提示', '加入照明、反光装备和结伴建议。', 'inbox', 'medium', 'member-an', '2026-09-05', ['内容']],
      ['map-symbols', '绘制路线图例系统', '统一坡度、维修点和饮水点符号。', 'planned', 'high', 'member-qiao', '2026-09-03', ['视觉', '地图']],
      ['mobile-shell', '搭建移动端路线壳', '完成路线切换与底部信息抽屉。', 'planned', 'urgent', 'member-zhou', '2026-09-02', ['前端']],
      ['checkpoint-audit', '复核沿途补给点', '电话确认营业时间并标注季节性关闭。', 'planned', 'medium', 'member-lin', '2026-09-06', ['路线']],
      ['elevation-chart', '实现坡度剖面图', '联动地图高亮当前路段。', 'doing', 'urgent', 'member-zhou', '2026-09-01', ['前端', '地图']],
      ['launch-poster', '制作首发招募海报', '准备社群竖版与门店横版两个尺寸。', 'doing', 'high', 'member-qiao', '2026-09-02', ['视觉']],
      ['route-tone', '确定路线说明语气', '采用简短、可执行的导航语言。', 'done', 'medium', 'member-an', '2026-08-29', ['内容']],
      ['pilot-ride', '完成东岸路线试骑', '记录施工绕行与两个新增饮水点。', 'done', 'high', 'member-lin', '2026-08-30', ['路线']],
    ].map((task, index) => ({
      id: task[0],
      title: task[1],
      description: task[2],
      status: task[3],
      priority: task[4],
      memberId: task[5],
      dueDate: task[6],
      tags: task[7],
      createdAt: now,
      updatedAt: now,
      completedAt: task[3] === 'done' ? now : '',
      order: index,
    }));
  }

  function createDefaultState(options = {}) {
    const now = nowValue(options);
    const state = {
      version: VERSION,
      project: { name: '城市骑行路线发布', sprint: 'SPRINT 06 · 发布准备', updatedAt: now },
      members: defaultMembers(),
      tasks: defaultTasks(now),
      activity: [
        { id: 'activity-brief', type: 'created', message: '林青建立了发布冲刺看板', taskId: '', at: now },
        { id: 'activity-pilot', type: 'moved', message: '东岸路线试骑 → 已完成', taskId: 'pilot-ride', at: now },
      ],
    };
    state.tasks = normalizeOrders(state.tasks);
    return state;
  }

  function sanitizeMember(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const id = cleanId(raw.id);
    const name = cleanText(raw.name, 40);
    if (!id || !name) return null;
    const fallbackColors = ['#2F6E9C', '#B85632', '#4C7B61', '#7D5A8C'];
    return {
      id,
      name,
      role: cleanText(raw.role, 50) || '团队成员',
      initials: initialsFor(name),
      color: cleanColor(raw.color, fallbackColors[index % fallbackColors.length]),
    };
  }

  function sanitizeTask(raw, memberIds, now) {
    if (!raw || typeof raw !== 'object') return null;
    const id = cleanId(raw.id);
    const title = cleanText(raw.title, 80);
    if (!id || !title) return null;
    const status = STATUSES.includes(raw.status) ? raw.status : 'inbox';
    const priority = PRIORITIES.includes(raw.priority) ? raw.priority : 'medium';
    const memberId = memberIds.has(raw.memberId) ? raw.memberId : '';
    const tags = Array.isArray(raw.tags)
      ? [...new Set(raw.tags.map((tag) => cleanText(tag, 16)).filter(Boolean))].slice(0, 5)
      : [];
    return {
      id,
      title,
      description: cleanText(raw.description, 300),
      status,
      priority,
      memberId,
      dueDate: cleanDate(raw.dueDate),
      tags,
      createdAt: cleanText(raw.createdAt, 40) || now,
      updatedAt: cleanText(raw.updatedAt, 40) || now,
      completedAt: status === 'done' ? (cleanText(raw.completedAt, 40) || now) : '',
      order: Number.isFinite(Number(raw.order)) ? Math.max(0, Number(raw.order)) : 0,
    };
  }

  function sanitizeState(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('看板数据格式无效');
    if (!Array.isArray(input.members) || input.members.length === 0) throw new Error('看板至少需要一名成员');
    if (!Array.isArray(input.tasks)) throw new Error('看板任务列表无效');
    const now = nowValue(options);
    const seenMembers = new Set();
    const members = input.members.map(sanitizeMember).filter((member) => {
      if (!member || seenMembers.has(member.id)) return false;
      seenMembers.add(member.id);
      return true;
    });
    if (!members.length) throw new Error('看板至少需要一名有效成员');
    const memberIds = new Set(members.map((member) => member.id));
    const seenTasks = new Set();
    const tasks = input.tasks.map((task) => sanitizeTask(task, memberIds, now)).filter((task) => {
      if (!task || seenTasks.has(task.id)) return false;
      seenTasks.add(task.id);
      return true;
    });
    const activity = Array.isArray(input.activity) ? input.activity.map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const message = cleanText(entry.message, 160);
      if (!message) return null;
      return {
        id: cleanId(entry.id) || `imported-${index}`,
        type: cleanText(entry.type, 24) || 'updated',
        message,
        taskId: cleanId(entry.taskId),
        at: cleanText(entry.at, 40) || now,
      };
    }).filter(Boolean).slice(-ACTIVITY_LIMIT) : [];
    return {
      version: VERSION,
      project: {
        name: cleanText(input.project && input.project.name, 60) || '未命名项目',
        sprint: cleanText(input.project && input.project.sprint, 60) || '当前冲刺',
        updatedAt: now,
      },
      members,
      tasks: normalizeOrders(tasks),
      activity,
    };
  }

  function validateTaskInput(state, input, existing) {
    const titleSource = Object.prototype.hasOwnProperty.call(input, 'title') ? input.title : existing && existing.title;
    const rawTitle = String(titleSource == null ? '' : titleSource).trim();
    if (!rawTitle) throw new Error('任务标题不能为空');
    if ([...rawTitle].length > 80) throw new Error('任务标题不能超过 80 个字符');
    const descriptionSource = Object.prototype.hasOwnProperty.call(input, 'description') ? input.description : existing && existing.description;
    const rawDescription = String(descriptionSource == null ? '' : descriptionSource).trim();
    if ([...rawDescription].length > 300) throw new Error('任务说明不能超过 300 个字符');
    const status = Object.prototype.hasOwnProperty.call(input, 'status') ? input.status : (existing && existing.status) || 'inbox';
    if (!STATUSES.includes(status)) throw new Error('任务状态无效');
    const priority = Object.prototype.hasOwnProperty.call(input, 'priority') ? input.priority : (existing && existing.priority) || 'medium';
    if (!PRIORITIES.includes(priority)) throw new Error('任务优先级无效');
    const memberId = Object.prototype.hasOwnProperty.call(input, 'memberId') ? input.memberId : (existing && existing.memberId) || '';
    if (memberId && !state.members.some((member) => member.id === memberId)) throw new Error('所选成员不存在');
    const dueSource = Object.prototype.hasOwnProperty.call(input, 'dueDate') ? input.dueDate : existing && existing.dueDate;
    const dueDate = cleanDate(dueSource);
    if (dueSource && !dueDate) throw new Error('截止日期无效');
    const tagSource = Object.prototype.hasOwnProperty.call(input, 'tags') ? input.tags : existing && existing.tags;
    const tagValues = Array.isArray(tagSource) ? tagSource : String(tagSource || '').split(/[,，]/);
    const tags = [...new Set(tagValues.map((tag) => cleanText(tag, 16)).filter(Boolean))].slice(0, 5);
    return { title: rawTitle, description: rawDescription, status, priority, memberId, dueDate, tags };
  }

  function createTask(state, input, options = {}) {
    const next = copyState(state);
    const values = validateTaskInput(next, input || {}, null);
    const id = cleanId(options.id) || makeId('task');
    if (next.tasks.some((task) => task.id === id)) throw new Error('任务编号已存在');
    const now = nowValue(options);
    const order = next.tasks.filter((task) => task.status === values.status).length;
    const task = { id, ...values, createdAt: now, updatedAt: now, completedAt: values.status === 'done' ? now : '', order };
    next.tasks.push(task);
    next.project.updatedAt = now;
    const withActivity = addActivity(next, { type: 'created', message: `创建任务「${task.title}」`, taskId: id }, options);
    return { state: withActivity, task: { ...task, tags: [...task.tags] } };
  }

  function updateTask(state, taskId, patch, options = {}) {
    const next = copyState(state);
    const index = next.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) throw new Error('任务不存在');
    const existing = next.tasks[index];
    const values = validateTaskInput(next, patch || {}, existing);
    const now = nowValue(options);
    const statusChanged = values.status !== existing.status;
    const task = {
      ...existing,
      ...values,
      updatedAt: now,
      completedAt: values.status === 'done' ? (existing.completedAt || now) : '',
      order: statusChanged ? next.tasks.filter((item) => item.status === values.status).length : existing.order,
    };
    next.tasks[index] = task;
    next.tasks = normalizeOrders(next.tasks);
    next.project.updatedAt = now;
    const withActivity = addActivity(next, { type: 'updated', message: `更新任务「${task.title}」`, taskId }, options);
    return { state: withActivity, task: { ...task, tags: [...task.tags] } };
  }

  function deleteTask(state, taskId, options = {}) {
    const next = copyState(state);
    const index = next.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) throw new Error('任务不存在');
    const [task] = next.tasks.splice(index, 1);
    next.tasks = normalizeOrders(next.tasks);
    const now = nowValue(options);
    next.project.updatedAt = now;
    const withActivity = addActivity(next, { type: 'deleted', message: `删除任务「${task.title}」`, taskId }, options);
    return { state: withActivity, task };
  }

  function moveTask(state, taskId, targetStatus, targetIndex, options = {}) {
    if (!STATUSES.includes(targetStatus)) throw new Error('目标状态无效');
    const next = copyState(state);
    const task = next.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('任务不存在');
    const target = next.tasks.filter((item) => item.status === targetStatus && item.id !== taskId).sort((a, b) => a.order - b.order);
    const index = Math.max(0, Math.min(Number.isFinite(Number(targetIndex)) ? Math.trunc(Number(targetIndex)) : target.length, target.length));
    target.splice(index, 0, task);
    const targetOrder = new Map(target.map((item, order) => [item.id, order]));
    const now = nowValue(options);
    const fromStatus = task.status;
    next.tasks = next.tasks.map((item) => {
      if (item.id === taskId) {
        return {
          ...item,
          status: targetStatus,
          order: targetOrder.get(item.id),
          updatedAt: now,
          completedAt: targetStatus === 'done' ? (item.completedAt || now) : '',
        };
      }
      if (item.status === targetStatus && targetOrder.has(item.id)) return { ...item, order: targetOrder.get(item.id) };
      return item;
    });
    next.tasks = normalizeOrders(next.tasks);
    next.project.updatedAt = now;
    const verb = fromStatus === targetStatus ? '调整顺序' : `移动到${STATUS_LABELS[targetStatus]}`;
    const withActivity = addActivity(next, { type: 'moved', message: `${task.title} · ${verb}`, taskId }, options);
    return { state: withActivity, task: withActivity.tasks.find((item) => item.id === taskId) };
  }

  function filterTasks(state, filters = {}) {
    const query = cleanText(filters.query, 80).toLocaleLowerCase('zh-CN');
    return state.tasks.filter((task) => {
      if (filters.memberId && task.memberId !== filters.memberId) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (!query) return true;
      const member = state.members.find((item) => item.id === task.memberId);
      const haystack = [task.title, task.description, task.tags.join(' '), member && member.name].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    }).map((task) => ({ ...task, tags: [...task.tags] })).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.order - b.order);
  }

  function getStats(state, options = {}) {
    const today = nowValue(options).slice(0, 10);
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => task.status === 'done').length;
    const doing = state.tasks.filter((task) => task.status === 'doing').length;
    const overdue = state.tasks.filter((task) => task.status !== 'done' && task.dueDate && task.dueDate < today).length;
    return { total, done, doing, overdue, completionPercent: total ? Math.round((done / total) * 100) : 0 };
  }

  return {
    VERSION,
    STATUSES,
    PRIORITIES,
    STATUS_LABELS,
    PRIORITY_LABELS,
    createDefaultState,
    sanitizeState,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    filterTasks,
    getStats,
  };
}));
