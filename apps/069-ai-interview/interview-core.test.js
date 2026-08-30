const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QUESTION_BANK,
  normalizeConfig,
  buildQuestionPlan,
  scoreAnswer,
  buildFollowUp,
  summarizeSession,
  sanitizeAIQuestions,
  sanitizeAIEvaluation,
} = require('./interview-core');

const frontendQuestion = {
  id: 'frontend-performance',
  role: 'frontend',
  category: 'role',
  prompt: '你如何定位并改善一个首屏加载缓慢的页面？',
  hint: '说明指标、定位过程、取舍和结果。',
  keywords: ['性能', '指标', '网络', '渲染', '缓存', '结果'],
};

test('normalizes bounded setup values and removes executable markup', () => {
  const config = normalizeConfig({
    role: 'unknown',
    level: 'staff',
    type: 'magic',
    questionCount: 99,
    jobDescription: '<script>alert(1)</script>负责 React 性能优化',
    focus: 'React，性能、React；沟通\n系统设计',
    aiEnabled: 'yes',
  });

  assert.equal(config.role, 'frontend');
  assert.equal(config.level, 'mid');
  assert.equal(config.type, 'comprehensive');
  assert.equal(config.questionCount, 8);
  assert.doesNotMatch(config.jobDescription, /script|alert/);
  assert.match(config.jobDescription, /React 性能优化/);
  assert.deepEqual(config.focus, ['React', '性能', '沟通', '系统设计']);
  assert.equal(config.aiEnabled, false);

  assert.equal(normalizeConfig({ questionCount: 1 }).questionCount, 3);
});

test('ships a broad local catalog across all supported roles', () => {
  assert.ok(QUESTION_BANK.length >= 36);
  for (const role of ['frontend', 'backend', 'product', 'data', 'design', 'operations']) {
    assert.ok(QUESTION_BANK.filter((question) => question.role === role).length >= 5, `${role} needs role questions`);
  }
});

test('builds deterministic, unique and category-balanced interview plans', () => {
  const config = normalizeConfig({ role: 'frontend', level: 'senior', type: 'comprehensive', questionCount: 6 });
  const first = buildQuestionPlan(config, 'same-seed');
  const second = buildQuestionPlan(config, 'same-seed');

  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.equal(new Set(first.map((question) => question.id)).size, 6);
  assert.ok(first.every((question) => question.role === 'all' || question.role === 'frontend'));
  assert.ok(first.some((question) => question.category === 'intro'));
  assert.ok(first.some((question) => question.category === 'behavioral'));
  assert.ok(first.some((question) => question.category === 'role'));
  assert.ok(first.some((question) => question.category === 'scenario'));
});

test('honors specialized interview modes without losing an opening question', () => {
  const behavioral = buildQuestionPlan({ role: 'product', type: 'behavioral', questionCount: 4 }, 'behavior');
  assert.equal(behavioral[0].category, 'intro');
  assert.ok(behavioral.slice(1).every((question) => ['behavioral', 'scenario'].includes(question.category)));

  const technical = buildQuestionPlan({ role: 'backend', type: 'technical', questionCount: 5 }, 'tech');
  assert.equal(technical[0].category, 'intro');
  assert.ok(technical.slice(1).filter((question) => question.category === 'role').length >= 3);
});

test('scores relevance, STAR structure, quantified evidence and depth explainably', () => {
  const strong = scoreAnswer(frontendQuestion, `
    背景是活动首页的 LCP 达到 4.2 秒，我负责在两周内把核心指标降到 2.5 秒以内。
    我先用性能面板和网络瀑布定位渲染阻塞，再拆分首屏 JavaScript、压缩图片并调整缓存策略。
    上线后 LCP 从 4.2 秒降到 1.9 秒，跳出率降低 18%。我也用真实用户监控持续验证结果。
  `);

  assert.ok(strong.score >= 75, `expected strong score, got ${strong.score}`);
  assert.ok(strong.dimensions.relevance >= 70);
  assert.ok(strong.dimensions.structure >= 70);
  assert.ok(strong.dimensions.evidence >= 70);
  assert.ok(strong.dimensions.depth >= 70);
  assert.ok(strong.strengths.length >= 2);
  assert.ok(strong.evidence.some((item) => /量化证据/.test(item)));
  assert.ok(Array.isArray(strong.suggestedOutline));
});

test('gives actionable low scores for vague or skipped answers', () => {
  const vague = scoreAnswer(frontendQuestion, '我会看一下性能，然后想办法优化。');
  assert.ok(vague.score < 55);
  assert.ok(vague.improvements.some((item) => /数据|指标|证据|过程|具体/.test(item)));

  const skipped = scoreAnswer(frontendQuestion, '');
  assert.equal(skipped.score, 0);
  assert.equal(skipped.skipped, true);
  assert.deepEqual(skipped.dimensions, { relevance: 0, structure: 0, evidence: 0, depth: 0 });
  assert.match(skipped.improvements[0], /先写下一个真实经历/);
});

test('targets follow-up questions at the clearest answer gap', () => {
  const vague = scoreAnswer(frontendQuestion, '我会查看网络和渲染，再做性能优化。');
  assert.match(buildFollowUp(frontendQuestion, vague), /指标|数字|验证|结果/);

  const strong = scoreAnswer(frontendQuestion, '背景是 LCP 4 秒。我负责性能指标，先检查网络和渲染，调整缓存，最终降到 2 秒并提升转化 12%。');
  assert.match(buildFollowUp(frontendQuestion, strong), /取舍|风险|不同/);
});

test('summarizes the complete session without inventing hiring probability', () => {
  const strong = scoreAnswer(frontendQuestion, '背景是 LCP 4 秒，我负责性能指标。先检查网络和渲染并调整缓存，最终降到 2 秒，转化提升 12%。');
  const weak = scoreAnswer({ ...frontendQuestion, id: 'two' }, '不太清楚。');
  const summary = summarizeSession({
    config: { role: 'frontend', level: 'mid', type: 'comprehensive' },
    startedAt: 1_000,
    finishedAt: 121_000,
    answers: [
      { question: frontendQuestion, answer: '回答一', evaluation: strong, durationSeconds: 70 },
      { question: { ...frontendQuestion, id: 'two' }, answer: '不太清楚', evaluation: weak, durationSeconds: 50 },
      { question: { ...frontendQuestion, id: 'three' }, answer: '', evaluation: scoreAnswer(frontendQuestion, ''), durationSeconds: 0, skipped: true },
    ],
  });

  assert.equal(summary.totalQuestions, 3);
  assert.equal(summary.answeredCount, 2);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.durationSeconds, 120);
  assert.ok(summary.score >= 0 && summary.score <= 100);
  assert.ok(['relevance', 'structure', 'evidence', 'depth'].includes(summary.strongestDimension));
  assert.ok(summary.nextActions.length >= 2);
  assert.doesNotMatch(JSON.stringify(summary), /录用概率|offer probability/i);
});

test('sanitizes AI question plans and rejects malformed questions', () => {
  const questions = sanitizeAIQuestions({ questions: [
    {
      prompt: '<b>请讲一次你改善核心转化漏斗的经历</b>',
      category: 'behavioral',
      hint: '<script>bad()</script>使用 STAR',
      keywords: ['转化', '<i>指标</i>', '实验'],
    },
    { prompt: '太短', category: 'unknown', keywords: [] },
  ] }, { role: 'product', questionCount: 4 });

  assert.equal(questions.length, 1);
  assert.equal(questions[0].prompt, '请讲一次你改善核心转化漏斗的经历');
  assert.equal(questions[0].role, 'product');
  assert.equal(questions[0].keywords[1], '指标');
  assert.doesNotMatch(questions[0].hint, /script|bad/);
});

test('sanitizes bounded AI evaluations and rejects hostile payloads', () => {
  const evaluation = sanitizeAIEvaluation({ evaluation: {
    score: 109,
    dimensions: { relevance: 88, structure: 76, evidence: 69, depth: 81 },
    strengths: ['<b>切中问题</b>', '给出明确行动'],
    improvements: ['补充基线数据'],
    followUp: '<img src=x>这个方案最大的取舍是什么？',
    suggestedOutline: ['背景与目标', '行动', '结果'],
  } });

  assert.equal(evaluation.score, 100);
  assert.equal(evaluation.strengths[0], '切中问题');
  assert.equal(evaluation.followUp, '这个方案最大的取舍是什么？');
  assert.equal(evaluation.dimensions.evidence, 69);
  assert.equal(sanitizeAIEvaluation({ evaluation: { score: 'great' } }), null);
  assert.equal(sanitizeAIEvaluation(null), null);
});
