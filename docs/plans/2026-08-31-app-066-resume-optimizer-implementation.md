# App 066 Resume Optimizer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a privacy-first resume evidence editor that gives useful local diagnostics without a key and optional OpenAI-compatible bullet rewrites with a user-provided key.

**Architecture:** A dependency-free UMD core owns deterministic parsing, keyword matching, evidence diagnostics, scoring, endpoint validation, and AI request construction. A static HTML/CSS/JavaScript shell owns file input, accessible rendering, in-memory API settings, copy/download actions, and browser-only network calls.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node.js `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the resume analysis contract with TDD

**Files:**
- Create: `apps/066-resume-optimizer/resume-core.test.js`
- Create: `apps/066-resume-optimizer/resume-core.js`

1. Write failing tests for `normalizeText`, `extractKeywords`, `splitResume`, `analyzeBullet`, `analyzeResume`, `validateEndpoint`, and `buildAiRequest`.
2. Run `node --test apps/066-resume-optimizer/resume-core.test.js`; expect failure before the module exists.
3. Implement conservative, immutable pure functions with Chinese and English text support.
4. Run the same test command; expect all tests to pass.
5. Commit the design, plan, tests, and core module.

### Task 2: Build the proofing-desk interface

**Files:**
- Create: `apps/066-resume-optimizer/index.html`
- Create: `apps/066-resume-optimizer/styles.css`

1. Add the PROOF/66 masthead, privacy note, resume/job inputs, file/sample controls, analysis action, score rail, keyword ledger, evidence rows, rewrite inspector, API settings dialog, toast, and live region.
2. Implement the blueprint-proof color tokens, evidence-margin signature, desktop split layout, 390px stacked layout, visible focus, 44px controls, and reduced-motion overrides.
3. Run markup/source assertions and serve the page locally to confirm assets load.

### Task 3: Wire local analysis and optional AI rewriting

**Files:**
- Create: `apps/066-resume-optimizer/app.js`
- Modify: `apps/066-resume-optimizer/index.html`

1. Load the sample, import UTF-8 text, enforce size limits, and render deterministic local results.
2. Add keyword filters, evidence selection, local rewrite templates, copy actions, and a text report download.
3. Keep API key and endpoint in memory only; validate the endpoint and send only the selected evidence context.
4. Handle loading, abort, HTTP errors, malformed responses, and empty results without losing local analysis.
5. Run `node --check` on both scripts and rerun core tests.

### Task 4: Document and publish the tracker entry

**Files:**
- Create: `apps/066-resume-optimizer/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Document scope, privacy, AI configuration, local operation, limitations, and verification commands.
2. Change App 066 to `PROOF/66：本地岗位匹配+成果证据诊断+可选 AI 逐条改写` and add `https://jokerlixing.github.io/100apps/apps/066-resume-optimizer/`.
3. Add 66 to `INIT_DONE` while preserving other official entries and update the tracker regression test to assert App 066.
4. Run `node --test qa/tracker.test.js`.

### Task 5: Browser and visual verification

**Files:**
- Create: `apps/066-resume-optimizer/qa/browser-smoke.mjs`
- Create: `apps/066-resume-optimizer/assets/screenshot.png`

1. Start a local static server and use Chrome/Edge CDP to open the app at 1440×1000 and 390×844.
2. Assert sample analysis, scores, keyword and evidence rows, selection, settings dialog, report download wiring, no horizontal overflow, no runtime errors, and absence of persisted API secrets.
3. Capture desktop and mobile screenshots; inspect them and copy the representative mobile image to `assets/screenshot.png`.
4. Run the full unit, syntax, tracker, and browser smoke suite.

### Task 6: Integrate and synchronize

**Files:** all App 066, plan, tracker, and QA files only.

1. Review `git diff --check`, `git status`, and the final diff for unrelated changes.
2. Commit the completed application on `codex/app-066-resume-optimizer`.
3. Fetch and rebase onto the latest `origin/main`, rerun affected tests, then push only to GitHub `origin` with `HEAD:main`.
4. Record finish time after remote verification and report the auditable elapsed duration.
