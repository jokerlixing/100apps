# App 055 JSON Formatter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dependency-free JSON workbench with formatting, minifying, exact parse-error context, searchable collapsible trees, path copying, and local file export.

**Architecture:** Put deterministic parsing, position mapping, statistics, JSONPath generation, traversal, and search in a UMD core module that Node can test. Keep browser state, safe DOM rendering, storage, file handling, clipboard/download actions, and responsive interaction in a separate controller; semantic HTML and CSS provide the SPEC/55 specimen-bench shell without a build step.

**Tech Stack:** Semantic HTML, responsive CSS, vanilla JavaScript, File/Blob/Clipboard APIs, localStorage, Node.js built-in test runner.

---

### Task 1: Specify and implement the JSON domain core

**Files:**
- Create: `apps/055-json-formatter/json-core.test.js`
- Create: `apps/055-json-formatter/json-core.js`

**Step 1: Write failing tests**

Cover `parseJson`, `positionToLineColumn`, `formatJson`, `minifyJson`, `analyzeJson`, `joinPath`, `searchJson`, and malformed or boundary inputs. Include CRLF location mapping, unsafe-key JSONPath quoting, arrays, scalar roots, search result limits, and HTML-like string values.

**Step 2: Verify red**

Run: `node --test apps/055-json-formatter/json-core.test.js`

Expected: FAIL because `json-core.js` does not exist.

**Step 3: Implement the smallest safe UMD core**

Parse with native `JSON.parse`, normalize syntax-error positions into zero-based offsets, derive 1-based line/column context, recursively collect statistics with a depth guard, build readable `$` paths, and return capped depth-first search results without producing HTML.

**Step 4: Verify green and syntax**

Run: `node --test apps/055-json-formatter/json-core.test.js`

Run: `node --check apps/055-json-formatter/json-core.js`

Expected: all tests PASS and syntax check exits 0.

### Task 2: Build the SPEC/55 semantic shell

**Files:**
- Create: `apps/055-json-formatter/index.html`
- Create: `apps/055-json-formatter/styles.css`

**Step 1: Add accessible structure**

Create a skip link, challenge breadcrumb, title and privacy note, file/sample/clear actions, editor with line gutter, validation context, format/minify/copy/download actions, statistics, search controls, tree view, node inspector, toast, and live announcer.

**Step 2: Implement the specimen-bench visual system**

Use the six design tokens, a ruled editor gutter, physical specimen labels, restrained type coloring, at least 44px touch targets, visible focus, desktop split layout, stacked 390px layout, and reduced-motion overrides.

**Step 3: Inspect static semantics**

Run source assertions for the title, stylesheet/script order, named controls, ARIA status regions, and local-only asset references.

Expected: all required ids exist exactly once and no remote assets are present.

### Task 3: Connect parsing, rendering, persistence, and file actions

**Files:**
- Create: `apps/055-json-formatter/app.js`
- Modify: `apps/055-json-formatter/index.html`

**Step 1: Bind validation and editor actions**

Debounce input validation, keep the gutter synchronized with scrolling, distinguish empty/valid/error states, expose exact error context, and make 2-space/4-space formatting and minifying replace the editor contents without losing validation state.

**Step 2: Render a safe interactive tree**

Create every row with DOM nodes and `textContent`; show type badges, compact previews, child counts and JSONPath. Support per-node toggle, expand/collapse all, search highlights, next-match scrolling, and copying a node path.

**Step 3: Add browser integrations**

Import `.json` or text files up to 2 MB, handle drag/drop, copy output, download a timestamped `.json`, load a representative sample, and persist drafts no larger than 250 KB. Report denied clipboard/storage operations with actionable inline feedback.

**Step 4: Run automated checks**

Run: `node --test apps/055-json-formatter/json-core.test.js`

Run: `node --check apps/055-json-formatter/app.js`

Expected: tests PASS and syntax check exits 0.

### Task 4: Document and integrate App 055

**Files:**
- Create: `apps/055-json-formatter/README.md`
- Modify: `index.html`
- Modify: `README.md`

**Step 1: Document the app**

Explain features, privacy, supported JSON rules, file limits, local run path, tests, keyboard behavior, and file responsibilities.

**Step 2: Update the root tracker**

Replace App 055's generic copy with a concise `SPEC/55` description and GitHub Pages URL. Add 55 to official completed ids without falsely marking Apps 052–054 complete, and update repository progress text if it is hard-coded.

**Step 3: Verify integration**

Assert the exact App 055 directory/link, official completion id, valid IDEA count, and unchanged status of ids 52–54.

### Task 5: Browser QA, review, commit, and synchronize

**Files:**
- Verify all files above.

**Step 1: Run full static verification**

Run unit/syntax tests, HTML source assertions, `git diff --check`, and inspect the complete scoped diff.

Expected: all commands exit 0 and only App 055, its plans, root documentation, and tracker are changed.

**Step 2: Run browser verification**

Serve the repository locally. Exercise sample, valid formatting, malformed error context, tree toggles, search/next, path copy, import/download, persistence, and reset. Inspect 1280×800 and 390×844 screenshots, horizontal overflow, focus behavior, and console errors.

**Step 3: Fix findings and repeat QA**

Correct any functional or visual defects found in screenshots or console output, then rerun the relevant tests and capture clean final views.

**Step 4: Commit and synchronize**

Create focused commits on `codex/app-055-json-formatter`, refresh `origin/main`, integrate without overwriting concurrent project work, and push completed code only to GitHub `origin`. Verify the remote commit before recording the finish timestamp.
