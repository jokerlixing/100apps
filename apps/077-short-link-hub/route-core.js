(function routeCoreFactory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RouteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRouteCore() {
  "use strict";

  const STORAGE_VERSION = 1;
  const MAX_VISITS = 2000;
  const RESERVED_SLUGS = new Set([
    "api", "app", "apps", "assets", "admin", "health", "index", "login",
    "logout", "new", "qr", "r", "route", "routes", "settings", "static",
  ]);

  function cleanText(value, maxLength = 80) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function normalizeUrl(value) {
    let candidate = cleanText(value, 2048);
    if (!candidate) throw new Error("请输入目标地址");
    if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error("目标地址格式不正确");
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("目标地址只支持 http 或 https");
    if (parsed.username || parsed.password) throw new Error("目标地址不能包含账号或密码");
    if (!parsed.hostname || parsed.hostname.length > 253) throw new Error("目标地址缺少有效域名");
    parsed.hash = parsed.hash.slice(0, 256);
    const normalized = parsed.toString();
    if (normalized.length > 2048) throw new Error("目标地址不能超过 2048 个字符");
    return normalized;
  }

  function normalizeSlug(value) {
    return cleanText(value, 64)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32)
      .replace(/-$/g, "");
  }

  function validateSlug(value) {
    const slug = normalizeSlug(value);
    if (slug.length < 3) throw new Error("短链别名至少需要 3 个字符");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(slug)) {
      throw new Error("别名只能使用小写字母、数字和中间连字符");
    }
    if (RESERVED_SLUGS.has(slug)) throw new Error("这个别名由系统保留，请换一个");
    return slug;
  }

  function randomToken(random = Math.random, length = 4) {
    const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
    let token = "";
    for (let index = 0; index < length; index += 1) {
      token += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
    }
    return token;
  }

  function buildAutomaticSlug(url, existingSlugs, random = Math.random) {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const stem = normalizeSlug(hostname.split(".")[0]) || "route";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = randomToken(random, attempt > 8 ? 6 : 4);
      const slug = `${stem.slice(0, 25)}-${suffix}`;
      if (!existingSlugs.has(slug) && !RESERVED_SLUGS.has(slug)) return slug;
    }
    throw new Error("暂时无法生成唯一别名，请手动填写");
  }

  function makeId(now = Date.now, random = Math.random) {
    return `route_${now().toString(36)}_${randomToken(random, 6)}`;
  }

  function createLink(input, existingLinks = [], options = {}) {
    const now = options.now || Date.now;
    const random = options.random || Math.random;
    const target = normalizeUrl(input.target);
    const existingSlugs = new Set(existingLinks.map((link) => normalizeSlug(link.slug)));
    const requestedSlug = normalizeSlug(input.slug);
    const slug = requestedSlug ? validateSlug(requestedSlug) : buildAutomaticSlug(target, existingSlugs, random);
    if (existingSlugs.has(slug)) throw new Error("这个别名已被占用");

    const hostname = new URL(target).hostname.replace(/^www\./, "");
    return {
      id: makeId(now, random),
      slug,
      target,
      label: cleanText(input.label, 60) || hostname,
      campaign: cleanText(input.campaign, 40) || "日常入口",
      active: true,
      createdAt: new Date(now()).toISOString(),
      visits: [],
    };
  }

  function normalizeVisit(input, now = Date.now) {
    const date = new Date(input?.at || now());
    return {
      at: Number.isNaN(date.getTime()) ? new Date(now()).toISOString() : date.toISOString(),
      source: cleanText(input?.source, 32) || "直接访问",
      device: ["手机", "桌面", "平板", "其他"].includes(input?.device) ? input.device : "其他",
    };
  }

  function recordVisit(link, visit, now = Date.now) {
    const visits = Array.isArray(link.visits) ? link.visits.slice(-(MAX_VISITS - 1)) : [];
    visits.push(normalizeVisit(visit, now));
    return { ...link, visits };
  }

  function utcDay(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function recentDayKeys(nowValue, count = 7) {
    const now = new Date(nowValue);
    const keys = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
      keys.push(day.toISOString().slice(0, 10));
    }
    return keys;
  }

  function countBy(items, key) {
    const result = {};
    for (const item of items) {
      const value = item[key] || "其他";
      result[value] = (result[value] || 0) + 1;
    }
    return Object.entries(result)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }

  function aggregateLink(link, nowValue = Date.now()) {
    const visits = Array.isArray(link.visits) ? link.visits.map((visit) => normalizeVisit(visit, () => nowValue)) : [];
    const days = recentDayKeys(nowValue);
    const dayCounts = Object.fromEntries(days.map((day) => [day, 0]));
    for (const visit of visits) {
      const day = utcDay(visit.at);
      if (day in dayCounts) dayCounts[day] += 1;
    }
    const sources = countBy(visits, "source");
    const devices = countBy(visits, "device");
    return {
      total: visits.length,
      last7: days.reduce((sum, day) => sum + dayCounts[day], 0),
      today: dayCounts[days[days.length - 1]],
      days: days.map((day) => ({ day, count: dayCounts[day] })),
      sources,
      devices,
      topSource: sources[0]?.name || "暂无来源",
    };
  }

  function aggregateWorkspace(links, nowValue = Date.now()) {
    const normalized = Array.isArray(links) ? links : [];
    const totals = normalized.map((link) => aggregateLink(link, nowValue));
    return {
      routes: normalized.length,
      active: normalized.filter((link) => link.active !== false).length,
      visits: totals.reduce((sum, item) => sum + item.total, 0),
      last7: totals.reduce((sum, item) => sum + item.last7, 0),
    };
  }

  function classifyDevice(userAgent = "") {
    const value = String(userAgent);
    if (/ipad|tablet|playbook|silk/i.test(value)) return "平板";
    if (/mobi|android|iphone|ipod/i.test(value)) return "手机";
    if (/windows|macintosh|linux|cros/i.test(value)) return "桌面";
    return "其他";
  }

  function classifySource({ source = "", referer = "" } = {}) {
    const explicit = cleanText(source, 32).toLowerCase();
    const haystack = `${explicit} ${String(referer).toLowerCase()}`;
    if (/wechat|weixin|微信/.test(haystack)) return "微信";
    if (/xiaohongshu|xhs|小红书/.test(haystack)) return "小红书";
    if (/douyin|tiktok|抖音/.test(haystack)) return "抖音";
    if (/email|mail|邮件/.test(haystack)) return "邮件";
    if (/weibo|微博/.test(haystack)) return "微博";
    if (/search|baidu|google|bing/.test(haystack)) return "搜索";
    if (explicit) return cleanText(source, 20);
    if (referer) {
      try { return new URL(referer).hostname.replace(/^www\./, "").slice(0, 24); } catch { return "外部页面"; }
    }
    return "直接访问";
  }

  function normalizeLink(value) {
    if (!value || typeof value !== "object") return null;
    try {
      const link = {
        id: cleanText(value.id, 80),
        slug: validateSlug(value.slug),
        target: normalizeUrl(value.target),
        label: cleanText(value.label, 60),
        campaign: cleanText(value.campaign, 40) || "日常入口",
        active: value.active !== false,
        createdAt: new Date(value.createdAt).toISOString(),
        visits: Array.isArray(value.visits) ? value.visits.slice(-MAX_VISITS).map((visit) => normalizeVisit(visit)) : [],
      };
      if (!link.id || Number.isNaN(new Date(link.createdAt).getTime())) return null;
      return link;
    } catch {
      return null;
    }
  }

  function normalizeWorkspace(value) {
    const links = Array.isArray(value?.links) ? value.links.map(normalizeLink).filter(Boolean) : [];
    const seen = new Set();
    return {
      version: STORAGE_VERSION,
      links: links.filter((link) => {
        if (seen.has(link.slug)) return false;
        seen.add(link.slug);
        return true;
      }),
    };
  }

  function seedWorkspace(nowValue = Date.now()) {
    const today = new Date(nowValue);
    const ago = (days, hour) => new Date(Date.UTC(
      today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, hour, (days * 11) % 60,
    )).toISOString();
    const seedDefinitions = [
      ["autumn-market", "https://example.com/autumn-market", "秋日市集预约", "线下活动", true, 34],
      ["studio-notes", "https://example.com/studio/notes", "工作室周报", "内容订阅", true, 21],
      ["menu-preview", "https://example.com/menu", "周末菜单预览", "门店桌卡", true, 15],
      ["old-portfolio", "https://example.com/archive", "旧版作品集", "历史入口", false, 7],
    ];
    const sources = ["微信", "直接访问", "小红书", "邮件", "搜索"];
    const devices = ["手机", "手机", "桌面", "手机", "平板"];
    const links = seedDefinitions.map(([slug, target, label, campaign, active, count], linkIndex) => ({
      id: `route_seed_${linkIndex + 1}`,
      slug,
      target,
      label,
      campaign,
      active,
      createdAt: ago(18 - linkIndex * 3, 9),
      visits: Array.from({ length: count }, (_, visitIndex) => ({
        at: ago((visitIndex * 3 + linkIndex) % 7, 8 + (visitIndex % 11)),
        source: sources[(visitIndex + linkIndex) % sources.length],
        device: devices[(visitIndex * 2 + linkIndex) % devices.length],
      })),
    }));
    return { version: STORAGE_VERSION, links };
  }

  return {
    STORAGE_VERSION,
    RESERVED_SLUGS,
    aggregateLink,
    aggregateWorkspace,
    buildAutomaticSlug,
    classifyDevice,
    classifySource,
    cleanText,
    createLink,
    normalizeLink,
    normalizeSlug,
    normalizeUrl,
    normalizeVisit,
    normalizeWorkspace,
    recordVisit,
    seedWorkspace,
    validateSlug,
  };
});
