(function initBoardCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Room93Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function boardCoreFactory() {
  'use strict';

  const VERSION = 1;
  const DEFAULT_ROOM = 'ROOM-93';
  const OBJECT_TYPES = new Set(['sticky', 'note', 'text', 'shape', 'connector']);
  const COLOR_VALUES = new Set(['yellow', 'blue', 'mint', 'coral', 'paper', 'ink']);
  const SHAPE_VALUES = new Set(['rectangle', 'round', 'pill']);

  const TEMPLATE_DEFINITIONS = [
    {
      id: 'blank',
      name: '空白画布',
      description: '从一个清爽的坐标网格开始',
      accent: 'paper',
      title: '未命名白板',
      objects: [],
    },
    {
      id: 'kickoff',
      name: '项目启动会',
      description: '目标、边界、角色和下一步',
      accent: 'blue',
      title: 'ROOM/93 产品启动会',
      objects: [
        { key: 'title', type: 'note', x: 100, y: 74, width: 360, height: 78, text: 'ROOM/93 · 产品启动会', color: 'ink', fontSize: 25 },
        { key: 'goal', type: 'shape', x: 100, y: 196, width: 280, height: 210, text: '本次会议\n把目标、边界与下一步\n放到同一张图上', color: 'blue', shape: 'round' },
        { key: 'h1', type: 'note', x: 430, y: 190, width: 220, height: 62, text: '我们要解决什么？', color: 'paper', fontSize: 16 },
        { key: 's1', type: 'sticky', x: 430, y: 272, width: 188, height: 146, text: '用户需要在 10 分钟内完成第一次对齐', color: 'yellow' },
        { key: 's2', type: 'sticky', x: 642, y: 272, width: 188, height: 146, text: '不依赖账号或复杂部署，也能现场演示', color: 'mint' },
        { key: 'h2', type: 'note', x: 878, y: 190, width: 220, height: 62, text: '谁负责下一步？', color: 'paper', fontSize: 16 },
        { key: 's3', type: 'sticky', x: 878, y: 272, width: 188, height: 146, text: '林青 · 梳理用户路径\n今天 16:00', color: 'coral' },
        { key: 's4', type: 'sticky', x: 1090, y: 272, width: 188, height: 146, text: '何川 · 整理成功指标\n明天 10:00', color: 'blue' },
        { type: 'connector', fromKey: 'goal', toKey: 's1', color: 'blue' },
        { type: 'connector', fromKey: 's2', toKey: 's3', color: 'coral' },
      ],
    },
    {
      id: 'retro',
      name: '冲刺复盘',
      description: '继续、停止、开始三栏复盘',
      accent: 'coral',
      title: '本周冲刺复盘',
      objects: [
        { key: 'title', type: 'note', x: 110, y: 72, width: 420, height: 78, text: 'SPRINT 08 · 冲刺复盘', color: 'ink', fontSize: 25 },
        { key: 'keep', type: 'shape', x: 110, y: 190, width: 330, height: 500, text: '继续做  /  KEEP', color: 'mint', shape: 'round' },
        { key: 'stop', type: 'shape', x: 474, y: 190, width: 330, height: 500, text: '停止做  /  STOP', color: 'coral', shape: 'round' },
        { key: 'start', type: 'shape', x: 838, y: 190, width: 330, height: 500, text: '开始做  /  START', color: 'blue', shape: 'round' },
        { type: 'sticky', x: 142, y: 278, width: 260, height: 132, text: '评审前先发上下文，会议更聚焦', color: 'yellow' },
        { type: 'sticky', x: 506, y: 278, width: 260, height: 132, text: '不要在最后一天集中合并所有改动', color: 'coral' },
        { type: 'sticky', x: 870, y: 278, width: 260, height: 132, text: '每天记录一个可验证的小交付', color: 'blue' },
      ],
    },
    {
      id: 'journey',
      name: '用户旅程',
      description: '按阶段标记行为、触点与机会',
      accent: 'mint',
      title: '首次使用旅程',
      objects: [
        { type: 'note', x: 90, y: 62, width: 430, height: 80, text: '首次使用旅程 · 从邀请到共识', color: 'ink', fontSize: 25 },
        { type: 'text', x: 90, y: 188, width: 170, height: 64, text: '01\n收到邀请', color: 'paper' },
        { type: 'text', x: 350, y: 188, width: 170, height: 64, text: '02\n理解画布', color: 'paper' },
        { type: 'text', x: 610, y: 188, width: 170, height: 64, text: '03\n加入讨论', color: 'paper' },
        { type: 'text', x: 870, y: 188, width: 170, height: 64, text: '04\n形成结论', color: 'paper' },
        { type: 'sticky', x: 90, y: 290, width: 210, height: 150, text: '想法\n这和我有什么关系？', color: 'yellow' },
        { type: 'sticky', x: 350, y: 290, width: 210, height: 150, text: '行为\n浏览模板与示例内容', color: 'mint' },
        { type: 'sticky', x: 610, y: 290, width: 210, height: 150, text: '触点\n创建便签、拖动、评论', color: 'blue' },
        { type: 'sticky', x: 870, y: 290, width: 210, height: 150, text: '机会\n让导出结论足够简单', color: 'coral' },
      ],
    },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultId(prefix = 'item') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeRoomCode(value) {
    const ascii = String(value || '')
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return ascii || DEFAULT_ROOM;
  }

  function createBoard(options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    return {
      version: VERSION,
      roomId: normalizeRoomCode(options.roomId),
      title: String(options.title || '未命名白板').slice(0, 80),
      templateId: String(options.templateId || 'blank'),
      revision: 0,
      objects: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function createObject(type, overrides = {}, idFactory = defaultId) {
    if (!OBJECT_TYPES.has(type)) throw new Error(`不支持的对象类型：${type}`);
    const base = {
      id: idFactory(type),
      type,
      x: 160,
      y: 140,
      width: 190,
      height: 140,
      text: '',
      color: type === 'sticky' ? 'yellow' : 'paper',
      fontSize: type === 'text' ? 20 : 16,
      rotation: 0,
    };
    if (type === 'note') Object.assign(base, { width: 280, height: 76, fontSize: 22, color: 'ink' });
    if (type === 'text') Object.assign(base, { width: 250, height: 84, color: 'paper' });
    if (type === 'shape') Object.assign(base, { width: 220, height: 130, shape: 'rectangle', color: 'blue' });
    if (type === 'connector') {
      return {
        id: base.id,
        type,
        from: String(overrides.from || ''),
        to: String(overrides.to || ''),
        text: String(overrides.text || '').slice(0, 120),
        color: COLOR_VALUES.has(overrides.color) ? overrides.color : 'ink',
      };
    }
    const result = { ...base, ...overrides, id: base.id, type };
    result.x = finiteOr(result.x, base.x);
    result.y = finiteOr(result.y, base.y);
    result.width = clamp(finiteOr(result.width, base.width), 80, 1000);
    result.height = clamp(finiteOr(result.height, base.height), 52, 800);
    result.fontSize = clamp(finiteOr(result.fontSize, base.fontSize), 12, 42);
    result.rotation = clamp(finiteOr(result.rotation, 0), -12, 12);
    result.text = String(result.text || '').slice(0, 2000);
    result.color = COLOR_VALUES.has(result.color) ? result.color : base.color;
    if (type === 'shape') result.shape = SHAPE_VALUES.has(result.shape) ? result.shape : 'rectangle';
    return result;
  }

  function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function touch(board, objects, now) {
    return {
      ...board,
      objects,
      revision: finiteOr(board.revision, 0) + 1,
      updatedAt: Number.isFinite(now) ? now : Date.now(),
    };
  }

  function addObject(board, object, now) {
    if (!object || !OBJECT_TYPES.has(object.type)) throw new Error('无法添加未知对象');
    if (board.objects.some((item) => item.id === object.id)) throw new Error('对象 ID 已存在');
    return touch(board, [...board.objects, clone(object)], now);
  }

  function updateObject(board, id, patch, now) {
    const index = board.objects.findIndex((item) => item.id === id);
    if (index < 0) return board;
    const previous = board.objects[index];
    const candidate = createObject(previous.type, { ...previous, ...patch }, () => previous.id);
    const objects = board.objects.slice();
    objects[index] = candidate;
    return touch(board, objects, now);
  }

  function duplicateObject(board, id, idFactory = defaultId, now) {
    const original = board.objects.find((item) => item.id === id);
    if (!original || original.type === 'connector') return board;
    const copy = createObject(original.type, {
      ...original,
      x: original.x + 28,
      y: original.y + 28,
      text: original.text,
    }, idFactory);
    return addObject(board, copy, now);
  }

  function removeObject(board, id, now) {
    const objects = board.objects.filter((item) => (
      item.id !== id && !(item.type === 'connector' && (item.from === id || item.to === id))
    ));
    if (objects.length === board.objects.length) return board;
    return touch(board, objects, now);
  }

  function listTemplates() {
    return TEMPLATE_DEFINITIONS.map(({ id, name, description, accent }) => ({ id, name, description, accent }));
  }

  function instantiateTemplate(templateId, options = {}) {
    const definition = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
    if (!definition) throw new Error(`找不到模板：${templateId}`);
    const idFactory = options.idFactory || defaultId;
    let board = createBoard({
      roomId: options.roomId,
      title: options.title || definition.title,
      templateId,
      now: options.now,
    });
    const keyMap = new Map();
    const regularObjects = definition.objects.filter((item) => item.type !== 'connector');
    for (const source of regularObjects) {
      const object = createObject(source.type, source, idFactory);
      if (source.key) keyMap.set(source.key, object.id);
      board.objects.push(object);
    }
    for (const source of definition.objects.filter((item) => item.type === 'connector')) {
      const connector = createObject('connector', {
        ...source,
        from: keyMap.get(source.fromKey) || '',
        to: keyMap.get(source.toKey) || '',
      }, idFactory);
      board.objects.push(connector);
    }
    return board;
  }

  function createHistory(initialBoard, limit = 50) {
    return { past: [], present: clone(initialBoard), future: [], limit: clamp(finiteOr(limit, 50), 1, 200) };
  }

  function commitHistory(history, nextBoard) {
    if (JSON.stringify(history.present) === JSON.stringify(nextBoard)) return history;
    return {
      ...history,
      past: [...history.past, clone(history.present)].slice(-history.limit),
      present: clone(nextBoard),
      future: [],
    };
  }

  function undoHistory(history) {
    if (!history.past.length) return history;
    return {
      ...history,
      past: history.past.slice(0, -1),
      present: clone(history.past[history.past.length - 1]),
      future: [clone(history.present), ...history.future],
    };
  }

  function redoHistory(history) {
    if (!history.future.length) return history;
    return {
      ...history,
      past: [...history.past, clone(history.present)].slice(-history.limit),
      present: clone(history.future[0]),
      future: history.future.slice(1),
    };
  }

  function validateBoard(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '白板数据必须是对象' };
    if (input.version !== VERSION) return { ok: false, error: `不支持的白板版本：${input.version}` };
    if (!Array.isArray(input.objects)) return { ok: false, error: '白板对象列表缺失' };
    if (input.objects.length > 600) return { ok: false, error: '白板对象超过 600 个，无法导入' };
    const seen = new Set();
    for (const object of input.objects) {
      if (!object || typeof object !== 'object') return { ok: false, error: '白板包含无效对象' };
      if (!OBJECT_TYPES.has(object.type)) return { ok: false, error: `不支持的对象类型：${object.type}` };
      if (!object.id || seen.has(object.id)) return { ok: false, error: '对象 ID 缺失或重复' };
      seen.add(object.id);
      if (object.type === 'connector') continue;
      if (![object.x, object.y, object.width, object.height].every((value) => Number.isFinite(Number(value)))) {
        return { ok: false, error: `对象 ${object.id} 的坐标或尺寸无效` };
      }
      if (String(object.text || '').length > 2000) return { ok: false, error: `对象 ${object.id} 的文字过长` };
    }
    return { ok: true };
  }

  function normalizeImportedBoard(input) {
    const now = Date.now();
    return {
      version: VERSION,
      roomId: normalizeRoomCode(input.roomId),
      title: String(input.title || '导入的白板').slice(0, 80),
      templateId: String(input.templateId || 'blank').slice(0, 30),
      revision: Math.max(0, Math.floor(finiteOr(input.revision, 0))),
      createdAt: finiteOr(input.createdAt, now),
      updatedAt: finiteOr(input.updatedAt, now),
      objects: input.objects.map((object) => createObject(object.type, object, () => String(object.id).slice(0, 100))),
    };
  }

  function parseBoardJson(text) {
    let input;
    try {
      input = JSON.parse(String(text));
    } catch (error) {
      throw new Error('文件不是有效的 JSON，请选择 ROOM/93 导出的白板文件');
    }
    const result = validateBoard(input);
    if (!result.ok) throw new Error(result.error);
    return normalizeImportedBoard(input);
  }

  function getContentBounds(objects, padding = 60) {
    const visible = (objects || []).filter((object) => object.type !== 'connector');
    if (!visible.length) return { x: 0, y: 0, width: 1200, height: 760 };
    const safePadding = Math.max(0, finiteOr(padding, 60));
    const left = Math.min(...visible.map((object) => finiteOr(object.x, 0))) - safePadding;
    const top = Math.min(...visible.map((object) => finiteOr(object.y, 0))) - safePadding;
    const right = Math.max(...visible.map((object) => finiteOr(object.x, 0) + finiteOr(object.width, 0))) + safePadding;
    const bottom = Math.max(...visible.map((object) => finiteOr(object.y, 0) + finiteOr(object.height, 0))) + safePadding;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  return Object.freeze({
    VERSION,
    DEFAULT_ROOM,
    createBoard,
    createObject,
    addObject,
    updateObject,
    duplicateObject,
    removeObject,
    listTemplates,
    instantiateTemplate,
    createHistory,
    commitHistory,
    undoHistory,
    redoHistory,
    validateBoard,
    parseBoardJson,
    getContentBounds,
    normalizeRoomCode,
    clone,
  });
});
