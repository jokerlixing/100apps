# App 058 Web Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static PageSpeed Insights client that turns a public URL into an understandable Lighthouse performance report with a resilient sample fallback.

**Architecture:** Keep network and rendering code in `app.js`, and put deterministic URL validation, response parsing, scoring and history normalization in a UMD-style `performance-core.js` that runs in both the browser and Node tests. The UI consumes a compact report model, persists only report summaries, and never injects remote strings as HTML.

**Tech Stack:** Semantic HTML, responsive CSS, vanilla JavaScript, Google PageSpeed Insights v5, Node.js built-in test runner, localStorage.

---

### Task 1: Build the tested performance domain core

**Files:**
- Create: `apps/058-web-performance/performance-core.js`
- Create: `apps/058-web-performance/tests/performance-core.test.js`

**Steps:**
1. Write failing Node tests for URL normalization, private-host rejection, API query construction, Lighthouse score bands, missing audit values, opportunity ordering, waterfall request selection, and history cleanup.
2. Run `node --test apps/058-web-performance/tests/performance-core.test.js` and confirm failures identify the missing module.
3. Implement a browser/Node compatible `PerformanceCore` module with pure functions and immutable report output.
4. Run the focused test file and confirm every case passes.
5. Commit the domain core and tests as `feat: add app 058 performance core`.

### Task 2: Build the diagnostic interface

**Files:**
- Create: `apps/058-web-performance/index.html`
- Create: `apps/058-web-performance/styles.css`
- Create: `apps/058-web-performance/app.js`

**Steps:**
1. Add semantic regions for the audit form, progress state, score, metrics, request trace, opportunities and local history.
2. Implement the network-flight-recorder token system, typography, responsive grid, focus states and reduced-motion handling in CSS.
3. Add a PageSpeed client with a 90-second timeout, progress phases, cancellation and user-facing status mapping.
4. Render only through DOM properties and `textContent`; create safe HTTP(S) links through the core validator.
5. Add a marked sample response path and local history restore/re-run controls.
6. Run the Node tests again and open the page through a local HTTP server to check the initial, loading, success/sample and error states.
7. Commit the interface as `feat: build app 058 web performance lab`.

### Task 3: Document and register the app

**Files:**
- Create: `apps/058-web-performance/README.md`
- Modify: `index.html`

**Steps:**
1. Document the one-minute workflow, PageSpeed data source, no-key public quota, local-only history, limitations, local run command and test command.
2. Change tracker item 058 from the placeholder to `TRACE/58：PageSpeed 实时审计+核心指标+请求瀑布` and add the GitHub Pages URL.
3. Add `58` to `INIT_DONE` without removing completion entries added by other project branches during integration.
4. Run a tracker parsing check and verify the app link resolves from the local server.
5. Commit as `docs: register app 058 performance lab`.

### Task 4: Verify and synchronize

**Files:**
- Verify: `apps/058-web-performance/**`
- Verify: `index.html`

**Steps:**
1. Run `node --test apps/058-web-performance/tests/performance-core.test.js` and syntax-check both JavaScript files.
2. Serve the worktree locally, use a browser at desktop and mobile widths, and inspect screenshots for overflow, clipped text, broken focus and state hierarchy.
3. Exercise invalid URL, sample report, device switch, history reset and at least one live API request when the public quota permits.
4. Check `git diff --check`, `git status`, and the exact commit diff for unrelated changes.
5. Fetch the latest `origin/main`, rebase the isolated branch, resolve tracker conflicts by preserving all completed apps, then push completed code only to GitHub `origin`.
