(function createPortfolioCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PortfolioCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function portfolioCoreFactory() {
  'use strict';

  const MAX_PROJECTS = 100;
  const DEFAULT_FEATURED_IDS = [62, 68, 72, 78, 80, 52, 60, 40, 37];

  function cleanText(value, maxLength = 260) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function clampLevel(value) {
    const level = Number.parseInt(value, 10);
    if (!Number.isFinite(level)) return 1;
    return Math.min(5, Math.max(1, level));
  }

  function safeLink(value) {
    const candidate = cleanText(value, 500);
    if (!candidate) return '';
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function normalizeProjects(ideas, officialDoneIds = new Set()) {
    if (!Array.isArray(ideas)) throw new TypeError('Project catalog must be an array');
    const doneIds = officialDoneIds instanceof Set ? officialDoneIds : new Set(officialDoneIds || []);

    return ideas.slice(0, MAX_PROJECTS).map((idea, index) => {
      const row = Array.isArray(idea) ? idea : [];
      const id = index + 1;
      return Object.freeze({
        id,
        code: String(id).padStart(3, '0'),
        name: cleanText(row[0], 100) || `App ${String(id).padStart(3, '0')}`,
        description: cleanText(row[1], 280) || '项目说明待补充',
        level: clampLevel(row[2]),
        link: safeLink(row[3]),
        status: doneIds.has(id) ? 'done' : 'todo',
      });
    });
  }

  function parseTrackerSource(source) {
    const text = String(source || '');
    const catalogMatch = text.match(/const\s+IDEAS\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!catalogMatch) throw new Error('Project catalog was not found in tracker source');

    let ideas;
    try {
      ideas = JSON.parse(catalogMatch[1]);
    } catch (error) {
      throw new Error(`Project catalog is not valid JSON: ${error.message}`);
    }

    const officialMatch = text.match(/const\s+INIT_DONE\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!officialMatch) throw new Error('Official completion state was not found in tracker source');

    const doneIds = new Set();
    const pairPattern = /(?:^|,)\s*["']?(\d{1,3})["']?\s*:\s*(?:1|true|["']done["'])\s*(?=,|$)/gi;
    let pair;
    while ((pair = pairPattern.exec(officialMatch[1]))) {
      const id = Number(pair[1]);
      if (id >= 1 && id <= MAX_PROJECTS) doneIds.add(id);
    }
    const assignmentPattern = /\bINIT_DONE\s*\[\s*["']?(\d{1,3})["']?\s*\]\s*=\s*(?:1|true|["']done["'])\s*;/gi;
    while ((pair = assignmentPattern.exec(text))) {
      const id = Number(pair[1]);
      if (id >= 1 && id <= MAX_PROJECTS) doneIds.add(id);
    }
    return normalizeProjects(ideas, doneIds);
  }

  function filterProjects(projects, filters = {}) {
    const query = cleanText(filters.query, 120).toLocaleLowerCase('zh-CN');
    const requestedLevel = filters.level == null ? 'all' : String(filters.level);
    const requestedStatus = filters.status == null ? 'all' : String(filters.status);

    return (Array.isArray(projects) ? projects : []).filter((project) => {
      const haystack = `${project.code} ${project.name} ${project.description}`.toLocaleLowerCase('zh-CN');
      const matchesQuery = !query || haystack.includes(query);
      const matchesLevel = requestedLevel === 'all' || String(project.level) === requestedLevel;
      const matchesStatus = requestedStatus === 'all' || project.status === requestedStatus;
      return matchesQuery && matchesLevel && matchesStatus;
    });
  }

  function summarizeProjects(projects) {
    const source = Array.isArray(projects) ? projects : [];
    const levels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let done = 0;
    let linked = 0;
    source.forEach((project) => {
      if (project.status === 'done') done += 1;
      if (project.link) linked += 1;
      if (levels[project.level] != null) levels[project.level] += 1;
    });
    return {
      total: source.length,
      done,
      linked,
      percent: source.length ? Math.round((done / source.length) * 100) : 0,
      levels,
    };
  }

  function pickFeaturedProjects(projects, preferredIds = DEFAULT_FEATURED_IDS, limit = 3) {
    const source = Array.isArray(projects) ? projects : [];
    const amount = Math.max(0, Number.parseInt(limit, 10) || 0);
    const preferred = Array.isArray(preferredIds) ? preferredIds : DEFAULT_FEATURED_IDS;
    const selected = [];
    const selectedIds = new Set();
    const eligible = (project) => project && project.status === 'done' && Boolean(project.link);

    preferred.forEach((id) => {
      const project = source.find((item) => item.id === Number(id));
      if (eligible(project) && !selectedIds.has(project.id) && selected.length < amount) {
        selected.push(project);
        selectedIds.add(project.id);
      }
    });
    source.forEach((project) => {
      if (eligible(project) && !selectedIds.has(project.id) && selected.length < amount) {
        selected.push(project);
        selectedIds.add(project.id);
      }
    });
    return selected;
  }

  return Object.freeze({
    MAX_PROJECTS,
    DEFAULT_FEATURED_IDS,
    cleanText,
    safeLink,
    normalizeProjects,
    parseTrackerSource,
    filterProjects,
    summarizeProjects,
    pickFeaturedProjects,
  });
});
