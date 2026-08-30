# App 051 Stock Watchlist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive, local-first stock watchlist with 60-second quote refresh, interactive candlestick ranges, and an explicit offline sample-data fallback.

**Architecture:** Keep symbol normalization, Tencent response parsing, range configuration, chart bounds, and formatting in a dependency-free UMD core module so Node can test the business logic. The browser controller owns fetch, localStorage, refresh scheduling, rendering, and Canvas interaction; HTML and CSS provide an accessible paper-tape terminal shell without a build step.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Canvas 2D, Fetch API, localStorage, Node.js built-in test runner.

---

### Task 1: Lock down market-domain behavior with TDD

**Files:**
- Create: `apps/051-stock-watchlist/market-core.test.js`
- Create: `apps/051-stock-watchlist/market-core.js`

**Step 1: Write the failing tests**

Cover `normalizeSymbol`, `parseQuotePayload`, `parseKlineResponse`, `getRangeConfig`, `calculateChartBounds`, `formatCompactNumber`, and malformed/empty inputs.

**Step 2: Run the tests to verify red**

Run: `node --test apps/051-stock-watchlist/market-core.test.js`
Expected: FAIL because `market-core.js` does not exist.

**Step 3: Implement the smallest dependency-free core**

Export through CommonJS and `window.MarketCore`. Treat all remote values as untrusted, discard incomplete candles, and never turn invalid numbers into zero-price data.

**Step 4: Run green and syntax checks**

Run: `node --test apps/051-stock-watchlist/market-core.test.js`
Expected: all tests PASS.

Run: `node --check apps/051-stock-watchlist/market-core.js`
Expected: exit 0.

### Task 2: Build the TICK/51 interface

**Files:**
- Create: `apps/051-stock-watchlist/index.html`
- Create: `apps/051-stock-watchlist/styles.css`

**Step 1: Add semantic structure**

Create a header with freshness status, watchlist form/list, selected quote summary, range tabs, an accessible Canvas figure with textual fallback, candle inspector, empty/error states, and the educational disclaimer.

**Step 2: Implement the paper-tape visual system**

Use the six documented color tokens, clear numeric typography, a perforated chart edge, responsive watchlist rail, visible focus states, touch targets of at least 44px, and reduced-motion overrides.

**Step 3: Parse inline scripts and inspect overflow**

Run a Node syntax extraction check and verify no fixed width forces horizontal scrolling at 390px.

### Task 3: Connect quotes, K-lines, storage, and Canvas

**Files:**
- Create: `apps/051-stock-watchlist/app.js`
- Modify: `apps/051-stock-watchlist/index.html`

**Step 1: Add deterministic sample data and fetch adapters**

Fetch batch quotes from `https://qt.gtimg.cn/q=...` using `TextDecoder('gbk')`; fetch selected-symbol K-lines from `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?...`. Enforce timeouts and use sample data only with an explicit badge.

**Step 2: Implement local watchlist state**

Validate duplicate and maximum-count cases, persist only normalized symbols and selection, keep at least one symbol, and announce mutations through an ARIA live region.

**Step 3: Implement refresh state and ranges**

Refresh immediately, every 60 seconds while visible, and on manual action. Abort stale requests when selection/range changes and retain last good values on transient failure.

**Step 4: Draw and interact with the K-line paper tape**

Scale for device pixel ratio, draw price/volume grids and red-up/green-down candles, support pointer crosshair and left/right keyboard inspection, and mirror the selected candle in text.

**Step 5: Run unit and syntax checks**

Run: `node --test apps/051-stock-watchlist/market-core.test.js`
Run: `node --check apps/051-stock-watchlist/app.js`
Expected: PASS / exit 0.

### Task 4: Integrate challenge metadata

**Files:**
- Create: `apps/051-stock-watchlist/README.md`
- Modify: `index.html`
- Modify: `README.md`

**Step 1: Document operation and limitations**

Explain supported symbol forms, data source behavior, sample fallback, local-only storage, browser support, test command, and non-investment disclaimer.

**Step 2: Mark app 051 complete in the tracker**

Add the GitHub Pages link and a concise `TICK/51` description, and update repository progress without disturbing concurrent 048–050 entries.

### Task 5: Verify, review, and synchronize

**Files:**
- Verify all files above.

**Step 1: Run static verification**

Run tests, syntax checks, `git diff --check`, link/path assertions, and inspect the exact diff.

**Step 2: Run browser verification**

Serve the worktree locally. Validate the live path and forced-offline sample path, add/remove, persistence, range changes, chart pointer/keyboard inspection, 1280px desktop and 390px mobile layouts, and console warnings/errors.

**Step 3: Commit only app 051 changes**

Create focused commits on `codex/app-051-stock-watchlist`; do not stage unrelated files.

**Step 4: Integrate safely and push GitHub only**

Refresh `origin/main`, rebase or cherry-pick without overwriting concurrent projects, then push only to GitHub `origin`. Verify the remote commit hash before stopping the timer.
