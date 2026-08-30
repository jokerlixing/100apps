# MARGIN/63 AI Writer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable AI writing workbench for polishing, expanding, translating, and restyling text with safe BYOK streaming plus an honest local demo mode.

**Architecture:** A dependency-free static application keeps deterministic prompt, stream, diff, and demo logic in a testable UMD core. The browser controller owns ephemeral credentials, fetch streaming, local history, rendering, exports, and accessibility. GitHub Pages hosts the application; real AI requests go only to the endpoint explicitly configured by the user.

**Tech Stack:** Semantic HTML, native CSS, native JavaScript, Fetch/Streams APIs, localStorage, Node.js `node:test`, Chrome DevTools Protocol.

---

### Task 1: Build and test the deterministic writing core

**Files:**
- Create: `apps/063-ai-writer/writer-core.test.js`
- Create: `apps/063-ai-writer/writer-core.js`

**Step 1: Write the failing tests**

Cover mixed Chinese/Latin text metrics, each rewrite mode's prompt, missing endpoint/model validation, fragmented SSE records, response-shape extraction, deterministic demo output, and diff additions/deletions.

**Step 2: Run the tests to verify they fail**

Run: `node --test apps/063-ai-writer/writer-core.test.js`

Expected: FAIL because `writer-core.js` does not exist.

**Step 3: Implement the minimal core**

Expose pure functions through both `module.exports` and `window.WriterCore`. Keep the diff algorithm bounded, normalize untrusted inputs, and return data instead of HTML.

**Step 4: Run the tests to verify they pass**

Run: `node --test apps/063-ai-writer/writer-core.test.js`

Expected: all core tests PASS.

**Step 5: Commit**

```powershell
git add apps/063-ai-writer/writer-core.js apps/063-ai-writer/writer-core.test.js
git commit -m "test: add app 063 writing core"
```

### Task 2: Implement the manuscript workbench

**Files:**
- Create: `apps/063-ai-writer/index.html`
- Create: `apps/063-ai-writer/styles.css`
- Create: `apps/063-ai-writer/app.js`

**Step 1: Create semantic structure**

Add the mode rail, source editor, constraints, revision output, status region, actions, provider dialog, history dialog, and privacy copy. Use native controls and no third-party scripts.

**Step 2: Apply the MARGIN visual system**

Implement the cold surgical-paper palette, intentional three-font hierarchy, revision seam, responsive single-column mobile layout, keyboard focus, and reduced-motion behavior.

**Step 3: Wire local demo and real streaming**

Build prompts with the core, run demo generation when selected, POST OpenAI-compatible requests when configured, parse SSE incrementally, support abort, and render escaped diff segments.

**Step 4: Add persistence and output actions**

Persist only endpoint/model preferences and eight non-sensitive history items. Keep API keys in memory. Add copy, TXT export, use-as-source, example loading, restore, and clear history.

**Step 5: Verify syntax**

Run: `node --check apps/063-ai-writer/writer-core.js; node --check apps/063-ai-writer/app.js`

Expected: both commands exit 0.

**Step 6: Commit**

```powershell
git add apps/063-ai-writer/index.html apps/063-ai-writer/styles.css apps/063-ai-writer/app.js
git commit -m "feat: build app 063 ai writing workbench"
```

### Task 3: Document and register the application

**Files:**
- Create: `apps/063-ai-writer/README.md`
- Create after browser verification: `apps/063-ai-writer/assets/screenshot.png`
- Modify: `index.html`

**Step 1: Write the project README**

Document features, AI boundary, ephemeral-key behavior, local run commands, test commands, technology choices, and screenshot.

**Step 2: Replace idea 63 in the tracker**

Change the `AI写作助手` entry to the MARGIN/63 description, level, and GitHub Pages URL. Add index 62 to `INIT_DONE` without changing unrelated tracker data.

**Step 3: Run tracker tests**

Run: `node --test qa/tracker.test.js`

Expected: tracker invariants PASS and completed count becomes 62/100.

**Step 4: Commit**

```powershell
git add apps/063-ai-writer/README.md apps/063-ai-writer/assets/screenshot.png index.html docs/plans/2026-08-31-app-063-ai-writer-*.md
git commit -m "docs: register app 063 ai writer"
```

### Task 4: Run browser and final verification

**Files:**
- Create: `apps/063-ai-writer/qa/browser-smoke.mjs`

**Step 1: Implement CDP browser smoke coverage**

Start local Chrome/Edge with a temporary profile. Verify initial demo state, all mode controls, generation result, diff, history, settings key non-persistence, desktop and mobile geometry, focusable controls, and zero runtime errors.

**Step 2: Run the application locally**

Run: `python -m http.server 4173 --bind 127.0.0.1`

**Step 3: Run the smoke test and capture screenshots**

Run: `node apps/063-ai-writer/qa/browser-smoke.mjs http://127.0.0.1:4173/apps/063-ai-writer/ apps/063-ai-writer/assets`

Expected: desktop and 390px mobile assertions PASS; `screenshot.png` is created.

**Step 4: Run the full regression set**

Run: `node --test apps/063-ai-writer/writer-core.test.js qa/tracker.test.js; node --check apps/063-ai-writer/writer-core.js; node --check apps/063-ai-writer/app.js; git diff --check origin/main...HEAD`

Expected: all tests and checks PASS.

**Step 5: Commit**

```powershell
git add apps/063-ai-writer/qa/browser-smoke.mjs apps/063-ai-writer/assets/screenshot.png apps/063-ai-writer/README.md
git commit -m "test: verify app 063 browser flows"
```

### Task 5: Synchronize only to GitHub

**Files:** None.

**Step 1: Rebase on the latest GitHub main**

Run: `git fetch origin; git rebase origin/main`

Expected: clean rebase, preserving concurrent app tracker entries.

**Step 2: Re-run focused regression checks**

Run the Task 4 regression set again after rebase.

**Step 3: Push only to GitHub**

Run: `git push origin HEAD:main`

Expected: GitHub `origin/main` advances. Do not push Gitee.

**Step 4: Verify remote and deployment**

Compare local `HEAD`, `origin/main`, and `git ls-remote origin refs/heads/main`; then request the GitHub Pages URL and require HTTP 200 before completion reporting.
