# DUE/76 Subscription Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first subscription manager that makes upcoming renewals, monthly equivalents, annual forecasts, and reminder decisions auditable.

**Architecture:** Put validation, calendar math, status derivation, summaries, timeline sorting, and backup import in a dependency-free UMD core shared by Node tests and the browser. Use semantic HTML, handcrafted CSS, vanilla JavaScript, SVG-free data-bearing HTML, localStorage, and a Chrome DevTools Protocol smoke test.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, localStorage, Node.js `node:test`, Chrome/Edge CDP.

---

### Task 1: Define subscription math with TDD

**Files:**
- Create: `apps/076-subscription-manager/subscription-core.test.js`
- Create: `apps/076-subscription-manager/subscription-core.js`

**Step 1:** Write failing tests for `normalizeSubscription`, `monthlyEquivalent`, `daysUntil`, `renewalState`, `summarizeSubscriptions`, `buildTimeline`, and `importBackup`.

**Step 2:** Run `node --test apps/076-subscription-manager/subscription-core.test.js`; expect a missing-module failure.

**Step 3:** Implement bounded text, positive amount, ISO local dates, supported cycles/currencies, deterministic 30-day timeline logic, active-only forecasts, currency-separated totals, duplicate removal, and prototype-safe import.

**Step 4:** Run the unit test and `node --check apps/076-subscription-manager/subscription-core.js`; expect all checks to pass.

### Task 2: Build the DUE/76 renewal desk

**Files:**
- Create: `apps/076-subscription-manager/index.html`
- Create: `apps/076-subscription-manager/styles.css`
- Create: `apps/076-subscription-manager/app.js`

**Step 1:** Add semantic landmarks, one `h1`, skip link, summary counters, timeline, filters, subscription ledger, editor dialog, delete confirmation, backup controls, sample-data action, and live status.

**Step 2:** Implement the receipt-counter visual tokens, real-data ticket positions, visible reminder states, 44px controls, focus states, mobile layout, print styles, and reduced-motion fallback.

**Step 3:** Connect create/edit/pause/resume/delete, search/category/status filters, local persistence, sample onboarding, JSON export, validated merge/replace import, and clear-data confirmation without inline handlers.

**Step 4:** Run syntax and structural assertions; expect no inline handlers, correct script order, one `h1`, and labelled controls.

### Task 3: Add browser evidence and documentation

**Files:**
- Create: `apps/076-subscription-manager/qa/browser-smoke.mjs`
- Create: `apps/076-subscription-manager/README.md`
- Create: `apps/076-subscription-manager/assets/screenshot-desktop.png`
- Create: `apps/076-subscription-manager/assets/screenshot-mobile.png`

**Step 1:** Document storage, calculations, reminder limitations, import/export behavior, accessibility, local start command, test commands, and published URL.

**Step 2:** Use a temporary browser profile to verify empty onboarding, sample loading, create/edit/pause/delete, filters, export, invalid import, persistence, keyboard focus, no runtime errors, and no horizontal overflow at 1440px and 390px.

**Step 3:** Inspect both screenshots and fix any visual defect before continuing.

### Task 4: Integrate the root tracker on latest main

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1:** Fetch `origin/main` after application verification and rebase so concurrently published apps are preserved.

**Step 2:** Replace app 76 metadata with `DUE/76`, add the GitHub Pages URL, and mark only app 76 officially complete while preserving every newer completion.

**Step 3:** Extend tracker tests for number, name, description prefix, link, and completion migration.

**Step 4:** Run app tests, tracker tests, browser smoke, syntax checks, and `git diff --check`; expect all checks to pass.

### Task 5: Commit and synchronize GitHub only

**Files:**
- Verify all files above.

**Step 1:** Review `git status --short`, the branch diff, generated screenshots, and tracked file list.

**Step 2:** Commit the complete 76 project and tracker integration on `codex/app-076-subscription-manager`.

**Step 3:** Push the feature branch to `origin`, then push its verified head to `origin/main`; if main advanced, fetch, rebase, rerun tracker verification, and retry. Never push `gitee`.

**Step 4:** Verify local `HEAD`, `origin/codex/app-076-subscription-manager`, and `origin/main` match; record finish time and elapsed duration.
