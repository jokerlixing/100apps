# INDEX/100 Portfolio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish App 100 as a distinctive, tracker-backed portfolio that makes all one hundred challenge projects searchable and inspectable.

**Architecture:** A static HTML/CSS/JavaScript application fetches the root tracker and passes its source through a side-effect-free core module. The UI consumes normalized project records, while a small embedded fallback catalog keeps the page useful when tracker loading is unavailable. Node tests verify core behavior and a CDP browser smoke test verifies real interactions and responsive rendering.

**Tech Stack:** Semantic HTML, modern CSS, browser JavaScript, Node.js built-in test runner, Chrome DevTools Protocol, GitHub Pages.

---

### Task 1: Tracker-backed domain core

**Files:**
- Create: `apps/100-portfolio/portfolio-core.js`
- Create: `apps/100-portfolio/portfolio-core.test.js`

**Step 1: Write the failing tests**

Cover parsing `IDEAS` and `INIT_DONE`, truncation at ID 100, safe URL normalization, summary totals, query/level/status filters, and featured-project selection.

**Step 2: Run tests to verify they fail**

Run: `node --test apps/100-portfolio/portfolio-core.test.js`
Expected: FAIL because the core module does not exist.

**Step 3: Implement the minimal core**

Expose pure functions through both `module.exports` and `window.PortfolioCore`: `parseTrackerSource`, `normalizeProjects`, `filterProjects`, `summarizeProjects`, and `pickFeaturedProjects`.

**Step 4: Run tests to verify they pass**

Run: `node --test apps/100-portfolio/portfolio-core.test.js`
Expected: all core tests PASS.

### Task 2: Portfolio interface

**Files:**
- Create: `apps/100-portfolio/index.html`
- Create: `apps/100-portfolio/styles.css`
- Create: `apps/100-portfolio/app.js`

**Step 1: Build the semantic document**

Add the masthead, hero thesis, 10x10 punchboard, selected work, practice, archive controls, project dialog, contact strip, live regions, and accessible labels.

**Step 2: Implement the visual system**

Encode the six design tokens, asymmetric cover layout, blueprint rails, responsive archive, visible focus, 44px touch targets, and reduced-motion behavior.

**Step 3: Wire real data and interactions**

Fetch `../../index.html`, parse the tracker, update the board/readout/archive, filter without page reloads, manage the dialog and focus, persist the display preference, and export normalized JSON.

**Step 4: Run core tests again**

Run: `node --test apps/100-portfolio/portfolio-core.test.js`
Expected: all tests PASS after UI integration.

### Task 3: Browser acceptance and documentation

**Files:**
- Create: `apps/100-portfolio/qa/browser-smoke.mjs`
- Create: `apps/100-portfolio/README.md`
- Create: `apps/100-portfolio/assets/screenshot-desktop.png`
- Create: `apps/100-portfolio/assets/screenshot-mobile.png`

**Step 1: Add the failing browser acceptance script**

Serve the repository root, open the portfolio route, assert one hundred tracker projects load, exercise punchboard selection, filters, detail dialog, and export wiring, then check desktop/mobile overflow, focus, touch targets, and console errors.

**Step 2: Run the smoke test and fix failures**

Run: `node apps/100-portfolio/qa/browser-smoke.mjs`
Expected: PASS with desktop and mobile evidence written under `assets/`.

**Step 3: Inspect the screenshots**

Review both images for hierarchy, clipping, accidental template styling, and mobile usability. Revise and rerun the smoke test until both are clean.

**Step 4: Document use and verification**

Explain purpose, feature set, local serving, deployment URL, technology choices, privacy, limitations, and exact test commands in the app README.

**Step 5: Commit the application**

Run: `git add apps/100-portfolio docs/plans/2026-08-31-app-100-portfolio-*.md && git commit -m "feat: build app 100 portfolio"`
Expected: one application commit on `codex/app-100-portfolio`.

### Task 4: Root tracker closeout

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Integrate current GitHub state without dropping parallel projects**

Fetch `origin`, inspect `main...origin/main`, and merge or rebase only after the shared main worktree has no unresolved operation. Preserve all existing app registrations.

**Step 2: Register App 100**

Set the final name and `INDEX/100` description, add `https://jokerlixing.github.io/100apps/apps/100-portfolio/`, and add ID 100 to the official completion map.

**Step 3: Add tracker assertions**

Test App 100's array position, name, description marker, URL, official completion state, and stale-cache migration.

**Step 4: Run full verification**

Run: `node --test apps/100-portfolio/portfolio-core.test.js qa/tracker.test.js && node apps/100-portfolio/qa/browser-smoke.mjs`
Expected: all tests and browser smoke checks PASS.

### Task 5: GitHub synchronization

**Files:**
- Commit the completed App 100 and tracker changes; do not include unrelated working-tree files.

**Step 1: Review the exact staged diff**

Run: `git diff --cached --stat && git diff --cached --check`
Expected: only App 100, its plan/evidence, and the App 100 tracker/test changes.

**Step 2: Commit the tracker closeout**

Run: `git commit -m "chore: publish app 100 in tracker"`
Expected: clean App 100 closeout commit.

**Step 3: Push GitHub only**

Run: `git push origin main`
Expected: `origin/main` advances to the verified closeout commit. Do not push `gitee`.
