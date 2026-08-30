# SWITCHYARD/90 Workflow Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable local-first workflow engine where visitors compose, run, inspect, persist, and exchange trigger-condition-action automations.

**Architecture:** A dependency-free UMD core owns workflow validation and deterministic execution. A static browser controller renders the editor, schedules enabled interval workflows only while the page is open, persists versioned state in `localStorage`, and delegates all rule behavior to the tested core.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node.js built-in test runner, built-in HTTP server, Chromium DevTools Protocol smoke test.

---

### Task 1: Build the deterministic workflow core

**Files:**
- Create: `apps/090-workflow-engine/workflow-core.test.js`
- Create: `apps/090-workflow-engine/workflow-core.js`

1. Write failing tests for path lookup, condition operators, manual/event/interval trigger matching, ordered action execution, skipped runs, normalized imports and bounded history.
2. Run `node --test apps/090-workflow-engine/workflow-core.test.js`; expect missing-module failure.
3. Implement constants, ID helpers, cloning, normalization, condition evaluation, trigger matching, execution and backup import/export functions.
4. Re-run the test; expect all cases to pass.

### Task 2: Build the dispatch-desk interface

**Files:**
- Create: `apps/090-workflow-engine/index.html`
- Create: `apps/090-workflow-engine/styles.css`
- Create: `apps/090-workflow-engine/app.js`

1. Add semantic regions for workflow roster, signal route editor, payload desk and run ledger.
2. Implement the dispatch-blue token system, switchyard route signature, desktop three-column layout, mobile stack, focus visibility and reduced motion.
3. Seed useful templates; implement create, duplicate, delete, search, enable, trigger/condition/action editing and auto-save.
4. Wire manual/event runs, interval scheduling, structured result rendering, payload JSON validation and per-workflow metrics.
5. Add template chooser, import/export, reset, confirm dialogs and precise empty/error states.
6. Run `node --check` for both scripts and the core unit suite; expect zero failures.

### Task 3: Document and verify the complete app

**Files:**
- Create: `apps/090-workflow-engine/README.md`
- Create: `apps/090-workflow-engine/qa/browser-smoke.mjs`
- Create: `apps/090-workflow-engine/assets/screenshot-desktop.png`
- Create: `apps/090-workflow-engine/assets/screenshot-mobile.png`

1. Document the public URL, feature boundary, local data model, keyboard/accessibility behavior and exact test commands.
2. Implement a temporary-profile CDP smoke test using an installed Chrome or Edge executable and a built-in static server.
3. Verify template selection, workflow creation/editing, passed and skipped runs, refresh persistence, export, keyboard focus, runtime errors and responsive overflow.
4. Save deterministic desktop and mobile screenshots only after the inspected flows pass.

### Task 4: Publish through the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch GitHub `origin` and integrate the latest `main` before editing tracker data.
2. Add a tracker regression test for App 090 name, `SWITCHYARD/90` description, Pages URL and official completion state; run it and expect failure.
3. Update the 90th idea entry and `INIT_DONE`, preserving every parallel project registration.
4. Run the App 090 unit/smoke checks and `node --test qa/tracker.test.js`; expect all tests to pass.
5. Review the diff for App 090, its plans, tracker and tracker test only; commit and push only to GitHub `origin/main`.
