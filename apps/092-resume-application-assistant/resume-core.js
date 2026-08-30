(function initResumeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ResumeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createResumeCore() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STATUS_VALUES = new Set(['draft', 'ready', 'applied', 'interview', 'offer', 'closed']);
  const KEYWORDS = [
    ['B2B', ['b2b', 'to b']],
    ['B2C', ['b2c', 'to c']],
    ['SaaS', ['saas']],
    ['SQL', ['sql']],
    ['Python', ['python']],
    ['JavaScript', ['javascript', 'js']],
    ['TypeScript', ['typescript', 'ts']],
    ['React', ['react']],
    ['Vue', ['vue']],
    ['Node.js', ['node.js', 'nodejs']],
    ['A/B 测试', ['a/b 测试', 'ab 测试', 'a/b test', 'ab test']],
    ['产品策略', ['产品策略', 'product strategy']],
    ['用户研究', ['用户研究', '用户调研', 'user research']],
    ['数据分析', ['数据分析', 'data analysis', 'analytics']],
    ['团队管理', ['团队管理', '带领团队', 'people management']],
    ['项目管理', ['项目管理', 'project management']],
    ['需求分析', ['需求分析', 'requirements analysis']],
    ['增长策略', ['增长策略', '增长实验', 'growth strategy']],
    ['商业分析', ['商业分析', 'business analysis']],
    ['竞品分析', ['竞品分析', 'competitive analysis']],
    ['路线图', ['路线图', 'roadmap']],
    ['原型设计', ['原型设计', 'prototyping']],
    ['交互设计', ['交互设计', 'interaction design']],
    ['用户体验', ['用户体验', 'user experience', 'ux']],
    ['Figma', ['figma']],
    ['Axure', ['axure']],
    ['Tableau', ['tableau']],
    ['Power BI', ['power bi', 'powerbi']],
    ['Excel', ['excel']],
    ['机器学习', ['机器学习', 'machine learning']],
    ['人工智能', ['人工智能', 'ai']],
    ['自然语言处理', ['自然语言处理', 'nlp']],
    ['敏捷开发', ['敏捷开发', 'agile']],
    ['Scrum', ['scrum']],
    ['OKR', ['okr']],
    ['KPI', ['kpi']],
    ['CRM', ['crm']],
    ['ERP', ['erp']],
    ['电商', ['电商', 'e-commerce', 'ecommerce']],
    ['内容运营', ['内容运营']],
    ['用户运营', ['用户运营']],
    ['活动运营', ['活动运营']],
    ['渠道运营', ['渠道运营']],
    ['品牌营销', ['品牌营销', 'brand marketing']],
    ['SEO', ['seo']],
    ['SEM', ['sem']],
    ['沟通协作', ['沟通协作', '跨部门协作', 'stakeholder management']],
    ['英语', ['英语', 'english']],
  ];

  function clean(value, maximum = 10_000) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').trim().slice(0, maximum);
  }

  function compact(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const item = clean(value, 240);
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  function toList(value) {
    if (Array.isArray(value)) return compact(value);
    return compact(clean(value).split(/[，,；;\n]+/));
  }

  function toBullets(value) {
    if (Array.isArray(value)) return compact(value);
    return compact(clean(value).split(/\n+/));
  }

  function makeId(prefix = 'item') {
    const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return `${prefix}-${cryptoObject.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeExperience(value = {}, index = 0) {
    return {
      id: clean(value.id, 120) || `experience-${index + 1}`,
      role: clean(value.role, 160),
      company: clean(value.company, 160),
      period: clean(value.period, 120),
      bullets: toBullets(value.bullets).slice(0, 12),
    };
  }

  function normalizeProject(value = {}, index = 0) {
    return {
      id: clean(value.id, 120) || `project-${index + 1}`,
      name: clean(value.name, 180),
      role: clean(value.role, 160),
      bullets: toBullets(value.bullets).slice(0, 12),
      tags: toList(value.tags).slice(0, 20),
    };
  }

  function normalizeProfile(value = {}) {
    const experiences = Array.isArray(value.experiences) ? value.experiences : [];
    const projects = Array.isArray(value.projects) ? value.projects : [];
    return {
      name: clean(value.name, 120),
      headline: clean(value.headline, 180),
      email: clean(value.email, 180),
      phone: clean(value.phone, 80),
      location: clean(value.location, 120),
      website: clean(value.website, 240),
      summary: clean(value.summary, 2_000),
      skills: toList(value.skills).slice(0, 40),
      education: clean(value.education, 600),
      experiences: experiences.slice(0, 12).map(normalizeExperience),
      projects: projects.slice(0, 12).map(normalizeProject),
    };
  }

  function includesTerm(text, aliases) {
    const haystack = ` ${clean(text).toLocaleLowerCase()} `;
    return aliases.some((alias) => {
      const needle = clean(alias).toLocaleLowerCase();
      if (!needle) return false;
      if (/^[a-z0-9.+#/ -]+$/i.test(needle)) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
      }
      return haystack.includes(needle);
    });
  }

  function extractKeywords(text, hints = []) {
    const source = clean(text);
    if (!source) return [];
    const result = [];
    for (const [name, aliases] of KEYWORDS) {
      if (includesTerm(source, [name, ...aliases])) result.push(name);
    }
    for (const hint of compact(Array.isArray(hints) ? hints : toList(hints))) {
      if (includesTerm(source, [hint])) result.push(hint);
    }
    return compact(result);
  }

  function profileText(profile) {
    return [
      profile.headline,
      profile.summary,
      profile.education,
      ...profile.skills,
      ...profile.experiences.flatMap((item) => [item.role, item.company, ...item.bullets]),
      ...profile.projects.flatMap((item) => [item.name, item.role, ...item.tags, ...item.bullets]),
    ].join('\n');
  }

  function scoreProfile(value, jobText) {
    const profile = normalizeProfile(value);
    const keywords = extractKeywords(jobText, profile.skills);
    const evidence = profileText(profile);
    const matched = keywords.filter((keyword) => includesTerm(evidence, [keyword]));
    const missing = keywords.filter((keyword) => !matched.includes(keyword));
    return {
      score: keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0,
      total: keywords.length,
      keywords,
      matched,
      missing,
    };
  }

  function relevance(item, matched) {
    const text = Object.values(item).flatMap((value) => Array.isArray(value) ? value : [value]).join('\n');
    return matched.reduce((total, keyword) => total + (includesTerm(text, [keyword]) ? 1 : 0), 0);
  }

  function rank(items, matched) {
    return items
      .map((item, index) => ({ item, index, relevance: relevance(item, matched) }))
      .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
      .map(({ item }) => item);
  }

  function generateVersion(value, target = {}, options = {}) {
    const profile = normalizeProfile(value);
    const role = clean(target.role, 180);
    if (!role) throw new Error('请先填写岗位名称。');
    if (!profile.name || (!profile.summary && !profile.experiences.length && !profile.projects.length)) {
      throw new Error('母版资料不足，请至少填写姓名和一段简介、经历或项目。');
    }
    const company = clean(target.company, 180);
    const jobText = clean(target.jobText, 12_000);
    const result = scoreProfile(profile, jobText);
    const matchedSet = new Set(result.matched.map((keyword) => keyword.toLocaleLowerCase()));
    const skills = [...profile.skills].sort((a, b) => {
      const aMatched = matchedSet.has(a.toLocaleLowerCase()) ? 1 : 0;
      const bMatched = matchedSet.has(b.toLocaleLowerCase()) ? 1 : 0;
      return bMatched - aMatched;
    });
    const now = clean(options.now, 80) || new Date().toISOString();
    return {
      id: clean(options.id, 160) || makeId('version'),
      title: clean(target.title, 220) || [company, role].filter(Boolean).join(' · '),
      company,
      role,
      status: STATUS_VALUES.has(target.status) ? target.status : 'draft',
      jobText,
      score: result.score,
      keywords: result.keywords,
      matchedKeywords: result.matched,
      missingKeywords: result.missing,
      profile: {
        ...profile,
        skills,
        experiences: rank(profile.experiences, result.matched),
        projects: rank(profile.projects, result.matched),
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  function recutVersion(version, profile, options = {}) {
    const next = generateVersion(profile, {
      company: version.company,
      role: version.role,
      jobText: version.jobText,
      title: version.title,
      status: version.status,
    }, { id: version.id, now: options.now });
    return {
      ...next,
      createdAt: clean(version.createdAt, 80) || next.createdAt,
    };
  }

  function resumeToText(version = {}) {
    const profile = normalizeProfile(version.profile || {});
    const contact = [profile.email, profile.phone, profile.location, profile.website].filter(Boolean).join(' · ');
    const lines = [profile.name, profile.headline, contact, '', '个人简介', profile.summary, '', '核心技能', profile.skills.join(' · ')];
    if (profile.experiences.length) {
      lines.push('', '工作经历');
      profile.experiences.forEach((item) => {
        lines.push(`${item.role}${item.company ? ` · ${item.company}` : ''}${item.period ? ` · ${item.period}` : ''}`);
        item.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
      });
    }
    if (profile.projects.length) {
      lines.push('', '项目经历');
      profile.projects.forEach((item) => {
        lines.push(`${item.name}${item.role ? ` · ${item.role}` : ''}`);
        item.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
      });
    }
    if (profile.education) lines.push('', '教育经历', profile.education);
    return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n').trim();
  }

  function normalizeVersion(value = {}, index = 0) {
    const profile = normalizeProfile(value.profile || {});
    const keywords = compact(Array.isArray(value.keywords) ? value.keywords : []);
    const matchedKeywords = compact(Array.isArray(value.matchedKeywords) ? value.matchedKeywords : []);
    const missingKeywords = compact(Array.isArray(value.missingKeywords) ? value.missingKeywords : []);
    const score = Number(value.score);
    return {
      id: clean(value.id, 160) || `version-${index + 1}`,
      title: clean(value.title, 220),
      company: clean(value.company, 180),
      role: clean(value.role, 180),
      status: STATUS_VALUES.has(value.status) ? value.status : 'draft',
      jobText: clean(value.jobText, 12_000),
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      keywords,
      matchedKeywords,
      missingKeywords,
      profile,
      createdAt: clean(value.createdAt, 80),
      updatedAt: clean(value.updatedAt, 80),
    };
  }

  function normalizeWorkspace(value = {}) {
    const profile = normalizeProfile(value.profile || {});
    const versions = Array.isArray(value.versions) ? value.versions.slice(0, 50).map(normalizeVersion) : [];
    const requestedActive = clean(value.activeVersionId, 160);
    return {
      schemaVersion: SCHEMA_VERSION,
      profile,
      versions,
      activeVersionId: versions.some((version) => version.id === requestedActive) ? requestedActive : (versions[0]?.id || ''),
    };
  }

  function exportWorkspace(workspace, now = new Date().toISOString()) {
    return JSON.stringify({ ...normalizeWorkspace(workspace), exportedAt: clean(now, 80) }, null, 2);
  }

  function importWorkspace(json) {
    let parsed;
    try {
      parsed = JSON.parse(String(json));
    } catch {
      throw new Error('备份文件不是有效的 JSON。');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('备份文件结构不正确。');
    if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('备份版本不受支持。');
    if (!parsed.profile || typeof parsed.profile !== 'object' || !Array.isArray(parsed.versions)) {
      throw new Error('备份文件缺少母版或版本列表。');
    }
    return normalizeWorkspace(parsed);
  }

  return {
    SCHEMA_VERSION,
    STATUS_VALUES: [...STATUS_VALUES],
    normalizeProfile,
    normalizeWorkspace,
    extractKeywords,
    scoreProfile,
    generateVersion,
    recutVersion,
    resumeToText,
    exportWorkspace,
    importWorkspace,
  };
});
