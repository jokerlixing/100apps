# TALKBACK/70 AI Speaking Coach Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive English speaking-practice app with honest local coaching, browser speech input/output, optional in-memory BYOK AI enhancement, and an exportable session report.

**Architecture:** Keep scoring, scenario progression, persistence cleaning, report aggregation, and AI payload validation in a dependency-free UMD core shared by Node tests and the browser. Use semantic HTML, handcrafted CSS, and a vanilla JavaScript controller for Web Speech APIs, localStorage, Fetch, and rendering; local scripted practice remains fully usable when speech or AI services are unavailable.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Web Speech API, Fetch/AbortController, localStorage, Clipboard/Blob APIs, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the coaching domain with TDD

**Files:**
- Create: `apps/070-ai-speaking-coach/coach-core.test.js`
- Create: `apps/070-ai-speaking-coach/coach-core.js`

**Step 1: Write failing core tests**

Test `cleanText`, `tokenizeEnglish`, `countFillers`, `calculateWordsPerMinute`, `calculateLexicalDiversity`, `calculatePhraseCoverage`, `analyzeTurn`, `advanceLocalScenario`, `normalizeEndpoint`, `buildAIRequest`, `sanitizeAIReply`, `sanitizeSession`, and `summarizeSession`. Cover punctuation, contractions, empty input, duration limits, repeated fillers, partial target phrases, stable scenario endings, unsafe endpoints, markup/oversized AI fields, invalid persisted turns, and aggregate goals.

**Step 2: Run the red test**

Run: `node --test apps/070-ai-speaking-coach/coach-core.test.js`
Expected: FAIL because `coach-core.js` does not exist.

**Step 3: Implement the minimal domain module**

Export helpers through CommonJS and `window.CoachCore`. Cap text and arrays, keep scores deterministic, generate specific suggestions from measured values, and never label recognition confidence as pronunciation accuracy. Define six immutable scenarios with CEFR level, goal, five coach prompts, expected concepts, target phrases, model answers, and local follow-ups.

**Step 4: Run green and syntax checks**

Run: `node --test apps/070-ai-speaking-coach/coach-core.test.js`
Run: `node --check apps/070-ai-speaking-coach/coach-core.js`
Expected: all tests PASS and syntax check exits 0.

**Step 5: Commit the domain layer**

Run: `git add apps/070-ai-speaking-coach/coach-core.js apps/070-ai-speaking-coach/coach-core.test.js && git commit -m "test: add app 070 speaking coach core"`
Expected: one focused commit containing the tested domain layer.

### Task 2: Build the language-lab interface

**Files:**
- Create: `apps/070-ai-speaking-coach/index.html`
- Create: `apps/070-ai-speaking-coach/styles.css`

**Step 1: Add semantic structure**

Create one `h1`, a skip link, scenario radio group, level and auto-read controls, coach prompt, ordered conversation rail, recognition status, press-to-talk and typed-answer controls, live feedback region, report dialog, AI settings dialog, and explicit unsupported/permission/error states. Load `coach-core.js` before `app.js`; do not use inline event handlers.

**Step 2: Implement the visual system**

Use the six documented tokens, asymmetric language-lab console, punched lesson-card edges, one orange route indicator, visible focus, 44px targets, 390px responsive layout, high-contrast status text, and reduced-motion overrides. Avoid gradients, generic dashboard cards, waveform decoration, and ornamental numbering.

**Step 3: Run structural assertions**

Run a Node assertion over `index.html` checking one `h1`, required form labels and IDs, dialog headings, no inline `onclick`, and script order.
Expected: assertion exits 0.

### Task 3: Connect local speech practice and persistence

**Files:**
- Create: `apps/070-ai-speaking-coach/app.js`
- Modify: `apps/070-ai-speaking-coach/index.html`

**Step 1: Add state and scenario controls**

Initialize sanitized state from `talkback70.state.v1`; render six scenario cards, current prompt, progress and past turns; allow difficulty selection, scenario change, new session confirmation, typed input, an explicit demo answer, and completion after five turns.

**Step 2: Add speech recognition and synthesis**

Feature-detect `SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis`. Keep interim text separate from final text, calculate duration from the active attempt, stop cleanly, surface permission/service errors, speak only user-requested or auto-read prompts, and always retain the typed-input fallback.

**Step 3: Render feedback and reports**

Show WPM, filler count, target-expression coverage, vocabulary variety, transcript-confidence reference, one strength, and up to three next actions after every turn. Aggregate the final session, copy or download a TXT report, save only bounded summaries and final turns, and restore safely after refresh.

**Step 4: Verify syntax and core integration**

Run: `node --check apps/070-ai-speaking-coach/app.js`
Run: `node --test apps/070-ai-speaking-coach/coach-core.test.js`
Expected: exit 0 and all tests PASS.

### Task 4: Add optional in-memory AI enhancement

**Files:**
- Modify: `apps/070-ai-speaking-coach/app.js`
- Modify: `apps/070-ai-speaking-coach/index.html`
- Modify: `apps/070-ai-speaking-coach/README.md`

**Step 1: Implement temporary connection settings**

Collect HTTPS/localhost base URL, model and temporary key. Persist base URL and model only; hold the key in a module-scoped variable, clear it on refresh, never include it in reports, and show the browser-direct security/CORS warning next to the field.

**Step 2: Enhance one completed turn**

Build a bounded OpenAI-compatible `/chat/completions` request with the current scenario and recent turns. Use `AbortController`, stable Chinese error messages, and `sanitizeAIReply`; replace only the coach reply, rewrite and tips when the payload is valid, while retaining local metrics and the local next prompt on every failure.

**Step 3: Verify failure and secret boundaries**

Run unit tests for endpoint validation and AI cleaning, then inspect serialized localStorage and the exported report with a sentinel key.
Expected: the sentinel never appears and failed Fetch leaves a usable local next turn.

### Task 5: Document, integrate, and verify in a browser

**Files:**
- Create: `apps/070-ai-speaking-coach/README.md`
- Create: `apps/070-ai-speaking-coach/qa/browser-smoke.mjs`
- Create: `apps/070-ai-speaking-coach/assets/screenshot-desktop.png`
- Create: `apps/070-ai-speaking-coach/assets/screenshot-mobile.png`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest capabilities**

Explain microphone/browser support, typed and demo fallbacks, local scoring limits, AI direct-connect risk, temporary-key behavior, privacy, storage, report export, test commands, and the GitHub Pages URL.

**Step 2: Integrate challenge metadata**

Replace idea 70 with `TALKBACK/70：六类情景对练+浏览器语音+可信表达反馈+可选AI追问`, add its published path, add 70 to `INIT_DONE`, and extend tracker tests without marking 68 or 69 complete.

**Step 3: Add and run the browser smoke test**

Serve the repository with a temporary local HTTP server and drive Chrome/Edge through CDP. Verify demo answer, typed answer, five-turn completion, scenario change, feedback metrics, report dialog, refresh restoration, AI failure fallback, sentinel-key non-persistence, keyboard focus, 1440px and 390px layouts, no horizontal overflow, and no runtime errors. Save reviewed desktop and mobile screenshots under `assets/`.

**Step 4: Run full verification**

Run: `node --test apps/070-ai-speaking-coach/coach-core.test.js qa/tracker.test.js`
Run: `node --check apps/070-ai-speaking-coach/coach-core.js`
Run: `node --check apps/070-ai-speaking-coach/app.js`
Run: `node apps/070-ai-speaking-coach/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS, screenshots exist and have been visually reviewed, no runtime errors, no secret persistence, and diff check is clean.

### Task 6: Commit and synchronize GitHub only

**Files:**
- Verify every file listed above.

**Step 1: Inspect the exact branch diff**

Run: `git status --short`, `git diff --stat origin/main...HEAD`, and `git diff --check`.

**Step 2: Create focused commits**

Commit the design/plan, tested core, interface/controller, and docs/tracker/QA in auditable groups on `codex/app-070-ai-speaking-coach`.

**Step 3: Push only to GitHub**

Run: `git push -u origin codex/app-070-ai-speaking-coach`
Expected: GitHub `origin` accepts the branch. Do not push to Gitee or any other remote.

**Step 4: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-070-ai-speaking-coach`, rerun `git status --short --branch`, record the finish timestamp, and report the auditable elapsed duration from `2026-08-31 01:28:58.307 +08:00` through verification and GitHub synchronization.
