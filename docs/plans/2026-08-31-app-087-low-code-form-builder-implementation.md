# App 087 · JIG/87 Low-code Form Builder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency low-code form assembly bench that edits a safe schema, previews validation, persists locally, and exports JSON or standalone HTML.

**Architecture:** Keep business logic in a browser/CommonJS `model.js` module and treat the DOM layer as a renderer/controller around immutable schema updates. Store only the sanitized schema in localStorage; generated HTML is self-contained and escapes every user-controlled string.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node.js built-in test runner, localStorage, HTML Drag and Drop API.

---

### Task 1: Pure form model

**Files:**
- Create: `apps/087-low-code-form-builder/model.js`
- Create: `apps/087-low-code-form-builder/tests/model.test.js`

**Step 1: Write the failing model tests**

Cover field creation, schema normalization, duplicate IDs, CRUD/reorder, choice parsing, preview validation, JSON round-trip, safe filename generation, and escaped standalone HTML.

**Step 2: Run the tests to verify red**

Run: `node --test apps/087-low-code-form-builder/tests/model.test.js`

Expected: FAIL because `model.js` does not exist.

**Step 3: Implement the minimal model**

Export `FIELD_TYPES`, `createField`, `createStarterSchema`, `sanitizeSchema`, `addField`, `updateField`, `duplicateField`, `removeField`, `moveField`, `parseOptions`, `validateSubmission`, `serializeSchema`, `deserializeSchema`, `safeFileName`, and `generateStandaloneHtml` through CommonJS and `window.FormModel`.

**Step 4: Run the tests to verify green**

Run: `node --test apps/087-low-code-form-builder/tests/model.test.js`

Expected: all tests PASS.

### Task 2: Semantic assembly interface

**Files:**
- Create: `apps/087-low-code-form-builder/index.html`
- Create: `apps/087-low-code-form-builder/styles.css`

**Step 1: Build the document structure**

Add the masthead, file controls, parts bin, assembly canvas, empty state, field template, calibration inspector, preview dialog, import input, toast and live region. Every form control receives a label and every icon-only action receives an accessible name.

**Step 2: Apply the design tokens and responsive layouts**

Implement the documented six-color palette, condensed/utility/body type roles, three-column bench, calibration ruler, selected-field jig, visible focus, minimum 44px targets, 980px/680px breakpoints and reduced-motion rules.

**Step 3: Run static structure checks**

Run: `node apps/087-low-code-form-builder/tests/static.test.js`

Expected: PASS for local assets, unique IDs, labels, landmarks and responsive safeguards.

### Task 3: Builder controller and persistence

**Files:**
- Create: `apps/087-low-code-form-builder/app.js`
- Create: `apps/087-low-code-form-builder/tests/static.test.js`

**Step 1: Write static expectations**

Assert the required files, DOM hooks, no third-party URLs, no inline event handlers, one `h1`, one `main`, a labelled status region, and mobile/reduced-motion CSS.

**Step 2: Implement state and rendering**

Wire parts-bin add/drag, canvas reorder, selection, title/description editing, property controls, option editing, duplicate/delete/move, undo/redo, starter reset, sanitized local persistence and status announcements.

**Step 3: Implement import/export and preview**

Add JSON download/upload, standalone HTML download, preview dialog rendering, input collection, validation summaries, field-level messages and successful local receipt.

**Step 4: Run model and static tests**

Run: `node --test apps/087-low-code-form-builder/tests/model.test.js && node apps/087-low-code-form-builder/tests/static.test.js`

Expected: both suites PASS.

### Task 4: Product documentation

**Files:**
- Create: `apps/087-low-code-form-builder/README.md`

**Step 1: Document the product**

Describe its job, feature set, static run URL, local-data boundary, exported HTML behavior, keyboard/mobile support, file map, test commands and current limitations.

**Step 2: Verify referenced commands and paths**

Run every documented test command and confirm the GitHub Pages URL uses `/apps/087-low-code-form-builder/`.

### Task 5: Browser acceptance and artifacts

**Files:**
- Create: `apps/087-low-code-form-builder/tests/browser-smoke.mjs`
- Create: `apps/087-low-code-form-builder/assets/jig-87-desktop.png`
- Create: `apps/087-low-code-form-builder/assets/jig-87-mobile.png`

**Step 1: Start a local static server**

Run: `python -m http.server 8087`

Open: `http://127.0.0.1:8087/apps/087-low-code-form-builder/`

**Step 2: Exercise the complete flow**

Use a temporary Chrome/Edge profile and CDP to verify add, reorder, inspector edits, duplication, deletion, undo/redo, failed and successful preview submission, local persistence, JSON import, and both download buttons.

**Step 3: Inspect both viewports**

Capture 1440×1000 and 390×844 screenshots, confirm no document-level horizontal overflow, no clipped controls, visible current state, and no uncaught console/runtime error. Review both screenshots and fix defects before retaining them.

### Task 6: Repository and tracker closeout

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Commit and push the isolated app branch**

Commit only App 087 and its two plan files, then push `codex/app-087-low-code-form-builder` to GitHub `origin`.

**Step 2: Reconcile latest tracker state**

Fetch `origin/main`, integrate the latest completed entries, then set item 87 to `JIG/87 表单装配台`, its final description, GitHub Pages URL, and official done state without overwriting parallel project changes.

**Step 3: Extend and run tracker tests**

Add assertions for App 087 number, link, description and `INIT_DONE` status. Run `node qa/tracker.test.js`, all App 087 tests, `git diff --check`, and inspect the final diff.

**Step 4: Push the completed result**

Push the final integrated branch/main only to GitHub `origin`, verify the remote commit, and report the run URL, checks, commit, push status, start/finish times and elapsed duration.

