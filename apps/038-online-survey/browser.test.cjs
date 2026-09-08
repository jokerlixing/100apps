'use strict';

// Run with Playwright installed and the repository served at PULSE38_TEST_URL (default below).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = process.env.PULSE38_TEST_URL || 'http://127.0.0.1:8038/apps/038-online-survey/';
const STATE_KEY = 'pulse38-state-v3';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function setup(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.Pulse38Generator && window.pulse38);
  return { context, page, errors };
}

async function saved(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STATE_KEY);
}

async function generateExample(page, example = 'product') {
  await page.locator(`[data-generator-example="${example}"]`).click();
  await page.locator('#generateButton').click();
  await page.locator('#generatedDraft').waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width && rect.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
    }).slice(0, 8).map(el => `${el.tagName}.${el.className}`)
  }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, `${label}: ${JSON.stringify(dimensions)}`);
}

test('empty briefs and absent types report errors without replacing the saved questionnaire', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.locator('#generateButton').click();
    assert.match(await page.locator('#generatorStatus').innerText(), /至少输入/);
    await page.locator('#generatorTopic').fill('社区图书馆服务');
    for (const checkbox of await page.locator('[name="generatorType"]').all()) await checkbox.uncheck();
    await page.locator('#generateButton').click();
    assert.match(await page.locator('#generatorStatus').innerText(), /至少选择/);
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('generate, inspect, apply, edit, share, fill, submit, reload and undo preserve questionnaire isolation', async () => {
  const { context, page, errors } = await setup();
  try {
    await generateExample(page);
    assert.equal(await page.locator('#generatedDraft .generated-questions > li').count(), 8);
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    await page.locator('[data-action="apply-generated"]').click();
    const applied = await saved(page);
    assert.notEqual(applied.survey.id, 'workshop-pulse-38');
    assert.equal(applied.undoSurvey.id, 'workshop-pulse-38');
    assert.equal(applied.responses.length, 4);
    assert.equal(await page.locator('#statResponses').innerText(), '0');
    assert.equal(new Set(applied.survey.questions.map(q => q.id)).size, 8);
    await page.locator('#questionList [data-field="title"]').first().fill('你会在什么场景使用这个产品？');
    await page.locator('.top-action').click();
    const shareUrl = await page.locator('#shareUrl').inputValue();
    const sharedPage = await context.newPage();
    await sharedPage.goto(shareUrl);
    await sharedPage.locator('#fillView').waitFor({ state: 'visible' });
    assert.equal(await sharedPage.locator('.fill-question').count(), 8);
    await sharedPage.locator('button[type="submit"]').last().click();
    assert.ok(await sharedPage.locator('.error-text').count() > 0);
    const active = await saved(sharedPage);
    for (const question of active.survey.questions) {
      const controls = sharedPage.locator(`#fillCard [data-answer-id="${question.id}"]`);
      if (question.type === 'text') await controls.fill('保留同步功能，希望提高提醒稳定性。');
      else await controls.first().check();
    }
    assert.match(await sharedPage.locator('#progressText').innerText(), /100%/);
    await sharedPage.locator('#responseForm button[type="submit"]').click();
    await sharedPage.locator('.receipt').waitFor();
    await sharedPage.locator('.receipt [data-mode="results"]').click();
    assert.equal(await sharedPage.locator('#statResponses').innerText(), '1');
    await page.reload();
    assert.equal(await page.locator('#statResponses').innerText(), '1');
    await page.locator('#undoGeneration').click();
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.equal(await page.locator('#statResponses').innerText(), '4');
    assert.equal((await saved(page)).responses.length, 5);
    await page.reload();
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.equal(await page.locator('#undoGenerationRow').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('changing a brief invalidates the preview and generator input survives reload', async () => {
  const { context, page, errors } = await setup();
  try {
    await generateExample(page, 'food');
    await page.locator('#generatorPrompt').fill('生成 6 道题，只要单选题，全部选答');
    assert.equal(await page.locator('#generatedDraft').isVisible(), false);
    await page.reload();
    assert.equal(await page.locator('#generatorPrompt').inputValue(), '生成 6 道题，只要单选题，全部选答');
    await page.locator('#generateButton').click();
    await page.locator('#generatedDraft').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.generated-questions > li').count(), 6);
    await page.locator('[data-action="apply-generated"]').click();
    const state = await saved(page);
    assert.ok(state.survey.questions.every(q => q.type === 'single' && !q.required));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a shared tab submission preserves a newer generated draft and survives undo without reloading', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.locator('#surveyTitle').fill('原问卷的最新标题');
    const original = (await saved(page)).survey;
    await page.locator('.top-action').click();
    const sharedPage = await context.newPage();
    await sharedPage.goto(await page.locator('#shareUrl').inputValue());
    await page.locator('[data-action="close-share"]').click();
    await generateExample(page, 'food');
    await page.locator('[data-action="apply-generated"]').click();
    const generatedId = (await saved(page)).survey.id;
    for (const question of original.questions) {
      const controls = sharedPage.locator(`#fillCard [data-answer-id="${question.id}"]`);
      if (question.type === 'text') await controls.fill('跨标签页保留的建议');
      else await controls.first().check();
    }
    await sharedPage.locator('#responseForm button[type="submit"]').click();
    await sharedPage.locator('.receipt').waitFor();
    assert.equal((await saved(page)).survey.id, generatedId);
    assert.equal((await saved(page)).responses.length, 5);
    await page.locator('#undoGeneration').click();
    assert.equal(await page.locator('#surveyTitle').inputValue(), '原问卷的最新标题');
    assert.equal(await page.locator('#statResponses').innerText(), '5');
    await page.locator('#surveyDescription').fill('继续编辑仍保留新答卷。');
    assert.equal((await saved(page)).responses.length, 5);
    await page.locator('.mode-btn[data-mode="results"]').click();
    await page.locator('#clearResponses').click();
    await page.locator('#clearResponses').click();
    assert.equal((await saved(page)).responses.length, 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('clearing and replacing a choice preserves its siblings and incomplete choices cannot be shared', async () => {
  const { context, page, errors } = await setup();
  try {
    await generateExample(page);
    await page.locator('[data-action="apply-generated"]').click();
    const original = (await saved(page)).survey.questions[0].options;
    const second = page.locator('#questionList .question-card').first().locator('[data-field="option"]').nth(1);
    await second.fill('');
    const cleared = (await saved(page)).survey.questions[0].options;
    assert.deepEqual(cleared, original.map((value, index) => index === 1 ? '' : value));
    await page.locator('.top-action').click();
    assert.equal(await page.locator('#shareDialog').isVisible(), false);
    assert.match(await page.locator('#toast').innerText(), /选项不为空/);
    await page.reload();
    assert.equal(await second.inputValue(), '');
    await second.fill('有一定了解');
    assert.deepEqual((await saved(page)).survey.questions[0].options, original.map((value, index) => index === 1 ? '有一定了解' : value));
    await page.locator('.top-action').click();
    assert.equal(await page.locator('#shareDialog').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [320, 390, 768, 1440]) {
  test(`responsive generation, editing, filling and sharing fit ${width}px`, async () => {
    const { context, page, errors } = await setup({ width, height: 900 });
    try {
      await assertNoOverflow(page, `${width} initial`);
      await generateExample(page, 'course');
      await assertNoOverflow(page, `${width} generated`);
      await page.locator('[data-action="apply-generated"]').click();
      await page.locator('#surveyTitle').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3));
      await page.locator('#questionList [data-field="title"]').first().fill('LongUnbrokenQuestion'.repeat(7));
      await assertNoOverflow(page, `${width} editor with long text`);
      if (width <= 390) {
        assert.equal(await page.locator('#generatorTopic').evaluate(el => getComputedStyle(el).fontSize), '16px');
        assert.ok(await page.locator('.question-tools button').first().evaluate(el => el.getBoundingClientRect().width) >= 44);
      }
      await page.locator('.mode-btn[data-mode="fill"]').click();
      await assertNoOverflow(page, `${width} fill`);
      await page.locator('.mode-btn[data-mode="results"]').click();
      await assertNoOverflow(page, `${width} results`);
      await page.locator('.top-action').click();
      await assertNoOverflow(page, `${width} share dialog`);
      await page.locator('[data-action="close-share"]').click();
      await page.locator('.mode-btn[data-mode="build"]').click();
      await page.locator('#generatorMethod').selectOption('ai');
      await assertNoOverflow(page, `${width} AI settings`);
      if (process.env.PULSE38_SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.PULSE38_SCREENSHOT_DIR}/pulse38-${width}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

async function configureAI(page) {
  await page.locator('#generatorTopic').fill('社区图书馆服务');
  await page.locator('#generatorSource').fill('我们希望改善借阅流程与阅读空间。');
  await page.locator('#generatorMethod').selectOption('ai');
  await page.locator('#generatorEndpoint').fill('https://survey-ai.example/v1/chat/completions');
  await page.locator('#generatorModel').fill('test-survey-model');
  await page.locator('#generatorKey').fill('test-secret-never-persist');
}

test('AI uses only the brief, validates output, and keeps connection credentials out of storage and sharing', async () => {
  const { context, page, errors } = await setup();
  try {
    await configureAI(page);
    let requestBody;
    await page.route('https://survey-ai.example/**', async route => {
      requestBody = route.request().postDataJSON();
      assert.equal(route.request().headers().authorization, 'Bearer test-secret-never-persist');
      const draft = {
        title: '社区图书馆服务调查', description: '感谢参与，请根据真实体验作答。',
        questions: Array.from({ length: 8 }, (_, i) => ({ type: 'single', title: `图书馆服务的第 ${i + 1} 个环节是否满足你的需要？`, required: true, options: ['满足', '一般', '不满足', '未体验'] }))
      };
      await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(draft) } }] } });
    });
    await page.locator('#generateButton').click();
    await page.locator('#generatedDraft').waitFor({ state: 'visible' });
    assert.match(JSON.stringify(requestBody), /借阅流程/);
    assert.doesNotMatch(JSON.stringify(requestBody), /workshop-pulse|demo-1|本地答卷|test-secret/);
    await page.locator('[data-action="apply-generated"]').click();
    await page.locator('.top-action').click();
    assert.doesNotMatch(await page.locator('#shareUrl').inputValue(), /test-secret/);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    assert.doesNotMatch(stored, /test-secret|survey-ai\.example|test-survey-model/);
    await page.reload();
    assert.equal(await page.locator('#generatorKey').inputValue(), '');
    assert.equal(await page.locator('#generatorMethod').inputValue(), 'local');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('AI failures and cancellation leave the current questionnaire intact and allow retry', async () => {
  const { context, page, errors } = await setup();
  try {
    await configureAI(page);
    await page.route('https://survey-ai.example/**', route => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }));
    await page.locator('#generateButton').click();
    await page.waitForFunction(() => document.querySelector('#generatorStatus').dataset.error === 'true');
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.equal(await page.locator('#generateButton').isEnabled(), true);
    await page.unroute('https://survey-ai.example/**');
    await page.route('https://survey-ai.example/**', route => route.fulfill({ json: { choices: [{ message: { content: '{"title":"bad","questions":[]}' } }] } }));
    await page.locator('#generateButton').click();
    await page.waitForFunction(() => document.querySelector('#generatorStatus').dataset.error === 'true');
    assert.equal(await page.locator('#generatedDraft').isVisible(), false);
    await page.unroute('https://survey-ai.example/**');
    await page.route('https://survey-ai.example/**', () => {});
    await page.locator('#generateButton').click();
    await page.locator('#cancelGeneration').click();
    assert.match(await page.locator('#generatorStatus').innerText(), /已取消/);
    assert.equal(await page.locator('#generateButton').isEnabled(), true);
    await page.locator('#generatorMethod').selectOption('local');
    await page.locator('#generateButton').click();
    await page.locator('#generatedDraft').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('literal markup remains text and unavailable storage does not interrupt generation', async () => {
  const { context, page, errors } = await setup({ width: 390, height: 844 });
  try {
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await page.locator('#generatorTopic').fill('<img src=x onerror=alert(1)>服务调查');
    await page.locator('#generateButton').click();
    await page.locator('#generatedDraft').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#generatedDraft img').count(), 0);
    await page.locator('[data-action="apply-generated"]').click();
    assert.match(await page.locator('#generatorStatus').innerText(), /存储不可用/);
    assert.equal(await page.locator('#previewBody img').count(), 0);
    await page.locator('#undoGeneration').click();
    assert.equal(await page.locator('#surveyTitle').inputValue(), '工作坊体验反馈');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a response survives repeated quota failures in memory and persists when storage recovers', async () => {
  const { context, page, errors } = await setup();
  try {
    await page.locator('#surveyTitle').fill('存储恢复测试');
    const survey = (await saved(page)).survey;
    await page.evaluate(() => {
      window.restoreTestStorage = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await page.locator('.mode-btn[data-mode="fill"]').click();
    for (const question of survey.questions) {
      const controls = page.locator(`#fillCard [data-answer-id="${question.id}"]`);
      if (question.type === 'text') await controls.fill('存储恢复前也要保留的回答');
      else await controls.first().check();
    }
    await page.locator('#responseForm button[type="submit"]').click();
    assert.match(await page.locator('.receipt').innerText(), /仅保留在本次页面/);
    await page.locator('.mode-btn[data-mode="build"]').click();
    await page.locator('#surveyDescription').fill('第一次保存仍失败');
    await page.locator('#surveyDescription').fill('第二次保存仍失败');
    assert.equal(await page.locator('#statResponses').innerText(), '5');
    await page.evaluate(() => { Storage.prototype.setItem = window.restoreTestStorage; });
    await page.locator('#surveyDescription').fill('存储恢复');
    assert.equal((await saved(page)).responses.length, 5);
    await page.reload();
    assert.equal(await page.locator('#statResponses').innerText(), '5');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
