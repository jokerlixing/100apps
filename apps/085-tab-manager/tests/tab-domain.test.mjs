import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGroupPlan,
  colorForDomain,
  displayDomain,
  domainFromUrl,
  findDuplicateTabs,
  normalizeUrl,
} from "../tab-domain.js";

test("normalizeUrl removes tracking noise while preserving meaningful queries", () => {
  assert.equal(
    normalizeUrl("https://www.Example.com/path/?utm_source=feed&b=2&a=1#part"),
    "https://example.com/path?a=1&b=2",
  );
  assert.equal(normalizeUrl("chrome://extensions"), "");
  assert.equal(normalizeUrl("not a url"), "");
});

test("domain labels are compact and service-aware", () => {
  assert.equal(domainFromUrl("https://www.github.com/openai/codex"), "github.com");
  assert.equal(displayDomain("docs.google.com"), "Google Docs");
  assert.equal(displayDomain("developer.chrome.com"), "Chrome");
  assert.equal(displayDomain("news.example.com"), "Example");
});

test("colorForDomain is stable and returns a Chrome tab-group color", () => {
  const allowed = new Set(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
  const first = colorForDomain("github.com");

  assert.ok(allowed.has(first));
  assert.equal(first, colorForDomain("github.com"));
});

test("buildGroupPlan groups eligible domains and protects pinned or internal tabs", () => {
  const tabs = [
    { id: 7, index: 4, url: "https://github.com/openai", title: "OpenAI", pinned: false },
    { id: 4, index: 1, url: "https://www.github.com/features", title: "Features", pinned: false },
    { id: 5, index: 2, url: "https://github.com/settings", title: "Pinned", pinned: true },
    { id: 6, index: 3, url: "https://docs.google.com/document/1", title: "Draft", pinned: false },
    { id: 8, index: 5, url: "chrome://extensions", title: "Extensions", pinned: false },
  ];

  assert.deepEqual(buildGroupPlan(tabs), [
    {
      key: "github.com",
      title: "GitHub",
      color: colorForDomain("github.com"),
      tabIds: [4, 7],
    },
  ]);
});

test("buildGroupPlan leaves tabs that already belong to a group untouched", () => {
  const tabs = [
    { id: 1, index: 0, url: "https://example.com/one", pinned: false, groupId: 7 },
    { id: 2, index: 1, url: "https://example.com/two", pinned: false, groupId: 7 },
  ];

  assert.deepEqual(buildGroupPlan(tabs), []);
});

test("findDuplicateTabs keeps the active copy and never removes pinned tabs", () => {
  const tabs = [
    { id: 1, index: 0, url: "https://example.com/read?utm_source=mail", active: false, pinned: false },
    { id: 2, index: 1, url: "https://www.example.com/read#notes", active: true, pinned: false },
    { id: 3, index: 2, url: "https://example.com/read", active: false, pinned: true },
    { id: 4, index: 3, url: "https://example.com/other", active: false, pinned: false },
  ];

  assert.deepEqual(findDuplicateTabs(tabs), [
    {
      key: "https://example.com/read",
      keepId: 2,
      removeIds: [1],
    },
  ]);
});
