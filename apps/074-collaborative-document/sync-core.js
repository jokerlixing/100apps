(function attachGalleyCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createGalleyCore() {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const LIMITS = Object.freeze({
    room: 24,
    name: 32,
    title: 120,
    content: 120000,
    comments: 200,
    commentText: 1000,
    quote: 280,
    history: 16,
  });

  const UNSAFE_CONTENT = /<\s*\/?\s*(?:script|iframe|object|embed|style|link|meta|svg|math)\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=\s*["']?\s*(?:javascript|data)\s*:/i;
  const SAFE_ID = /^[a-zA-Z0-9_-]{1,80}$/;

  function compactSpaces(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function clip(value, limit) {
    return String(value == null ? '' : value).slice(0, limit);
  }

  function normalizeRoom(value) {
    const room = String(value == null ? '' : value)
      .normalize('NFKD')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, LIMITS.room);
    return room || 'GALLEY-74';
  }

  function normalizeName(value) {
    return clip(compactSpaces(value), LIMITS.name) || '匿名校对员';
  }

  function safeIso(value, fallback) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function cloneComments(comments) {
    return comments.map((comment) => ({ ...comment }));
  }

  function welcomeContent() {
    return '<h1>一起编辑这份校样</h1><p>这是 GALLEY/74 的共享文档。修改标题或正文后，内容会自动保存并同步给同一房间里的其他成员。</p><h2>交稿清单</h2><ul><li>补齐发布日期和负责人</li><li>选中文字后添加批注</li><li>分享房间链接，请同伴打开</li></ul><blockquote>静态页面使用本机多标签页协作；启动 WebSocket 服务后可跨设备编辑。</blockquote>';
  }

  function createInitialState(room, now = new Date().toISOString()) {
    const timestamp = safeIso(now, new Date().toISOString());
    return {
      room: normalizeRoom(room),
      revision: 0,
      title: '协作发布稿',
      content: welcomeContent(),
      comments: [],
      updatedAt: timestamp,
      updatedBy: '',
      history: [],
    };
  }

  function validateComment(raw, index) {
    if (!raw || typeof raw !== 'object') return { ok: false, code: 'invalid_comment', index };
    const id = String(raw.id || '');
    const text = clip(compactSpaces(raw.text), LIMITS.commentText);
    if (!SAFE_ID.test(id) || !text) return { ok: false, code: 'invalid_comment', index };
    const createdAt = safeIso(raw.createdAt, '');
    if (!createdAt) return { ok: false, code: 'invalid_comment', index };
    const comment = {
      id,
      text,
      quote: clip(compactSpaces(raw.quote), LIMITS.quote),
      author: normalizeName(raw.author),
      createdAt,
      resolved: Boolean(raw.resolved),
    };
    if (comment.resolved && raw.resolvedAt) comment.resolvedAt = safeIso(raw.resolvedAt, createdAt);
    return { ok: true, value: comment };
  }

  function validateDocumentInput(input) {
    if (!input || typeof input !== 'object') return { ok: false, code: 'invalid_document' };
    const title = clip(compactSpaces(input.title), LIMITS.title) || '未命名文档';
    const content = String(input.content == null ? '' : input.content);
    if (content.length > LIMITS.content) return { ok: false, code: 'content_too_large' };
    if (UNSAFE_CONTENT.test(content)) return { ok: false, code: 'unsafe_content' };
    if (!Array.isArray(input.comments) || input.comments.length > LIMITS.comments) {
      return { ok: false, code: 'invalid_comments' };
    }
    const comments = [];
    for (let index = 0; index < input.comments.length; index += 1) {
      const checked = validateComment(input.comments[index], index);
      if (!checked.ok) return checked;
      comments.push(checked.value);
    }
    return { ok: true, value: { title, content, comments } };
  }

  function snapshotVersion(state) {
    return {
      revision: state.revision,
      title: state.title,
      content: state.content,
      comments: cloneComments(state.comments),
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
    };
  }

  function conflict(state) {
    return { ok: false, code: 'revision_conflict', state };
  }

  function applyDocumentUpdate(state, input, actor = {}, now = new Date().toISOString()) {
    const baseRevision = Number(input && input.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision !== state.revision) return conflict(state);
    const checked = validateDocumentInput(input);
    if (!checked.ok) return checked;
    const history = [...state.history, snapshotVersion(state)].slice(-LIMITS.history);
    return {
      ok: true,
      state: {
        ...state,
        revision: state.revision + 1,
        ...checked.value,
        updatedAt: safeIso(now, new Date().toISOString()),
        updatedBy: normalizeName(actor.name),
        history,
      },
    };
  }

  function restoreVersion(state, input, actor = {}, now = new Date().toISOString()) {
    const baseRevision = Number(input && input.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision !== state.revision) return conflict(state);
    const targetRevision = Number(input && input.targetRevision);
    const target = state.history.find((version) => version.revision === targetRevision);
    if (!target) return { ok: false, code: 'version_not_found', state };
    return applyDocumentUpdate(state, {
      baseRevision,
      title: target.title,
      content: target.content,
      comments: target.comments,
    }, actor, now);
  }

  function deleteDocument(state, input, actor = {}, now = new Date().toISOString()) {
    const baseRevision = Number(input && input.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision !== state.revision) return conflict(state);
    return {
      ok: true,
      state: {
        ...state,
        revision: state.revision + 1,
        title: '未命名文档',
        content: '',
        comments: [],
        updatedAt: safeIso(now, new Date().toISOString()),
        updatedBy: normalizeName(actor.name),
        history: [],
      },
    };
  }

  function toClientState(state) {
    return {
      room: state.room,
      revision: state.revision,
      title: state.title,
      content: state.content,
      comments: cloneComments(state.comments),
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
      versions: state.history.map((version) => ({
        revision: version.revision,
        title: version.title,
        updatedAt: version.updatedAt,
        updatedBy: version.updatedBy,
      })).reverse(),
    };
  }

  return {
    PROTOCOL_VERSION,
    LIMITS,
    normalizeRoom,
    normalizeName,
    createInitialState,
    validateDocumentInput,
    applyDocumentUpdate,
    restoreVersion,
    deleteDocument,
    toClientState,
  };
}));
