(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PerformanceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const API_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const STRATEGIES = new Set(["mobile", "desktop"]);
  const METRICS = [
    ["first-contentful-paint", "FCP", "首次内容绘制"],
    ["largest-contentful-paint", "LCP", "最大内容绘制"],
    ["speed-index", "SI", "速度指数"],
    ["total-blocking-time", "TBT", "总阻塞时间"],
    ["cumulative-layout-shift", "CLS", "布局偏移"]
  ];
  const METRIC_IDS = new Set(METRICS.map(([id]) => id));

  function domainError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isPrivateIpv4(hostname) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    const octets = hostname.split(".").map(Number);
    if (octets.some((part) => part > 255)) return true;
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  function isPrivateHost(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (isPrivateIpv4(host)) return true;
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    );
  }

  function normalizeUrl(input) {
    if (typeof input !== "string" || !input.trim()) {
      throw domainError("请输入要检测的网址。", "EMPTY_URL");
    }

    const trimmed = input.trim();
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      throw domainError("网址格式不正确，请输入完整域名。", "INVALID_URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw domainError("仅支持 HTTP 或 HTTPS 网址。", "INVALID_PROTOCOL");
    }
    if (parsed.username || parsed.password) {
      throw domainError("请移除网址中的账号凭据后再检测。", "URL_CREDENTIALS");
    }
    if (isPrivateHost(parsed.hostname)) {
      throw domainError("PageSpeed 只能检测可公开访问的公网网址。", "PRIVATE_HOST");
    }

    parsed.hash = "";
    return parsed.href;
  }

  function buildApiUrl(input, strategy = "mobile") {
    if (!STRATEGIES.has(strategy)) {
      throw domainError("请选择移动端或桌面端设备。", "INVALID_STRATEGY");
    }
    const endpoint = new URL(API_ENDPOINT);
    endpoint.searchParams.set("url", normalizeUrl(input));
    endpoint.searchParams.set("strategy", strategy);
    endpoint.searchParams.set("category", "performance");
    endpoint.searchParams.set("locale", "zh-CN");
    endpoint.searchParams.set("utm_source", "100apps_trace58");
    return endpoint.href;
  }

  function scoreBand(score) {
    if (typeof score !== "number" || !Number.isFinite(score)) {
      return { key: "unknown", label: "暂无", grade: "—" };
    }
    if (score >= 90) return { key: "good", label: "良好", grade: "A" };
    if (score >= 50) return { key: "needs-work", label: "需优化", grade: "B" };
    return { key: "poor", label: "较慢", grade: "C" };
  }

  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function compactText(value, fallback = "") {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : fallback;
  }

  function parseMetrics(audits) {
    return METRICS.map(([id, shortLabel, label]) => {
      const audit = audits[id] || {};
      const value = finiteNumber(audit.numericValue);
      const auditScore = finiteNumber(audit.score);
      return {
        id,
        shortLabel,
        label,
        value,
        displayValue: compactText(audit.displayValue, value === null ? "—" : String(value)),
        band: scoreBand(auditScore === null ? null : Math.round(auditScore * 100))
      };
    });
  }

  function parseOpportunities(audits) {
    return Object.entries(audits)
      .filter(([id, audit]) => {
        if (METRIC_IDS.has(id) || !audit || typeof audit !== "object") return false;
        const details = audit.details || {};
        return details.type === "opportunity" && (
          finiteNumber(details.overallSavingsMs) > 0 ||
          finiteNumber(details.overallSavingsBytes) > 0 ||
          (finiteNumber(audit.score) !== null && audit.score < 0.9)
        );
      })
      .map(([id, audit]) => ({
        id,
        title: compactText(audit.title, id),
        description: compactText(audit.description),
        displayValue: compactText(audit.displayValue),
        score: finiteNumber(audit.score),
        savingsMs: finiteNumber(audit.details && audit.details.overallSavingsMs) || 0,
        savingsBytes: finiteNumber(audit.details && audit.details.overallSavingsBytes) || 0
      }))
      .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes || (a.score ?? 1) - (b.score ?? 1));
  }

  function requestTiming(item) {
    const start = finiteNumber(item.networkRequestTime) ?? finiteNumber(item.startTime);
    const end = finiteNumber(item.networkEndTime) ?? finiteNumber(item.endTime);
    return { start, end };
  }

  function parseRequests(audits) {
    const items = audits["network-requests"]?.details?.items;
    if (!Array.isArray(items)) return { requests: [], traceDuration: 0 };

    const validItems = items
      .map((item) => ({ item, ...requestTiming(item) }))
      .filter(({ item, start, end }) => {
        if (!item || typeof item.url !== "string" || start === null || end === null || end < start) return false;
        try {
          const url = new URL(item.url);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      });
    if (!validItems.length) return { requests: [], traceDuration: 0 };

    const origin = Math.min(...validItems.map(({ start }) => start));
    const end = Math.max(...validItems.map((item) => item.end));
    const requests = validItems
      .map(({ item, start, end: requestEnd }) => ({
        url: item.url,
        host: new URL(item.url).host,
        path: `${new URL(item.url).pathname}${new URL(item.url).search}`,
        resourceType: compactText(item.resourceType, "Other"),
        transferSize: Math.max(0, finiteNumber(item.transferSize) ?? finiteNumber(item.resourceSize) ?? 0),
        statusCode: finiteNumber(item.statusCode),
        startMs: Math.max(0, Math.round((start - origin) * 1000)),
        durationMs: Math.max(1, Math.round((requestEnd - start) * 1000))
      }))
      .sort((a, b) => a.startMs - b.startMs || b.durationMs - a.durationMs);

    return { requests, traceDuration: Math.max(1, Math.round((end - origin) * 1000)) };
  }

  function parsePageSpeedResult(payload, fallbackStrategy = "mobile") {
    const lighthouse = payload && payload.lighthouseResult;
    if (!lighthouse || typeof lighthouse !== "object") {
      throw domainError("响应中缺少 Lighthouse 报告。", "MISSING_LIGHTHOUSE");
    }
    const rawScore = lighthouse.categories?.performance?.score;
    if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
      throw domainError("Lighthouse 没有返回有效的性能分数。", "MISSING_SCORE");
    }

    const audits = lighthouse.audits && typeof lighthouse.audits === "object" ? lighthouse.audits : {};
    const parsedRequests = parseRequests(audits);
    const score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
    const requested = compactText(lighthouse.requestedUrl || payload.id);
    const final = compactText(lighthouse.finalUrl || payload.id || requested);
    let finalUrl;
    try {
      finalUrl = normalizeUrl(final || requested);
    } catch {
      throw domainError("Lighthouse 返回的网址无效。", "INVALID_RESULT_URL");
    }
    const strategy = lighthouse.configSettings?.formFactor;
    const safeStrategy = STRATEGIES.has(strategy) ? strategy : (STRATEGIES.has(fallbackStrategy) ? fallbackStrategy : "mobile");
    const screenshot = audits["final-screenshot"]?.details?.data;
    const requestList = parsedRequests.requests;

    return {
      url: finalUrl,
      requestedUrl: requested || finalUrl,
      fetchedAt: compactText(lighthouse.fetchTime || payload.analysisUTCTimestamp, new Date().toISOString()),
      lighthouseVersion: compactText(lighthouse.lighthouseVersion),
      strategy: safeStrategy,
      score,
      band: scoreBand(score),
      metrics: parseMetrics(audits),
      opportunities: parseOpportunities(audits),
      requests: requestList,
      traceDuration: parsedRequests.traceDuration,
      pageWeight: requestList.reduce((total, item) => total + item.transferSize, 0),
      requestCount: requestList.length,
      screenshot: typeof screenshot === "string" && /^data:image\/(?:jpeg|png|webp);base64,/i.test(screenshot) ? screenshot : ""
    };
  }

  function normalizeHistory(input, maxItems = 6) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const result = [];
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      try {
        const url = normalizeUrl(item.url);
        const score = finiteNumber(item.score);
        const strategy = STRATEGIES.has(item.strategy) ? item.strategy : null;
        const fetchedAt = typeof item.fetchedAt === "string" && Number.isFinite(Date.parse(item.fetchedAt)) ? item.fetchedAt : null;
        if (score === null || score < 0 || score > 100 || !strategy || !fetchedAt) continue;
        const key = `${url}|${strategy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ url, score: Math.round(score), strategy, fetchedAt });
        if (result.length >= maxItems) break;
      } catch {
        // Ignore untrusted local history entries that no longer validate.
      }
    }
    return result;
  }

  function createHistoryEntry(report) {
    return normalizeHistory([report], 1)[0] || null;
  }

  function formatBytes(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${trimDecimal(bytes / 1024)} KB`;
    return `${trimDecimal(bytes / (1024 * 1024))} MB`;
  }

  function formatDuration(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${trimDecimal(ms / 1000)} s`;
  }

  function trimDecimal(value) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return {
    API_ENDPOINT,
    normalizeUrl,
    buildApiUrl,
    scoreBand,
    parsePageSpeedResult,
    normalizeHistory,
    createHistoryEntry,
    formatBytes,
    formatDuration
  };
});
