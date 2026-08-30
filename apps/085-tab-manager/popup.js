import {
  buildGroupPlan,
  colorForDomain,
  displayDomain,
  domainFromUrl,
  findDuplicateTabs,
} from "./tab-domain.js";

const SESSION_KEY = "tabloomLatestSession";
const NO_GROUP = -1;
const GROUP_RAILS = {
  grey: "#8793a3",
  blue: "#315bff",
  red: "#f06b50",
  yellow: "#e5bd32",
  green: "#4aad78",
  pink: "#e5679b",
  purple: "#8c67d9",
  cyan: "#28a9bf",
  orange: "#e68a35",
};

const DEMO_TABS = [
  { id: 101, index: 0, title: "Codex · OpenAI", url: "https://github.com/openai/codex", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 102, index: 1, title: "Pull requests · 100apps", url: "https://github.com/jokerlixing/100apps/pulls", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 103, index: 2, title: "Issues · App 085", url: "https://github.com/jokerlixing/100apps/issues", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 104, index: 3, title: "Tabloom explorations", url: "https://www.figma.com/file/tabloom/explorations", active: true, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 105, index: 4, title: "Browser utility tokens", url: "https://figma.com/file/tabloom/tokens", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 106, index: 5, title: "Product launch notes", url: "https://docs.google.com/document/d/launch", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 107, index: 6, title: "Weekly tab audit", url: "https://docs.google.com/spreadsheets/d/audit", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 108, index: 7, title: "Inbox (4)", url: "https://mail.google.com/mail/u/0/#inbox", active: false, pinned: true, discarded: false, groupId: NO_GROUP },
  { id: 109, index: 8, title: "Tab management research", url: "https://www.notion.so/workspace/tab-management", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
  { id: 110, index: 9, title: "Tab management research · notes", url: "https://notion.so/workspace/tab-management#notes", active: false, pinned: false, discarded: false, groupId: NO_GROUP },
];

const elements = {
  app: document.querySelector(".app"),
  tabCount: document.querySelector("#tabCount"),
  tabSearch: document.querySelector("#tabSearch"),
  organizeBtn: document.querySelector("#organizeBtn"),
  organizeHint: document.querySelector("#organizeHint"),
  groupCount: document.querySelector("#groupCount"),
  duplicateCount: document.querySelector("#duplicateCount"),
  restCount: document.querySelector("#restCount"),
  demoBadge: document.querySelector("#demoBadge"),
  tabList: document.querySelector("#tabList"),
  sessionSummary: document.querySelector("#sessionSummary"),
  restoreBtn: document.querySelector("#restoreBtn"),
  duplicateBtn: document.querySelector("#duplicateBtn"),
  discardBtn: document.querySelector("#discardBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  ungroupBtn: document.querySelector("#ungroupBtn"),
  statusLine: document.querySelector("#statusLine"),
};

const actionButtons = [
  elements.organizeBtn,
  elements.restoreBtn,
  elements.duplicateBtn,
  elements.discardBtn,
  elements.saveBtn,
  elements.ungroupBtn,
];

const requestedDemo = new URLSearchParams(location.search).has("demo");
const hasExtensionTabs = Boolean(globalThis.chrome?.tabs?.query && globalThis.chrome?.tabGroups?.update);
const isDemo = requestedDemo || !hasExtensionTabs;

const state = {
  tabs: [],
  session: null,
  query: "",
  busy: false,
  metrics: { groups: 0, duplicates: 0, rest: 0, plans: 0 },
};

function reindex(tabs) {
  tabs.forEach((tab, index) => {
    tab.index = index;
  });
}

function snapshotFromTabs(tabs) {
  return {
    savedAt: new Date().toISOString(),
    tabs: tabs
      .filter((tab) => domainFromUrl(tab.url))
      .map((tab) => ({ title: tab.title || displayDomain(domainFromUrl(tab.url)), url: tab.url, pinned: Boolean(tab.pinned) })),
  };
}

function validSession(value) {
  return Boolean(
    value
    && typeof value.savedAt === "string"
    && Array.isArray(value.tabs)
    && value.tabs.every((tab) => typeof tab?.url === "string" && Boolean(domainFromUrl(tab.url))),
  );
}

function createDemoAdapter() {
  let tabs = structuredClone(DEMO_TABS);
  let nextTabId = 200;
  let nextGroupId = 1;

  function readStoredSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY));
      return validSession(value) ? value : null;
    } catch {
      return null;
    }
  }

  return {
    async listTabs() {
      return structuredClone(tabs);
    },

    async organize(currentTabs) {
      const plans = buildGroupPlan(currentTabs);
      for (const plan of plans) {
        const groupId = nextGroupId++;
        const ids = new Set(plan.tabIds);
        tabs = tabs.map((tab) => (ids.has(tab.id) ? { ...tab, groupId } : tab));
      }
      return plans.length;
    },

    async closeDuplicates(currentTabs) {
      const removeIds = findDuplicateTabs(currentTabs).flatMap((entry) => entry.removeIds);
      const removeSet = new Set(removeIds);
      tabs = tabs.filter((tab) => !removeSet.has(tab.id));
      reindex(tabs);
      return removeIds.length;
    },

    async discard(currentTabs) {
      const ids = new Set(
        currentTabs
          .filter((tab) => !tab.active && !tab.pinned && !tab.discarded && domainFromUrl(tab.url))
          .map((tab) => tab.id),
      );
      tabs = tabs.map((tab) => (ids.has(tab.id) ? { ...tab, discarded: true } : tab));
      return ids.size;
    },

    async save(currentTabs) {
      const session = snapshotFromTabs(currentTabs);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },

    async readSession() {
      return readStoredSession();
    },

    async restore(session) {
      const added = session.tabs.map((savedTab) => ({
        id: nextTabId++,
        index: 0,
        title: savedTab.title,
        url: savedTab.url,
        active: false,
        pinned: Boolean(savedTab.pinned),
        discarded: false,
        groupId: NO_GROUP,
      }));
      tabs.push(...added);
      reindex(tabs);
      return added.length;
    },

    async ungroup(currentTabs) {
      const ids = new Set(currentTabs.filter((tab) => tab.groupId >= 0).map((tab) => tab.id));
      tabs = tabs.map((tab) => (ids.has(tab.id) ? { ...tab, groupId: NO_GROUP } : tab));
      return ids.size;
    },

    async activate(tab) {
      tabs = tabs.map((item) => ({ ...item, active: item.id === tab.id }));
    },
  };
}

function createChromeAdapter() {
  return {
    async listTabs() {
      return chrome.tabs.query({ currentWindow: true });
    },

    async organize(currentTabs) {
      const plans = buildGroupPlan(currentTabs);
      for (const plan of plans) {
        const sample = currentTabs.find((tab) => plan.tabIds.includes(tab.id));
        const groupOptions = { tabIds: plan.tabIds };
        if (sample?.windowId != null) groupOptions.createProperties = { windowId: sample.windowId };
        const groupId = await chrome.tabs.group(groupOptions);
        await chrome.tabGroups.update(groupId, {
          title: plan.title,
          color: plan.color,
          collapsed: false,
        });
      }
      return plans.length;
    },

    async closeDuplicates(currentTabs) {
      const ids = findDuplicateTabs(currentTabs).flatMap((entry) => entry.removeIds);
      if (ids.length) await chrome.tabs.remove(ids);
      return ids.length;
    },

    async discard(currentTabs) {
      const ids = currentTabs
        .filter((tab) => !tab.active && !tab.pinned && !tab.discarded && domainFromUrl(tab.url))
        .map((tab) => tab.id)
        .filter(Number.isInteger);
      const results = await Promise.allSettled(ids.map((tabId) => chrome.tabs.discard(tabId)));
      return results.filter((result) => result.status === "fulfilled").length;
    },

    async save(currentTabs) {
      const session = snapshotFromTabs(currentTabs);
      await chrome.storage.local.set({ [SESSION_KEY]: session });
      return session;
    },

    async readSession() {
      const stored = await chrome.storage.local.get(SESSION_KEY);
      return validSession(stored[SESSION_KEY]) ? stored[SESSION_KEY] : null;
    },

    async restore(session) {
      const safeTabs = session.tabs.slice(0, 40);
      await Promise.all(safeTabs.map((tab) => chrome.tabs.create({ url: tab.url, active: false, pinned: Boolean(tab.pinned) })));
      return safeTabs.length;
    },

    async ungroup(currentTabs) {
      const ids = currentTabs
        .filter((tab) => tab.groupId >= 0 && Number.isInteger(tab.id))
        .map((tab) => tab.id);
      if (ids.length) await chrome.tabs.ungroup(ids);
      return ids.length;
    },

    async activate(tab) {
      await chrome.tabs.update(tab.id, { active: true });
    },
  };
}

const adapter = isDemo ? createDemoAdapter() : createChromeAdapter();

function setStatus(message, { error = false } = {}) {
  elements.statusLine.textContent = message;
  elements.statusLine.classList.toggle("error", error);
}

function formatSavedAt(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "刚刚";
  }
}

function calculateMetrics(tabs) {
  const groups = new Set(tabs.filter((tab) => tab.groupId >= 0).map((tab) => tab.groupId)).size;
  const duplicates = findDuplicateTabs(tabs).reduce((total, entry) => total + entry.removeIds.length, 0);
  const rest = tabs.filter((tab) => !tab.active && !tab.pinned && !tab.discarded && domainFromUrl(tab.url)).length;
  const plans = buildGroupPlan(tabs).length;
  return { groups, duplicates, rest, plans };
}

function renderControlState() {
  elements.organizeBtn.disabled = state.busy || state.metrics.plans === 0;
  elements.duplicateBtn.disabled = state.busy || state.metrics.duplicates === 0;
  elements.discardBtn.disabled = state.busy || state.metrics.rest === 0;
  elements.saveBtn.disabled = state.busy || state.tabs.length === 0;
  elements.restoreBtn.disabled = state.busy || !state.session;
  elements.ungroupBtn.disabled = state.busy || state.metrics.groups === 0;
  elements.app.classList.toggle("is-busy", state.busy);
}

function createFlag(text, live = false) {
  const flag = document.createElement("span");
  flag.className = `tab-flag${live ? " live" : ""}`;
  flag.textContent = text;
  return flag;
}

function createTabStrip(tab) {
  const domain = domainFromUrl(tab.url) || "browser";
  const label = displayDomain(domain);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tab-strip${tab.active ? " active" : ""}`;
  button.style.setProperty("--rail", GROUP_RAILS[colorForDomain(domain)] ?? GROUP_RAILS.grey);
  button.title = `切换到：${tab.title || label}`;

  const monogram = document.createElement("span");
  monogram.className = "tab-monogram";
  monogram.textContent = label.slice(0, 2);

  const copy = document.createElement("span");
  copy.className = "tab-copy";
  const title = document.createElement("strong");
  title.textContent = tab.title || label;
  const site = document.createElement("small");
  site.textContent = domain;
  copy.append(title, site);

  const flags = document.createElement("span");
  flags.className = "tab-flags";
  if (tab.active) flags.append(createFlag("live", true));
  if (tab.pinned) flags.append(createFlag("pin"));
  if (tab.discarded) flags.append(createFlag("sleep"));

  button.append(monogram, copy, flags);
  button.addEventListener("click", async () => {
    try {
      await adapter.activate(tab);
      if (isDemo) {
        await refresh();
        setStatus(`已切换到 ${tab.title || label}`);
      }
    } catch (error) {
      setStatus(`无法切换标签页：${error.message}`, { error: true });
    }
  });

  return button;
}

function renderTabs() {
  const query = state.query.trim().toLowerCase();
  const visible = state.tabs.filter((tab) => {
    if (!query) return true;
    return `${tab.title ?? ""} ${domainFromUrl(tab.url)}`.toLowerCase().includes(query);
  });

  elements.tabList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = query ? "没有匹配的标签页。试试网站名或标题中的关键词。" : "当前窗口还没有可显示的标签页。";
    elements.tabList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const tab of visible) {
    const item = document.createElement("li");
    item.append(createTabStrip(tab));
    fragment.append(item);
  }
  elements.tabList.append(fragment);
}

function render() {
  state.metrics = calculateMetrics(state.tabs);
  elements.tabCount.textContent = String(state.tabs.length).padStart(2, "0");
  elements.groupCount.textContent = String(state.metrics.groups).padStart(2, "0");
  elements.duplicateCount.textContent = String(state.metrics.duplicates).padStart(2, "0");
  elements.restCount.textContent = String(state.metrics.rest).padStart(2, "0");
  elements.organizeHint.textContent = state.metrics.plans
    ? `${state.metrics.plans} 个网站可以自动成组`
    : "当前窗口已经井然有序";
  elements.demoBadge.hidden = !isDemo;

  if (state.session) {
    elements.sessionSummary.textContent = `${formatSavedAt(state.session.savedAt)} · ${state.session.tabs.length} 个标签页`;
  } else {
    elements.sessionSummary.textContent = "还没有保存过窗口";
  }

  renderTabs();
  renderControlState();
}

async function refresh({ keepStatus = true } = {}) {
  try {
    const [tabs, session] = await Promise.all([adapter.listTabs(), adapter.readSession()]);
    state.tabs = tabs.slice().sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    state.session = session;
    render();
  } catch (error) {
    state.tabs = [];
    state.session = null;
    render();
    setStatus(`无法读取当前窗口：${error.message}`, { error: true });
    return;
  }

  if (!keepStatus) {
    setStatus(isDemo ? "演示模式：所有操作只影响示例标签页" : "只读取当前窗口，不访问页面内容");
  }
}

async function runMutation(operation) {
  if (state.busy) return;
  state.busy = true;
  renderControlState();

  try {
    const message = await operation();
    await refresh();
    setStatus(message);
  } catch (error) {
    setStatus(`操作未完成：${error.message || "请重新打开扩展后再试"}`, { error: true });
  } finally {
    state.busy = false;
    renderControlState();
  }
}

elements.organizeBtn.addEventListener("click", () => runMutation(async () => {
  const count = await adapter.organize(state.tabs);
  return count ? `已建立 ${count} 个网站分组` : "没有可合并的同站标签页";
}));

elements.duplicateBtn.addEventListener("click", () => runMutation(async () => {
  const count = await adapter.closeDuplicates(state.tabs);
  return count ? `已清理 ${count} 个重复页` : "没有可以安全清理的重复页";
}));

elements.discardBtn.addEventListener("click", () => runMutation(async () => {
  const count = await adapter.discard(state.tabs);
  return count ? `已释放 ${count} 个后台页的内存` : "没有可释放的后台页";
}));

elements.saveBtn.addEventListener("click", () => runMutation(async () => {
  const session = await adapter.save(state.tabs);
  state.session = session;
  return `已在本机保存 ${session.tabs.length} 个标签页`;
}));

elements.restoreBtn.addEventListener("click", () => runMutation(async () => {
  const count = await adapter.restore(state.session);
  return `已恢复 ${count} 个标签页`;
}));

elements.ungroupBtn.addEventListener("click", () => runMutation(async () => {
  const count = await adapter.ungroup(state.tabs);
  return count ? `已取消 ${count} 个标签页的分组` : "当前窗口没有分组";
}));

elements.tabSearch.addEventListener("input", (event) => {
  state.query = event.currentTarget.value;
  renderTabs();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.tabSearch) {
    event.preventDefault();
    elements.tabSearch.focus();
  }
  if (event.key === "Escape" && document.activeElement === elements.tabSearch) {
    elements.tabSearch.value = "";
    state.query = "";
    renderTabs();
    elements.tabSearch.blur();
  }
});

document.body.classList.toggle("demo-mode", isDemo);
refresh({ keepStatus: false });
