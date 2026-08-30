(function attachNoteCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NoteCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNoteCore() {
  'use strict';

  const VERSION = 1;
  const DEFAULT_COLOR = 'yellow';
  const COLORS = Object.freeze(['yellow', 'blue', 'mint', 'coral', 'lilac']);
  const TITLE_LIMIT = 80;
  const BODY_LIMIT = 20000;
  let fallbackSequence = 0;

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    fallbackSequence += 1;
    return `note-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
  }

  function text(value, limit, trim) {
    const result = value == null ? '' : String(value).slice(0, limit);
    return trim ? result.trim() : result;
  }

  function timestamp(value, fallback) {
    const candidate = value == null ? '' : String(value);
    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function normalizeNote(input, options) {
    const source = input && typeof input === 'object' ? input : {};
    const settings = options && typeof options === 'object' ? options : {};
    const now = timestamp(settings.now, new Date().toISOString());
    const createdAt = timestamp(source.createdAt, now);
    const updatedAt = timestamp(source.updatedAt, createdAt);
    const title = text(source.title, TITLE_LIMIT, true) || '无标题便签';
    const color = COLORS.includes(source.color) ? source.color : DEFAULT_COLOR;

    return {
      id: text(settings.id || source.id, 120, true) || makeId(),
      title,
      body: text(source.body, BODY_LIMIT, false),
      color,
      pinned: source.pinned === true,
      archived: source.archived === true,
      createdAt,
      updatedAt,
    };
  }

  function createNote(input, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const now = timestamp(settings.now, new Date().toISOString());
    return normalizeNote({ ...(input || {}), createdAt: now, updatedAt: now }, { ...settings, now });
  }

  function updateNote(note, patch, nowValue) {
    const original = normalizeNote(note);
    const changes = patch && typeof patch === 'object' ? patch : {};
    const allowed = {};
    for (const key of ['title', 'body', 'color', 'pinned', 'archived']) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) allowed[key] = changes[key];
    }
    const now = timestamp(nowValue, new Date().toISOString());
    return normalizeNote({
      ...original,
      ...allowed,
      id: original.id,
      createdAt: original.createdAt,
      updatedAt: now,
    }, { id: original.id, now });
  }

  function duplicateNote(note, options) {
    const original = normalizeNote(note);
    const settings = options && typeof options === 'object' ? options : {};
    const suffix = ' · 副本';
    const baseTitle = original.title.slice(0, Math.max(1, TITLE_LIMIT - suffix.length));
    return createNote({
      title: `${baseTitle}${suffix}`,
      body: original.body,
      color: original.color,
      pinned: false,
      archived: false,
    }, settings);
  }

  function filterNotes(notes, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const query = text(settings.query, 200, true).toLocaleLowerCase('zh-CN');
    const scope = ['active', 'pinned', 'archived', 'all'].includes(settings.scope)
      ? settings.scope
      : 'active';

    return (Array.isArray(notes) ? notes : [])
      .map((note) => normalizeNote(note))
      .filter((note) => {
        if (scope === 'active' && note.archived) return false;
        if (scope === 'pinned' && (note.archived || !note.pinned)) return false;
        if (scope === 'archived' && !note.archived) return false;
        if (!query) return true;
        return `${note.title}\n${note.body}`.toLocaleLowerCase('zh-CN').includes(query);
      })
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const timeDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return timeDifference || left.title.localeCompare(right.title, 'zh-CN');
      });
  }

  function exportNotebook(notes, exportedAtValue) {
    const exportedAt = timestamp(exportedAtValue, new Date().toISOString());
    const normalized = (Array.isArray(notes) ? notes : []).map((note) => normalizeNote(note));
    return JSON.stringify({ version: VERSION, exportedAt, notes: normalized }, null, 2);
  }

  function importNotebook(json, options) {
    let payload;
    try {
      payload = JSON.parse(String(json));
    } catch (error) {
      throw new Error('备份文件不是有效的 JSON');
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.notes)) {
      throw new Error('备份文件结构不正确');
    }
    if (payload.version !== VERSION) {
      throw new Error(`不支持的备份版本：${payload.version ?? '未知'}`);
    }

    const settings = options && typeof options === 'object' ? options : {};
    const now = timestamp(settings.now, new Date().toISOString());
    const seen = new Set();
    return payload.notes.slice(0, 500).map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('备份文件包含无效便签');
      }
      const note = normalizeNote(entry, { now });
      if (seen.has(note.id)) note.id = makeId();
      seen.add(note.id);
      return note;
    });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_COLOR,
    COLORS,
    createNote,
    normalizeNote,
    updateNote,
    duplicateNote,
    filterNotes,
    exportNotebook,
    importNotebook,
  });
});
