# App 085 Tabloom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real Chrome Manifest V3 tab-grouping extension with an interactive GitHub Pages demo and verified tracker registration.

**Architecture:** Keep grouping decisions in a pure ES module, then put browser mutations behind a small adapter used by one shared popup UI. The extension adapter uses Chrome APIs while the demo adapter mutates sample data in memory.

**Tech Stack:** HTML, CSS, modern JavaScript ES modules, Chrome Manifest V3 APIs, Node.js built-in test runner.

---

### Task 1: Pure tab-domain rules

**Files:**
- Create: `apps/085-tab-manager/tab-domain.js`
- Create: `apps/085-tab-manager/tests/tab-domain.test.mjs`

**Step 1: Write failing behavior tests**

Cover URL normalization, `www.` removal, protected protocols, deterministic group colors, grouping only domains with two or more eligible tabs, pinned-tab exclusion, and duplicate retention of the active tab.

**Step 2: Verify the test fails**

Run: `node --test apps/085-tab-manager/tests/tab-domain.test.mjs`

Expected: FAIL because `tab-domain.js` does not exist.

**Step 3: Implement the minimal pure module**

Export `normalizeUrl`, `domainFromUrl`, `displayDomain`, `colorForDomain`, `buildGroupPlan`, and `findDuplicateTabs`. Invalid or protected URLs return an empty domain; each plan item has `{ key, title, color, tabIds }`.

**Step 4: Verify the tests pass**

Run: `node --test apps/085-tab-manager/tests/tab-domain.test.mjs`

Expected: all tests pass.

### Task 2: Extension shell and live adapter

**Files:**
- Create: `apps/085-tab-manager/manifest.json`
- Create: `apps/085-tab-manager/popup.html`
- Create: `apps/085-tab-manager/popup.css`
- Create: `apps/085-tab-manager/popup.js`

**Step 1: Add a strict Manifest V3 definition**

Declare only `tabs`, `tabGroups`, and `storage`. Set `popup.html` as the action popup and use a minimum Chrome version that supports promise-based grouping APIs.

**Step 2: Build semantic popup markup and the dispatch-board token system**

Include the wordmark, current-window count, search, one primary organize action, metrics, live tab list, secondary controls, saved-session area, and an `aria-live` status region. Keep scripts external and local.

**Step 3: Implement extension operations**

Query the current window, group each plan with `chrome.tabs.group`, title/color it through `chrome.tabGroups.update`, remove duplicate IDs, discard eligible background tabs, store a URL snapshot in `chrome.storage.local`, restore snapshot URLs, ungroup grouped IDs, and activate a selected tab.

**Step 4: Make failures actionable**

Disable busy controls during mutations and report messages such as “没有可合并的同站标签” or “Chrome 拒绝了此操作，请重新打开扩展后再试”.

### Task 3: Interactive Pages demo

**Files:**
- Create: `apps/085-tab-manager/index.html`
- Create: `apps/085-tab-manager/demo.css`

**Step 1: Add the installation runway**

Explain downloading the directory, opening `chrome://extensions`, enabling developer mode, and loading the unpacked folder. Link directly to the public repository tree.

**Step 2: Reuse the popup in demo mode**

Embed `popup.html?demo=1` in a fixed-size preview. The popup detects a missing extension API and uses realistic sample tabs; its organize, search, duplicate, discard, save, restore, and ungroup actions remain interactive.

**Step 3: Add responsive and accessibility behavior**

Use a two-column desktop frame and one-column mobile layout, visible focus, semantic buttons, sufficient contrast, and reduced-motion rules.

### Task 4: Project documentation and automated checks

**Files:**
- Create: `apps/085-tab-manager/README.md`
- Create: `apps/085-tab-manager/tests/manifest.test.mjs`

**Step 1: Test the manifest**

Assert Manifest V3, exact required permissions, action popup existence, no host permissions, and existence of every referenced local asset.

**Step 2: Document real installation and privacy**

Explain features, file layout, Chrome loading steps, GitHub Pages demo, commands, requested permissions, local-only storage, and known limitations.

**Step 3: Run the app suite**

Run: `node --test apps/085-tab-manager/tests/*.test.mjs`

Expected: all tests pass.

### Task 5: Browser verification

**Files:**
- Create: `apps/085-tab-manager/tests/screenshots/demo-desktop.png`
- Create: `apps/085-tab-manager/tests/screenshots/demo-mobile.png`

**Step 1: Serve the worktree**

Run a local static server from the repository root and open `/apps/085-tab-manager/`.

**Step 2: Check the full demo flow**

Verify initial data, search, organize, duplicate cleanup, session save/restore, narrow responsive layout, and zero console errors.

**Step 3: Save inspected screenshots**

Capture a desktop composition and a narrow popup/mobile composition only after fixing any visible issue.

### Task 6: Tracker synchronization and GitHub push

**Files:**
- Modify: `index.html`
- Create or modify: `qa/check-app085-tracker.ps1`

**Step 1: Refresh repository state**

Fetch GitHub `origin`, inspect divergence, and integrate the latest tracker state without overwriting parallel registrations.

**Step 2: Register App 085**

Set the official name/description, link `./apps/085-tab-manager/`, and completion state for ID 85.

**Step 3: Add and run tracker assertions**

Verify ID 85 maps to the expected row, link resolves to an existing `index.html`, and `INIT_DONE` contains `85:"done"`.

**Step 4: Commit and push**

Review the scoped diff, commit App 085 plus its tracker registration, and push only `codex/app-085-tab-manager` to GitHub `origin`.
