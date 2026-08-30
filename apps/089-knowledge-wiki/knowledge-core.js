(function attachKnowledgeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KnowledgeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createKnowledgeCore() {
  'use strict';

  const BACKUP_VERSION = 1;
  const MAX_NOTES = 1500;
  const MAX_CONTENT_LENGTH = 250000;

  function asText(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  function titleKey(value) {
    return asText(value).trim().normalize('NFKC').toLocaleLowerCase();
  }

  function escapeHtml(value) {
    return asText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTags(value) {
    const source = Array.isArray(value) ? value : asText(value).split(/[,，]/);
    const seen = new Set();
    const tags = [];

    for (const item of source) {
      const tag = asText(item).trim().replace(/^#+/, '').slice(0, 30);
      const key = titleKey(tag);
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length === 12) break;
    }
    return tags;
  }

  function validDate(value, fallback) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createNote(input = {}, options = {}) {
    const now = validDate(options.now || new Date().toISOString(), new Date().toISOString());
    const title = asText(input.title).trim().slice(0, 120) || '未命名笔记';
    return {
      id: asText(options.id || input.id).trim() || createId(),
      title,
      content: asText(input.content).slice(0, MAX_CONTENT_LENGTH),
      tags: normalizeTags(input.tags),
      createdAt: validDate(input.createdAt, now),
      updatedAt: validDate(input.updatedAt, now),
    };
  }

  function cloneNote(note) {
    return { ...note, tags: [...(note.tags || [])] };
  }

  function extractWikiLinks(content) {
    const links = [];
    const seen = new Set();
    const pattern = /\[\[([^\[\]\n]{1,120})\]\]/g;
    let match;
    while ((match = pattern.exec(asText(content)))) {
      const label = match[1].trim();
      const key = titleKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      links.push(label);
    }
    return links;
  }

  function replaceWikiTitle(content, oldTitle, newTitle) {
    const oldKey = titleKey(oldTitle);
    if (!oldKey) return asText(content);
    return asText(content).replace(/\[\[([^\[\]\n]{1,120})\]\]/g, (whole, label) =>
      titleKey(label) === oldKey ? `[[${newTitle}]]` : whole,
    );
  }

  function renameNote(notes, noteId, nextTitle, now = new Date().toISOString()) {
    const title = asText(nextTitle).trim().slice(0, 120);
    if (!title) throw new Error('笔记标题不能为空');

    const current = notes.find((note) => note.id === noteId);
    if (!current) throw new Error('找不到要重命名的笔记');
    const duplicate = notes.some((note) => note.id !== noteId && titleKey(note.title) === titleKey(title));
    if (duplicate) throw new Error('已有同名笔记，请使用不同标题');

    const stamp = validDate(now, new Date().toISOString());
    return notes.map((note) => {
      const cloned = cloneNote(note);
      if (note.id === noteId) {
        cloned.title = title;
        cloned.updatedAt = stamp;
      }
      const content = replaceWikiTitle(cloned.content, current.title, title);
      if (content !== cloned.content) {
        cloned.content = content;
        cloned.updatedAt = stamp;
      }
      return cloned;
    });
  }

  function searchNotes(notes, query = '', tag = '') {
    const terms = titleKey(query).split(/\s+/).filter(Boolean);
    const tagFilter = titleKey(tag);

    return notes
      .filter((note) => !tagFilter || (note.tags || []).some((item) => titleKey(item) === tagFilter))
      .map((note) => {
        const title = titleKey(note.title);
        const content = titleKey(note.content);
        const tags = titleKey((note.tags || []).join(' '));
        let score = 0;
        for (const term of terms) {
          if (!title.includes(term) && !content.includes(term) && !tags.includes(term)) return null;
          if (title === term) score += 160;
          else if (title.includes(term)) score += 100;
          if (tags.includes(term)) score += 45;
          if (content.includes(term)) score += 20;
        }
        return { note, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || Date.parse(b.note.updatedAt) - Date.parse(a.note.updatedAt))
      .map(({ note }) => note);
  }

  function getBacklinks(notes, targetNote) {
    const target = titleKey(targetNote && targetNote.title);
    if (!target) return [];
    return notes
      .filter((note) => extractWikiLinks(note.content).some((link) => titleKey(link) === target))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  function getOutgoingLinks(notes, sourceNote) {
    const byTitle = new Map(notes.map((note) => [titleKey(note.title), note]));
    return extractWikiLinks(sourceNote && sourceNote.content).map((title) => ({
      title,
      note: byTitle.get(titleKey(title)) || null,
      missing: !byTitle.has(titleKey(title)),
    }));
  }

  function buildGraph(notes) {
    const byTitle = new Map(notes.map((note) => [titleKey(note.title), note]));
    const missingByTitle = new Map();
    const nodes = notes.map((note) => ({
      id: note.id,
      label: note.title,
      missing: false,
      tags: [...(note.tags || [])],
      updatedAt: note.updatedAt,
    }));
    const links = [];

    for (const note of notes) {
      for (const linkTitle of extractWikiLinks(note.content)) {
        const resolved = byTitle.get(titleKey(linkTitle));
        let targetId;
        if (resolved) {
          targetId = resolved.id;
        } else {
          const key = titleKey(linkTitle);
          if (!missingByTitle.has(key)) {
            const missing = { id: `missing:${encodeURIComponent(key)}`, label: linkTitle, missing: true, tags: [] };
            missingByTitle.set(key, missing);
            nodes.push(missing);
          }
          targetId = missingByTitle.get(key).id;
        }
        links.push({ source: note.id, target: targetId });
      }
    }
    return { nodes, links };
  }

  function renderInline(source) {
    const tokens = [];
    const hold = (html) => {
      const token = `\uE000${tokens.length}\uE001`;
      tokens.push(html);
      return token;
    };

    let text = asText(source);
    text = text.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
    text = text.replace(/\[\[([^\[\]\n]{1,120})\]\]/g, (_, label) => {
      const title = label.trim();
      if (!title) return '';
      return hold(
        `<button type="button" class="wiki-link" data-note-title="${escapeHtml(title)}">${escapeHtml(title)}</button>`,
      );
    });
    text = text.replace(/\[([^\]\n]+)\]\(([^\s)]+(?:\?[^\s)]*)?)\)/g, (_, label, url) => {
      if (!/^https?:\/\//i.test(url)) return escapeHtml(label);
      return hold(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
      );
    });

    text = escapeHtml(text)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return text.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || '');
  }

  function renderMarkdown(content) {
    const lines = asText(content).replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let list = '';
    let code = null;

    const closeList = () => {
      if (list) output.push(`</${list}>`);
      list = '';
    };

    for (const line of lines) {
      const fence = line.match(/^```\s*([\w-]*)\s*$/);
      if (fence) {
        if (code) {
          output.push(`<pre><code${code.language ? ` data-language="${escapeHtml(code.language)}"` : ''}>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
          code = null;
        } else {
          closeList();
          code = { language: fence[1], lines: [] };
        }
        continue;
      }
      if (code) {
        code.lines.push(line);
        continue;
      }

      if (!line.trim()) {
        closeList();
        continue;
      }

      const unordered = line.match(/^\s*[-*]\s+(.+)/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)/);
      if (unordered || ordered) {
        const nextList = unordered ? 'ul' : 'ol';
        if (list !== nextList) {
          closeList();
          list = nextList;
          output.push(`<${list}>`);
        }
        output.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
        continue;
      }

      closeList();
      const heading = line.match(/^(#{1,3})\s+(.+)/);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      } else if (/^\s*---+\s*$/.test(line)) {
        output.push('<hr>');
      } else if (/^>\s?/.test(line)) {
        output.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
      } else {
        output.push(`<p>${renderInline(line)}</p>`);
      }
    }

    closeList();
    if (code) output.push(`<pre><code>${escapeHtml(code.lines.join('\n'))}</code></pre>`);
    return output.join('\n');
  }

  function normalizeImportedNote(input, index, now) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`第 ${index + 1} 则笔记格式不正确`);
    }
    const title = asText(input.title).trim().slice(0, 120);
    if (!title) throw new Error(`第 ${index + 1} 则笔记缺少标题`);
    const content = asText(input.content);
    if (content.length > MAX_CONTENT_LENGTH) throw new Error(`“${title}”正文过长`);
    return createNote(
      { ...input, title, content },
      { id: asText(input.id).trim() || `imported-${index + 1}`, now },
    );
  }

  function importBackup(raw) {
    let payload;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_error) {
      throw new Error('无法解析备份文件，请选择 LOOM/89 导出的 JSON');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('备份内容格式不正确');
    }
    if (payload.version !== BACKUP_VERSION) throw new Error('备份版本不受支持');
    if (!Array.isArray(payload.notes) || payload.notes.length === 0) throw new Error('备份至少包含一则笔记');
    if (payload.notes.length > MAX_NOTES) throw new Error(`备份不能超过 ${MAX_NOTES} 则笔记`);

    const now = new Date().toISOString();
    const imported = payload.notes.map((note, index) => normalizeImportedNote(note, index, now));
    const ids = new Set();
    const titles = new Set();
    for (const note of imported) {
      if (ids.has(note.id)) throw new Error('备份包含重复的笔记 ID');
      if (titles.has(titleKey(note.title))) throw new Error(`备份包含同名笔记：“${note.title}”`);
      ids.add(note.id);
      titles.add(titleKey(note.title));
    }
    return { version: BACKUP_VERSION, notes: imported };
  }

  function exportBackup(notes, exportedAt = new Date().toISOString()) {
    return JSON.stringify(
      {
        app: 'LOOM/89',
        version: BACKUP_VERSION,
        exportedAt: validDate(exportedAt, new Date().toISOString()),
        notes: notes.map(cloneNote),
      },
      null,
      2,
    );
  }

  function createUniqueTitle(notes, base = '未命名笔记') {
    const used = new Set(notes.map((note) => titleKey(note.title)));
    if (!used.has(titleKey(base))) return base;
    let suffix = 2;
    while (used.has(titleKey(`${base} ${suffix}`))) suffix += 1;
    return `${base} ${suffix}`;
  }

  return Object.freeze({
    BACKUP_VERSION,
    buildGraph,
    createNote,
    createUniqueTitle,
    escapeHtml,
    exportBackup,
    extractWikiLinks,
    getBacklinks,
    getOutgoingLinks,
    importBackup,
    normalizeTags,
    renameNote,
    renderMarkdown,
    replaceWikiTitle,
    searchNotes,
    titleKey,
  });
});
