# TIDE/71 Emotion Diary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a private local-first emotion diary with explainable time-range trends, safe data backup, and an explicitly opted-in server-side AI reflection mode.

**Architecture:** Keep record validation, range filtering, aggregate calculations, factor patterns, local observations, import checks, AI payload construction, and AI-output validation in a dependency-free UMD core shared by Node tests, the browser, and the HTTP server. Use semantic HTML, handcrafted CSS and vanilla JavaScript for the GitHub Pages application, plus a dependency-free Node proxy for optional OpenAI-compatible insights.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, SVG, localStorage, Node.js built-in HTTP/Fetch APIs, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the emotion domain with TDD

**Files:**
- Create: `apps/071-emotion-diary/emotion-core.test.js`
- Create: `apps/071-emotion-diary/emotion-core.js`

**Step 1: Write failing unit tests**

Test `normalizeEntry`, `normalizeEntries`, `filterEntriesByRange`, `summarizeEntries`, `calculateFactorPatterns`, `buildLocalInsights`, `buildAIPayload`, `sanitizeAIInsights`, and `importBackup`. Cover invalid dates, future dates, bounded text and arrays, stable newest-first sorting, duplicate IDs, 7/14/30-day boundaries, empty ranges, average and variability calculations, minimum factor samples, correlation wording, excerpt opt-in, prototype-shaped input, HTML removal and malformed provider data.

**Step 2: Run the red test**

Run: `node --test apps/071-emotion-diary/emotion-core.test.js`
Expected: FAIL because `emotion-core.js` does not exist.

**Step 3: Implement the UMD domain module**

Normalize mood and energy to integers from 1–5, allow at most five known emotion words and five bounded factors, store ISO dates, cap notes at 2000 characters and history at 365 entries, and expose immutable helpers through CommonJS and `window.EmotionCore`. Return sample counts with every aggregate; show factor patterns only at three or more samples; never infer diagnoses, causes or risk scores. Build minimal AI payloads with note excerpts excluded by default and sanitize output to bounded observations, questions and actions.

**Step 4: Run green and syntax checks**

Run: `node --test apps/071-emotion-diary/emotion-core.test.js`
Run: `node --check apps/071-emotion-diary/emotion-core.js`
Expected: all tests PASS and syntax check exits 0.

### Task 2: Build the TIDE/71 observation desk

**Files:**
- Create: `apps/071-emotion-diary/index.html`
- Create: `apps/071-emotion-diary/styles.css`

**Step 1: Add semantic application structure**

Create one `h1`, a skip link, the check-in form, mood and energy controls, emotion-word and factor pickers, note editor, local-storage disclosure, range tabs, text metrics, accessible tide chart, local observations, AI disclosure/confirmation dialog, record ledger, edit dialog, delete confirmation, backup/import controls, clear-data confirmation and live region. Do not use inline handlers.

**Step 2: Implement the distinctive visual system**

Use the six documented coastal-observation tokens, a compact observation form, graph-paper tide panel, data-bearing tide nodes, ledger binding, visible focus, 44px controls, 390px responsive layout and reduced-motion overrides. Avoid generic gradients, glass cards, decorative pills and unsupported wellness scores.

**Step 3: Run structural checks**

Assert one `h1`, labelled form controls, dialog labels, required IDs, no inline `onclick`, and script order `emotion-core.js` before `app.js`.

### Task 3: Connect local state, trends and backup

**Files:**
- Create: `apps/071-emotion-diary/app.js`
- Modify: `apps/071-emotion-diary/index.html`

**Step 1: Implement record lifecycle**

Load only normalized entries from `tide71.entries.v1`; create, edit and delete records; enforce the 365-entry cap; update form status; render newest-first entries with accessible edit and delete actions; and never persist draft notes, AI choices or dialogs.

**Step 2: Render local trend evidence**

Support 7-, 14- and 30-day ranges; render averages, recording frequency, variability and strongest valid factor pattern; build an accessible SVG tide line whose node position, size, color, label and focus target all come from real records; keep a text summary for empty and non-visual use.

**Step 3: Add backup and recovery**

Export a versioned JSON file, validate imported backups through the core, require confirmation before merging or replacing data, report rejected records, and provide a separate destructive clear-data confirmation.

**Step 4: Verify local integration**

Run: `node --check apps/071-emotion-diary/app.js`
Run: `node --test apps/071-emotion-diary/emotion-core.test.js`
Expected: exit 0 and all tests PASS.

### Task 4: Add secure opt-in AI reflection

**Files:**
- Create: `apps/071-emotion-diary/server.js`
- Create: `apps/071-emotion-diary/server.test.js`
- Modify: `apps/071-emotion-diary/app.js`

**Step 1: Write failing server tests**

Start the exported server on an ephemeral port. Assert `GET /` serves only public assets; `POST /api/insights` rejects non-JSON, oversized or invalid bodies; returns 503 without credentials; sends bounded normalized input to a stubbed provider; returns sanitized output; and hides upstream failure details.

**Step 2: Run the red test**

Run: `node --test apps/071-emotion-diary/server.test.js`
Expected: FAIL because `server.js` does not exist.

**Step 3: Implement server and consent flow**

Export `createEmotionServer`, `buildMessages`, and `requestAIInsights`. Read `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`; limit bodies to 48 KiB, records to 30, note excerpts to 240 characters each and upstream time; validate both sides through the core. In the browser, preview exactly what will be sent, default excerpts off, request only after confirmation, retain local results on every failure and never persist the AI response.

**Step 4: Run server and static checks**

Run: `node --test apps/071-emotion-diary/emotion-core.test.js apps/071-emotion-diary/server.test.js`
Run: `node --check apps/071-emotion-diary/server.js`
Run: `node --check apps/071-emotion-diary/app.js`
Expected: all tests PASS and syntax checks exit 0.

### Task 5: Document, integrate and verify in a browser

**Files:**
- Create: `apps/071-emotion-diary/README.md`
- Create: `apps/071-emotion-diary/qa/browser-smoke.mjs`
- Create: `apps/071-emotion-diary/assets/screenshot-desktop.png`
- Create: `apps/071-emotion-diary/assets/screenshot-mobile.png`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest operating modes**

Explain local storage, entry schema, trend limitations, optional AI variables, exact upload fields, backup/import, data deletion, accessibility, local commands, tests and GitHub Pages URL. Include the verified desktop screenshot.

**Step 2: Integrate challenge metadata**

Replace idea 71 with `TIDE/71：本地情绪潮汐+可解释趋势+自选 AI 反思` and the published path, add 71 to `INIT_DONE` without marking 68–70 complete, and extend tracker tests without changing prior completion state.

**Step 3: Add browser smoke coverage**

Use a temporary Edge/Chrome profile and CDP to verify first-run empty state, saving records, 7/14/30-day changes, editing, deleting, export, invalid import, AI consent preview, forced local failure, data persistence, keyboard focus, 1440px and 390px layouts, no horizontal overflow and no runtime errors. Save desktop and mobile screenshots under `apps/071-emotion-diary/assets/`.

**Step 4: Run full verification**

Run: `node --test apps/071-emotion-diary/emotion-core.test.js apps/071-emotion-diary/server.test.js qa/tracker.test.js`
Run: `node --check apps/071-emotion-diary/emotion-core.js`
Run: `node --check apps/071-emotion-diary/app.js`
Run: `node --check apps/071-emotion-diary/server.js`
Run: `node apps/071-emotion-diary/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS, screenshots exist, no runtime errors, and diff check is clean.

### Task 6: Commit and synchronize GitHub only

**Files:**
- Verify every file listed above.

**Step 1: Inspect the complete branch diff**

Run: `git status --short`, `git diff --stat main...HEAD`, and `git diff --check`.

**Step 2: Create focused commits**

Commit design/plan, core tests/implementation, interface/server, and docs/tracker/QA in auditable groups on `codex/app-071-emotion-diary`.

**Step 3: Push only to GitHub**

Run: `git push -u origin codex/app-071-emotion-diary`
Expected: GitHub `origin` accepts the branch. Do not push to Gitee or any other remote.

**Step 4: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-071-emotion-diary`, rerun `git status --short --branch`, record the finish timestamp, and report elapsed duration from the first implementation command through verification and GitHub synchronization.
