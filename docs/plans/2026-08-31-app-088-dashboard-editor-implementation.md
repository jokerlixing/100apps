# GRID/88 Dashboard Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dependency-free visual dashboard editor with draggable grid widgets, local JSON/CSV data binding, preview, persistence, and project import/export.

**Architecture:** Keep deterministic parsing, layout, binding, and serialization in a UMD-style `dashboard-core.js` module so Node can test it directly. Use semantic HTML, CSS Grid, DOM events, and inline SVG in `app.js`; all runtime data stays in browser storage.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, SVG, Node.js built-in test runner, Chrome DevTools Protocol browser smoke tests.

---

### Task 1: Core data and layout module

**Files:**
- Create: `apps/088-dashboard-editor/dashboard-core.js`
- Test: `apps/088-dashboard-editor/dashboard-core.test.js`

1. Write failing tests for CSV quoting, JSON arrays, field inference, numeric series coercion, layout clamping, unique widget creation, and project normalization.
2. Run `node --test apps/088-dashboard-editor/dashboard-core.test.js` and confirm the module-not-found failure.
3. Implement the pure functions and frozen defaults.
4. Re-run the test and confirm all cases pass.

### Task 2: Editor shell and visual system

**Files:**
- Create: `apps/088-dashboard-editor/index.html`
- Create: `apps/088-dashboard-editor/styles.css`

1. Build the three-zone editor shell, accessible toolbar, component palette, 12-column stage, inspector, data-source dialog, and toast region.
2. Apply the cool-grey control-room palette, local font stacks, labelled rulers, visible focus states, responsive drawer behavior, and reduced-motion handling.
3. Confirm all controls have labels, buttons have explicit types, and dialogs have accessible names.

### Task 3: Editor behavior and chart rendering

**Files:**
- Create: `apps/088-dashboard-editor/app.js`

1. Seed a complete example dashboard with two local datasets and five widget types.
2. Add palette insertion, HTML drag-and-drop, pointer drag on the stage, keyboard nudging, duplication, deletion, undo/redo, and inspector updates.
3. Bind widgets to source fields and render metric, bar, line, donut, and table views without third-party libraries.
4. Add edit/preview modes, theme switching, auto-save, JSON import/export, and clear inline errors.

### Task 4: Documentation and automated browser checks

**Files:**
- Create: `apps/088-dashboard-editor/README.md`
- Create: `apps/088-dashboard-editor/qa/browser-smoke.mjs`

1. Document capabilities, privacy model, supported formats, shortcuts, and local serving commands.
2. Add a Chrome DevTools Protocol test that serves the app, verifies desktop and mobile geometry, inserts and edits a widget, switches preview mode, reloads, and checks runtime errors.
3. Run unit and browser tests; fix any functional or visual defect before continuing.

### Task 5: Tracker synchronization and publication

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch the latest `origin/main` and rebase so parallel project registrations are preserved.
2. Update app 088 with final name, specific description, GitHub Pages URL, and official completion state.
3. Add tracker assertions for app number, URL, description, and `INIT_DONE` status.
4. Run app tests and tracker tests from the rebased tree.
5. Commit all app and tracker changes, rebase once more if `origin/main` advanced, then push only to GitHub `origin`.
