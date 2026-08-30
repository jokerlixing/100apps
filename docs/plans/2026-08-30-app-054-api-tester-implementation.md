# App 054 API Tester Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive, local-first API testing workbench that composes HTTP requests, explains browser/CORS failures, inspects responses, and safely reuses local history.

**Architecture:** Put deterministic URL, header, body, response, and history rules in a dependency-free UMD core module tested by Node. Keep browser state, fetch/abort behavior, localStorage, rendering, clipboard, and downloads in one controller; semantic HTML and CSS provide the two-pane PORT/54 workbench without a build step.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Fetch API, AbortController, localStorage, Clipboard/Blob APIs, Node.js built-in test runner.

---

### Task 1: Lock down request-domain behavior with TDD

**Files:**
- Create: `apps/054-api-tester/api-core.test.js`
- Create: `apps/054-api-tester/api-core.js`

**Step 1: Write failing tests**

Cover `normalizeUrl`, `buildRequestUrl`, `sanitizeHeaderRows`, `maskSensitiveHeaders`, `prepareRequestBody`, `detectResponseKind`, `formatBytes`, and `trimHistory`, including malformed input and boundary cases.

**Step 2: Run the red test**

Run: `node --test apps/054-api-tester/api-core.test.js`
Expected: FAIL because `api-core.js` does not exist.

**Step 3: Implement the minimal dependency-free core**

Export through CommonJS and `window.ApiCore`. Accept only HTTP(S), never mutate input rows, omit disabled/empty keys, reject malformed JSON, and cap history at 12 entries.

**Step 4: Run green and syntax checks**

Run: `node --test apps/054-api-tester/api-core.test.js`
Expected: all tests PASS.

Run: `node --check apps/054-api-tester/api-core.js`
Expected: exit 0.

### Task 2: Build the PORT/54 interface

**Files:**
- Create: `apps/054-api-tester/index.html`
- Create: `apps/054-api-tester/styles.css`

**Step 1: Add semantic structure**

Create a labelled method/URL bar, timeout control, send/cancel controls, request tabs, reusable key-value rows, body mode/format controls, response summary/tabs, safe text viewer, recent-history drawer, status line, and three starter examples.

**Step 2: Implement the network-analyzer visual system**

Use the documented six-token palette, compressed display type, monospace data, straight instrument panels, vertical pulse rail, 44px touch targets, strong focus states, desktop/mobile compositions, and reduced-motion overrides.

**Step 3: Check structure and overflow**

Parse referenced scripts, assert required landmark IDs, and verify no fixed width forces horizontal scrolling at 390px.

### Task 3: Connect request composition, fetch, response inspection, and history

**Files:**
- Create: `apps/054-api-tester/app.js`
- Modify: `apps/054-api-tester/index.html`

**Step 1: Implement request state and row editors**

Render query/header rows with enabled toggles and delete actions, synchronize body controls with method, and generate a read-only final request preview through `ApiCore`.

**Step 2: Implement fetch and cancellation**

Create one `AbortController` per request, distinguish timeout from manual cancellation, keep HTTP error bodies inspectable, and translate likely CORS/network failures into actionable browser guidance.

**Step 3: Implement safe response tools**

Format JSON when valid, render all content through `textContent`, expose response/request headers, copy visible content, and download the raw response with a content-derived extension.

**Step 4: Implement privacy-safe history and examples**

Persist at most 12 serializable records with sensitive header values masked, restore a record without secrets, allow confirmed clearing, and seed public GET and POST examples.

**Step 5: Run unit and syntax checks**

Run: `node --test apps/054-api-tester/api-core.test.js`
Run: `node --check apps/054-api-tester/app.js`
Expected: PASS / exit 0.

### Task 4: Integrate challenge metadata

**Files:**
- Create: `apps/054-api-tester/README.md`
- Modify: `index.html`

**Step 1: Document use and limitations**

Explain methods, body modes, CORS/browser limits, secret handling, local history, local server command, test commands, and privacy guarantees.

**Step 2: Mark app 054 complete in the tracker**

Replace the 54th idea with the `PORT/54` description and GitHub Pages URL while leaving apps 052 and 053 unchanged.

### Task 5: Verify, review, and synchronize

**Files:**
- Verify all files above.

**Step 1: Run static verification**

Run unit tests, syntax checks, `git diff --check`, path assertions, and inspect the exact diff.

**Step 2: Run browser verification**

Serve the repository locally. Validate request composition and mocked success/error/timeout/cancel paths, JSON formatting, history/privacy, responsive layout at 1280px and 390px, keyboard focus, reduced motion, and console output.

**Step 3: Commit only app 054 changes**

Create focused commits on `codex/app-054-api-tester`; do not stage unrelated files.

**Step 4: Push GitHub only**

Refresh `origin/main`, integrate safely without overwriting concurrent work, push only to GitHub `origin`, and verify the remote commit hash before stopping the timer.
