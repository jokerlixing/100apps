const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./resume-core.js');

test('normalizeText cleans pasted resume text without flattening sections', () => {
  const value = Core.normalizeText('  张三\r\n\r\n\r\n 工作经历\u00a0\r\n- 负责平台建设  \r\n');
  assert.equal(value, '张三\n\n工作经历\n- 负责平台建设');
});

test('extractKeywords ranks known skills and repeated English terms without duplicates', () => {
  const result = Core.extractKeywords('负责 React 与 TypeScript 开发。需要 React、数据分析、SQL 和跨团队协作。', 8);
  assert.deepEqual(result.slice(0, 5), ['React', 'TypeScript', '数据分析', 'SQL', '跨团队协作']);
  assert.equal(new Set(result).size, result.length);
});

test('splitResume identifies sections and usable evidence lines', () => {
  const result = Core.splitResume(`李明\n产品经理\n\n工作经历\n- 负责增长活动\n- 将转化率提升 18%\n\n技能\nSQL / 数据分析`);
  assert.equal(result.sections.some((section) => section.key === 'experience'), true);
  assert.deepEqual(result.bullets.map((bullet) => bullet.text), ['负责增长活动', '将转化率提升 18%']);
  assert.equal(result.presentSections.includes('skills'), true);
});

test('analyzeBullet rewards quantified outcomes and reports weak wording', () => {
  const strong = Core.analyzeBullet('重构结算流程，将支付成功率从 91% 提升至 97%，覆盖 30 万用户', ['支付', '用户']);
  const weak = Core.analyzeBullet('负责相关工作，参与日常运营', ['运营']);
  assert.equal(strong.hasMetric, true);
  assert.ok(strong.strength >= 80);
  assert.deepEqual(strong.matchedKeywords, ['支付', '用户']);
  assert.equal(weak.weakVerbs.includes('负责'), true);
  assert.ok(weak.issues.some((issue) => issue.code === 'missing-metric'));
  assert.ok(weak.strength < strong.strength);
});

test('analyzeResume returns bounded explainable scores and missing keywords', () => {
  const resume = `李明\n产品经理\n\n工作经历\n- 设计会员增长实验，将次月留存率提升 12%\n- 使用 SQL 分析 20 万条行为数据\n\n技能\nSQL、A/B 测试、数据分析\n\n教育经历\n某大学 本科`;
  const job = '寻找产品经理，负责用户增长、数据分析和 A/B 测试，要求 SQL、跨团队协作。';
  const result = Core.analyzeResume(resume, job);
  assert.ok(result.score >= 55 && result.score <= 100);
  assert.ok(result.scores.match >= 50);
  assert.equal(result.matchedKeywords.includes('SQL'), true);
  assert.equal(result.missingKeywords.includes('跨团队协作'), true);
  assert.equal(result.bullets.length, 2);
  for (const score of Object.values(result.scores)) assert.ok(score >= 0 && score <= 100);
});

test('analyzeResume handles empty evidence conservatively', () => {
  const result = Core.analyzeResume('张三\n求职目标：产品经理', '需要 SQL 和数据分析能力');
  assert.equal(result.bullets.length, 0);
  assert.ok(result.score < 35);
  assert.ok(result.summary.includes('经历'));
});

test('validateEndpoint accepts HTTPS and localhost but rejects unsafe remote HTTP', () => {
  assert.equal(Core.validateEndpoint('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(Core.validateEndpoint('http://127.0.0.1:11434/v1/chat/completions'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.throws(() => Core.validateEndpoint('http://example.com/v1/chat/completions'), /HTTPS/);
  assert.throws(() => Core.validateEndpoint('javascript:alert(1)'), /接口地址/);
});

test('buildAiRequest scopes the prompt to one evidence line and target role', () => {
  const body = Core.buildAiRequest({
    model: 'gpt-4.1-mini',
    bullet: '负责用户增长工作',
    jobText: '需要用户增长、SQL 与跨团队协作',
    matchedKeywords: ['用户增长'],
    missingKeywords: ['SQL', '跨团队协作'],
  });
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2);
  assert.match(body.messages[1].content, /负责用户增长工作/);
  assert.match(body.messages[1].content, /SQL/);
  assert.ok(body.messages[1].content.length < 2500);
});

test('createLocalRewrite never invents a metric', () => {
  const rewrite = Core.createLocalRewrite('负责用户增长工作', ['用户增长', 'SQL']);
  assert.match(rewrite, /用户增长/);
  assert.match(rewrite, /待补充/);
  assert.doesNotMatch(rewrite, /\d+%/);
  assert.equal(Core.createLocalRewrite(rewrite, ['SQL']), rewrite, 'a generated placeholder must not be wrapped twice');
});
