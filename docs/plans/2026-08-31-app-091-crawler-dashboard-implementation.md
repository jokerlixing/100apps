# PULSEWATCH/91 Crawler Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static, deployable crawler-change dashboard that monitors browser-accessible JSON/text sources, ships deterministic demo sources, and makes every detected change auditable.

**Architecture:** Keep all deterministic data behavior in a zero-dependency UMD domain module, with a browser controller for fetching, scheduling, persistence, notifications, and rendering. Use a self-contained Node HTTP fixture inside browser QA so the real `fetch` path is verified without external services.

**Tech Stack:** Semantic HTML, native CSS, vanilla JavaScript, localStorage, Fetch/AbortController, Notification API, Node `node:test`, Chrome DevTools Protocol.

---

### Task 1: Domain model and tests

**Files:**
- Create: `apps/091-crawler-dashboard/monitor-core.test.js`
- Create: `apps/091-crawler-dashboard/monitor-core.js`

**Steps:**
1. Write failing tests for source normalization, dotted JSON path extraction, canonical serialization and deterministic FNV-1a fingerprints.
2. Run `node --test apps/091-crawler-dashboard/monitor-core.test.js`; expect missing-module failure.
3. Add the UMD API: `normalizeSource`, `extractAtPath`, `canonicalize`, `fingerprint`, `compareSnapshots`, `nextRunAt`, `isDue`, and `sanitizeImport`.
4. Add failing cases for nested JSON changes, line-based text changes, unchanged snapshots, disabled-source scheduling, URL validation and import caps.
5. Implement the minimum behavior and rerun the test file; expect all tests to pass.

### Task 2: Accessible dashboard shell

**Files:**
- Create: `apps/091-crawler-dashboard/index.html`
- Create: `apps/091-crawler-dashboard/styles.css`

**Steps:**
1. Build one semantic `h1`, a skip link, source navigation, live status region, signal history, selected-source detail, event log, empty states and native dialogs.
2. Define the observatory token system from the design document and implement the three-column desktop layout.
3. Add responsive layouts at 1100px and 720px, 44px touch targets, `:focus-visible`, high-contrast form states and `prefers-reduced-motion` handling.
4. Confirm the static shell loads without JavaScript errors using `node --check` after the controller exists.

### Task 3: Monitoring controller and persistence

**Files:**
- Create: `apps/091-crawler-dashboard/app.js`

**Steps:**
1. Seed four demo sources with baseline snapshots and deterministic next values; store schema version 1 under `pulsewatch91_state_v1`.
2. Implement real JSON/text fetching with a 10-second AbortController timeout and JSON path extraction via the core module.
3. Implement per-source run locks, “check selected”, “check all”, 15-second due checks, pause/resume, and maximum history/event limits.
4. Render statistics, source state, waveform samples, current snapshot, structured field diffs and event rows using safe DOM APIs.
5. Wire add/edit/delete source flows, filters, notification permission, copy summary, JSON export/import and demo reset.
6. Run `node --check` for both JavaScript files and rerun domain tests.

### Task 4: Browser QA and screenshots

**Files:**
- Create: `apps/091-crawler-dashboard/qa/browser-smoke.mjs`
- Create: `apps/091-crawler-dashboard/assets/screenshot-desktop.png`
- Create: `apps/091-crawler-dashboard/assets/screenshot-mobile.png`

**Steps:**
1. Start an embedded static/fixture HTTP server with a mutable `/fixture/status.json` endpoint.
2. Launch headless Chrome/Edge through CDP, clear storage and load the page at 1440×1000.
3. Assert four seeded sources, run all, observe at least two changes, select a source, pause/resume it and verify persistence after reload.
4. Add the real fixture URL, run twice around a fixture mutation and assert the field diff is visible.
5. Verify export produces schema v1 JSON, inspect focus visibility, no runtime errors and no horizontal overflow; capture the desktop screenshot.
6. Switch to 390×844, assert navigation and controls stay in bounds with 44px touch targets; capture the mobile screenshot.

### Task 5: Documentation and tracker closeout

**Files:**
- Create: `apps/091-crawler-dashboard/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Steps:**
1. Document features, static-server command, real-source requirements, privacy/security boundaries, tests and the GitHub Pages URL.
2. Fetch `origin`, merge or rebase onto the newest tracker state, and confirm parallel app registrations remain present.
3. Update tracker item 91 to `PULSEWATCH/91：CORS 数据源轮询+内容指纹+差异追踪与本地通知`, add its deployment URL, and mark 91 officially done.
4. Add a tracker assertion for name, description, URL and completion state.
5. Run domain tests, tracker tests, syntax checks and browser QA; inspect both screenshots and repair any visual defects.
6. Commit the completed app and tracker, fast-forward local `main`, and push only `origin/main`.
