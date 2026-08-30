# CHANNEL/80 Video Site Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable static video site with a curated playlist, local-file fallback, timed danmaku, persisted progress, and responsive browser verification.

**Architecture:** Keep deterministic validation and playback state rules in a zero-dependency UMD module so Node tests and the browser share the same behavior. The page controller owns DOM/media APIs, object URL lifecycle, localStorage, danmaku rendering, and accessible feedback. Static HTML/CSS provide the projection-room layout and require no build step.

**Tech Stack:** Semantic HTML, native CSS, browser Media API, File/Object URL API, localStorage, UMD JavaScript, `node:test`.

---

### Task 1: Specify the playback core with failing tests

**Files:**
- Create: `apps/080-video-site/video-core.test.js`
- Create: `apps/080-video-site/video-core.js`

**Step 1:** Test control-character stripping and the 60-character danmaku limit.

**Step 2:** Test stable bullet normalization, per-video filtering, time-window selection, lane allocation, progress clamping, time formatting, and next-video rules.

**Step 3:** Run `node --test apps/080-video-site/video-core.test.js`; expect the initial missing-module failure.

**Step 4:** Implement only the exported pure functions needed by those tests, with safe defaults for malformed input.

**Step 5:** Re-run the test; expect all assertions to pass.

### Task 2: Build the semantic player shell and visual system

**Files:**
- Create: `apps/080-video-site/index.html`
- Create: `apps/080-video-site/styles.css`

**Step 1:** Add landmarks, skip link, labelled player, signal rail, media controls, danmaku form, playlist, local-file picker, empty/error status, and a short privacy note.

**Step 2:** Implement the six-color token system and asymmetric projection-room layout from the design document.

**Step 3:** Add 390px mobile layout, visible focus, high-contrast control states, and reduced-motion behavior.

**Step 4:** Verify IDs referenced by the controller exist and interactive elements have names.

### Task 3: Connect video, playlist, persistence, and danmaku

**Files:**
- Create: `apps/080-video-site/app.js`

**Step 1:** Define three curated CC0/sample video records and render the playlist without injecting HTML from user input.

**Step 2:** Implement source switching, resume progress, play/pause, seek, volume/mute, speed, full screen, and optional auto-next.

**Step 3:** Implement local `video/*` selection with object URL cleanup and no binary persistence.

**Step 4:** Persist validated settings, remote-video progress, selected video, and normalized danmaku under versioned keys.

**Step 5:** Render each due danmaku once per seek epoch across six lanes; reset the epoch on seek/source switch and respect the visibility toggle.

**Step 6:** Expose clear load errors, storage recovery, submission feedback, and a clear-current-video action.

### Task 4: Document and automatically verify the app

**Files:**
- Create: `apps/080-video-site/README.md`
- Create: `apps/080-video-site/qa/browser-smoke.mjs`

**Step 1:** Document features, static serving, remote-source boundary, local-file privacy, keyboard behavior, and exact checks.

**Step 2:** Add browser assertions for initial render, source switching, danmaku submission, visibility toggle, persistence, keyboard focus, runtime errors, and 1440/390 layouts.

**Step 3:** Run:

```powershell
node --test apps/080-video-site/video-core.test.js
node --check apps/080-video-site/video-core.js
node --check apps/080-video-site/app.js
node apps/080-video-site/qa/browser-smoke.mjs
```

Expected: every command exits 0, screenshots contain the player and playlist without horizontal overflow.

### Task 5: Publish the project, then synchronize the tracker

**Files:**
- Modify after project push: `index.html`
- Modify after project push: `qa/tracker.test.js`

**Step 1:** Commit only the #080 app and its two plan documents.

**Step 2:** Fetch/rebase the latest `origin/main`, run the app checks again, then push the project commit to GitHub `origin/main`.

**Step 3:** Fetch/rebase latest `origin/main` again so concurrently published #073–#079 tracker entries are preserved.

**Step 4:** Change IDEAS #080 to `CHANNEL/80` with the GitHub Pages URL and add `80:"done"` to `INIT_DONE`; extend tracker tests for name, description prefix, link, sequence, and completion.

**Step 5:** Run `node --test qa/tracker.test.js apps/080-video-site/video-core.test.js` and the browser smoke test.

**Step 6:** Commit the tracker change and push only to GitHub `origin/main`; verify local HEAD, `origin/main`, and the public URL source agree.
