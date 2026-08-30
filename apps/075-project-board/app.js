(function startRailBoard() {
  'use strict';

  const Core = window.BoardCore;
  if (!Core) throw new Error('RAIL/75 board core failed to load');

  const STORAGE_KEY = 'rail75-board-v1';
  const MAX_IMPORT_BYTES = 512 * 1024;
  const PRIORITY_COLORS = { low: '#6d8290', medium: '#2f6e9c', high: '#b85632', urgent: '#a43f31' };
  const STATUS_CODES = { inbox: 'INBOX', planned: 'PLANNED', doing: 'IN MOTION', done: 'ARRIVED' };
  const ACTIVITY_CODES = { created: '+', updated: '✎', moved: '→', deleted: '×' };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const dom = {
    board: $('#board'),
    projectTitle: $('#projectTitle'),
    sprintLabel: $('#sprintLabel'),
    totalStat: $('#totalStat'),
    doingStat: $('#doingStat'),
    doneStat: $('#doneStat'),
    overdueStat: $('#overdueStat'),
    completionLabel: $('#completionLabel'),
    completionBar: $('#completionBar'),
    completionNote: $('#completionNote'),
    searchInput: $('#searchInput'),
    memberFilters: $('#memberFilters'),
    priorityFilter: $('#priorityFilter'),
    clearFiltersButton: $('#clearFiltersButton'),
    filterResult: $('#filterResult'),
    activityButton: $('#activityButton'),
    activityCount: $('#activityCount'),
    activityPanel: $('#activityPanel'),
    activityList: $('#activityList'),
    closeActivityButton: $('#closeActivityButton'),
    panelScrim: $('#panelScrim'),
    dataTools: $('#dataTools'),
    exportButton: $('#exportButton'),
    importInput: $('#importInput'),
    resetButton: $('#resetButton'),
    newTaskButton: $('#newTaskButton'),
    taskDialog: $('#taskDialog'),
    taskForm: $('#taskForm'),
    taskId: $('#taskId'),
    taskStatus: $('#taskStatus'),
    taskTitle: $('#taskTitle'),
    taskDescription: $('#taskDescription'),
    taskMember: $('#taskMember'),
    taskPriority: $('#taskPriority'),
    taskDueDate: $('#taskDueDate'),
    taskTags: $('#taskTags'),
    dialogEyebrow: $('#dialogEyebrow'),
    dialogTitle: $('#dialogTitle'),
    descriptionCounter: $('#descriptionCounter'),
    taskFormError: $('#taskFormError'),
    deleteTaskButton: $('#deleteTaskButton'),
    closeTaskButton: $('#closeTaskButton'),
    cancelTaskButton: $('#cancelTaskButton'),
    confirmDialog: $('#confirmDialog'),
    confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'),
    acceptConfirmButton: $('#acceptConfirmButton'),
    cancelConfirmButton: $('#cancelConfirmButton'),
    toast: $('#toast'),
    liveRegion: $('#liveRegion'),
  };

  let loadNotice = '';
  let state = loadState();
  let filters = { query: '', memberId: '', priority: '' };
  let draggedTaskId = '';
  let confirmAction = null;
  let toastTimer = 0;
  let lastDialogTrigger = null;
  let landingTaskId = '';

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Core.createDefaultState();
    try {
      return Core.sanitizeState(JSON.parse(raw));
    } catch (error) {
      loadNotice = `已忽略无法读取的本地看板：${error.message}`;
      return Core.createDefaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      showToast('浏览器存储空间不足，本次更改只保留到刷新前。', 'error');
      return false;
    }
  }

  function applyState(nextState, message, taskId) {
    state = nextState;
    landingTaskId = taskId || '';
    saveState();
    render();
    if (message) {
      showToast(message);
      announce(message);
    }
    if (landingTaskId) window.setTimeout(() => { landingTaskId = ''; }, 420);
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function localToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function shortDate(value) {
    if (!value) return '';
    const parts = value.split('-');
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : value;
  }

  function formatActivityTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function render() {
    dom.projectTitle.textContent = state.project.name;
    dom.sprintLabel.textContent = state.project.sprint;
    renderStats();
    renderMemberFilters();
    renderBoard();
    renderActivity();
  }

  function renderStats() {
    const stats = Core.getStats(state);
    dom.totalStat.textContent = stats.total;
    dom.doingStat.textContent = stats.doing;
    dom.doneStat.textContent = stats.done;
    dom.overdueStat.textContent = stats.overdue;
    dom.completionLabel.textContent = `${stats.completionPercent}%`;
    dom.completionBar.style.width = `${stats.completionPercent}%`;
    dom.completionNote.textContent = stats.total
      ? `${stats.done} 张卡已到站，还剩 ${stats.total - stats.done} 张在轨道上。`
      : '新建第一张任务卡，开始这次冲刺。';
  }

  function renderMemberFilters() {
    dom.memberFilters.replaceChildren();
    const all = makeElement('button', 'member-filter all-members', 'ALL');
    all.type = 'button';
    all.dataset.memberId = '';
    all.dataset.active = String(!filters.memberId);
    all.setAttribute('aria-label', '显示全部成员');
    all.title = '全部成员';
    dom.memberFilters.append(all);
    state.members.forEach((member) => {
      const button = makeElement('button', 'member-filter', member.initials);
      button.type = 'button';
      button.dataset.memberId = member.id;
      button.dataset.active = String(filters.memberId === member.id);
      button.style.setProperty('--member-color', member.color);
      button.setAttribute('aria-label', `只看 ${member.name} 的任务`);
      button.title = `${member.name} · ${member.role}`;
      dom.memberFilters.append(button);
    });
  }

  function renderBoard() {
    const visible = Core.filterTasks(state, filters);
    const byStatus = Object.fromEntries(Core.STATUSES.map((status) => [status, visible.filter((task) => task.status === status)]));
    Core.STATUSES.forEach((status) => {
      const list = $(`.task-list[data-status="${status}"]`);
      list.replaceChildren();
      byStatus[status].forEach((task) => list.append(createTaskCard(task)));
      if (!byStatus[status].length) {
        const empty = makeElement('div', 'empty-column', hasFilters() ? '没有符合筛选条件的任务' : '轨道空闲，添加一张任务卡');
        list.append(empty);
      }
      const actualCount = state.tasks.filter((task) => task.status === status).length;
      $(`[data-count="${status}"]`).textContent = actualCount;
    });
    const has = hasFilters();
    dom.clearFiltersButton.hidden = !has;
    dom.filterResult.textContent = has ? `筛选显示 ${visible.length} / ${state.tasks.length} 张任务` : `当前显示全部 ${state.tasks.length} 张任务`;
  }

  function createTaskCard(task) {
    const member = state.members.find((item) => item.id === task.memberId);
    const card = makeElement('article', `task-card${task.id === landingTaskId ? ' is-landing' : ''}`);
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('draggable', 'true');
    card.setAttribute('aria-label', `${task.title}，${Core.STATUS_LABELS[task.status]}，${Core.PRIORITY_LABELS[task.priority]}优先级`);
    card.style.setProperty('--priority-color', PRIORITY_COLORS[task.priority]);

    const topline = makeElement('div', 'card-topline');
    const priority = makeElement('span', 'priority-label');
    priority.append(makeElement('i'));
    priority.append(document.createTextNode(`${Core.PRIORITY_LABELS[task.priority]} PRIORITY`));
    const route = makeElement('div', 'card-route');
    const statusIndex = Core.STATUSES.indexOf(task.status);
    route.append(createRouteButton('previous', '←', '移动到上一列', statusIndex === 0));
    route.append(createRouteButton('next', '→', '移动到下一列', statusIndex === Core.STATUSES.length - 1));
    topline.append(priority, route);
    card.append(topline);

    card.append(makeElement('h3', '', task.title));
    if (task.description) card.append(makeElement('p', 'description', task.description));
    if (task.tags.length) {
      const tags = makeElement('div', 'tag-list');
      task.tags.forEach((tag) => tags.append(makeElement('span', '', tag)));
      card.append(tags);
    }

    const meta = makeElement('div', 'card-meta');
    const assignee = makeElement('span', `assignee${member ? '' : ' unassigned'}`);
    const avatar = makeElement('i', 'avatar', member ? member.initials : '?');
    if (member) avatar.style.setProperty('--member-color', member.color);
    assignee.append(avatar, document.createTextNode(member ? member.name : '待分配'));
    meta.append(assignee);
    if (task.dueDate) {
      const due = makeElement('time', `due-date${task.status !== 'done' && task.dueDate < localToday() ? ' is-overdue' : ''}`, `DUE ${shortDate(task.dueDate)}`);
      due.dateTime = task.dueDate;
      meta.append(due);
    }
    card.append(meta);
    return card;
  }

  function createRouteButton(action, text, label, disabled) {
    const button = makeElement('button', 'route-button', text);
    button.type = 'button';
    button.dataset.action = action;
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    return button;
  }

  function renderActivity() {
    dom.activityCount.textContent = state.activity.length;
    dom.activityList.replaceChildren();
    [...state.activity].reverse().forEach((entry) => {
      const item = makeElement('li');
      item.dataset.type = entry.type;
      item.append(makeElement('span', 'activity-icon', ACTIVITY_CODES[entry.type] || '•'));
      const copy = makeElement('div', 'activity-copy');
      copy.append(makeElement('p', '', entry.message));
      const time = makeElement('time', '', formatActivityTime(entry.at));
      time.dateTime = entry.at;
      copy.append(time);
      item.append(copy);
      dom.activityList.append(item);
    });
    if (!state.activity.length) dom.activityList.append(makeElement('li', '', '还没有活动记录。'));
  }

  function hasFilters() {
    return Boolean(filters.query || filters.memberId || filters.priority);
  }

  function setFilters(next) {
    filters = { ...filters, ...next };
    renderMemberFilters();
    renderBoard();
  }

  function openTaskDialog(task, status = 'inbox', trigger = document.activeElement) {
    lastDialogTrigger = trigger;
    dom.taskForm.reset();
    dom.taskFormError.textContent = '';
    dom.taskMember.replaceChildren(new Option('待分配', ''));
    state.members.forEach((member) => dom.taskMember.add(new Option(`${member.name} · ${member.role}`, member.id)));
    const isEditing = Boolean(task);
    dom.taskId.value = task ? task.id : '';
    dom.taskStatus.value = task ? task.status : status;
    dom.taskTitle.value = task ? task.title : '';
    dom.taskDescription.value = task ? task.description : '';
    dom.taskMember.value = task ? task.memberId : '';
    dom.taskPriority.value = task ? task.priority : 'medium';
    dom.taskDueDate.value = task ? task.dueDate : '';
    dom.taskTags.value = task ? task.tags.join(', ') : '';
    dom.dialogEyebrow.textContent = `${isEditing ? 'EDIT CARD' : 'NEW CARD'} / ${STATUS_CODES[dom.taskStatus.value]}`;
    dom.dialogTitle.textContent = isEditing ? '编辑任务' : '新建任务';
    dom.deleteTaskButton.hidden = !isEditing;
    updateDescriptionCounter();
    dom.taskDialog.showModal();
    window.setTimeout(() => dom.taskTitle.focus(), 0);
  }

  function closeTaskDialog() {
    if (dom.taskDialog.open) dom.taskDialog.close();
    if (lastDialogTrigger && document.contains(lastDialogTrigger)) lastDialogTrigger.focus();
  }

  function taskFormValues() {
    return {
      title: dom.taskTitle.value,
      description: dom.taskDescription.value,
      status: dom.taskStatus.value,
      memberId: dom.taskMember.value,
      priority: dom.taskPriority.value,
      dueDate: dom.taskDueDate.value,
      tags: dom.taskTags.value,
    };
  }

  function submitTask(event) {
    event.preventDefault();
    try {
      const id = dom.taskId.value;
      const result = id ? Core.updateTask(state, id, taskFormValues()) : Core.createTask(state, taskFormValues());
      closeTaskDialog();
      applyState(result.state, id ? '任务已保存。' : '任务已加入看板。', result.task.id);
    } catch (error) {
      dom.taskFormError.textContent = error.message;
      dom.taskTitle.focus();
    }
  }

  function moveByStep(taskId, direction) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const currentIndex = Core.STATUSES.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= Core.STATUSES.length) return;
    const targetStatus = Core.STATUSES[nextIndex];
    const result = Core.moveTask(state, taskId, targetStatus, Number.MAX_SAFE_INTEGER);
    applyState(result.state, `「${task.title}」已移动到${Core.STATUS_LABELS[targetStatus]}。`, taskId);
    window.setTimeout(() => $(`.task-card[data-task-id="${CSS.escape(taskId)}"]`)?.focus(), 0);
  }

  function removeDropState() {
    draggedTaskId = '';
    dom.board.classList.remove('is-dragging');
    $$('.task-card.is-dragging', dom.board).forEach((card) => card.classList.remove('is-dragging'));
    $$('.board-column.is-drop-target', dom.board).forEach((column) => column.classList.remove('is-drop-target'));
  }

  function openActivity() {
    dom.activityPanel.hidden = false;
    dom.panelScrim.hidden = false;
    dom.activityButton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    dom.closeActivityButton.focus();
  }

  function closeActivity() {
    dom.activityPanel.hidden = true;
    dom.panelScrim.hidden = true;
    dom.activityButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    dom.activityButton.focus();
  }

  function askConfirmation({ title, message, acceptLabel = '确认', action }) {
    confirmAction = action;
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.acceptConfirmButton.textContent = acceptLabel;
    dom.confirmDialog.showModal();
    dom.cancelConfirmButton.focus();
  }

  function showToast(message, tone = 'normal') {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.dataset.tone = tone;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, 3200);
  }

  function announce(message) {
    dom.liveRegion.textContent = '';
    window.setTimeout(() => { dom.liveRegion.textContent = message; }, 20);
  }

  function updateDescriptionCounter() {
    dom.descriptionCounter.textContent = `${[...dom.taskDescription.value].length} / 300`;
  }

  function exportData() {
    const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rail75-board-${localToday()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    dom.dataTools.open = false;
    showToast('看板 JSON 已导出。');
  }

  async function importData(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    dom.dataTools.open = false;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast('导入文件超过 512 KiB，未覆盖当前看板。', 'error');
      return;
    }
    try {
      const imported = Core.sanitizeState(JSON.parse(await file.text()));
      applyState(imported, `已导入 ${imported.tasks.length} 张任务卡。`);
    } catch (error) {
      showToast(`导入失败：${error.message}`, 'error');
    }
  }

  dom.newTaskButton.addEventListener('click', (event) => openTaskDialog(null, 'inbox', event.currentTarget));
  $$('.column-add').forEach((button) => button.addEventListener('click', (event) => openTaskDialog(null, button.dataset.addStatus, event.currentTarget)));
  dom.taskForm.addEventListener('submit', submitTask);
  dom.taskDescription.addEventListener('input', updateDescriptionCounter);
  dom.closeTaskButton.addEventListener('click', closeTaskDialog);
  dom.cancelTaskButton.addEventListener('click', closeTaskDialog);
  dom.taskDialog.addEventListener('close', () => { dom.taskFormError.textContent = ''; });

  dom.deleteTaskButton.addEventListener('click', () => {
    const task = state.tasks.find((item) => item.id === dom.taskId.value);
    if (!task) return;
    askConfirmation({
      title: '删除这张任务卡？',
      message: `「${task.title}」及其当前排期会从看板移除，活动记录会保留一次删除说明。`,
      acceptLabel: '删除任务',
      action: () => {
        const result = Core.deleteTask(state, task.id);
        closeTaskDialog();
        applyState(result.state, '任务已删除。');
      },
    });
  });

  dom.acceptConfirmButton.addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    dom.confirmDialog.close();
    if (action) action();
  });
  dom.cancelConfirmButton.addEventListener('click', () => { confirmAction = null; dom.confirmDialog.close(); });

  dom.board.addEventListener('click', (event) => {
    const card = event.target.closest('.task-card');
    if (!card) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'previous') return moveByStep(card.dataset.taskId, -1);
    if (action === 'next') return moveByStep(card.dataset.taskId, 1);
    openTaskDialog(state.tasks.find((task) => task.id === card.dataset.taskId), card.dataset.status, card);
  });
  dom.board.addEventListener('keydown', (event) => {
    const card = event.target.closest('.task-card');
    if (!card || event.target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTaskDialog(state.tasks.find((task) => task.id === card.dataset.taskId), card.dataset.status, card);
    }
  });
  dom.board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.task-card');
    if (!card) return;
    draggedTaskId = card.dataset.taskId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedTaskId);
    dom.board.classList.add('is-dragging');
    window.requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  dom.board.addEventListener('dragover', (event) => {
    const list = event.target.closest('.task-list');
    if (!list || !draggedTaskId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    $$('.board-column.is-drop-target', dom.board).forEach((column) => column.classList.remove('is-drop-target'));
    list.closest('.board-column').classList.add('is-drop-target');
  });
  dom.board.addEventListener('drop', (event) => {
    const list = event.target.closest('.task-list');
    const taskId = draggedTaskId || event.dataTransfer.getData('text/plain');
    if (!list || !taskId) return;
    event.preventDefault();
    const targetStatus = list.dataset.status;
    const cards = $$('.task-card', list).filter((card) => card.dataset.taskId !== taskId);
    const beforeIndex = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    const targetIndex = beforeIndex < 0 ? cards.length : beforeIndex;
    const task = state.tasks.find((item) => item.id === taskId);
    try {
      const result = Core.moveTask(state, taskId, targetStatus, targetIndex);
      removeDropState();
      applyState(result.state, `「${task.title}」已移动到${Core.STATUS_LABELS[targetStatus]}。`, taskId);
    } catch (error) {
      removeDropState();
      showToast(error.message, 'error');
    }
  });
  dom.board.addEventListener('dragend', removeDropState);

  dom.searchInput.addEventListener('input', () => setFilters({ query: dom.searchInput.value }));
  dom.priorityFilter.addEventListener('change', () => setFilters({ priority: dom.priorityFilter.value }));
  dom.memberFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-member-id]');
    if (button) setFilters({ memberId: button.dataset.memberId });
  });
  dom.clearFiltersButton.addEventListener('click', () => {
    filters = { query: '', memberId: '', priority: '' };
    dom.searchInput.value = '';
    dom.priorityFilter.value = '';
    renderMemberFilters();
    renderBoard();
    dom.searchInput.focus();
  });

  dom.activityButton.addEventListener('click', openActivity);
  dom.closeActivityButton.addEventListener('click', closeActivity);
  dom.panelScrim.addEventListener('click', closeActivity);
  dom.exportButton.addEventListener('click', exportData);
  dom.importInput.addEventListener('change', importData);
  dom.resetButton.addEventListener('click', () => {
    dom.dataTools.open = false;
    askConfirmation({
      title: '恢复示例看板？',
      message: '当前任务和活动会被城市骑行路线示例替换。需要保留时，请先导出 JSON。',
      acceptLabel: '恢复示例',
      action: () => {
        filters = { query: '', memberId: '', priority: '' };
        dom.searchInput.value = '';
        dom.priorityFilter.value = '';
        applyState(Core.createDefaultState(), '示例看板已恢复。');
      },
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.activityPanel.hidden) closeActivity();
  });

  render();
  if (loadNotice) showToast(loadNotice, 'error');
}());
