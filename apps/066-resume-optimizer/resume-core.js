(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ResumeCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEYWORDS = [
    ['用户增长', ['用户增长', 'growth']],
    ['数据分析', ['数据分析', 'data analysis', 'analytics']],
    ['A/B 测试', ['a/b 测试', 'a/b test', 'ab test']],
    ['跨团队协作', ['跨团队协作', '跨部门协作', 'cross-functional']],
    ['项目管理', ['项目管理', 'project management']],
    ['产品策略', ['产品策略', 'product strategy']],
    ['用户研究', ['用户研究', 'user research']],
    ['需求分析', ['需求分析', 'requirements analysis']],
    ['内容运营', ['内容运营', 'content operations']],
    ['活动运营', ['活动运营', 'campaign operations']],
    ['商业分析', ['商业分析', 'business analysis']],
    ['机器学习', ['机器学习', 'machine learning']],
    ['自然语言处理', ['自然语言处理', 'nlp']],
    ['生成式 AI', ['生成式 ai', 'generative ai', 'llm', '大模型']],
    ['TypeScript', ['typescript']],
    ['JavaScript', ['javascript']],
    ['React', ['react']],
    ['Vue', ['vue', 'vue.js']],
    ['Node.js', ['node.js', 'nodejs']],
    ['Python', ['python']],
    ['Java', ['java']],
    ['Go', ['golang']],
    ['SQL', ['sql']],
    ['Excel', ['excel']],
    ['Tableau', ['tableau']],
    ['Power BI', ['power bi']],
    ['Figma', ['figma']],
    ['Git', ['git']],
    ['Docker', ['docker']],
    ['Kubernetes', ['kubernetes', 'k8s']],
    ['AWS', ['aws']],
    ['Scrum', ['scrum']],
    ['敏捷开发', ['敏捷开发', 'agile']],
    ['转化率', ['转化率', 'conversion rate']],
    ['留存率', ['留存率', 'retention']],
    ['GMV', ['gmv']],
    ['ROI', ['roi']],
    ['SEO', ['seo']],
  ];

  const ENGLISH_STOP_WORDS = new Set([
    'and', 'the', 'with', 'for', 'from', 'that', 'this', 'will', 'have', 'has',
    'are', 'you', 'your', 'our', 'into', 'using', 'work', 'role', 'team', '负责',
  ]);
  const WEAK_VERBS = ['负责', '参与', '协助', '相关工作', '日常工作', '跟进', '配合', '处理'];
  const ACTION_VERBS = [
    '主导', '设计', '重构', '搭建', '推动', '制定', '优化', '实现', '交付', '建立',
    '增长', '降低', '提升', '缩短', '完成', 'launch', 'led', 'built', 'designed',
    'improved', 'increased', 'reduced', 'delivered', 'created', 'optimized',
  ];
  const SECTION_RULES = [
    ['experience', /^(工作|实习|职业)?经历|experience|employment|work history/i],
    ['projects', /^项目(经历|经验)?|projects?/i],
    ['skills', /^(专业)?技能|skills?|tech(?:nical)? stack/i],
    ['education', /^教育(经历|背景)?|education/i],
    ['summary', /^(个人)?(简介|总结|优势)|summary|profile|objective/i],
    ['awards', /^奖项|荣誉|证书|awards?|certifications?/i],
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f]/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[\t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let index = 0;
    while ((index = haystack.indexOf(needle, index)) !== -1) {
      count += 1;
      index += needle.length;
    }
    return count;
  }

  function extractKeywords(value, limit = 18) {
    const text = normalizeText(value);
    const lower = text.toLocaleLowerCase('en-US');
    const ranked = [];
    KEYWORDS.forEach(([canonical, aliases]) => {
      let count = 0;
      let first = Infinity;
      aliases.forEach((alias) => {
        const normalizedAlias = alias.toLocaleLowerCase('en-US');
        count += countOccurrences(lower, normalizedAlias);
        const index = lower.indexOf(normalizedAlias);
        if (index >= 0) first = Math.min(first, index);
      });
      if (count) ranked.push({ keyword: canonical, count, first, known: true });
    });

    const knownAliases = new Set(KEYWORDS.flatMap(([, aliases]) => aliases.map((alias) => alias.toLocaleLowerCase('en-US'))));
    const tokens = lower.match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
    tokens.forEach((token, index) => {
      if (ENGLISH_STOP_WORDS.has(token) || knownAliases.has(token)) return;
      const current = ranked.find((item) => item.keyword.toLocaleLowerCase('en-US') === token);
      if (current) current.count += 1;
      else ranked.push({ keyword: token, count: 1, first: text.toLocaleLowerCase('en-US').indexOf(token), known: false, tokenIndex: index });
    });

    return ranked
      .sort((a, b) => b.count - a.count || a.first - b.first || Number(b.known) - Number(a.known))
      .slice(0, clamp(Number(limit) || 18, 1, 40))
      .map((item) => item.keyword);
  }

  function sectionKey(line) {
    const candidate = line.replace(/^[#\s]+|[:：\s]+$/g, '').trim();
    const match = SECTION_RULES.find(([, pattern]) => pattern.test(candidate));
    return match ? match[0] : '';
  }

  function splitResume(value) {
    const text = normalizeText(value);
    const lines = text ? text.split('\n') : [];
    const sections = [];
    const bullets = [];
    let current = { key: 'header', title: '基本信息', lines: [] };
    sections.push(current);

    lines.forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) return;
      const key = sectionKey(line);
      if (key) {
        current = { key, title: line.replace(/[:：]$/, ''), lines: [] };
        sections.push(current);
        return;
      }
      current.lines.push(line);
      const marker = line.match(/^(?:[-*•·▪◦]|\d+[.)、])\s*(.+)$/);
      const plainExperience = ['experience', 'projects'].includes(current.key) && line.length >= 12 && !/^(\d{4}|至今|present)/i.test(line);
      if (marker || plainExperience) {
        const bulletText = normalizeText(marker ? marker[1] : line);
        if (bulletText.length >= 4) bullets.push({
          id: `evidence-${bullets.length + 1}`,
          text: bulletText,
          section: current.key,
          line: lineIndex + 1,
        });
      }
    });

    return {
      text,
      sections: sections.filter((section) => section.lines.length || section.key !== 'header'),
      bullets,
      presentSections: [...new Set(sections.filter((section) => section.lines.length && section.key !== 'header').map((section) => section.key))],
    };
  }

  function includesKeyword(text, keyword) {
    return text.toLocaleLowerCase('en-US').includes(String(keyword).toLocaleLowerCase('en-US'));
  }

  function analyzeBullet(value, keywords = []) {
    const text = normalizeText(value);
    const hasMetric = /(?:\d[\d,.]*\s*(?:%|％|万|千|百|亿|人|个|次|天|小时|分钟|元|美元|条|家|款|倍|ms|s|x))|(?:从\s*\d[^，。;；]*?(?:到|至|提升至|降至)\s*\d)|(?:\d+\s*(?:->|→)\s*\d+)/i.test(text);
    const weakVerbs = WEAK_VERBS.filter((word) => includesKeyword(text, word));
    const hasAction = ACTION_VERBS.some((word) => includesKeyword(text.slice(0, 16), word));
    const matchedKeywords = keywords.filter((keyword) => includesKeyword(text, keyword));
    const issues = [];
    if (!hasMetric) issues.push({ code: 'missing-metric', label: '缺少可验证结果', detail: '补充规模、效率、增长、成本或质量变化；没有可靠数字时不要编造。' });
    if (weakVerbs.length) issues.push({ code: 'weak-verb', label: '职责词过重', detail: `“${weakVerbs[0]}”没有说明你实际推动了什么，改用具体动作开头。` });
    if (!matchedKeywords.length && keywords.length) issues.push({ code: 'missing-keyword', label: '岗位语言不足', detail: '在事实成立的前提下，使用目标岗位中的准确能力词。' });
    if (text.length < 12) issues.push({ code: 'too-short', label: '信息不足', detail: '说明动作、对象、方法与结果。' });
    if (text.length > 110) issues.push({ code: 'too-long', label: '句子过长', detail: '保留一个核心成果，把背景信息拆到下一条。' });

    let strength = 0;
    strength += hasMetric ? 35 : 0;
    strength += hasAction ? 20 : 0;
    strength += matchedKeywords.length ? Math.min(20, 10 + matchedKeywords.length * 5) : 0;
    strength += text.length >= 16 && text.length <= 90 ? 15 : text.length >= 10 ? 8 : 0;
    strength += weakVerbs.length ? 0 : 10;

    return {
      text,
      hasMetric,
      hasAction,
      weakVerbs,
      matchedKeywords,
      strength: Math.round(clamp(strength, 0, 100)),
      issues,
    };
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function analyzeResume(resumeValue, jobValue) {
    const resume = splitResume(resumeValue);
    const jobText = normalizeText(jobValue);
    const keywords = extractKeywords(jobText, 18);
    const matchedKeywords = keywords.filter((keyword) => includesKeyword(resume.text, keyword));
    const missingKeywords = keywords.filter((keyword) => !matchedKeywords.includes(keyword));
    const bullets = resume.bullets.map((bullet) => ({ ...bullet, ...analyzeBullet(bullet.text, keywords) }));

    const match = keywords.length ? Math.round((matchedKeywords.length / keywords.length) * 100) : 35;
    const evidence = bullets.length ? Math.round(average(bullets.map((bullet) => bullet.hasMetric ? 100 : 28))) : 0;
    const clarity = bullets.length ? Math.round(average(bullets.map((bullet) => bullet.strength))) : 15;
    const structuralKeys = ['experience', 'skills', 'education', 'summary'];
    const sectionPoints = structuralKeys.filter((key) => resume.presentSections.includes(key)).length;
    const structure = Math.round(clamp(sectionPoints * 22 + (resume.text.length >= 180 ? 12 : 0), 0, 100));
    const scores = { match, evidence, clarity, structure };
    const score = Math.round(clamp(match * 0.36 + evidence * 0.30 + clarity * 0.18 + structure * 0.16, 0, 100));
    const issueCount = bullets.reduce((sum, bullet) => sum + bullet.issues.length, 0);
    let summary = '已有基本素材，先补齐岗位关键词与成果证据。';
    if (!bullets.length) summary = '未识别到可分析的经历条目，请在工作或项目经历中使用短横线列出成果。';
    else if (score >= 80) summary = '岗位语言与成果证据较完整，优先精修最弱的两条经历。';
    else if (score >= 60) summary = '方向已对齐，但仍有经历缺少量化结果或岗位语言。';

    return {
      score,
      scores,
      summary,
      keywords,
      matchedKeywords,
      missingKeywords,
      bullets,
      issueCount,
      sections: resume.sections,
      presentSections: resume.presentSections,
      stats: {
        characters: resume.text.length,
        bullets: bullets.length,
        quantified: bullets.filter((bullet) => bullet.hasMetric).length,
        matched: matchedKeywords.length,
        totalKeywords: keywords.length,
      },
    };
  }

  function validateEndpoint(value) {
    const raw = String(value || '').trim();
    let url;
    try { url = new URL(raw); } catch { throw new Error('请输入完整的接口地址。'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('接口地址仅支持 HTTP(S)。');
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) throw new Error('远程接口必须使用 HTTPS。');
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  function cleanPromptValue(value, maxLength) {
    return normalizeText(value).replace(/[<>]/g, '').slice(0, maxLength);
  }

  function buildAiRequest(options = {}) {
    const model = cleanPromptValue(options.model || '', 120);
    if (!model) throw new Error('请输入模型名称。');
    const bullet = cleanPromptValue(options.bullet || '', 500);
    if (!bullet) throw new Error('请选择要改写的经历。');
    const jobText = cleanPromptValue(options.jobText || '', 1200);
    const matched = (options.matchedKeywords || []).slice(0, 8).join('、') || '暂无';
    const missing = (options.missingKeywords || []).slice(0, 8).join('、') || '暂无';
    return {
      model,
      stream: false,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content: '你是严格的中文简历编辑。只基于用户提供的事实改写，不编造数字、公司、职责或技术；信息不足处使用【待补充】。只输出一条改写后的简历经历，不解释。',
        },
        {
          role: 'user',
          content: `原经历：${bullet}\n已覆盖关键词：${matched}\n建议补充关键词：${missing}\n目标岗位：${jobText || '未提供'}\n请用“动作 + 对象/方法 + 可验证结果”的结构改写，控制在 70 个汉字左右。`,
        },
      ],
    };
  }

  function createLocalRewrite(value, keywords = []) {
    const text = normalizeText(value).replace(/^(负责|参与|协助|配合|跟进)\s*/, '');
    const keyword = keywords.find((item) => !includesKeyword(text, item)) || keywords[0] || '目标岗位能力';
    const action = text || '核心工作';
    const ending = /\d/.test(action) ? '' : '；结果：【待补充可验证指标】';
    return `围绕${keyword}，推动${action}${ending}`.replace(/[；;]{2,}/g, '；');
  }

  return {
    normalizeText,
    extractKeywords,
    splitResume,
    analyzeBullet,
    analyzeResume,
    validateEndpoint,
    buildAiRequest,
    createLocalRewrite,
  };
}));
