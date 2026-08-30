(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.QuizCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = new Set(["single", "multiple", "boolean"]);
  const DIFFICULTIES = new Set(["basic", "advanced"]);

  function asText(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 不能为空`);
    return value.trim();
  }

  function normalizeQuestion(input) {
    if (!input || typeof input !== "object") throw new Error("题目格式无效");
    const id = asText(input.id, "题目 ID");
    const prompt = asText(input.prompt, "题干");
    const category = asText(input.category, "分类");
    const type = asText(input.type, "题型");
    const difficulty = asText(input.difficulty, "难度");
    if (!TYPES.has(type)) throw new Error(`${id} 的题型无效`);
    if (!DIFFICULTIES.has(difficulty)) throw new Error(`${id} 的难度无效`);
    if (!Array.isArray(input.options) || input.options.length < 2) throw new Error(`${id} 至少需要两个选项`);

    const optionIds = new Set();
    const options = input.options.map((option, index) => {
      if (!option || typeof option !== "object") throw new Error(`${id} 的选项 ${index + 1} 无效`);
      const optionId = asText(option.id, `${id} 的选项 ID`);
      if (optionIds.has(optionId)) throw new Error(`${id} 存在重复选项`);
      optionIds.add(optionId);
      return { id: optionId, label: asText(option.label, `${id} 的选项内容`) };
    });

    const answerIds = Array.isArray(input.answerIds) ? [...new Set(input.answerIds.map(String))] : [];
    if (!answerIds.length || answerIds.some(answerId => !optionIds.has(answerId))) {
      throw new Error(`${id} 的答案不在选项中`);
    }
    if (type !== "multiple" && answerIds.length !== 1) throw new Error(`${id} 只能有一个答案`);
    if (type === "multiple" && answerIds.length < 2) throw new Error(`${id} 的多选答案不足`);

    return {
      id,
      prompt,
      category,
      type,
      difficulty,
      options,
      answerIds,
      explanation: asText(input.explanation, "解析")
    };
  }

  function seedFrom(value) {
    const text = String(value ?? "SCAN46");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let state = seedFrom(seed);
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function buildQuiz(bank, config) {
    const questions = (Array.isArray(bank) ? bank : []).map(normalizeQuestion);
    if (!questions.length) throw new Error("题库为空");
    const categories = new Set(Array.isArray(config?.categories) ? config.categories : []);
    const difficulty = config?.difficulty || "all";
    const count = Number(config?.count);
    if (!Number.isInteger(count) || count < 1) throw new Error("题量无效");

    const pool = questions.filter(question => {
      const categoryMatch = categories.size === 0 || categories.has(question.category);
      const difficultyMatch = difficulty === "all" || question.difficulty === difficulty;
      return categoryMatch && difficultyMatch;
    });
    if (pool.length < count) throw new Error(`当前条件只有 ${pool.length} 道题，请减少题量或放宽筛选`);
    return shuffle(pool, createRandom(config?.seed)).slice(0, count);
  }

  function normalizeSelection(question, selection) {
    const validIds = new Set(question.options.map(option => option.id));
    return [...new Set(Array.isArray(selection) ? selection.map(String) : [])]
      .filter(id => validIds.has(id));
  }

  function toggleSelection(questionInput, selection, optionId) {
    const question = normalizeQuestion(questionInput);
    const validIds = new Set(question.options.map(option => option.id));
    const target = String(optionId);
    if (!validIds.has(target)) throw new Error("选项不存在");
    if (question.type !== "multiple") return [target];

    const current = new Set(normalizeSelection(question, selection));
    if (current.has(target)) current.delete(target);
    else current.add(target);
    return question.options.map(option => option.id).filter(id => current.has(id));
  }

  function sameAnswer(actual, expected) {
    if (actual.length !== expected.length) return false;
    const actualSet = new Set(actual);
    return expected.every(value => actualSet.has(value));
  }

  function scoreQuiz(questionInputs, answerMap) {
    const questions = questionInputs.map(normalizeQuestion);
    const answers = answerMap && typeof answerMap === "object" ? answerMap : {};
    const categories = {};
    const details = questions.map(question => {
      const selectedIds = normalizeSelection(question, answers[question.id]);
      const correct = sameAnswer(selectedIds, question.answerIds);
      if (!categories[question.category]) categories[question.category] = { total: 0, correct: 0 };
      categories[question.category].total += 1;
      if (correct) categories[question.category].correct += 1;
      return { question, selectedIds, correct };
    });
    const correct = details.filter(detail => detail.correct).length;
    const total = questions.length;
    return {
      total,
      correct,
      unanswered: details.filter(detail => detail.selectedIds.length === 0).length,
      percent: total ? Math.round((correct / total) * 100) : 0,
      categories,
      details
    };
  }

  function remainingSeconds(startedAt, durationSeconds, now) {
    if (durationSeconds === null || durationSeconds === undefined || durationSeconds === 0) return null;
    const start = Number(startedAt);
    const duration = Number(durationSeconds);
    const current = Number(now);
    if (![start, duration, current].every(Number.isFinite) || duration < 0) throw new Error("计时数据无效");
    return Math.max(0, Math.ceil((start + duration * 1000 - current) / 1000));
  }

  function normalizeDraft(input, bank, bankVersion) {
    if (!input || typeof input !== "object" || input.bankVersion !== bankVersion || input.status !== "active") return null;
    const byId = new Map(bank.map(question => {
      const normalized = normalizeQuestion(question);
      return [normalized.id, normalized];
    }));
    if (!Array.isArray(input.questionIds) || !input.questionIds.length) return null;
    const questions = input.questionIds.map(id => byId.get(String(id)));
    if (questions.some(question => !question)) return null;
    const startedAt = Number(input.startedAt);
    const durationSeconds = input.durationSeconds === null ? null : Number(input.durationSeconds);
    if (!Number.isFinite(startedAt) || (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 1))) return null;
    const answers = {};
    questions.forEach(question => {
      const selected = normalizeSelection(question, input.answers?.[question.id]);
      if (selected.length) answers[question.id] = selected;
    });
    return {
      status: "active",
      bankVersion,
      questionIds: questions.map(question => question.id),
      answers,
      currentIndex: Math.min(Math.max(0, Number.isInteger(input.currentIndex) ? input.currentIndex : 0), questions.length - 1),
      startedAt,
      durationSeconds,
      config: input.config && typeof input.config === "object" ? input.config : {}
    };
  }

  return {
    normalizeQuestion,
    buildQuiz,
    toggleSelection,
    scoreQuiz,
    remainingSeconds,
    normalizeDraft,
    seedFrom
  };
});
