const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./support-core.js');

const KNOWLEDGE = [
  {
    id: 'shipping-progress',
    intent: 'shipping',
    question: '订单发货后怎么查询物流？',
    answer: '订单发货后，可在订单详情中查看承运商和运单轨迹。',
    keywords: ['物流', '快递', '发货', '运单'],
    aliases: ['什么时候到', '查快递'],
    suggestedReplies: ['还没发货怎么办？', '可以修改地址吗？'],
    enabled: true,
  },
  {
    id: 'refund-arrival',
    intent: 'refund',
    question: '退款多久可以到账？',
    answer: '审核通过后会原路退款，到账时间取决于支付渠道。',
    keywords: ['退款', '到账', '原路退回'],
    aliases: ['钱什么时候退回'],
    suggestedReplies: ['退款进度在哪里看？'],
    enabled: true,
  },
  {
    id: 'invoice-company',
    intent: 'invoice',
    question: '怎样申请企业发票？',
    answer: '在订单完成页填写企业抬头和税号即可申请。',
    keywords: ['发票', '抬头', '税号'],
    aliases: [],
    enabled: false,
  },
];

test('normalizes punctuation, whitespace, case and unsafe markup', () => {
  assert.equal(Core.normalizeText('  Shipping，订单！！ <b>NOW</b>  '), 'shipping 订单 now');
  assert.equal(Core.normalizeText('A\n\nB\tC'), 'a b c');
  assert.ok(Core.normalizeText('字'.repeat(180)).length <= 120);
});

test('tokenizes Chinese n-grams and English words without duplicates', () => {
  const tokens = Core.tokenize('Where is my 快递物流？ shipping shipping');
  assert.ok(tokens.includes('where'));
  assert.ok(tokens.includes('快递'));
  assert.ok(tokens.includes('物流'));
  assert.equal(tokens.filter((token) => token === 'shipping').length, 1);
});

test('sanitizes FAQ fields and normalizes duplicate IDs', () => {
  const unsafe = Core.sanitizeFaq({
    id: '../FAQ One',
    intent: 'unknown',
    question: '<b>如何联系？</b>',
    answer: '<script>alert(1)</script>请联系在线客服。',
    keywords: ['客服', '客服', '<i>联系</i>'],
    suggestedReplies: ['<b>人工</b>'],
    enabled: true,
  }, 0);
  assert.equal(unsafe.id, 'faq-one');
  assert.equal(unsafe.intent, 'contact');
  assert.equal(unsafe.question, '如何联系？');
  assert.doesNotMatch(unsafe.answer, /[<>]/);
  assert.deepEqual(unsafe.keywords, ['客服', '联系']);

  const normalized = Core.normalizeKnowledgeBase([
    { ...KNOWLEDGE[0], id: 'same' },
    { ...KNOWLEDGE[1], id: 'same' },
    null,
  ]);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((faq) => faq.id), ['same', 'same-2']);
  assert.ok(Object.isFrozen(normalized[0]));
});

test('classifies common Chinese and English support intents', () => {
  assert.equal(Core.classifyIntent('我的快递什么时候送到？').intent, 'shipping');
  assert.equal(Core.classifyIntent('退款怎么还没到账').intent, 'refund');
  assert.equal(Core.classifyIntent('I forgot my account password').intent, 'account');
  assert.equal(Core.classifyIntent('我要开公司发票，抬头怎么填').intent, 'invoice');
  assert.equal(Core.classifyIntent('今天天气如何').intent, 'unknown');
});

test('ranks enabled FAQ cards with stable order and intent weighting', () => {
  const ranked = Core.rankFaqs('订单发货了，在哪里查快递物流？', KNOWLEDGE);
  assert.equal(ranked[0].faq.id, 'shipping-progress');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(ranked.some((entry) => entry.faq.id === 'invoice-company'), false);

  const tied = Core.rankFaqs('人工客服', [
    { id: 'first', intent: 'contact', question: '联系人工客服', answer: '第一条', keywords: ['人工客服'] },
    { id: 'second', intent: 'contact', question: '联系人工客服', answer: '第二条', keywords: ['人工客服'] },
  ]);
  assert.deepEqual(tied.map((entry) => entry.faq.id), ['first', 'second']);
});

test('routes a supported question with evidence and suggestions', () => {
  const result = Core.routeQuestion('发货后要去哪里查物流？', KNOWLEDGE);
  assert.equal(result.intent, 'shipping');
  assert.equal(result.needsHandoff, false);
  assert.deepEqual(result.faqIds, ['shipping-progress']);
  assert.match(result.answer, /订单详情/);
  assert.ok(result.confidence >= 0.6 && result.confidence <= 1);
  assert.deepEqual(result.suggestedReplies, ['还没发货怎么办？', '可以修改地址吗？']);
});

test('uses an explicit handoff for unsupported or empty questions', () => {
  const unsupported = Core.routeQuestion('你们办公室的窗帘是什么颜色？', KNOWLEDGE);
  assert.equal(unsupported.intent, 'unknown');
  assert.equal(unsupported.needsHandoff, true);
  assert.deepEqual(unsupported.faqIds, []);
  assert.match(unsupported.answer, /人工/);

  const empty = Core.routeQuestion('  ', KNOWLEDGE);
  assert.equal(empty.needsHandoff, true);
  assert.match(empty.answer, /具体问题/);
});

test('sanitizes AI replies and requires verifiable enabled citations', () => {
  const reply = Core.sanitizeAIReply({
    answer: '<b>请在订单详情查看物流。</b><script>bad()</script>',
    intent: 'shipping',
    confidence: 8,
    citationIds: ['shipping-progress', 'missing', 'shipping-progress'],
    suggestedReplies: ['<i>还没发货怎么办？</i>', '修改地址', '联系人工', '第四条'],
  }, KNOWLEDGE);
  assert.equal(reply.answer, '请在订单详情查看物流。bad()');
  assert.deepEqual(reply.faqIds, ['shipping-progress']);
  assert.equal(reply.confidence, 1);
  assert.equal(reply.source, 'ai');
  assert.deepEqual(reply.suggestedReplies, ['还没发货怎么办？', '修改地址', '联系人工']);

  assert.equal(Core.sanitizeAIReply({
    answer: '这是一条没有依据的回答。',
    citationIds: ['missing', 'invoice-company'],
  }, KNOWLEDGE), null);
  assert.equal(Core.sanitizeAIReply({ answer: '<b></b>', citationIds: ['shipping-progress'] }, KNOWLEDGE), null);
});
