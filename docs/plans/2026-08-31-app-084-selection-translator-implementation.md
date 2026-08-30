# MARGIN / 84 Selection Translator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a tested Manifest V3 selection-translation extension with an inspectable GitHub Pages demo.

**Architecture:** A dependency-free shared core defines validation, fallback, caching, and history behavior. The extension content script owns selection UI, a service worker owns remote translation, and a popup owns preferences; a standalone demo exercises the same interaction locally.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Chrome Manifest V3 APIs, MyMemory HTTPS API, Node.js built-in test runner, Playwright browser smoke checks.

---

### Task 1: Shared translation contract

**Files:**
- Create: `apps/084-selection-translator/translator-core.js`
- Test: `apps/084-selection-translator/translator-core.test.js`

1. Write failing Node tests for whitespace normalization, 500-character limits, source/target validation, stable cache keys, MyMemory payload validation, local phrase fallback, and history deduplication.
2. Run `node --test apps/084-selection-translator/translator-core.test.js`; expect failures because the module is absent.
3. Implement a browser/Node-compatible `MarginCore` module with typed result objects and no global side effects beyond its namespace.
4. Re-run the test file; expect all tests to pass.

### Task 2: Public inspection demo

**Files:**
- Create: `apps/084-selection-translator/index.html`
- Create: `apps/084-selection-translator/styles.css`
- Create: `apps/084-selection-translator/demo.js`

1. Build the proof-sheet layout with real selectable bilingual reading content, source/target selectors, auto-translate toggle, privacy ledger, status region, and recent slips.
2. Connect pointer and keyboard selection to an anchored translation tab and result card through `MarginCore`.
3. Persist preferences and recent translations to localStorage, include copy and speech actions, and expose deterministic demo examples.
4. Verify at desktop and mobile sizes, with keyboard navigation and reduced motion.

### Task 3: Manifest V3 extension runtime

**Files:**
- Create: `apps/084-selection-translator/manifest.json`
- Create: `apps/084-selection-translator/background.js`
- Create: `apps/084-selection-translator/content.js`
- Create: `apps/084-selection-translator/content.css`
- Create: `apps/084-selection-translator/popup.html`
- Create: `apps/084-selection-translator/popup.css`
- Create: `apps/084-selection-translator/popup.js`
- Create: `apps/084-selection-translator/icons/icon.svg`

1. Declare only `storage` permission plus the MyMemory HTTPS host permission; register the shared core, content layer, popup, and service worker.
2. Implement service-worker request validation, timeout, cache lookup/write, local fallback, and typed messages.
3. Implement selection detection outside editable controls, accessible translate card placement, copy/speech/dismiss actions, pause/auto modes, and storage-change synchronization.
4. Implement popup preferences, status, history, clear-history action, and a link to the public demo.
5. Parse and validate the manifest with Node and exercise the service worker through mocked Chrome/fetch integration tests.

### Task 4: Automated and visual verification

**Files:**
- Create: `apps/084-selection-translator/background.test.js`
- Create: `apps/084-selection-translator/qa/browser-smoke.mjs`
- Create: `apps/084-selection-translator/assets/screenshot-desktop.png`
- Create: `apps/084-selection-translator/assets/screenshot-mobile.png`

1. Run unit/integration tests and fix every failure.
2. Start a local static server and run the Playwright smoke script; fail on page errors, console errors, missing focus visibility, broken selection flow, or mobile overflow.
3. Inspect both generated screenshots and revise any unclear hierarchy, collision, clipping, or templated styling.
4. Re-run the browser smoke test to capture final evidence.

### Task 5: Documentation and tracker closeout

**Files:**
- Create: `apps/084-selection-translator/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Document installation, capabilities, privacy/network boundary, limitations, inspection URL, test commands, and screenshot evidence.
2. Fetch `origin/main`, incorporate its latest tracker state without losing parallel registrations, and resolve only app 084 conflicts.
3. Register `MARGIN / 84`, its final description and `https://jokerlixing.github.io/100apps/apps/084-selection-translator/`; mark 84 officially complete.
4. Add tracker assertions for number, name, description, URL, and official completion migration.
5. Run app tests, browser smoke, manifest parse, tracker tests, and `git diff --check`.
6. Commit only app 084, its plans, and tracker changes; push the completed commit to GitHub `origin/main` only.
