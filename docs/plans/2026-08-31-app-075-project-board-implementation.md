# App 075 Project Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish RAIL/75, a responsive local-first project board with task assignment, drag-and-drop workflow, filters, activity history, and portable JSON data.

**Architecture:** Keep deterministic board rules in a UMD-style `board-core.js` module that works in Node tests and the browser. `app.js` owns DOM events, localStorage, dialogs, drag-and-drop, import/export, and rendering; static assets remain deployable on GitHub Pages without a build step.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node.js built-in test runner, CDP browser smoke script.

---

### Task 1: Create and test the board domain

**Files:**
- Create: `apps/075-project-board/board-core.test.js`
- Create: `apps/075-project-board/board-core.js`

**Step 1:** Write failing tests for default state, task validation, immutable create/update/delete, member validation, forward/backward moves, indexed drag moves, completion timestamps, filtering, statistics, activity caps, and imported-state cleaning.

**Step 2:** Run `node --test apps/075-project-board/board-core.test.js`; expect failure because the core module does not exist.

**Step 3:** Implement `createDefaultState`, `sanitizeState`, `createTask`, `updateTask`, `deleteTask`, `moveTask`, `filterTasks`, and `getStats`. Inject time/id values where determinism matters and return `{state, task}` or descriptive validation errors.

**Step 4:** Rerun the core tests and expect all cases to pass.

**Step 5:** Commit the tested domain and planning documents.

### Task 2: Build the responsive board interface

**Files:**
- Create: `apps/075-project-board/index.html`
- Create: `apps/075-project-board/styles.css`
- Create: `apps/075-project-board/app.js`

**Step 1:** Add semantic project header, local-mode disclosure, summary rail, member and priority filters, search, four status columns, activity panel, task dialog, confirmation dialog, data menu, toast, and live status region.

**Step 2:** Implement the blueprint dispatch visual tokens from the design document, including the status rail signature, responsive horizontal board, visible focus, touch sizing, and reduced-motion support.

**Step 3:** Render all board state; connect create/edit/delete, assignment, filters, search, drag-and-drop, previous/next controls, activity log, localStorage, reset, import, and export. Keep import atomic and cap files at 512 KiB.

**Step 4:** Run `node --check` on both JavaScript files and rerun the core tests.

**Step 5:** Commit the interactive application.

### Task 3: Document and browser-test the product

**Files:**
- Create: `apps/075-project-board/README.md`
- Create: `apps/075-project-board/qa/browser-smoke.mjs`
- Create: `apps/075-project-board/assets/screenshot-desktop.png`
- Create: `apps/075-project-board/assets/screenshot-mobile.png`

**Step 1:** Document features, static-server commands, storage/import limits, interaction alternatives, testing, deployment URL, and the honest lack of accounts/cloud collaboration.

**Step 2:** Implement a temporary-profile CDP smoke test that starts a static server and verifies initial rendering, create/edit, filtering, next/previous movement, HTML drag/drop, refresh persistence, mobile layout, focus visibility, and zero runtime errors.

**Step 3:** Run the smoke test at 1440×1000 and 390×844, save screenshots, inspect both images, and fix any visual or behavioral regressions.

**Step 4:** Run the full app tests, JavaScript syntax checks, browser smoke, and `git diff --check`.

**Step 5:** Commit README, QA, and verified screenshots.

### Task 4: Integrate the root tracker and publish

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1:** Fetch `origin/main`, rebase the app branch, and inspect the newest tracker so concurrently published app entries are preserved.

**Step 2:** Add a failing tracker assertion for app 75 name, `RAIL/75` description, Pages URL, and official completion.

**Step 3:** Update only app 75 metadata and add ID 75 to `INIT_DONE`, preserving all other newly completed IDs.

**Step 4:** Run core tests, tracker tests, browser smoke, syntax checks, and `git diff --check`; verify no secrets, temporary profiles, or local storage artifacts are tracked.

**Step 5:** Commit the tracker integration, re-fetch/rebase if necessary, push `HEAD:main` only to GitHub `origin`, verify local HEAD equals `origin/main`, and record finish time for the final duration report.
