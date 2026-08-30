(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TallyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = Object.freeze(['expense', 'income']);
  const CATEGORIES = Object.freeze([
    'food', 'transport', 'shopping', 'housing', 'health', 'education',
    'entertainment', 'salary', 'bonus', 'reimbursement', 'refund', 'other',
  ]);
  const ACCOUNTS = Object.freeze(['wechat', 'alipay', 'cash', 'bank', 'other']);
  const CATEGORY_LABELS = Object.freeze({
    food: '餐饮', transport: '交通', shopping: '购物', housing: '居住',
    health: '医疗', education: '学习', entertainment: '娱乐', salary: '工资',
    bonus: '奖金', reimbursement: '报销', refund: '退款', other: '其他',
  });
  const ACCOUNT_LABELS = Object.freeze({
    wechat: '微信', alipay: '支付宝', cash: '现金', bank: '银行卡', other: '未指定',
  });
  const TYPE_LABELS = Object.freeze({ expense: '支出', income: '收入' });
  const MAX_BACKUP_BYTES = 1_000_000;
  const MAX_RECORDS = 500;

  const digitMap = Object.freeze({
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  });
  const smallUnits = Object.freeze({ 十: 10, 百: 100, 千: 1000 });
  const categoryRules = Object.freeze([
    ['salary', /工资|薪资|薪水|发薪|月薪/],
    ['bonus', /奖金|年终奖|提成|分红/],
    ['reimbursement', /报销|垫付返还/],
    ['refund', /退款|退货|返现/],
    ['food', /早餐|早饭|午饭|午餐|晚饭|晚餐|夜宵|外卖|吃饭|餐厅|咖啡|奶茶|面包|水果/],
    ['transport', /打车|出租车|地铁|公交|高铁|火车|机票|加油|停车|通勤|滴滴/],
    ['shopping', /超市|淘宝|京东|买衣|购物|日用品|便利店|商场/],
    ['housing', /房租|租金|物业|水费|电费|燃气|宽带|装修/],
    ['health', /医院|看病|挂号|买药|药店|体检|牙医/],
    ['education', /课程|学费|书籍|买书|培训|考试/],
    ['entertainment', /电影|游戏|演出|音乐|会员|旅行|门票/],
  ]);

  function cleanText(value, max = 300) {
    return String(value ?? '')
      .replace(/[<>\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function parseChineseInteger(value) {
    const text = String(value || '').replace(/[元圆整正]/g, '');
    if (!text) return 0;
    if (/^[零〇一二两三四五六七八九]+$/.test(text)) {
      return Number([...text].map((character) => digitMap[character]).join(''));
    }

    let total = 0;
    let section = 0;
    let number = 0;
    for (const character of text) {
      if (Object.hasOwn(digitMap, character)) {
        number = digitMap[character];
      } else if (Object.hasOwn(smallUnits, character)) {
        section += (number || 1) * smallUnits[character];
        number = 0;
      } else if (character === '万') {
        total += (section + number || 1) * 10000;
        section = 0;
        number = 0;
      } else {
        return NaN;
      }
    }
    return total + section + number;
  }

  function parseChineseNumber(value) {
    let text = String(value ?? '').trim().replace(/钱|人民币|圆/g, '').replace(/元$/, '');
    if (!text) return NaN;

    const arabicColloquial = text.match(/^(\d+(?:\.\d+)?)\s*块\s*(\d)?\s*(?:毛|角)?\s*(\d)?\s*分?$/);
    if (arabicColloquial) {
      return roundMoney(Number(arabicColloquial[1]) + Number(arabicColloquial[2] || 0) / 10 + Number(arabicColloquial[3] || 0) / 100);
    }
    if (/^\d+(?:\.\d+)?$/.test(text)) return roundMoney(Number(text));

    const blockIndex = text.indexOf('块');
    if (blockIndex >= 0) {
      const whole = parseChineseInteger(text.slice(0, blockIndex));
      const fractionText = text.slice(blockIndex + 1);
      if (!fractionText) return roundMoney(whole);
      const tenthsMatch = fractionText.match(/^([零〇一二两三四五六七八九])(?:毛|角)?(?:([零〇一二两三四五六七八九])分?)?$/);
      if (!tenthsMatch) return NaN;
      return roundMoney(whole + digitMap[tenthsMatch[1]] / 10 + (tenthsMatch[2] ? digitMap[tenthsMatch[2]] / 100 : 0));
    }

    const decimalParts = text.split('点');
    if (decimalParts.length > 2) return NaN;
    const whole = parseChineseInteger(decimalParts[0]);
    if (!Number.isFinite(whole)) return NaN;
    if (decimalParts.length === 1) {
      const jiao = text.match(/^(.+?)([零〇一二两三四五六七八九])(?:毛|角)$/);
      if (jiao) return roundMoney(parseChineseInteger(jiao[1]) + digitMap[jiao[2]] / 10);
      return roundMoney(whole);
    }
    if (!/^[零〇一二两三四五六七八九]+$/.test(decimalParts[1])) return NaN;
    const decimals = Number(`0.${[...decimalParts[1]].map((character) => digitMap[character]).join('')}`);
    return roundMoney(whole + decimals);
  }

  function isValidDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
      && date.getUTCMonth() === Number(match[2]) - 1
      && date.getUTCDate() === Number(match[3]);
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateFromBase(baseDate) {
    const safe = isValidDate(baseDate) ? baseDate : toDateString(new Date());
    const [year, month, day] = safe.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function extractDate(text, baseDate) {
    const base = dateFromBase(baseDate);
    const explicit = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/);
    if (explicit) {
      const candidate = `${explicit[1] || base.getFullYear()}-${String(explicit[2]).padStart(2, '0')}-${String(explicit[3]).padStart(2, '0')}`;
      if (isValidDate(candidate)) return { value: candidate, matched: true, source: explicit[0] };
    }
    const relative = text.match(/前天|昨天|今日|今天/);
    if (relative) {
      const offset = relative[0] === '前天' ? -2 : relative[0] === '昨天' ? -1 : 0;
      base.setDate(base.getDate() + offset);
      return { value: toDateString(base), matched: true, source: relative[0] };
    }
    return { value: toDateString(base), matched: false, source: '' };
  }

  function extractAmount(text) {
    const normalized = text.replace(/[，,](?=\d{3}(?:\D|$))/g, '');
    const arabicBlock = normalized.match(/(\d+(?:\.\d+)?)\s*块\s*(\d)?\s*(?:毛|角)?\s*(\d)?\s*分?/);
    if (arabicBlock) return { value: parseChineseNumber(arabicBlock[0]), source: arabicBlock[0] };

    const arabicMoney = normalized.match(/(?:￥|¥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块|圆|人民币)/i);
    if (arabicMoney) return { value: roundMoney(arabicMoney[1]), source: arabicMoney[0] };

    const chineseMoney = normalized.match(/([零〇一二两三四五六七八九十百千万点]+(?:块(?:[零〇一二两三四五六七八九](?:毛|角)?(?:[零〇一二两三四五六七八九]分?)?)?|(?:元|圆)(?:[零〇一二两三四五六七八九](?:毛|角)(?:[零〇一二两三四五六七八九]分?)?)?))/);
    if (chineseMoney) {
      const value = parseChineseNumber(chineseMoney[1].replace(/元|圆/g, ''));
      if (Number.isFinite(value)) return { value, source: chineseMoney[0] };
    }

    const withoutDate = normalized
      .replace(/(?:\d{4}年)?\d{1,2}月\d{1,2}日?/g, '')
      .replace(/\d{4}-\d{1,2}-\d{1,2}/g, '');
    const afterVerb = withoutDate.match(/(?:花了?|消费|付款|付了?|支付|买了?|到账|收入|工资|奖金|报销|退款|赚了?|收了?)\D{0,5}(\d+(?:\.\d{1,2})?)/);
    if (afterVerb) return { value: roundMoney(afterVerb[1]), source: afterVerb[1] };
    const candidates = [...withoutDate.matchAll(/\d+(?:\.\d{1,2})?/g)];
    if (candidates.length === 1) return { value: roundMoney(candidates[0][0]), source: candidates[0][0] };
    return { value: null, source: '' };
  }

  function inferType(text) {
    if (/工资|薪资|奖金|报销|退款|返现|到账|收入|赚了?|收款|入账/.test(text)) return { value: 'income', matched: true };
    if (/花了?|消费|付款|付了?|支付|买了?|支出|扣款/.test(text)) return { value: 'expense', matched: true };
    return { value: 'expense', matched: false };
  }

  function inferCategory(text, type) {
    for (const [category, pattern] of categoryRules) {
      if (pattern.test(text)) return { value: category, matched: true };
    }
    return { value: type === 'income' ? 'other' : 'other', matched: false };
  }

  function inferAccount(text) {
    if (/微信|零钱/.test(text)) return { value: 'wechat', matched: true };
    if (/支付宝|花呗/.test(text)) return { value: 'alipay', matched: true };
    if (/现金|现钞/.test(text)) return { value: 'cash', matched: true };
    if (/银行卡|信用卡|储蓄卡|银行|刷卡/.test(text)) return { value: 'bank', matched: true };
    return { value: 'other', matched: false };
  }

  function parseTranscript(value, options = {}) {
    const transcript = cleanText(value, 300);
    const amount = extractAmount(transcript);
    const type = inferType(transcript);
    const category = inferCategory(transcript, type.value);
    const account = inferAccount(transcript);
    const date = extractDate(transcript, options.baseDate);
    const matchedFields = [];
    const warnings = [];
    const errors = [];
    let confidence = 0;

    if (Number.isFinite(amount.value) && amount.value > 0) { matchedFields.push('amount'); confidence += 0.45; }
    else errors.push('没有识别到明确金额，请在小票中填写金额。');
    if (type.matched) { matchedFields.push('type'); confidence += 0.1; }
    else warnings.push('未识别收支方向，已按支出处理。');
    if (category.matched) { matchedFields.push('category'); confidence += 0.2; }
    else warnings.push('未识别分类，已放入其他。');
    if (account.matched) { matchedFields.push('account'); confidence += 0.15; }
    else warnings.push('未识别账户，请确认付款方式。');
    if (date.matched) { matchedFields.push('date'); confidence += 0.1; }
    else confidence += 0.05;

    return {
      ok: errors.length === 0,
      transaction: {
        type: type.value,
        amount: Number.isFinite(amount.value) && amount.value > 0 ? amount.value : null,
        category: category.value,
        account: account.value,
        date: date.value,
        note: transcript,
        transcript,
      },
      matchedFields,
      warnings,
      errors,
      confidence: Math.round(confidence * 100) / 100,
      sources: { amount: amount.source, date: date.source },
    };
  }

  function normalizeTransaction(value) {
    if (!value || typeof value !== 'object') return null;
    const type = TYPES.includes(value.type) ? value.type : null;
    const category = CATEGORIES.includes(value.category) ? value.category : null;
    const account = ACCOUNTS.includes(value.account) ? value.account : null;
    const amount = roundMoney(value.amount);
    const date = cleanText(value.date, 10);
    if (!type || !category || !account || !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99 || !isValidDate(date)) return null;
    const now = new Date().toISOString();
    return {
      id: cleanText(value.id, 80) || `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      amount,
      category,
      account,
      date,
      note: cleanText(value.note, 120),
      transcript: cleanText(value.transcript, 300),
      createdAt: cleanText(value.createdAt, 40) || now,
      updatedAt: cleanText(value.updatedAt, 40) || now,
    };
  }

  function normalizeTransactions(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const output = [];
    for (const value of values.slice(0, MAX_RECORDS * 2)) {
      const normalized = normalizeTransaction(value);
      if (!normalized || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      output.push(normalized);
      if (output.length >= MAX_RECORDS) break;
    }
    return output;
  }

  function summarizeMonth(values, month) {
    const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : toDateString(new Date()).slice(0, 7);
    const transactions = normalizeTransactions(values).filter((item) => item.date.startsWith(safeMonth));
    let income = 0;
    let expense = 0;
    const categoryMap = new Map();
    for (const item of transactions) {
      if (item.type === 'income') income += item.amount;
      else {
        expense += item.amount;
        const current = categoryMap.get(item.category) || { category: item.category, amount: 0, count: 0 };
        current.amount += item.amount;
        current.count += 1;
        categoryMap.set(item.category, current);
      }
    }
    income = roundMoney(income);
    expense = roundMoney(expense);
    const categories = [...categoryMap.values()]
      .map((item) => ({ ...item, amount: roundMoney(item.amount), ratio: expense ? Math.round(item.amount / expense * 10000) / 100 : 0 }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
    return { month: safeMonth, income, expense, balance: roundMoney(income - expense), count: transactions.length, categories };
  }

  function filterTransactions(values, filters = {}) {
    const query = cleanText(filters.query, 80).toLocaleLowerCase('zh-CN');
    return normalizeTransactions(values)
      .filter((item) => !filters.month || item.date.startsWith(filters.month))
      .filter((item) => !filters.type || filters.type === 'all' || item.type === filters.type)
      .filter((item) => !filters.category || filters.category === 'all' || item.category === filters.category)
      .filter((item) => !query || `${item.note} ${item.transcript} ${CATEGORY_LABELS[item.category]} ${ACCOUNT_LABELS[item.account]}`.toLocaleLowerCase('zh-CN').includes(query))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\n\r，]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function toCSV(values) {
    const header = ['日期', '类型', '金额', '分类', '账户', '备注', '原始输入'];
    const rows = filterTransactions(values).map((item) => [
      item.date,
      TYPE_LABELS[item.type],
      item.amount.toFixed(2),
      CATEGORY_LABELS[item.category],
      ACCOUNT_LABELS[item.account],
      item.note,
      item.transcript,
    ]);
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  function exportBackup(values) {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions: normalizeTransactions(values) }, null, 2);
  }

  function importBackup(payload, existing = [], mode = 'merge') {
    try {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (!text || text.length > MAX_BACKUP_BYTES) return { ok: false, error: '备份文件无效或过大。', transactions: normalizeTransactions(existing), rejected: 0 };
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.transactions)) throw new Error('shape');
      const base = mode === 'replace' ? [] : normalizeTransactions(existing);
      const seen = new Set(base.map((item) => item.id));
      const transactions = [...base];
      let rejected = 0;
      for (const candidate of parsed.transactions.slice(0, MAX_RECORDS * 2)) {
        const normalized = normalizeTransaction(candidate);
        if (!normalized || seen.has(normalized.id) || transactions.length >= MAX_RECORDS) {
          rejected += 1;
          continue;
        }
        seen.add(normalized.id);
        transactions.push(normalized);
      }
      rejected += Math.max(0, parsed.transactions.length - MAX_RECORDS * 2);
      return { ok: true, transactions, rejected };
    } catch {
      return { ok: false, error: '无法读取备份，请选择 TALLY/96 导出的 JSON 文件。', transactions: normalizeTransactions(existing), rejected: 0 };
    }
  }

  return Object.freeze({
    TYPES, CATEGORIES, ACCOUNTS, CATEGORY_LABELS, ACCOUNT_LABELS, TYPE_LABELS,
    parseChineseNumber, parseTranscript, normalizeTransaction, normalizeTransactions,
    summarizeMonth, filterTransactions, toCSV, exportBackup, importBackup, isValidDate,
  });
});
