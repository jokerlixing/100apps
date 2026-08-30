# BENCH/94 Online IDE Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable browser IDE that edits and runs Web, JavaScript, and Python examples with isolated execution, persisted drafts, responsive UI, and auditable tests.

**Architecture:** Put deterministic templates, validation, line numbering, console serialization, run-history cleanup, and storage migration in a zero-dependency UMD core shared by Node tests and the browser. Keep DOM orchestration in `app.js`, Web output in a sandboxed `srcdoc`, JavaScript in a classic Worker, and Python in a module Worker that lazily imports pinned Pyodide from its CDN.

**Tech Stack:** Semantic HTML, native CSS, browser Web Workers, sandboxed iframe `srcdoc`, localStorage, Pyodide `v314.0.6`, UMD JavaScript, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Specify and implement the deterministic IDE core

**Files:**
- Create: `apps/094-online-ide/ide-core.test.js`
- Create: `apps/094-online-ide/ide-core.js`

**Step 1: Write the failing core tests**

Cover official mode/file metadata, immutable template cloning, mode and file fallback, code statistics, line-number generation, circular-safe console formatting, run-record cleanup, history caps, and persisted workspace migration.

**Step 2: Run the test to verify it fails**

Run: `node --test apps/094-online-ide/ide-core.test.js`

Expected: FAIL because `ide-core.js` does not exist.

**Step 3: Implement the minimal UMD core**

Export only the constants and pure functions required by the tests. Accept malformed storage input without throwing and clone all returned workspace files.

**Step 4: Re-run the test**

Run: `node --test apps/094-online-ide/ide-core.test.js`

Expected: all core tests pass.

### Task 2: Build the experiment-bench interface

**Files:**
- Create: `apps/094-online-ide/index.html`
- Create: `apps/094-online-ide/styles.css`

**Step 1: Add the semantic shell**

Create a skip link, header, mode switcher, real four-stage compile tape, labelled file rail, textarea editor with line-number gutter, run/stop/reset actions, output tabs, preview iframe, console log, recent-run list, privacy/dependency note, toast, and `aria-live` status.

**Step 2: Implement the visual tokens and responsive layout**

Use the six design tokens, asymmetric file/editor/output grid, continuous-paper editor details, visible focus states, 390px single-column layout, 44px touch controls, and reduced-motion rules.

**Step 3: Verify the static contract**

Check that every DOM ID referenced by the controller exists, buttons have explicit types and accessible names, and the iframe starts with `sandbox="allow-scripts"` only.

### Task 3: Add isolated JavaScript and Python runners

**Files:**
- Create: `apps/094-online-ide/js-worker.js`
- Create: `apps/094-online-ide/python-worker.mjs`

**Step 1: Implement the JavaScript Worker**

Provide a bounded console shim, execute strict async user code, serialize output safely, return duration/result/error, and expose no main-page DOM. Let the controller enforce timeout and stop by terminating the Worker.

**Step 2: Implement the Python module Worker**

Import `loadPyodide` from `https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs`, report loading stages, connect stdout/stderr, run code with `runPythonAsync`, stringify the final expression when present, and return stable errors.

**Step 3: Run syntax checks**

Run:

```powershell
node --check apps/094-online-ide/js-worker.js
node --check apps/094-online-ide/python-worker.mjs
```

Expected: both commands exit 0.

### Task 4: Connect editing, preview, execution, and persistence

**Files:**
- Create: `apps/094-online-ide/app.js`

**Step 1: Render modes and files from the core**

Switch modes without losing drafts, switch active files, update line numbers and code statistics, mark unsaved edits, and persist debounced workspaces under a versioned key.

**Step 2: Assemble the Web preview safely**

Combine the current HTML, CSS, and JavaScript with a restrictive CSP and a run-specific message bridge. Accept preview logs only when source, run ID, and message shape all match.

**Step 3: Manage runner lifecycle**

Create one Worker per run, show true compile-tape stages, stream logs, enforce an 8-second timeout, implement stop/retry, prevent stale Worker messages, and add run summaries without saving full source.

**Step 4: Add shortcuts and recovery**

Wire `Ctrl/⌘ + Enter`, Escape, current-mode reset confirmation, output tab selection, storage fallback, download-current-file, toast feedback, and visible loading/error guidance.

**Step 5: Run syntax checks**

Run: `node --check apps/094-online-ide/app.js`

Expected: command exits 0.

### Task 5: Document and verify real browser behavior

**Files:**
- Create: `apps/094-online-ide/README.md`
- Create: `apps/094-online-ide/qa/browser-smoke.mjs`
- Create after verification: `apps/094-online-ide/assets/screenshot-desktop.png`
- Create after verification: `apps/094-online-ide/assets/screenshot-mobile.png`

**Step 1: Document features and boundaries**

Explain local-only drafts, sandbox limits, JavaScript/Python Worker behavior, pinned network dependency, static serving, shortcuts, deployment URL, and exact verification commands.

**Step 2: Build a deterministic browser smoke test**

Serve the project locally, run headless Chrome/Edge through CDP, test mode/file switching, Web preview, JavaScript output, mocked deterministic Python Worker states, stop/reset confirmation, persistence, visible focus, runtime errors, 1440px and 390px layout, and screenshots.

**Step 3: Run project verification**

Run:

```powershell
node --test apps/094-online-ide/ide-core.test.js
node --check apps/094-online-ide/ide-core.js
node --check apps/094-online-ide/app.js
node --check apps/094-online-ide/js-worker.js
node --check apps/094-online-ide/python-worker.mjs
node apps/094-online-ide/qa/browser-smoke.mjs
```

Expected: every command exits 0 and both screenshots show usable layouts without page overflow.

### Task 6: Publish the project and synchronize the root tracker

**Files:**
- Modify after project verification: `index.html`
- Modify after project verification: `qa/tracker.test.js`

**Step 1: Stage only App #094 and its two plan files**

Keep untracked work for Apps #073, #083, and #092 outside the commit.

**Step 2: Re-fetch and merge the latest `origin/main`**

Preserve every parallel tracker registration before changing App #094.

**Step 3: Register App #094**

Change tracker item 94 to `BENCH/94` with final name, description, `https://jokerlixing.github.io/100apps/apps/094-online-ide/`, and add `94:"done"` to the official completion map. Add tracker tests for number/index, name, description prefix, link, completion, and stale-cache migration.

**Step 4: Run the full closeout verification**

Run:

```powershell
node --test qa/tracker.test.js apps/094-online-ide/ide-core.test.js
node apps/094-online-ide/qa/browser-smoke.mjs
```

Expected: all tracker and app assertions pass.

**Step 5: Commit and push only to GitHub**

Commit the complete project and tracker changes, push `main` only to `origin`, then verify `HEAD`, `origin/main`, and the public GitHub Pages URL source agree. Do not push to `gitee`.

