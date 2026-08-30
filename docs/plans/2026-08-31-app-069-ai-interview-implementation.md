# PANEL/69 AI Interview Simulator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive Chinese interview-practice application that creates a complete local interview, evaluates each answer with explainable evidence, and optionally enhances questions and coaching through a secure server proxy.

**Architecture:** Keep configuration normalization, deterministic question planning, answer scoring, follow-up generation, session summaries, and AI-output validation in a dependency-free UMD core shared by Node tests, the browser, and the HTTP server. Render the workflow with semantic HTML, handcrafted CSS, and vanilla JavaScript; use a dependency-free Node server for static hosting and an opt-in OpenAI-compatible coaching proxy that never exposes credentials.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Node.js built-in HTTP/Fetch APIs, localStorage, Clipboard API, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the interview domain with TDD

**Files:**
- Create: `apps/069-ai-interview/interview-core.test.js`
- Create: `apps/069-ai-interview/interview-core.js`

**Step 1: Write failing tests**

Test `normalizeConfig`, `buildQuestionPlan`, `scoreAnswer`, `buildFollowUp`, `summarizeSession`, `sanitizeAIQuestions`, and `sanitizeAIEvaluation`. Assertions cover invalid role/level/type values, deterministic and category-balanced plans, relevance keywords, STAR structure, quantified evidence, short answers, skipped answers, session dimension averages, HTML removal, array limits, and malformed provider data.

**Step 2: Run the red test**

Run: `node --test apps/069-ai-interview/interview-core.test.js`
Expected: FAIL because `interview-core.js` does not exist.

**Step 3: Implement the domain module**

Export immutable helpers through CommonJS and `window.InterviewCore`. Normalize bounded text and configuration; choose 3–8 questions with intro, behavioral, role-specific and scenario coverage; compute a 0–100 score from relevance, structure, evidence and depth; generate strengths, improvements, a safe answer outline and one targeted follow-up. Summarize completed answers without inventing employability probabilities. Accept AI content only after stripping markup, bounding arrays and numbers, and requiring the expected schema.

**Step 4: Run green and syntax checks**

Run: `node --test apps/069-ai-interview/interview-core.test.js`
Run: `node --check apps/069-ai-interview/interview-core.js`
Expected: all tests PASS and both commands exit 0.

### Task 2: Build the PANEL/69 interview room

**Files:**
- Create: `apps/069-ai-interview/index.html`
- Create: `apps/069-ai-interview/styles.css`

**Step 1: Add semantic workflow structure**

Create one `h1`, a skip link, preparation form, privacy disclosure, interview stage, progress and timer, answer editor, one-time prompt control, coach rail, live region, review stage, per-question transcript, history dialog, reset confirmation and useful loading/error/empty states. Do not use inline handlers.

**Step 2: Implement the visual system**

Use the six documented control-room tokens, a restrained session status beam, interview registration form, answer tape segments carrying real duration and scores, one tape-transfer animation, visible focus, 44px targets, 390px responsive layout, and reduced-motion overrides.

**Step 3: Run structural assertions**

Read `index.html` and assert one `h1`, labelled controls, required IDs, no inline `onclick`, and script order `interview-core.js` before `app.js`.

### Task 3: Connect local interview state and persistence

**Files:**
- Create: `apps/069-ai-interview/app.js`
- Modify: `apps/069-ai-interview/index.html`

**Step 1: Add the local question catalog and state machine**

Define at least 36 Chinese questions across six roles and four categories. Maintain explicit `setup`, `interview`, `feedback`, and `review` stages with current question, elapsed time, answers, follow-ups and source labels.

**Step 2: Implement the complete local flow**

Validate setup, build the plan, start and restore timers, reveal one bounded hint, submit or skip answers, show explainable score feedback, accept one follow-up response, advance questions, finish early with confirmation, and render a final summary plus per-question evidence.

**Step 3: Add history and export**

Persist only validated in-progress state and the latest three summaries in `panel69.state.v1`; provide resume, discard and clear-history controls. Copy a plain-text report that includes configuration, scores, strengths and next actions without hidden metadata.

**Step 4: Verify syntax and core integration**

Run: `node --check apps/069-ai-interview/app.js`
Run: `node --test apps/069-ai-interview/interview-core.test.js`
Expected: exit 0 and all tests PASS.

### Task 4: Add secure opt-in AI coaching

**Files:**
- Create: `apps/069-ai-interview/server.js`
- Create: `apps/069-ai-interview/server.test.js`
- Modify: `apps/069-ai-interview/app.js`

**Step 1: Write failing server tests**

Start the exported server on an ephemeral port. Assert `GET /` serves only public assets; `POST /api/coach` rejects non-JSON, unknown actions and oversized bodies; returns 503 without credentials; returns sanitized plans and evaluations with a stubbed provider; and hides upstream failure details.

**Step 2: Run the red test**

Run: `node --test apps/069-ai-interview/server.test.js`
Expected: FAIL because `server.js` does not exist.

**Step 3: Implement server and browser enhancement**

Export `createInterviewServer`, `buildMessages`, and `requestAICoaching`. Read `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`; limit bodies to 32 KiB and answers to 6000 characters; add an upstream timeout; validate provider output through the core module; and return stable JSON errors. In the browser, send data only when the user checks the explicit enhancement option, retain local results immediately, and replace only safe question or coaching copy.

**Step 4: Run server and static checks**

Run: `node --test apps/069-ai-interview/interview-core.test.js apps/069-ai-interview/server.test.js`
Run: `node --check apps/069-ai-interview/server.js`
Run: `node --check apps/069-ai-interview/app.js`
Expected: all tests PASS and syntax checks exit 0.

### Task 5: Document, integrate, and verify in a browser

**Files:**
- Create: `apps/069-ai-interview/README.md`
- Create: `apps/069-ai-interview/qa/browser-smoke.mjs`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest operating modes**

Explain the local question and scoring path, opt-in AI server variables, privacy boundaries, scoring limitations, localStorage, keyboard use, test commands, and GitHub Pages URL.

**Step 2: Integrate challenge metadata**

Replace idea 69 with the `PANEL/69` description and published path, add 69 to `INIT_DONE` without marking 68 complete, and extend tracker tests without changing completion state 1–67.

**Step 3: Add and run browser smoke coverage**

Use a temporary Chrome/Edge profile and CDP to verify setup, a scored answer, a skipped answer, final review, report copy fallback, persisted history, forced local mode, 1440px and 390px layouts, no horizontal overflow, visible focus, and no runtime errors. Save desktop and mobile screenshots under `apps/069-ai-interview/assets/`.

**Step 4: Run full verification**

Run: `node --test apps/069-ai-interview/interview-core.test.js apps/069-ai-interview/server.test.js qa/tracker.test.js`
Run: `node --check apps/069-ai-interview/interview-core.js`
Run: `node --check apps/069-ai-interview/app.js`
Run: `node --check apps/069-ai-interview/server.js`
Run: `node apps/069-ai-interview/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS, screenshots exist, no runtime errors, and diff check is clean.

### Task 6: Commit and synchronize GitHub only

**Files:**
- Verify every file listed above.

**Step 1: Inspect the branch diff**

Run: `git status --short`, `git diff --stat origin/main...HEAD`, and `git diff --check`.

**Step 2: Create focused commits**

Commit design/plan, core tests/implementation, interface/server, and docs/tracker/QA in auditable groups on `codex/app-069-ai-interview`.

**Step 3: Push only to GitHub**

Run: `git push -u origin codex/app-069-ai-interview`
Expected: GitHub `origin` accepts the branch. Do not push to Gitee or any other remote.

**Step 4: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-069-ai-interview`, rerun `git status --short --branch`, record the finish timestamp, and report the elapsed duration from the first implementation command through verification and GitHub synchronization.
