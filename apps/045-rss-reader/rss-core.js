(function createDial45Core() {
  "use strict";

  const SUBSCRIPTION_LIMIT = 40;
  const ARTICLE_LIMIT = 300;
  const COLORS = ["#f06449", "#243b6b", "#2f8f86", "#8766a8", "#c58a2e"];
  const ID_PATTERN = /^[a-zA-Z0-9_-]{4,96}$/;
  const STATUS = new Set(["idle", "loading", "ok", "error", "disabled"]);

  function cleanText(value, limit = 500) {
    if (typeof value !== "string") return "";
    return value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, Math.max(1, limit));
  }

  function normalizeHttpUrl(value, base) {
    try {
      const url = base ? new URL(String(value || ""), base) : new URL(String(value || ""));
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.hash = "";
      return url.href;
    } catch (error) {
      return null;
    }
  }

  function safeColor(value) {
    const color = String(value || "").toLowerCase();
    return COLORS.includes(color) ? color : COLORS[0];
  }

  function finiteTime(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value || "")) {
      result ^= char.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function normalizeSubscription(input) {
    if (!input || !ID_PATTERN.test(String(input.id || ""))) return null;
    const url = normalizeHttpUrl(input.url);
    if (!url) return null;
    const createdAt = finiteTime(input.createdAt, Date.now());
    const enabled = input.enabled !== false;
    return {
      id: String(input.id),
      title: cleanText(input.title, 40) || new URL(url).hostname,
      url,
      color: safeColor(input.color),
      enabled,
      builtin: Boolean(input.builtin),
      createdAt,
      lastFetchedAt: finiteTime(input.lastFetchedAt, 0),
      status: enabled ? (STATUS.has(input.status) && input.status !== "disabled" ? input.status : "idle") : "disabled",
      error: cleanText(input.error, 180),
    };
  }

  function normalizeSubscriptions(items, max = SUBSCRIPTION_LIMIT) {
    const map = new Map();
    for (const raw of Array.isArray(items) ? items : []) {
      const item = normalizeSubscription(raw);
      if (item) map.set(item.id, item);
    }
    return [...map.values()]
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(0, Math.max(1, Number(max) || SUBSCRIPTION_LIMIT));
  }

  function normalizeArticle(input) {
    if (!input || !ID_PATTERN.test(String(input.id || "")) || !ID_PATTERN.test(String(input.feedId || ""))) return null;
    const url = normalizeHttpUrl(input.url);
    const title = cleanText(input.title, 200);
    if (!url || !title) return null;
    const publishedAt = finiteTime(input.publishedAt, Date.now());
    const fetchedAt = finiteTime(input.fetchedAt, publishedAt);
    return {
      id: String(input.id),
      feedId: String(input.feedId),
      title,
      url,
      summary: cleanText(input.summary, 520),
      publishedAt,
      fetchedAt,
      updatedAt: finiteTime(input.updatedAt, fetchedAt),
      read: Boolean(input.read),
      readAt: finiteTime(input.readAt, 0),
    };
  }

  function articleNewest(a, b) {
    return b.publishedAt - a.publishedAt || b.id.localeCompare(a.id);
  }

  function mergeArticles(current, incoming, max = ARTICLE_LIMIT) {
    const map = new Map();
    for (const raw of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
      const article = normalizeArticle(raw);
      if (!article) continue;
      const previous = map.get(article.id);
      if (!previous) {
        map.set(article.id, article);
        continue;
      }
      const content = article.updatedAt >= previous.updatedAt ? article : previous;
      const readState = article.readAt > previous.readAt ? article : previous;
      map.set(article.id, { ...content, read: readState.read, readAt: readState.readAt });
    }
    return [...map.values()].sort(articleNewest).slice(0, Math.max(1, Number(max) || ARTICLE_LIMIT));
  }

  function setArticleRead(raw, read, now = Date.now()) {
    const article = normalizeArticle(raw);
    if (!article) return null;
    return { ...article, read: Boolean(read), readAt: Math.max(article.readAt + 1, finiteTime(now, Date.now())) };
  }

  function filterArticles(rawArticles, options = {}) {
    const articles = mergeArticles([], rawArticles);
    const feedId = options.feedId || "all";
    const status = options.status || "all";
    const query = cleanText(options.query || "", 100).toLocaleLowerCase("zh-CN");
    const enabled = Array.isArray(options.enabledFeedIds) ? new Set(options.enabledFeedIds) : null;
    return articles.filter((article) => {
      if (feedId !== "all" && article.feedId !== feedId) return false;
      if (feedId === "all" && enabled && !enabled.has(article.feedId)) return false;
      if (status === "unread" && article.read) return false;
      if (status === "read" && !article.read) return false;
      if (query && !`${article.title} ${article.summary}`.toLocaleLowerCase("zh-CN").includes(query)) return false;
      return true;
    });
  }

  function stats(rawArticles, enabledFeedIds) {
    const articles = filterArticles(rawArticles, { enabledFeedIds });
    return {
      total: articles.length,
      unread: articles.filter((article) => !article.read).length,
      read: articles.filter((article) => article.read).length,
    };
  }

  function removeFeedArticles(rawArticles, feedId) {
    return mergeArticles([], rawArticles).filter((article) => article.feedId !== feedId);
  }

  const api = {
    SUBSCRIPTION_LIMIT,
    ARTICLE_LIMIT,
    COLORS,
    cleanText,
    normalizeHttpUrl,
    safeColor,
    hash,
    normalizeSubscription,
    normalizeSubscriptions,
    normalizeArticle,
    mergeArticles,
    setArticleRead,
    filterArticles,
    stats,
    removeFeedArticles,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window === "object") window.Dial45Core = api;
})();
