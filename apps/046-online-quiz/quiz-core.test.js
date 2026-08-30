"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Core = require("./quiz-core.js");
const Bank = require("./question-bank.js");

test("整库题目都能通过规范化", () => {
  assert.equal(Bank.questions.length, 32);
  const normalized = Bank.questions.map(Core.normalizeQuestion);
  assert.equal(new Set(normalized.map(question => question.id)).size, 32);
  assert.deepEqual(new Set(normalized.map(question => question.category)), new Set(["Web", "科学", "逻辑", "常识"]));
  for (const category of ["Web", "科学", "逻辑", "常识"]) {
    assert.equal(normalized.filter(question => question.category === category).length, 8);
  }
});

test("相同种子得到相同试卷，不同种子改变题序", () => {
  const config = { count: 10, categories: [], difficulty: "all", seed: "same" };
  const first = Core.buildQuiz(Bank.questions, config).map(question => question.id);
  const second = Core.buildQuiz(Bank.questions, config).map(question => question.id);
  const another = Core.buildQuiz(Bank.questions, { ...config, seed: "another" }).map(question => question.id);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, another);
});

test("组卷会遵守分类、难度和题量", () => {
  const quiz = Core.buildQuiz(Bank.questions, {
    count: 4,
    categories: ["科学"],
    difficulty: "advanced",
    seed: "science"
  });
  assert.equal(quiz.length, 4);
  assert.ok(quiz.every(question => question.category === "科学" && question.difficulty === "advanced"));
  assert.throws(() => Core.buildQuiz(Bank.questions, {
    count: 5,
    categories: ["科学"],
    difficulty: "advanced",
    seed: "too-many"
  }), /只有 4 道题/);
});

test("最高档位可以生成 30 道不重复题目", () => {
  const quiz = Core.buildQuiz(Bank.questions, {
    count: 30,
    categories: ["Web", "科学", "逻辑", "常识"],
    difficulty: "all",
    seed: "thirty"
  });
  assert.equal(quiz.length, 30);
  assert.equal(new Set(quiz.map(question => question.id)).size, 30);
});

test("单选替换答案，多选按题目顺序切换", () => {
  const single = Bank.questions.find(question => question.id === "web-01");
  const multiple = Bank.questions.find(question => question.id === "web-02");
  assert.deepEqual(Core.toggleSelection(single, ["a"], "b"), ["b"]);
  assert.deepEqual(Core.toggleSelection(multiple, ["d"], "a"), ["a", "d"]);
  assert.deepEqual(Core.toggleSelection(multiple, ["a", "d"], "a"), ["d"]);
});

test("评分要求多选完整匹配并生成分类统计", () => {
  const questions = [
    Bank.questions.find(question => question.id === "web-01"),
    Bank.questions.find(question => question.id === "web-02"),
    Bank.questions.find(question => question.id === "science-01")
  ];
  const result = Core.scoreQuiz(questions, {
    "web-01": ["a"],
    "web-02": ["a", "b"],
    "science-01": ["a"]
  });
  assert.equal(result.correct, 2);
  assert.equal(result.percent, 67);
  assert.equal(result.unanswered, 0);
  assert.deepEqual(result.categories.Web, { total: 2, correct: 1 });
  assert.deepEqual(result.categories["科学"], { total: 1, correct: 1 });
});

test("倒计时向上取整并在到期后归零，无限时返回 null", () => {
  assert.equal(Core.remainingSeconds(1000, 60, 1501), 60);
  assert.equal(Core.remainingSeconds(1000, 60, 61001), 0);
  assert.equal(Core.remainingSeconds(1000, null, 999999), null);
});

test("草稿恢复会过滤非法答案并限制当前题号", () => {
  const restored = Core.normalizeDraft({
    status: "active",
    bankVersion: Bank.version,
    questionIds: ["web-01", "web-02"],
    answers: { "web-01": ["a", "missing"], "web-02": ["a", "d"] },
    currentIndex: 99,
    startedAt: 1234,
    durationSeconds: 300,
    config: { count: 2 }
  }, Bank.questions, Bank.version);
  assert.equal(restored.currentIndex, 1);
  assert.deepEqual(restored.answers["web-01"], ["a"]);
  assert.deepEqual(restored.answers["web-02"], ["a", "d"]);
  assert.equal(Core.normalizeDraft({ ...restored, bankVersion: "old" }, Bank.questions, Bank.version), null);
});

test("损坏题目会被拒绝", () => {
  assert.throws(() => Core.normalizeQuestion({
    id: "bad",
    prompt: "坏题",
    category: "测试",
    difficulty: "basic",
    type: "single",
    options: [{ id: "a", label: "A" }, { id: "a", label: "B" }],
    answerIds: ["a"],
    explanation: "重复选项"
  }), /重复选项/);
});
