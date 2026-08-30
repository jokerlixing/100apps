# FITROOM/92 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first resume application assistant that turns one master profile into multiple traceable job-specific resume versions.

**Architecture:** A dependency-free static app separates deterministic domain logic in `resume-core.js` from DOM/state orchestration in `app.js`. The browser stores one versioned document in `localStorage`; generated versions snapshot selected master data and keyword coverage so old applications do not mutate unexpectedly.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node built-in test runner, Chrome DevTools Protocol browser smoke test.

---

### Task 1: Define and test the resume domain

**Files:**
- Create: `apps/092-resume-application-assistant/resume-core.test.js`
- Create: `apps/092-resume-application-assistant/resume-core.js`

**Step 1: Write failing tests**

Cover `normalizeProfile`, `extractKeywords`, `scoreProfile`, `generateVersion`, `recutVersion`, `resumeToText`, `exportWorkspace`, and `importWorkspace`. Assertions must include empty inputs, duplicates, deterministic IDs/timestamps, snapshot behavior, and malformed backups.

**Step 2: Run tests to verify the red state**

Run: `node --test apps/092-resume-application-assistant/resume-core.test.js`

Expected: FAIL because `resume-core.js` does not exist or its exports are missing.

**Step 3: Implement the domain module**

Expose a browser/CommonJS UMD object. Normalize all strings and arrays through allowlisted fields, tokenize Chinese and Latin job text without external services, score explicit coverage, and never synthesize achievements that are absent from the profile.

**Step 4: Run tests to verify green**

Run: `node --test apps/092-resume-application-assistant/resume-core.test.js`

Expected: all tests PASS.

### Task 2: Build the FITROOM workspace

**Files:**
- Create: `apps/092-resume-application-assistant/index.html`
- Create: `apps/092-resume-application-assistant/styles.css`
- Create: `apps/092-resume-application-assistant/app.js`

**Step 1: Build semantic workspace markup**

Create one `h1`, labelled forms, live status regions, version navigation, the fit-ruler visualization, a real resume preview, native dialogs, and actions whose labels exactly match their result messages.

**Step 2: Implement browser state and rendering**

Load the normalized seed workspace, save on meaningful edits, render user text with DOM text APIs, generate/switch/recut/delete versions, update status, copy text, download JSON, import backup, reset the demo, and expose a minimal `window.__FITROOM92__` testing surface.

**Step 3: Apply the approved visual system**

Use the named six-color token set and tailored-workroom structure from the design document. Support desktop, tablet, 390px mobile, visible keyboard focus, minimum 44px touch targets, reduced motion, and an isolated print stylesheet that prints only the active resume.

**Step 4: Check syntax**

Run:

```powershell
node --check apps/092-resume-application-assistant/resume-core.js
node --check apps/092-resume-application-assistant/app.js
```

Expected: both commands exit 0.

### Task 3: Verify real browser flows

**Files:**
- Create: `apps/092-resume-application-assistant/qa/browser-smoke.mjs`
- Create: `apps/092-resume-application-assistant/assets/screenshot-desktop.png`
- Create: `apps/092-resume-application-assistant/assets/screenshot-mobile.png`

**Step 1: Add a zero-install browser smoke harness**

Start a temporary local static server and a headless installed Chrome/Edge instance through CDP. Use a unique storage key and temporary browser profile.

**Step 2: Exercise the product**

Edit the target company, role, and JD; generate a version; assert coverage and selected content; rename it; change application status; refresh to prove persistence; test an invalid generation; and check clipboard fallback state.

**Step 3: Inspect responsive and accessible behavior**

At 1440×1000 and 390×844, assert there is no horizontal overflow, visible controls remain inside the viewport, touch targets are at least 44px, the focused field has a visible outline, and no console/runtime errors occurred. Capture both screenshots.

**Step 4: Run the browser smoke test**

Run: `node apps/092-resume-application-assistant/qa/browser-smoke.mjs`

Expected: JSON evidence and two screenshot files.

### Task 4: Document and publish app 092 in the tracker

**Files:**
- Create: `apps/092-resume-application-assistant/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document operation and limits**

Describe the public URL, local static-server command, feature set, privacy boundary, keyboard behavior, test commands, and what the deterministic matching score does not claim.

**Step 2: Refresh the tracker baseline**

Fetch `origin`, verify whether `index.html` changed upstream, and merge the latest state before editing if required. Preserve every unrelated project entry and status.

**Step 3: Register the final app**

Set idea 92 to `简历投递助手`, a final `FITROOM/92` description, and `https://jokerlixing.github.io/100apps/apps/092-resume-application-assistant/`. Add `92:"done"` to the official completion state.

**Step 4: Add and run tracker tests**

Add a focused assertion for number 92, final title, description, URL, and official state.

Run: `node --test qa/tracker.test.js`

Expected: all tracker tests PASS.

### Task 5: Final verification and GitHub synchronization

**Files:** All app 092 files, its two plan documents, `index.html`, and `qa/tracker.test.js` only.

**Step 1: Run the full scoped suite**

Run unit tests, syntax checks, browser smoke, tracker tests, and `git diff --check`.

**Step 2: Review visual evidence**

Open both screenshots, critique them against the design document, fix any issue, and rerun the smoke test if changed.

**Step 3: Stage safely**

Stage only the exact app 092, plan, tracker, and tracker-test paths. Verify `git diff --cached --name-status` contains no parallel app 073/083 work.

**Step 4: Commit and push GitHub only**

Commit with `feat: build app 092 resume application assistant`, fetch and integrate any new `origin/main` state without losing parallel tracker updates, then push `main` to `origin`. Do not push `gitee`.

**Step 5: Verify deployment readiness**

Confirm `origin/main` contains the commit and the published URL resolves once GitHub Pages updates. Report the exact start time, finish time, elapsed duration, commit, tests, and GitHub-only push status.

