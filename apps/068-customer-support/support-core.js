(function exposeSupportCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SupportCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSupportCore() {
  'use strict';

  const MAX_QUESTION_LENGTH = 120;
  const VALID_INTENTS = Object.freeze([
    'order', 'shipping', 'return', 'refund', 'payment',
    'invoice', 'account', 'product', 'coupon', 'contact',
  ]);

  const INTENT_LABELS = Object.freeze({
    order: '订单处理',
    shipping: '物流配送',
    return: '退换货',
    refund: '退款进度',
    payment: '支付问题',
    invoice: '发票服务',
    account: '账户安全',
    product: '商品咨询',
    coupon: '优惠活动',
    contact: '人工服务',
    unknown: '待确认',
  });

  const INTENT_TERMS = Object.freeze({
    order: Object.freeze(['订单', '下单', '订单号', '修改订单', '取消订单', '购买记录', 'order', 'purchase']),
    shipping: Object.freeze(['物流', '快递', '发货', '配送', '送到', '到货', '运单', 'shipping', 'delivery', 'courier']),
    return: Object.freeze(['退货', '换货', '不要了', '尺码不合', '七天无理由', 'return', 'exchange']),
    refund: Object.freeze(['退款', '退钱', '到账', '原路退回', 'refund', 'money back']),
    payment: Object.freeze(['支付', '付款', '扣款', '信用卡', '支付宝', '微信支付', 'payment', 'charged']),
    invoice: Object.freeze(['发票', '抬头', '税号', '开票', 'invoice', 'receipt']),
    account: Object.freeze(['登录', '账号', '账户', '密码', '验证码', '注册', 'account', 'password', 'login']),
    product: Object.freeze(['商品', '尺寸', '尺码', '材质', '库存', '保质期', '颜色', 'product', 'size', 'stock']),
    coupon: Object.freeze(['优惠券', '折扣', '活动', '满减', '促销', 'coupon', 'discount', 'promotion']),
    contact: Object.freeze(['人工', '客服', '联系', '电话', '投诉', '建议', 'human', 'agent', 'support']),
  });

  function stripMarkup(value) {
    return String(value == null ? '' : value)
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plain(value, maximum) {
    return stripMarkup(value).slice(0, maximum);
  }

  function normalizeText(value) {
    return plain(value, MAX_QUESTION_LENGTH * 3)
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_QUESTION_LENGTH);
  }

  function uniquePlainArray(value, maximumItems, maximumLength) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
      const cleaned = plain(item, maximumLength);
      const key = normalizeText(cleaned);
      if (!cleaned || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
      if (result.length >= maximumItems) break;
    }
    return result;
  }

  function tokenize(value) {
    const normalized = normalizeText(value);
    if (!normalized) return [];
    const tokens = [];
    const seen = new Set();
    const add = (token) => {
      if (token.length < 2 || seen.has(token)) return;
      seen.add(token);
      tokens.push(token);
    };

    normalized.split(' ').forEach((segment) => {
      if (!segment) return;
      const english = segment.match(/[a-z0-9]+/g) || [];
      english.forEach(add);
      const chineseRuns = segment.match(/[\p{Script=Han}]+/gu) || [];
      chineseRuns.forEach((run) => {
        if (run.length <= 4) add(run);
        for (let size = 2; size <= Math.min(4, run.length); size += 1) {
          for (let index = 0; index <= run.length - size; index += 1) add(run.slice(index, index + size));
        }
      });
    });
    return tokens.slice(0, 80);
  }

  function safeId(value, fallback) {
    const candidate = stripMarkup(value)
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 48);
    return candidate || fallback;
  }

  function sanitizeFaq(value, index) {
    if (!value || typeof value !== 'object') return null;
    const question = plain(value.question, 180);
    const answer = plain(value.answer, 1200);
    if (!question || !answer) return null;
    const position = Number.isFinite(index) ? index : 0;
    const intent = VALID_INTENTS.includes(value.intent) ? value.intent : 'contact';
    const sanitized = {
      id: safeId(value.id, `faq-${position + 1}`),
      intent,
      question,
      answer,
      keywords: uniquePlainArray(value.keywords, 12, 40),
      aliases: uniquePlainArray(value.aliases, 8, 80),
      suggestedReplies: uniquePlainArray(value.suggestedReplies, 3, 80),
      enabled: value.enabled !== false,
      custom: value.custom === true,
    };
    return sanitized;
  }

  function freezeFaq(faq) {
    return Object.freeze({
      ...faq,
      keywords: Object.freeze([...faq.keywords]),
      aliases: Object.freeze([...faq.aliases]),
      suggestedReplies: Object.freeze([...faq.suggestedReplies]),
    });
  }

  function normalizeKnowledgeBase(value) {
    if (!Array.isArray(value)) return [];
    const usedIds = new Set();
    const result = [];
    for (let index = 0; index < value.length && result.length < 40; index += 1) {
      const faq = sanitizeFaq(value[index], index);
      if (!faq) continue;
      const baseId = faq.id;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`.slice(0, 48);
        suffix += 1;
      }
      usedIds.add(id);
      result.push(freezeFaq({ ...faq, id }));
    }
    return result;
  }

  function classifyIntent(question) {
    const normalized = normalizeText(question);
    if (!normalized) return Object.freeze({ intent: 'unknown', confidence: 0, score: 0, matchedTerms: Object.freeze([]) });
    let bestIntent = 'unknown';
    let bestScore = 0;
    let bestTerms = [];
    VALID_INTENTS.forEach((intent) => {
      const matches = INTENT_TERMS[intent].filter((term) => normalized.includes(normalizeText(term)));
      const score = matches.reduce((sum, term) => sum + (normalizeText(term).length >= 4 ? 2 : 1), 0);
      if (score > bestScore) {
        bestIntent = intent;
        bestScore = score;
        bestTerms = matches;
      }
    });
    if (!bestScore) return Object.freeze({ intent: 'unknown', confidence: 0.12, score: 0, matchedTerms: Object.freeze([]) });
    const confidence = Math.min(0.96, 0.48 + (bestScore * 0.11));
    return Object.freeze({
      intent: bestIntent,
      confidence,
      score: bestScore,
      matchedTerms: Object.freeze([...bestTerms]),
    });
  }

  function overlappingTokens(questionTokens, candidate) {
    const candidateSet = new Set(tokenize(candidate));
    return questionTokens.filter((token) => candidateSet.has(token));
  }

  function rankFaqs(question, knowledgeBase) {
    const normalizedQuestion = normalizeText(question);
    if (!normalizedQuestion) return [];
    const classification = classifyIntent(normalizedQuestion);
    const questionTokens = tokenize(normalizedQuestion);
    const faqs = normalizeKnowledgeBase(knowledgeBase);
    return faqs
      .map((faq, index) => {
        if (!faq.enabled) return null;
        let score = classification.intent === faq.intent ? 4 : 0;
        const matches = [];
        const normalizedFaqQuestion = normalizeText(faq.question);
        if (normalizedFaqQuestion === normalizedQuestion) {
          score += 12;
          matches.push(faq.question);
        } else if (normalizedQuestion.length >= 3 && (normalizedFaqQuestion.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedFaqQuestion))) {
          score += 5;
          matches.push(faq.question);
        }
        faq.aliases.forEach((alias) => {
          const normalizedAlias = normalizeText(alias);
          if (normalizedAlias && (normalizedQuestion.includes(normalizedAlias) || normalizedAlias.includes(normalizedQuestion))) {
            score += 7;
            matches.push(alias);
          }
        });
        faq.keywords.forEach((keyword) => {
          const normalizedKeyword = normalizeText(keyword);
          if (normalizedKeyword && normalizedQuestion.includes(normalizedKeyword)) {
            score += 6;
            matches.push(keyword);
          }
        });
        const questionOverlap = overlappingTokens(questionTokens, faq.question);
        const answerOverlap = overlappingTokens(questionTokens, faq.answer);
        score += Math.min(4, questionOverlap.length * 0.45);
        score += Math.min(2, answerOverlap.length * 0.16);
        return Object.freeze({
          faq,
          score: Number(score.toFixed(2)),
          matches: Object.freeze([...new Set(matches)].slice(0, 5)),
          index,
        });
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.index - right.index);
  }

  function fallbackReply(empty) {
    return Object.freeze({
      intent: 'unknown',
      confidence: empty ? 0 : 0.18,
      faqIds: Object.freeze([]),
      answer: empty
        ? '请告诉我具体问题，例如“退款多久能到账”或“怎么查询物流”。'
        : '这条问题暂时没有匹配到可靠知识卡。我已为你保留人工接管入口，客服可以继续确认细节。',
      suggestedReplies: Object.freeze(['查询物流', '退款进度', '联系人工客服']),
      needsHandoff: true,
      routingReason: empty ? '等待问题' : '知识库没有可靠匹配',
      source: 'local',
    });
  }

  function routeQuestion(question, knowledgeBase) {
    const normalizedQuestion = normalizeText(question);
    if (!normalizedQuestion) return fallbackReply(true);
    const classification = classifyIntent(normalizedQuestion);
    const ranked = rankFaqs(normalizedQuestion, knowledgeBase);
    const best = ranked[0];
    if (!best || best.score < 4) return fallbackReply(false);
    const confidence = Math.min(0.98, 0.42 + Math.min(0.4, best.score / 38) + (classification.confidence * 0.18));
    const matchedLabel = best.matches[0] || INTENT_LABELS[best.faq.intent];
    return Object.freeze({
      intent: best.faq.intent,
      confidence: Number(confidence.toFixed(2)),
      faqIds: Object.freeze([best.faq.id]),
      answer: best.faq.answer,
      suggestedReplies: Object.freeze([...best.faq.suggestedReplies]),
      needsHandoff: false,
      routingReason: `命中“${matchedLabel}”知识卡`,
      source: 'local',
    });
  }

  function sanitizeAIReply(payload, knowledgeBase) {
    if (!payload || typeof payload !== 'object') return null;
    const answer = plain(payload.answer, 1200);
    if (!answer) return null;
    const enabledFaqs = normalizeKnowledgeBase(knowledgeBase).filter((faq) => faq.enabled);
    const byId = new Map(enabledFaqs.map((faq) => [faq.id, faq]));
    const requestedIds = Array.isArray(payload.citationIds)
      ? payload.citationIds
      : Array.isArray(payload.faqIds) ? payload.faqIds : [];
    const faqIds = [...new Set(requestedIds.map((id) => safeId(id, '')).filter((id) => byId.has(id)))].slice(0, 3);
    if (!faqIds.length) return null;
    const citedFaq = byId.get(faqIds[0]);
    const intent = VALID_INTENTS.includes(payload.intent) ? payload.intent : citedFaq.intent;
    const numericConfidence = Number(payload.confidence);
    const confidence = Number.isFinite(numericConfidence) ? Math.min(1, Math.max(0, numericConfidence)) : 0.75;
    return Object.freeze({
      answer,
      intent,
      confidence: Number(confidence.toFixed(2)),
      faqIds: Object.freeze(faqIds),
      suggestedReplies: Object.freeze(uniquePlainArray(payload.suggestedReplies, 3, 80)),
      needsHandoff: false,
      routingReason: 'AI 基于已引用知识卡整理',
      source: 'ai',
    });
  }

  return Object.freeze({
    MAX_QUESTION_LENGTH,
    VALID_INTENTS,
    INTENT_LABELS,
    INTENT_TERMS,
    normalizeText,
    tokenize,
    sanitizeFaq,
    normalizeKnowledgeBase,
    classifyIntent,
    rankFaqs,
    routeQuestion,
    sanitizeAIReply,
  });
});
