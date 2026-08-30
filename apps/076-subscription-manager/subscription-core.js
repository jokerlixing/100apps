(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SubscriptionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_SUBSCRIPTIONS = 200;
  const CURRENCIES = ['CNY', 'USD', 'EUR', 'JPY', 'HKD'];
  const CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly'];
  const CATEGORIES = ['entertainment', 'productivity', 'cloud', 'learning', 'lifestyle', 'other'];
  const STATUSES = ['active', 'paused'];
  const REMINDER_OPTIONS = [0, 1, 3, 7, 14, 30];
  const CYCLE_MONTHS = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

  function plainRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function parseDate(value) {
    const text = String(value || '');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function toDateString(date) {
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  function todayString(now) {
    const date = now instanceof Date ? now : new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function safeTimestamp(value, fallback) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
  }

  function closestReminder(value) {
    const target = Number(value);
    return REMINDER_OPTIONS.reduce((best, option) => (
      Math.abs(option - target) < Math.abs(best - target) ? option : best
    ), 7);
  }

  function normalizeSubscription(input, nowISO) {
    if (!plainRecord(input)) return null;
    const name = cleanText(input.name, 80);
    const amount = roundMoney(input.amount);
    const nextRenewal = parseDate(input.nextRenewal) ? String(input.nextRenewal) : '';
    if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000 || !nextRenewal) return null;

    const fallbackNow = safeTimestamp(nowISO, new Date().toISOString());
    const id = cleanText(input.id, 72).replace(/[^a-zA-Z0-9_-]/g, '') || '';
    if (!id) return null;

    return {
      id,
      name,
      amount,
      currency: CURRENCIES.includes(input.currency) ? input.currency : 'CNY',
      cycle: CYCLES.includes(input.cycle) ? input.cycle : 'monthly',
      nextRenewal,
      category: CATEGORIES.includes(input.category) ? input.category : 'other',
      payment: cleanText(input.payment, 60),
      reminderDays: closestReminder(input.reminderDays),
      status: STATUSES.includes(input.status) ? input.status : 'active',
      notes: cleanText(input.notes, 500),
      createdAt: safeTimestamp(input.createdAt, fallbackNow),
      updatedAt: safeTimestamp(input.updatedAt, fallbackNow),
    };
  }

  function normalizeSubscriptions(items) {
    if (!Array.isArray(items)) return [];
    const ids = new Set();
    const normalized = [];
    for (const item of items) {
      const subscription = normalizeSubscription(item);
      if (!subscription || ids.has(subscription.id)) continue;
      ids.add(subscription.id);
      normalized.push(subscription);
      if (normalized.length >= MAX_SUBSCRIPTIONS) break;
    }
    return normalized;
  }

  function monthlyEquivalent(subscription) {
    const item = normalizeSubscription(subscription);
    if (!item) return 0;
    return roundMoney(item.amount * CYCLE_MONTHS[item.cycle]);
  }

  function annualEquivalent(subscription) {
    return roundMoney(monthlyEquivalent(subscription) * 12);
  }

  function daysUntil(dateString, referenceDate) {
    const target = parseDate(dateString);
    const reference = parseDate(referenceDate || todayString());
    if (!target || !reference) return null;
    return Math.round((target.getTime() - reference.getTime()) / 86_400_000);
  }

  function renewalState(subscription, referenceDate) {
    const item = normalizeSubscription(subscription);
    if (!item) return { key: 'invalid', label: '数据无效', days: null };
    const days = daysUntil(item.nextRenewal, referenceDate);
    if (item.status === 'paused') return { key: 'paused', label: '已暂停', days };
    if (days < 0) return { key: 'overdue', label: `已过期 ${Math.abs(days)} 天`, days };
    if (days <= item.reminderDays) return { key: 'due', label: days === 0 ? '今天续费' : `${days} 天后续费`, days };
    if (days <= 30) return { key: 'upcoming', label: `${days} 天后续费`, days };
    return { key: 'later', label: `${days} 天后续费`, days };
  }

  function buildTimeline(items, referenceDate, windowDays) {
    const daysWindow = Math.max(1, Math.min(90, Number(windowDays) || 30));
    return normalizeSubscriptions(items)
      .filter((item) => item.status === 'active')
      .map((item) => ({ ...item, days: daysUntil(item.nextRenewal, referenceDate), state: renewalState(item, referenceDate).key }))
      .filter((item) => item.days !== null && item.days >= -daysWindow && item.days <= daysWindow)
      .sort((a, b) => a.days - b.days || b.amount - a.amount || a.name.localeCompare(b.name, 'zh-CN'));
  }

  function summarizeSubscriptions(items, referenceDate) {
    const subscriptions = normalizeSubscriptions(items);
    const totals = {};
    let dueCount = 0;
    let overdueCount = 0;
    let pausedCount = 0;
    let activeCount = 0;

    for (const item of subscriptions) {
      if (item.status === 'paused') {
        pausedCount += 1;
        continue;
      }
      activeCount += 1;
      const state = renewalState(item, referenceDate);
      if (state.key === 'due' || state.key === 'overdue') dueCount += 1;
      if (state.key === 'overdue') overdueCount += 1;
      if (!totals[item.currency]) totals[item.currency] = { monthly: 0, annual: 0 };
      totals[item.currency].monthly = roundMoney(totals[item.currency].monthly + monthlyEquivalent(item));
      totals[item.currency].annual = roundMoney(totals[item.currency].annual + annualEquivalent(item));
    }

    const timeline = buildTimeline(subscriptions, referenceDate, 30);
    return {
      totalCount: subscriptions.length,
      activeCount,
      pausedCount,
      dueCount,
      overdueCount,
      renewal30Count: timeline.length,
      totals,
      next: timeline.find((item) => item.days >= 0) || timeline[0] || null,
    };
  }

  function groupByCategory(items, currency) {
    const targetCurrency = CURRENCIES.includes(currency) ? currency : 'CNY';
    const groups = new Map();
    for (const item of normalizeSubscriptions(items)) {
      if (item.status !== 'active' || item.currency !== targetCurrency) continue;
      const current = groups.get(item.category) || { category: item.category, monthly: 0, count: 0 };
      current.monthly = roundMoney(current.monthly + monthlyEquivalent(item));
      current.count += 1;
      groups.set(item.category, current);
    }
    return [...groups.values()].sort((a, b) => b.monthly - a.monthly || a.category.localeCompare(b.category));
  }

  function addMonthsClamped(date, months) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const first = new Date(Date.UTC(year, month + months, 1, 12));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
    first.setUTCDate(Math.min(day, lastDay));
    return first;
  }

  function advanceRenewal(subscription, referenceDate) {
    const item = normalizeSubscription(subscription);
    const reference = parseDate(referenceDate || todayString());
    if (!item || !reference) return null;
    let date = parseDate(item.nextRenewal);
    let guard = 0;
    do {
      if (item.cycle === 'weekly') date = new Date(date.getTime() + 7 * 86_400_000);
      else if (item.cycle === 'monthly') date = addMonthsClamped(date, 1);
      else if (item.cycle === 'quarterly') date = addMonthsClamped(date, 3);
      else date = addMonthsClamped(date, 12);
      guard += 1;
    } while (date.getTime() <= reference.getTime() && guard < 600);
    return { ...item, nextRenewal: toDateString(date), updatedAt: new Date().toISOString() };
  }

  function importBackup(raw, existing, mode) {
    if (typeof raw === 'string' && raw.length > 1_000_000) return { ok: false, error: '备份文件超过 1 MB。' };
    let payload;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      return { ok: false, error: '备份不是有效的 JSON。' };
    }
    if (!plainRecord(payload) || payload.version !== 1 || !Array.isArray(payload.subscriptions)) {
      return { ok: false, error: '备份格式或版本不受支持。' };
    }

    const incoming = [];
    const incomingIds = new Set();
    let rejected = 0;
    for (const candidate of payload.subscriptions.slice(0, 500)) {
      const item = normalizeSubscription(candidate);
      if (!item || incomingIds.has(item.id) || incoming.length >= MAX_SUBSCRIPTIONS) {
        rejected += 1;
        continue;
      }
      incomingIds.add(item.id);
      incoming.push(item);
    }
    if (payload.subscriptions.length > 500) rejected += payload.subscriptions.length - 500;

    if (mode === 'replace') return { ok: true, subscriptions: incoming, accepted: incoming.length, rejected };

    const merged = new Map(normalizeSubscriptions(existing).map((item) => [item.id, item]));
    for (const item of incoming) {
      if (merged.size >= MAX_SUBSCRIPTIONS && !merged.has(item.id)) {
        rejected += 1;
        continue;
      }
      merged.set(item.id, item);
    }
    return { ok: true, subscriptions: [...merged.values()], accepted: incoming.length, rejected };
  }

  function createBackup(items, exportedAt) {
    return {
      version: 1,
      app: 'DUE/76',
      exportedAt: safeTimestamp(exportedAt, new Date().toISOString()),
      subscriptions: normalizeSubscriptions(items),
    };
  }

  return Object.freeze({
    MAX_SUBSCRIPTIONS,
    CURRENCIES: Object.freeze([...CURRENCIES]),
    CYCLES: Object.freeze([...CYCLES]),
    CATEGORIES: Object.freeze([...CATEGORIES]),
    REMINDER_OPTIONS: Object.freeze([...REMINDER_OPTIONS]),
    normalizeSubscription,
    normalizeSubscriptions,
    monthlyEquivalent,
    annualEquivalent,
    daysUntil,
    renewalState,
    summarizeSubscriptions,
    buildTimeline,
    groupByCategory,
    advanceRenewal,
    importBackup,
    createBackup,
    todayString,
  });
});
