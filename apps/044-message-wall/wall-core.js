(function createPost44Core() {
  "use strict";

  const TEXT_LIMIT = 120;
  const AUTHOR_LIMIT = 18;
  const MAX_NOTES = 80;
  const COLORS = ["#f26b5b", "#194b68", "#3d8b7f", "#9a6fb0", "#d89132"];
  const ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;

  function cleanText(value) {
    if (typeof value !== "string") return null;
    const text = value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text && text.length <= TEXT_LIMIT ? text : null;
  }

  function cleanAuthor(value) {
    if (typeof value !== "string") return "匿名投递员";
    const author = value
      .replace(/[<>\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, AUTHOR_LIMIT);
    return author || "匿名投递员";
  }

  function cleanColor(value) {
    const color = String(value || "").toLowerCase();
    return COLORS.includes(color) ? color : COLORS[0];
  }

  function finiteTime(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeNote(input) {
    if (!input || !ID_PATTERN.test(String(input.id || ""))) return null;
    const text = cleanText(input.text);
    if (!text) return null;
    const createdAt = finiteTime(input.createdAt, Date.now());
    const updatedAt = Math.max(createdAt, finiteTime(input.updatedAt, createdAt));
    const likes = Math.min(999999, Math.max(0, Math.trunc(Number(input.likes) || 0)));
    const ownerId = ID_PATTERN.test(String(input.ownerId || "")) ? String(input.ownerId) : "";
    return {
      id: String(input.id),
      text,
      author: cleanAuthor(input.author),
      color: cleanColor(input.color),
      createdAt,
      updatedAt,
      likes,
      likedByMe: Boolean(input.likedByMe),
      ownerId,
      seed: Boolean(input.seed),
    };
  }

  function newestFirst(a, b) {
    return b.createdAt - a.createdAt || b.id.localeCompare(a.id);
  }

  function mergeNotes(current, incoming, max = MAX_NOTES) {
    const notes = new Map();
    for (const raw of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const note = normalizeNote(raw);
      if (!note) continue;
      const previous = notes.get(note.id);
      if (!previous || note.updatedAt > previous.updatedAt || (note.updatedAt === previous.updatedAt && note.likes > previous.likes)) {
        notes.set(note.id, note);
      }
    }
    return [...notes.values()].sort(newestFirst).slice(0, Math.max(1, Number(max) || MAX_NOTES));
  }

  function toggleLike(raw, now = Date.now()) {
    const note = normalizeNote(raw);
    if (!note) return null;
    const likedByMe = !note.likedByMe;
    return {
      ...note,
      likedByMe,
      likes: Math.max(0, note.likes + (likedByMe ? 1 : -1)),
      updatedAt: Math.max(note.updatedAt + 1, finiteTime(now, Date.now())),
    };
  }

  function filterNotes(rawNotes, filter = "all", ownerId = "") {
    const notes = mergeNotes([], rawNotes, MAX_NOTES);
    if (filter === "popular") {
      return notes
        .filter((note) => note.likes >= 3)
        .sort((a, b) => b.likes - a.likes || newestFirst(a, b));
    }
    if (filter === "mine") return notes.filter((note) => note.ownerId && note.ownerId === ownerId);
    return notes;
  }

  function stats(rawNotes) {
    const notes = mergeNotes([], rawNotes, MAX_NOTES);
    return {
      notes: notes.length,
      likes: notes.reduce((total, note) => total + note.likes, 0),
      popular: notes.filter((note) => note.likes >= 3).length,
    };
  }

  const api = {
    TEXT_LIMIT,
    AUTHOR_LIMIT,
    MAX_NOTES,
    COLORS,
    cleanText,
    cleanAuthor,
    cleanColor,
    normalizeNote,
    mergeNotes,
    toggleLike,
    filterNotes,
    stats,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window === "object") window.Post44Core = api;
})();
