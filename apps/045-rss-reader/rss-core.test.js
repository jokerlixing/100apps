"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("./rss-core.js");

function article(overrides = {}) {
  return {
    id: "article_base",
    feedId: "feed_base",
    title: "一条新信号",
    url: "https://example.com/posts/1#top",
    summary: "内容摘要",
    publishedAt: 100,
    fetchedAt: 100,
    updatedAt: 100,
    read: false,
    readAt: 0,
    ...overrides,
  };
}

test("HTTP URLs are normalized while unsafe protocols are rejected", () => {
  assert.equal(Core.normalizeHttpUrl("https://example.com/a#part"), "https://example.com/a");
  assert.equal(Core.normalizeHttpUrl("../post", "https://example.com/feed/index.xml"), "https://example.com/post");
  assert.equal(Core.normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(Core.normalizeHttpUrl("file:///tmp/feed.xml"), null);
});

test("subscriptions are normalized, deduplicated and bounded", () => {
  const raw = {
    id: "feed_alpha",
    title: "  设计\n波段  ",
    url: "https://example.com/feed.xml#x",
    color: "#ffffff",
    enabled: false,
    createdAt: 10,
    status: "ok",
  };
  const normalized = Core.normalizeSubscription(raw);
  assert.equal(normalized.title, "设计 波段");
  assert.equal(normalized.url, "https://example.com/feed.xml");
  assert.equal(normalized.color, "#f06449");
  assert.equal(normalized.status, "disabled");
  assert.equal(Core.normalizeSubscriptions([raw, raw]).length, 1);
  assert.equal(Core.normalizeSubscription({ ...raw, enabled: true, status: "disabled" }).status, "idle");
});

test("articles require safe links and plain titles", () => {
  const normalized = Core.normalizeArticle(article({ title: "  更新\n记录 ", summary: "a\u0000b" }));
  assert.equal(normalized.title, "更新 记录");
  assert.equal(normalized.summary, "a b");
  assert.equal(normalized.url, "https://example.com/posts/1");
  assert.equal(Core.normalizeArticle(article({ url: "data:text/html,x" })), null);
});

test("merge keeps fresh content without losing newer local read state", () => {
  const read = article({ title: "旧标题", read: true, readAt: 500, updatedAt: 100 });
  const refreshed = article({ title: "新标题", read: false, readAt: 0, updatedAt: 600 });
  const result = Core.mergeArticles([read], [refreshed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "新标题");
  assert.equal(result[0].read, true);
  assert.equal(result[0].readAt, 500);
});

test("article history is capped at the newest 300 records", () => {
  const items = Array.from({ length: Core.ARTICLE_LIMIT + 9 }, (_, index) => article({
    id: `article_${String(index).padStart(3, "0")}`,
    url: `https://example.com/posts/${index}`,
    publishedAt: index + 1,
    fetchedAt: index + 1,
    updatedAt: index + 1,
  }));
  const result = Core.mergeArticles([], items);
  assert.equal(result.length, Core.ARTICLE_LIMIT);
  assert.equal(result[0].publishedAt, Core.ARTICLE_LIMIT + 9);
  assert.equal(result.at(-1).publishedAt, 10);
});

test("read filters, search, feed scope and stats agree", () => {
  const items = [
    article({ id: "article_one", feedId: "feed_one", title: "设计系统", read: false, publishedAt: 30 }),
    article({ id: "article_two", feedId: "feed_two", title: "浏览器更新", read: true, readAt: 50, publishedAt: 20 }),
    article({ id: "article_three", feedId: "feed_one", title: "每周随笔", summary: "关于浏览器", read: false, publishedAt: 10 }),
  ];
  assert.deepEqual(Core.filterArticles(items, { status: "unread" }).map((item) => item.id), ["article_one", "article_three"]);
  assert.deepEqual(Core.filterArticles(items, { query: "浏览器" }).map((item) => item.id), ["article_two", "article_three"]);
  assert.deepEqual(Core.filterArticles(items, { feedId: "feed_one" }).map((item) => item.id), ["article_one", "article_three"]);
  assert.deepEqual(Core.stats(items, ["feed_one"]), { total: 2, unread: 2, read: 0 });
  assert.equal(Core.setArticleRead(items[0], true, 80).read, true);
  assert.deepEqual(Core.removeFeedArticles(items, "feed_one").map((item) => item.id), ["article_two"]);
});
