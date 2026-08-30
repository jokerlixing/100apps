(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmotionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_ENTRIES = 365;
  const MAX_NOTE_LENGTH = 2000;
  const MAX_AI_RECORDS = 30;
  const VALID_RANGES = Object.freeze([7, 14, 30]);
  const EMOTIONS = Object.freeze([
    '平静', '愉快', '期待', '感激', '放松', '振奋',
    '疲惫', '焦虑', '低落', '烦躁', '孤独', '压力',
  ]);
  const FACTORS = Object.freeze([
    '睡眠', '工作', '学习', '家人', '关系', '健康',
    '运动', '天气', '财务', '休闲', '饮食', '独处',
  ]);
  const MEDICAL_CLAIM = /诊断|确诊|抑郁症|焦虑症|双相|精神疾病|治疗方案|药物|停药|自杀风险|患有/u;

  function clampText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/<[^>]*>/gu, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
      .replace(/\r\n?/gu, '\n')
      .trim()
      .slice(0, maxLength);
  }

  function round(value, digits = 1) {
    if (!Number.isFinite(value)) return 0;
    const power = 10 ** digits;
    return Math.round((value + Number.EPSILON) * power) / power;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function uniqueKnown(values, allowed, limit) {
    if (!Array.isArray(values)) return Object.freeze([]);
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const normalized = clampText(value, 20);
      if (!allowed.includes(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= limit) break;
    }
    return Object.freeze(result);
  }

  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function safeId(value, date, mood, note) {
    const candidate = String(value == null ? '' : value);
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(candidate)) return candidate;
    return `entry-${new Date(date).getTime().toString(36)}-${hashText(`${mood}:${note}`)}`;
  }

  function toDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function normalizeScale(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
  }

  function normalizeEntry(input, now = new Date()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const current = toDate(now);
    const date = toDate(input.date);
    if (!current || !date || date.getTime() > current.getTime() + 5 * 60_000) return null;

    const mood = normalizeScale(input.mood);
    const energy = normalizeScale(input.energy);
    if (mood == null || energy == null) return null;

    const note = clampText(input.note, MAX_NOTE_LENGTH);
    const normalized = {
      id: safeId(input.id, date, mood, note),
      date: date.toISOString(),
      mood,
      energy,
      emotions: uniqueKnown(input.emotions, EMOTIONS, 5),
      factors: uniqueKnown(input.factors, FACTORS, 5),
      note,
    };
    return Object.freeze(normalized);
  }

  function normalizeEntries(input, now = new Date()) {
    if (!Array.isArray(input)) return Object.freeze([]);
    const byId = new Map();
    for (const item of input) {
      const normalized = normalizeEntry(item, now);
      if (!normalized || byId.has(normalized.id)) continue;
      byId.set(normalized.id, normalized);
    }
    return Object.freeze([...byId.values()]
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, MAX_ENTRIES));
  }

  function normalizeRange(days) {
    const numeric = Number(days);
    return VALID_RANGES.includes(numeric) ? numeric : 14;
  }

  function startOfRange(days, now) {
    const cutoff = toDate(now) || new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (normalizeRange(days) - 1));
    return cutoff;
  }

  function filterEntriesByRange(entries, days = 14, now = new Date()) {
    const cutoff = startOfRange(days, now).getTime();
    const current = (toDate(now) || new Date()).getTime() + 5 * 60_000;
    return (Array.isArray(entries) ? entries : [])
      .filter((item) => {
        const timestamp = Date.parse(item && item.date);
        return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= current;
      })
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }

  function dayKey(value) {
    const date = toDate(value);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function summarizeEntries(entries, days = 14, now = new Date()) {
    const rangeDays = normalizeRange(days);
    const filtered = filterEntriesByRange(entries, rangeDays, now);
    const moods = filtered.map((item) => Number(item.mood)).filter(Number.isFinite);
    const energies = filtered.map((item) => Number(item.energy)).filter(Number.isFinite);
    const averageMoodRaw = mean(moods);
    const variance = moods.length
      ? mean(moods.map((value) => (value - averageMoodRaw) ** 2))
      : 0;

    const chronological = [...filtered].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    let directionDelta = 0;
    let direction = 'steady';
    if (chronological.length >= 4) {
      const midpoint = Math.floor(chronological.length / 2);
      const earlier = mean(chronological.slice(0, midpoint).map((item) => item.mood));
      const later = mean(chronological.slice(midpoint).map((item) => item.mood));
      directionDelta = round(later - earlier, 1);
      if (directionDelta >= 0.5) direction = 'up';
      if (directionDelta <= -0.5) direction = 'down';
    }

    return Object.freeze({
      rangeDays,
      count: filtered.length,
      daysWithEntries: new Set(filtered.map((item) => dayKey(item.date))).size,
      averageMood: round(averageMoodRaw, 1),
      averageEnergy: round(mean(energies), 1),
      variability: round(Math.sqrt(variance), 1),
      direction,
      directionDelta,
    });
  }

  function calculateFactorPatterns(entries) {
    const records = Array.isArray(entries) ? entries : [];
    if (!records.length) return Object.freeze([]);
    const overall = mean(records.map((item) => Number(item.mood)).filter(Number.isFinite));
    const groups = new Map();
    for (const item of records) {
      const factors = uniqueKnown(item && item.factors, FACTORS, 5);
      for (const factor of factors) {
        if (!groups.has(factor)) groups.set(factor, []);
        groups.get(factor).push(Number(item.mood));
      }
    }

    const patterns = [];
    for (const [factor, moods] of groups.entries()) {
      if (moods.length < 3) continue;
      const averageMood = round(mean(moods), 1);
      const difference = round(averageMood - overall, 1);
      const direction = difference >= 0.5 ? 'higher' : difference <= -0.5 ? 'lower' : 'similar';
      const comparison = direction === 'higher'
        ? `比这段时间整体均值高 ${Math.abs(difference).toFixed(1)}`
        : direction === 'lower'
          ? `比这段时间整体均值低 ${Math.abs(difference).toFixed(1)}`
          : '与这段时间整体均值接近';
      patterns.push(Object.freeze({
        factor,
        count: moods.length,
        averageMood,
        difference,
        direction,
        description: `“${factor}”与 ${moods.length} 条记录同时出现，心情均值 ${averageMood.toFixed(1)}，${comparison}。`,
      }));
    }
    patterns.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || b.count - a.count || a.factor.localeCompare(b.factor, 'zh-CN'));
    return Object.freeze(patterns);
  }

  function buildLocalInsights(entries, days = 14, now = new Date()) {
    const rangeDays = normalizeRange(days);
    const filtered = filterEntriesByRange(entries, rangeDays, now);
    const summary = summarizeEntries(filtered, rangeDays, now);
    if (!summary.count) {
      return Object.freeze([Object.freeze({
        title: '等待第一条观测',
        text: '保存一条记录后，这里会用可复算的数据描述变化。',
        evidence: '当前范围 0 条记录',
      })]);
    }
    if (summary.count < 3) {
      return Object.freeze([Object.freeze({
        title: '样本还很少',
        text: `当前只有 ${summary.count} 条记录，先继续记录，不急着给变化下结论。`,
        evidence: `${rangeDays} 天内 ${summary.count} 条记录`,
      })]);
    }

    const result = [];
    const directionCopy = summary.direction === 'up'
      ? `后半段心情均值比前半段高 ${Math.abs(summary.directionDelta).toFixed(1)}。`
      : summary.direction === 'down'
        ? `后半段心情均值比前半段低 ${Math.abs(summary.directionDelta).toFixed(1)}。`
        : '前后两段的心情均值暂未出现明显差异。';
    result.push(Object.freeze({
      title: '这段时间的潮向',
      text: directionCopy,
      evidence: `${summary.count} 条记录 · 心情均值 ${summary.averageMood.toFixed(1)}`,
    }));

    result.push(Object.freeze({
      title: summary.variability >= 1.2 ? '潮位变化较多' : '潮位相对平稳',
      text: summary.variability >= 1.2
        ? '心情记录的高低差异较明显，可以回看具体日期发生了什么。'
        : '记录之间的心情差异不大，这只是当前样本的描述。',
      evidence: `波动值 ${summary.variability.toFixed(1)} · ${summary.daysWithEntries} 个记录日`,
    }));

    const pattern = calculateFactorPatterns(filtered)[0];
    if (pattern) {
      result.push(Object.freeze({
        title: `留意“${pattern.factor}”`,
        text: pattern.description,
        evidence: `${pattern.count} 条含该因素的记录`,
      }));
    }
    return Object.freeze(result);
  }

  function buildAIPayload(entries, options = {}) {
    const now = options.now || new Date();
    const rangeDays = normalizeRange(options.rangeDays);
    const includeNotes = options.includeNotes === true;
    const filtered = filterEntriesByRange(entries, rangeDays, now).slice(0, MAX_AI_RECORDS);
    const records = [...filtered].reverse().map((item) => {
      const record = {
        date: dayKey(item.date),
        mood: Number(item.mood),
        energy: Number(item.energy),
        emotions: [...uniqueKnown(item.emotions, EMOTIONS, 5)],
        factors: [...uniqueKnown(item.factors, FACTORS, 5)],
      };
      if (includeNotes && item.note) record.noteExcerpt = clampText(item.note, 240);
      return Object.freeze(record);
    });
    return Object.freeze({
      version: VERSION,
      rangeDays,
      includeNotes,
      summary: summarizeEntries(filtered, rangeDays, now),
      factorPatterns: calculateFactorPatterns(filtered).slice(0, 5),
      records: Object.freeze(records),
    });
  }

  function sanitizeList(value, limit) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
      const text = clampText(item, 240);
      if (!text || MEDICAL_CLAIM.test(text) || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
      if (result.length >= limit) break;
    }
    return result;
  }

  function sanitizeAIInsights(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const observations = sanitizeList(input.observations, 3);
    const questions = sanitizeList(input.questions, 3);
    const actions = sanitizeList(input.actions, 3);
    if (!observations.length && !questions.length && !actions.length) return null;
    return Object.freeze({
      observations: Object.freeze(observations),
      questions: Object.freeze(questions),
      actions: Object.freeze(actions),
      disclaimer: '这些内容只用于自我反思，不能替代专业诊断、治疗或紧急帮助。',
    });
  }

  function importBackup(input, now = new Date()) {
    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch {
        throw new Error('无法读取备份 JSON。');
      }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份格式无效。');
    if (Number(data.version) !== VERSION) throw new Error('备份版本不受支持。');
    if (!Array.isArray(data.entries)) throw new Error('备份中没有记录列表。');
    const entries = normalizeEntries(data.entries, now);
    return Object.freeze({
      version: VERSION,
      entries,
      totalCount: data.entries.length,
      rejectedCount: Math.max(0, data.entries.length - entries.length),
    });
  }

  function createBackup(entries, exportedAt = new Date()) {
    const date = toDate(exportedAt) || new Date();
    return {
      version: VERSION,
      app: 'TIDE/71',
      exportedAt: date.toISOString(),
      entries: normalizeEntries(entries, date).map((item) => ({
        id: item.id,
        date: item.date,
        mood: item.mood,
        energy: item.energy,
        emotions: [...item.emotions],
        factors: [...item.factors],
        note: item.note,
      })),
    };
  }

  return Object.freeze({
    VERSION,
    MAX_ENTRIES,
    MAX_NOTE_LENGTH,
    MAX_AI_RECORDS,
    VALID_RANGES,
    EMOTIONS,
    FACTORS,
    clampText,
    dayKey,
    normalizeRange,
    normalizeEntry,
    normalizeEntries,
    filterEntriesByRange,
    summarizeEntries,
    calculateFactorPatterns,
    buildLocalInsights,
    buildAIPayload,
    sanitizeAIInsights,
    importBackup,
    createBackup,
  });
});
