const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref_src",
]);

const GROUP_COLORS = ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple", "grey"];

const SERVICE_LABELS = new Map([
  ["github.com", "GitHub"],
  ["docs.google.com", "Google Docs"],
  ["drive.google.com", "Google Drive"],
  ["mail.google.com", "Gmail"],
  ["calendar.google.com", "Google Calendar"],
  ["youtube.com", "YouTube"],
  ["developer.chrome.com", "Chrome"],
  ["figma.com", "Figma"],
  ["notion.so", "Notion"],
  ["slack.com", "Slack"],
  ["openai.com", "OpenAI"],
]);

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function withoutTrailingSlash(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

export function normalizeUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.hash = "";
  url.pathname = withoutTrailingSlash(url.pathname);

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  return url.toString();
}

export function domainFromUrl(value) {
  const url = safeUrl(value);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
}

export function displayDomain(domain) {
  if (!domain) return "其他";
  if (SERVICE_LABELS.has(domain)) return SERVICE_LABELS.get(domain);

  const labels = domain.split(".").filter(Boolean);
  const source = labels.length > 1 ? labels.at(-2) : labels[0];
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : "其他";
}

export function colorForDomain(domain) {
  let hash = 0;
  for (const character of domain) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

function eligibleForGrouping(tab) {
  const isUngrouped = tab?.groupId == null || tab.groupId === -1;
  return Number.isInteger(tab?.id) && !tab.pinned && isUngrouped && Boolean(domainFromUrl(tab.url));
}

export function buildGroupPlan(tabs, { minGroupSize = 2 } = {}) {
  const groups = new Map();

  for (const tab of tabs ?? []) {
    if (!eligibleForGrouping(tab)) continue;
    const domain = domainFromUrl(tab.url);
    const group = groups.get(domain) ?? [];
    group.push(tab);
    groups.set(domain, group);
  }

  return [...groups.entries()]
    .filter(([, groupTabs]) => groupTabs.length >= minGroupSize)
    .sort(([, left], [, right]) => Math.min(...left.map((tab) => tab.index ?? 0)) - Math.min(...right.map((tab) => tab.index ?? 0)))
    .map(([domain, groupTabs]) => ({
      key: domain,
      title: displayDomain(domain),
      color: colorForDomain(domain),
      tabIds: groupTabs
        .slice()
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map((tab) => tab.id),
    }));
}

export function findDuplicateTabs(tabs) {
  const buckets = new Map();

  for (const tab of tabs ?? []) {
    if (!Number.isInteger(tab?.id)) continue;
    const key = normalizeUrl(tab.url);
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(tab);
    buckets.set(key, bucket);
  }

  const duplicates = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;

    const ordered = bucket.slice().sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    const keep = ordered.find((tab) => tab.active) ?? ordered.find((tab) => tab.pinned) ?? ordered[0];
    const removeIds = ordered
      .filter((tab) => tab.id !== keep.id && !tab.pinned)
      .map((tab) => tab.id);

    if (removeIds.length) {
      duplicates.push({ key, keepId: keep.id, removeIds });
    }
  }

  return duplicates;
}
