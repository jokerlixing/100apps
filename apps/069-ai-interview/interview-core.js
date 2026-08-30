(function initInterviewCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InterviewCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createInterviewCore() {
  'use strict';

  const ROLES = ['frontend', 'backend', 'product', 'data', 'design', 'operations'];
  const LEVELS = ['junior', 'mid', 'senior'];
  const TYPES = ['comprehensive', 'technical', 'behavioral', 'case'];
  const CATEGORIES = ['intro', 'behavioral', 'role', 'scenario'];
  const DIMENSIONS = ['relevance', 'structure', 'evidence', 'depth'];

  const ROLE_LABELS = Object.freeze({
    frontend: '前端工程师', backend: '后端工程师', product: '产品经理',
    data: '数据分析师', design: '产品设计师', operations: '运营经理',
  });

  const DIMENSION_LABELS = Object.freeze({
    relevance: '切题度', structure: '结构', evidence: '证据', depth: '深度',
  });

  function question(id, role, category, prompt, hint, keywords) {
    return Object.freeze({ id, role, category, prompt, hint, keywords: Object.freeze(keywords) });
  }

  const QUESTION_BANK = Object.freeze([
    question('common-intro-impact', 'all', 'intro', '请用两分钟介绍自己，并说明为什么你现在适合这个岗位。', '不要复述简历；用一条主线连接经历、能力和求职动机。', ['经历', '岗位', '能力', '成果', '动机']),
    question('common-intro-project', 'all', 'intro', '请选择一个最能代表你当前能力的项目，讲清你的角色和影响。', '先给结论，再交代目标、你的行动和可验证结果。', ['项目', '角色', '目标', '行动', '结果']),
    question('common-collaboration', 'all', 'behavioral', '讲一次你与意见不同的同事达成共识的经历。', '说明分歧点、你如何理解对方、如何验证方案。', ['分歧', '沟通', '共识', '行动', '结果']),
    question('common-failure', 'all', 'behavioral', '讲一次结果没有达到预期的经历，你后来改变了什么？', '重点不是失败本身，而是判断、复盘和后续变化。', ['目标', '失败', '原因', '复盘', '改变']),
    question('common-priority', 'all', 'behavioral', '当多个紧急任务同时出现时，你如何决定先做什么？', '给出真实场景、判断标准和你主动沟通的动作。', ['优先级', '影响', '风险', '沟通', '结果']),
    question('common-feedback', 'all', 'behavioral', '说一次你收到尖锐反馈并真正改进行为的经历。', '避免只说“虚心接受”，说明反馈前后的可观察变化。', ['反馈', '原因', '行动', '改变', '结果']),
    question('common-ambiguity', 'all', 'scenario', '如果入职第一周只收到一个模糊目标，你会怎样把它推进成可执行计划？', '从澄清对象、成功标准、风险和第一个验证动作展开。', ['目标', '澄清', '指标', '计划', '风险']),
    question('common-decision', 'all', 'scenario', '时间只够完成理想方案的一半时，你会如何做取舍并承担结果？', '说明保留什么、放弃什么，以及如何让相关方知道风险。', ['取舍', '价值', '风险', '沟通', '结果']),

    question('frontend-performance', 'frontend', 'role', '你如何定位并改善一个首屏加载缓慢的页面？', '说明指标、定位过程、取舍和上线后验证。', ['性能', '指标', '网络', '渲染', '缓存', '结果']),
    question('frontend-architecture', 'frontend', 'role', '面对持续增长的前端项目，你会如何划分模块和状态边界？', '结合一次真实重构，说明边界、依赖与迁移策略。', ['架构', '模块', '状态', '依赖', '重构']),
    question('frontend-accessibility', 'frontend', 'role', '你怎样把可访问性纳入组件开发和验收，而不是上线前补救？', '覆盖语义、键盘、读屏、自动化和团队约束。', ['可访问性', '语义', '键盘', '测试', '组件']),
    question('frontend-quality', 'frontend', 'role', '请设计一套前端质量保障策略，说明不同测试各自防什么问题。', '区分静态检查、单元、集成、端到端和线上监控。', ['测试', '单元', '端到端', '监控', '质量']),
    question('frontend-incident', 'frontend', 'scenario', '线上发布后结算页白屏，但本地无法复现，你会怎样处理前 30 分钟？', '先止损，再取证；说清协作、回滚和复盘。', ['白屏', '监控', '日志', '回滚', '复盘']),
    question('frontend-tradeoff', 'frontend', 'scenario', '设计稿要求高复杂度动效，但性能预算很紧，你会如何推动决策？', '用用户价值和测量数据讨论，而不是只谈实现难度。', ['动效', '性能', '用户', '取舍', '验证']),

    question('backend-reliability', 'backend', 'role', '你会如何设计一个可重试但不能重复扣款的支付接口？', '说明幂等键、状态机、事务边界和异常恢复。', ['幂等', '状态', '事务', '重试', '一致性']),
    question('backend-database', 'backend', 'role', '一次查询从 100 毫秒变成 8 秒，你会如何定位并优化？', '从指标、执行计划、索引、数据分布和验证展开。', ['查询', '指标', '索引', '执行计划', '数据']),
    question('backend-api', 'backend', 'role', '如何设计一个会持续演进且不轻易破坏客户端的 API？', '讨论契约、版本、兼容、错误模型和观测。', ['API', '契约', '版本', '兼容', '错误']),
    question('backend-queue', 'backend', 'role', '什么时候应该引入消息队列，什么时候它反而增加了风险？', '结合吞吐、解耦、一致性和运维成本做判断。', ['队列', '吞吐', '解耦', '一致性', '风险']),
    question('backend-incident', 'backend', 'scenario', '核心接口错误率突然升高但机器负载正常，你如何组织排查？', '先定义影响面，再按最近变化和依赖链缩小范围。', ['错误率', '日志', '依赖', '变更', '回滚']),
    question('backend-scale', 'backend', 'scenario', '流量将在一小时后达到平时十倍，你只能做三项准备，会选什么？', '说明容量依据、降级顺序和业务沟通。', ['流量', '容量', '缓存', '降级', '监控']),

    question('product-discovery', 'product', 'role', '你如何判断一个用户提出的需求值得进入路线图？', '区分表面方案与真实问题，并说明验证成本。', ['用户', '问题', '价值', '验证', '优先级']),
    question('product-metrics', 'product', 'role', '为一个新用户激活流程设计指标体系，你会看哪些信号？', '说明北极星、漏斗、护栏和数据偏差。', ['指标', '激活', '漏斗', '护栏', '数据']),
    question('product-roadmap', 'product', 'role', '资源不足时，你如何让路线图既可信又保留调整空间？', '给出排序标准、承诺层级和变更沟通方式。', ['路线图', '资源', '优先级', '风险', '沟通']),
    question('product-launch', 'product', 'role', '讲一次你从问题定义推进到上线验证的完整产品经历。', '交代决策证据、跨团队动作与结果。', ['问题', '用户', '方案', '上线', '结果']),
    question('product-experiment', 'product', 'scenario', 'A/B 实验显著提升点击却降低长期留存，你会如何决策？', '讨论指标层级、分群、统计可靠性和用户价值。', ['实验', '点击', '留存', '指标', '决策']),
    question('product-stakeholder', 'product', 'scenario', '老板要求两周上线一个你认为方向错误的功能，你会怎么推进？', '先理解目标，再用证据和可逆方案管理分歧。', ['目标', '证据', '风险', '沟通', '验证']),

    question('data-metric', 'data', 'role', '你如何定义一个看似简单但容易被误用的业务指标？', '说明口径、时间窗、分母、边界和验证。', ['指标', '口径', '分母', '数据', '验证']),
    question('data-experiment', 'data', 'role', '请完整解释一次实验分析，从假设到结论需要哪些检查？', '覆盖随机化、样本量、显著性、效应和护栏。', ['实验', '假设', '样本', '显著性', '结论']),
    question('data-quality', 'data', 'role', '当业务方说“这个报表不准”时，你会怎样定位数据质量问题？', '先明确差异，再沿血缘、口径与时间逐层排查。', ['报表', '质量', '口径', '血缘', '验证']),
    question('data-story', 'data', 'role', '如何把复杂分析转化为决策者能采取行动的结论？', '说明受众、结论层级、可视化和限制条件。', ['分析', '结论', '决策', '可视化', '限制']),
    question('data-conflict', 'data', 'scenario', '两个可信看板对同一问题给出相反结论，你会怎么处理？', '不要先选立场；比较定义、来源、时间和偏差。', ['看板', '口径', '来源', '偏差', '结论']),
    question('data-causality', 'data', 'scenario', '销售额上涨与新功能同时发生，负责人要求你证明功能有效，你怎么办？', '区分相关与因果，提出可执行的识别方案。', ['相关', '因果', '实验', '对照', '验证']),

    question('design-research', 'design', 'role', '你如何把模糊的用户反馈转化为可验证的设计问题？', '说明研究证据、问题框架、假设和验证。', ['用户', '研究', '问题', '假设', '验证']),
    question('design-system', 'design', 'role', '你如何判断一个组件应该进入设计系统？', '讨论复用频率、变体边界、无障碍和治理成本。', ['组件', '设计系统', '复用', '规范', '无障碍']),
    question('design-handoff', 'design', 'role', '讲一次你与工程师共同解决设计落地偏差的经历。', '展示如何理解约束、调整方案并守住用户价值。', ['设计', '工程', '约束', '协作', '结果']),
    question('design-critique', 'design', 'role', '你如何组织一次高质量设计评审，让反馈可执行？', '区分目标、原则、偏好和决策记录。', ['评审', '目标', '反馈', '原则', '决策']),
    question('design-accessibility', 'design', 'scenario', '品牌规范与可访问性要求发生冲突时，你会怎样推进？', '说明证据、替代方案、协作对象和验收。', ['品牌', '可访问性', '对比度', '替代', '验证']),
    question('design-deadline', 'design', 'scenario', '研究时间被压缩一半，你如何调整设计过程而不盲猜？', '保留最高风险假设的验证，解释删减依据。', ['研究', '风险', '假设', '取舍', '验证']),

    question('operations-growth', 'operations', 'role', '你如何拆解一次增长目标，并找到最值得先做的杠杆？', '说明人群、漏斗、基线、实验与复盘。', ['增长', '目标', '漏斗', '基线', '实验']),
    question('operations-content', 'operations', 'role', '如何建立一套能持续复用而不是只追热点的内容机制？', '讨论定位、选题、生产、分发和衡量。', ['内容', '用户', '生产', '分发', '指标']),
    question('operations-retention', 'operations', 'role', '活跃用户连续三周下滑，你会如何定位留存问题？', '从分群、生命周期、渠道和产品变化找证据。', ['活跃', '留存', '分群', '渠道', '数据']),
    question('operations-campaign', 'operations', 'role', '讲一次你从策划到复盘的运营活动，重点说明自己的判断。', '交代目标、受众、资源、执行和可量化结果。', ['活动', '目标', '用户', '执行', '结果']),
    question('operations-crisis', 'operations', 'scenario', '活动上线后评论区出现集中负面反馈，你会怎样处理前一小时？', '先识别事实和影响面，再决定回应、止损与升级。', ['反馈', '影响', '回应', '风险', '复盘']),
    question('operations-budget', 'operations', 'scenario', '渠道预算被砍 40%，但目标不变，你会如何重新分配？', '用边际效率和用户质量做取舍，并沟通目标风险。', ['预算', '渠道', '效率', '取舍', '目标']),
  ]);

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function sanitizeText(value, maxLength = 6000) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function parseFocus(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(/[，,、;；\n]+/);
    const seen = new Set();
    const result = [];
    source.forEach((item) => {
      const clean = sanitizeText(item, 40);
      const key = clean.toLocaleLowerCase('zh-CN');
      if (clean && !seen.has(key) && result.length < 8) {
        seen.add(key);
        result.push(clean);
      }
    });
    return result;
  }

  function normalizeConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
      role: ROLES.includes(source.role) ? source.role : 'frontend',
      level: LEVELS.includes(source.level) ? source.level : 'mid',
      type: TYPES.includes(source.type) ? source.type : 'comprehensive',
      questionCount: clamp(source.questionCount == null ? 5 : source.questionCount, 3, 8),
      jobDescription: sanitizeText(source.jobDescription, 2400),
      focus: parseFocus(source.focus),
      aiEnabled: source.aiEnabled === true,
    };
  }

  function hashSeed(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function ordered(pool, seed) {
    return [...pool].sort((a, b) => {
      const left = hashSeed(`${seed}:${a.id}`);
      const right = hashSeed(`${seed}:${b.id}`);
      return left - right || a.id.localeCompare(b.id);
    });
  }

  function cloneQuestion(item) {
    return {
      id: item.id,
      role: item.role,
      category: item.category,
      prompt: item.prompt,
      hint: item.hint,
      keywords: [...item.keywords],
    };
  }

  function buildQuestionPlan(input = {}, seed = 'panel69') {
    const config = normalizeConfig(input);
    const applicable = QUESTION_BANK.filter((item) => item.role === 'all' || item.role === config.role);
    const chosen = [];
    const used = new Set();

    function take(category, preferredRole) {
      let pool = applicable.filter((item) => item.category === category && !used.has(item.id));
      if (preferredRole) {
        const preferred = pool.filter((item) => item.role === preferredRole);
        if (preferred.length) pool = preferred;
      }
      const item = ordered(pool, `${seed}:${chosen.length}:${category}`)[0];
      if (item) {
        used.add(item.id);
        chosen.push(cloneQuestion(item));
      }
    }

    take('intro');
    if (config.type === 'comprehensive') {
      take('behavioral');
      take('role', config.role);
      take('scenario', config.role);
    } else if (config.type === 'technical') {
      while (chosen.length < config.questionCount && applicable.some((item) => item.category === 'role' && !used.has(item.id))) {
        take('role', config.role);
      }
    } else if (config.type === 'behavioral') {
      while (chosen.length < config.questionCount) {
        const before = chosen.length;
        take(chosen.length % 3 === 0 ? 'scenario' : 'behavioral');
        if (chosen.length === before) take('scenario', config.role);
        if (chosen.length === before) break;
      }
    } else if (config.type === 'case') {
      while (chosen.length < config.questionCount) {
        const before = chosen.length;
        take('scenario', config.role);
        if (chosen.length === before) take('role', config.role);
        if (chosen.length === before) break;
      }
    }

    const categoryPreference = config.type === 'technical'
      ? ['role', 'scenario', 'behavioral']
      : config.type === 'behavioral'
        ? ['behavioral', 'scenario', 'role']
        : config.type === 'case'
          ? ['scenario', 'role', 'behavioral']
          : ['role', 'behavioral', 'scenario'];

    while (chosen.length < config.questionCount) {
      const before = chosen.length;
      for (const category of categoryPreference) {
        take(category, category === 'role' || category === 'scenario' ? config.role : undefined);
        if (chosen.length > before) break;
      }
      if (chosen.length === before) break;
    }
    return chosen.slice(0, config.questionCount);
  }

  function countMatches(text, patterns) {
    return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  }

  function scoreAnswer(questionInput = {}, answerInput = '', configInput = {}) {
    const questionItem = questionInput && typeof questionInput === 'object' ? questionInput : {};
    const answer = sanitizeText(answerInput, 6000);
    const config = normalizeConfig(configInput);
    const emptyDimensions = { relevance: 0, structure: 0, evidence: 0, depth: 0 };
    if (answer.length < 4) {
      return {
        score: 0,
        skipped: true,
        dimensions: emptyDimensions,
        strengths: [],
        improvements: ['先写下一个真实经历：当时的目标、你的行动和最后结果。'],
        evidence: ['本题未形成可评分回答'],
        suggestedOutline: ['一句话结论', '具体背景与目标', '你的关键行动', '结果与复盘'],
      };
    }

    const lowered = answer.toLocaleLowerCase('zh-CN');
    const keywords = [...new Set([
      ...(Array.isArray(questionItem.keywords) ? questionItem.keywords : []),
      ...config.focus,
    ].map((item) => sanitizeText(item, 30)).filter(Boolean))].slice(0, 12);
    const keywordHits = keywords.filter((item) => lowered.includes(item.toLocaleLowerCase('zh-CN')));
    const keywordRatio = keywords.length ? keywordHits.length / keywords.length : Math.min(1, answer.length / 120);
    const relevance = clamp(28 + keywordRatio * 72, 0, 100);

    const structurePatterns = [
      /背景|当时|场景|情况|起初/,
      /目标|任务|负责|需要|要求/,
      /我先|我会|我负责|采取|通过|首先|然后|随后|具体做/,
      /结果|最终|上线|提升|降低|完成|因此|复盘/,
    ];
    const structureSignals = countMatches(answer, structurePatterns);
    const sentenceCount = answer.split(/[。！？!?；;]/).filter((item) => item.trim().length >= 4).length;
    const structure = clamp(16 + structureSignals * 18 + Math.min(12, sentenceCount * 3), 0, 100);

    const numberMatches = answer.match(/\d+(?:\.\d+)?\s*(?:%|％|秒|分钟|小时|天|周|个月|年|万|次|人|倍|ms|s)?/gi) || [];
    const comparisonSignals = countMatches(answer, [/从.+到/, /提升|增长|降低|减少|节省|转化|留存/, /基线|目标值|对照|验证/]);
    const evidence = clamp(12 + Math.min(60, numberMatches.length * 16) + comparisonSignals * 10, 0, 100);

    const causalSignals = countMatches(answer, [/因为|所以|因此|导致|原因/, /取舍|权衡|风险|约束/, /监控|验证|复盘|迭代/, /方案|策略|过程|步骤/]);
    const depth = clamp(12 + Math.min(58, answer.length * 0.45) + causalSignals * 9, 0, 100);

    const dimensions = { relevance, structure, evidence, depth };
    const score = clamp(relevance * 0.35 + structure * 0.25 + evidence * 0.2 + depth * 0.2, 0, 100);
    const strengths = [];
    if (relevance >= 68) strengths.push('回答紧扣问题中的关键能力，没有绕开核心。');
    if (structure >= 68) strengths.push('背景、行动和结果之间的结构清楚，便于面试官追问。');
    if (evidence >= 68) strengths.push('使用数字或对比提供了可核验的成果证据。');
    if (depth >= 68) strengths.push('不仅描述做法，也交代了判断过程或验证方式。');
    if (!strengths.length) strengths.push('已经给出可继续打磨的回答起点。');

    const improvements = [];
    if (relevance < 60) improvements.push('先用一句话直接回答问题，再补充最相关的具体经历。');
    if (structure < 60) improvements.push('按“背景与目标—你的行动—结果与复盘”重组过程。');
    if (evidence < 60) improvements.push('补充基线、目标和结果数据，让成果证据更具体。');
    if (depth < 60) improvements.push('解释关键判断、取舍或验证过程，避免只列动作。');
    if (!improvements.length) improvements.push('再补充一个关键取舍，以及如果重来会改变什么。');

    return {
      score,
      skipped: false,
      dimensions,
      strengths: strengths.slice(0, 3),
      improvements: improvements.slice(0, 3),
      evidence: [
        `命中关键词 ${keywordHits.length}/${keywords.length || 0}${keywordHits.length ? `：${keywordHits.slice(0, 5).join('、')}` : ''}`,
        `量化证据 ${numberMatches.length} 处`,
        `结构信号 ${structureSignals}/4`,
        `回答长度 ${answer.length} 字`,
      ],
      suggestedOutline: questionItem.category === 'scenario'
        ? ['明确目标与约束', '给出判断顺序', '说明协作与风险', '定义验证结果']
        : ['一句话结论', '背景与可衡量目标', '你的关键行动与取舍', '结果、证据与复盘'],
    };
  }

  function buildFollowUp(questionItem, evaluation) {
    const result = evaluation && typeof evaluation === 'object' ? evaluation : scoreAnswer(questionItem, '');
    if (result.skipped) return '先选一个最接近的真实经历：当时最需要解决的问题是什么？';
    const dimensions = result.dimensions || {};
    if ((dimensions.evidence || 0) < 60) return '你会用哪个指标或数字验证这次行动确实带来了结果？';
    if ((dimensions.structure || 0) < 60) return '请把你本人最关键的一个行动说得更具体：你先做了什么，为什么？';
    if ((dimensions.relevance || 0) < 60) return '这段经历与题目要求的核心能力，最直接的联系是什么？';
    if ((dimensions.depth || 0) < 65) return '当时最大的约束或风险是什么，你如何处理？';
    return '如果条件不同或再做一次，你会改变哪个取舍，为什么？';
  }

  function average(values) {
    if (!values.length) return 0;
    return clamp(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length, 0, 100);
  }

  function summarizeSession(input = {}) {
    const answers = Array.isArray(input.answers) ? input.answers : [];
    const dimensions = {};
    DIMENSIONS.forEach((key) => {
      dimensions[key] = average(answers.map((item) => item && item.evaluation && item.evaluation.dimensions
        ? item.evaluation.dimensions[key] : 0));
    });
    const score = average(answers.map((item) => item && item.evaluation ? item.evaluation.score : 0));
    const ranked = [...DIMENSIONS].sort((a, b) => dimensions[b] - dimensions[a]);
    const answeredCount = answers.filter((item) => item && !item.skipped && sanitizeText(item.answer, 6000)).length;
    const skippedCount = answers.length - answeredCount;
    const start = Number(input.startedAt) || 0;
    const finish = Number(input.finishedAt) || start;
    const durationSeconds = Math.max(0, Math.round((finish - start) / 1000))
      || answers.reduce((sum, item) => sum + clamp(item && item.durationSeconds, 0, 7200), 0);
    const weakest = ranked[ranked.length - 1] || 'evidence';
    const nextActionByDimension = {
      relevance: '每题开头先用一句话给结论，再选择最贴题的经历。',
      structure: '用 STAR 四句骨架重写本轮最低分回答。',
      evidence: '为三个常用项目准备基线、目标和结果数字。',
      depth: '为每个案例补充一次取舍、风险和验证过程。',
    };
    const label = score >= 82 ? '表达稳定' : score >= 68 ? '可以上场' : score >= 52 ? '需要打磨' : '先补案例';

    return {
      score,
      label,
      dimensions,
      strongestDimension: ranked[0] || 'relevance',
      weakestDimension: weakest,
      totalQuestions: answers.length,
      answeredCount,
      skippedCount,
      durationSeconds,
      nextActions: [
        nextActionByDimension[weakest],
        '24 小时内重答本轮最低分的一题，并把回答控制在两分钟内。',
      ],
      disclaimer: '本结果只用于练习反馈，不代表真实面试评价或录用结果。',
    };
  }

  function cleanStringArray(value, maxItems, maxLength) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => sanitizeText(item, maxLength)).filter(Boolean).slice(0, maxItems);
  }

  function sanitizeAIQuestions(payload, configInput = {}) {
    const config = normalizeConfig(configInput);
    if (!payload || !Array.isArray(payload.questions)) return [];
    const results = [];
    payload.questions.slice(0, config.questionCount).forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const prompt = sanitizeText(item.prompt, 320);
      const hint = sanitizeText(item.hint, 220);
      const category = CATEGORIES.includes(item.category) ? item.category : '';
      const keywords = cleanStringArray(item.keywords, 8, 30);
      if (prompt.length < 8 || !category || keywords.length < 2) return;
      results.push({
        id: `ai-${hashSeed(`${prompt}:${index}`).toString(36)}`,
        role: config.role,
        category,
        prompt,
        hint: hint || '先给结论，再用具体经历和结果支持。',
        keywords,
      });
    });
    return results;
  }

  function sanitizeAIEvaluation(payload) {
    const source = payload && typeof payload === 'object' && payload.evaluation && typeof payload.evaluation === 'object'
      ? payload.evaluation : null;
    if (!source || !Number.isFinite(Number(source.score))) return null;
    const dimensions = {};
    for (const key of DIMENSIONS) {
      if (!source.dimensions || !Number.isFinite(Number(source.dimensions[key]))) return null;
      dimensions[key] = clamp(source.dimensions[key], 0, 100);
    }
    const strengths = cleanStringArray(source.strengths, 3, 180);
    const improvements = cleanStringArray(source.improvements, 3, 180);
    const suggestedOutline = cleanStringArray(source.suggestedOutline, 5, 180);
    const followUp = sanitizeText(source.followUp, 240);
    if (!strengths.length || !improvements.length || !followUp) return null;
    return {
      score: clamp(source.score, 0, 100),
      dimensions,
      strengths,
      improvements,
      followUp,
      suggestedOutline,
    };
  }

  return Object.freeze({
    QUESTION_BANK,
    ROLE_LABELS,
    DIMENSION_LABELS,
    sanitizeText,
    normalizeConfig,
    buildQuestionPlan,
    scoreAnswer,
    buildFollowUp,
    summarizeSession,
    sanitizeAIQuestions,
    sanitizeAIEvaluation,
  });
});
