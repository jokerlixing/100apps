const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../performance-core.js");

test("normalizeUrl adds https and removes fragments", () => {
  assert.equal(
    core.normalizeUrl(" example.com/docs?q=1#intro "),
    "https://example.com/docs?q=1"
  );
});

test("normalizeUrl accepts explicit http URLs", () => {
  assert.equal(core.normalizeUrl("http://example.com"), "http://example.com/");
});

test("normalizeUrl rejects unsafe and unreachable targets", () => {
  assert.throws(() => core.normalizeUrl("ftp://example.com"), /HTTP/);
  assert.throws(() => core.normalizeUrl("https://user:pass@example.com"), /凭据/);
  assert.throws(() => core.normalizeUrl("localhost:3000"), /公网/);
  assert.throws(() => core.normalizeUrl("http://192.168.1.8"), /公网/);
  assert.throws(() => core.normalizeUrl("http://[::1]"), /公网/);
});

test("buildApiUrl includes the audited URL, strategy and performance category", () => {
  const url = new URL(core.buildApiUrl("https://example.com/a?x=1", "desktop"));
  assert.equal(url.origin, "https://www.googleapis.com");
  assert.equal(url.searchParams.get("url"), "https://example.com/a?x=1");
  assert.equal(url.searchParams.get("strategy"), "desktop");
  assert.equal(url.searchParams.get("category"), "performance");
  assert.equal(url.searchParams.get("locale"), "zh-CN");
});

test("buildApiUrl rejects unknown strategies", () => {
  assert.throws(() => core.buildApiUrl("example.com", "watch"), /设备/);
});

test("scoreBand follows Lighthouse thresholds", () => {
  assert.deepEqual(core.scoreBand(93), { key: "good", label: "良好", grade: "A" });
  assert.deepEqual(core.scoreBand(66), { key: "needs-work", label: "需优化", grade: "B" });
  assert.deepEqual(core.scoreBand(21), { key: "poor", label: "较慢", grade: "C" });
  assert.equal(core.scoreBand(null).key, "unknown");
});

const apiPayload = {
  id: "https://example.com/",
  analysisUTCTimestamp: "2026-08-30T14:00:00.000Z",
  lighthouseResult: {
    requestedUrl: "https://example.com",
    finalUrl: "https://example.com/",
    fetchTime: "2026-08-30T14:00:00.000Z",
    lighthouseVersion: "12.8.1",
    configSettings: { formFactor: "mobile" },
    categories: { performance: { score: 0.72 } },
    audits: {
      "first-contentful-paint": { title: "First Contentful Paint", score: 0.9, numericValue: 1234, displayValue: "1.2 s" },
      "largest-contentful-paint": { title: "Largest Contentful Paint", score: 0.48, numericValue: 3210, displayValue: "3.2 s" },
      "speed-index": { title: "Speed Index", score: 0.6, numericValue: 2800, displayValue: "2.8 s" },
      "total-blocking-time": { title: "Total Blocking Time", score: 0.8, numericValue: 240, displayValue: "240 ms" },
      "cumulative-layout-shift": { title: "Cumulative Layout Shift", score: 1, numericValue: 0.04, displayValue: "0.04" },
      "unused-javascript": {
        title: "Reduce unused JavaScript",
        description: "Remove dead code.",
        score: 0.3,
        displayValue: "Potential savings of 180 KiB",
        details: { type: "opportunity", overallSavingsMs: 1200, overallSavingsBytes: 184320 }
      },
      "render-blocking-resources": {
        title: "Eliminate render-blocking resources",
        description: "Inline critical resources.",
        score: 0.5,
        details: { type: "opportunity", overallSavingsMs: 480, overallSavingsBytes: 12000 }
      },
      "network-requests": {
        details: {
          type: "table",
          items: [
            { url: "https://example.com/", resourceType: "Document", transferSize: 4100, networkRequestTime: 1, networkEndTime: 1.12, statusCode: 200 },
            { url: "https://cdn.example.com/app.js", resourceType: "Script", transferSize: 220000, networkRequestTime: 1.05, networkEndTime: 1.8, statusCode: 200 },
            { url: "https://cdn.example.com/app.css", resourceType: "Stylesheet", transferSize: 18000, networkRequestTime: 1.02, networkEndTime: 1.2, statusCode: 200 }
          ]
        }
      },
      "final-screenshot": { details: { data: "data:image/jpeg;base64,abc123" } }
    }
  }
};

test("parsePageSpeedResult creates a compact report model", () => {
  const report = core.parsePageSpeedResult(apiPayload, "mobile");
  assert.equal(report.score, 72);
  assert.equal(report.band.key, "needs-work");
  assert.equal(report.metrics.length, 5);
  assert.equal(report.metrics[0].id, "first-contentful-paint");
  assert.equal(report.metrics[1].value, 3210);
  assert.equal(report.pageWeight, 242100);
  assert.equal(report.requestCount, 3);
  assert.equal(report.screenshot, "data:image/jpeg;base64,abc123");
});

test("parsePageSpeedResult orders opportunities by time savings", () => {
  const report = core.parsePageSpeedResult(apiPayload, "mobile");
  assert.deepEqual(report.opportunities.map((item) => item.id), [
    "unused-javascript",
    "render-blocking-resources"
  ]);
});

test("parsePageSpeedResult builds relative waterfall timing", () => {
  const report = core.parsePageSpeedResult(apiPayload, "mobile");
  assert.equal(report.requests[0].startMs, 0);
  assert.equal(report.requests[1].startMs, 20);
  assert.equal(report.requests[2].durationMs, 750);
  assert.equal(report.traceDuration, 800);
});

test("parsePageSpeedResult keeps missing metrics unknown instead of zero", () => {
  const changed = structuredClone(apiPayload);
  delete changed.lighthouseResult.audits["speed-index"];
  const speedIndex = core.parsePageSpeedResult(changed, "mobile").metrics[2];
  assert.equal(speedIndex.value, null);
  assert.equal(speedIndex.displayValue, "—");
  assert.equal(speedIndex.band.key, "unknown");
});

test("parsePageSpeedResult rejects malformed API responses", () => {
  assert.throws(() => core.parsePageSpeedResult({}, "mobile"), /Lighthouse/);
  assert.throws(
    () => core.parsePageSpeedResult({ lighthouseResult: { categories: { performance: { score: null } }, audits: {} } }),
    /性能分数/
  );
});

test("normalizeHistory removes invalid entries, duplicates and extra fields", () => {
  const history = core.normalizeHistory([
    { url: "https://example.com/", score: 72, strategy: "mobile", fetchedAt: "2026-08-30T14:00:00.000Z", secret: "drop" },
    { url: "https://example.com/", score: 65, strategy: "mobile", fetchedAt: "2026-08-29T14:00:00.000Z" },
    { url: "javascript:alert(1)", score: 100, strategy: "desktop", fetchedAt: "2026-08-30T14:00:00.000Z" },
    { nope: true }
  ]);
  assert.deepEqual(history, [{
    url: "https://example.com/",
    score: 72,
    strategy: "mobile",
    fetchedAt: "2026-08-30T14:00:00.000Z"
  }]);
});

test("formatBytes and formatDuration provide readable values", () => {
  assert.equal(core.formatBytes(0), "0 B");
  assert.equal(core.formatBytes(1536), "1.5 KB");
  assert.equal(core.formatDuration(830), "830 ms");
  assert.equal(core.formatDuration(2200), "2.2 s");
});
