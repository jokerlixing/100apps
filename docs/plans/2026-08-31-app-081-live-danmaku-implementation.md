# App 081 Live Danmaku Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish WAVE/81, a self-contained simulated live room with multi-track danmaku, live chat, reactions, preferences, and cross-tab synchronization.

**Architecture:** Keep domain rules in a dependency-free UMD module that runs in both Node and the browser. Build the product as a static HTML/CSS/JavaScript site; the UI composes simulated local events with `BroadcastChannel` and a `storage` fallback, so GitHub Pages remains the only deployment requirement.

**Tech Stack:** Semantic HTML5, CSS3, vanilla JavaScript, Node.js built-in test runner, Playwright-compatible browser smoke script.

---

### Task 1: Define the danmaku domain

**Files:**
- Create: `apps/081-live-danmaku/danmaku-core.test.js`
- Create: `apps/081-live-danmaku/danmaku-core.js`

1. Write failing Node tests for `normalizeMessage`, `assignLane`, `normalizePreferences`, and `formatAudience`.
2. Run `node --test apps/081-live-danmaku/danmaku-core.test.js`; expect missing-module failure.
3. Implement a UMD module with deterministic pure functions and no DOM access.
4. Run the same command; expect all tests to pass.

### Task 2: Build the semantic live-room shell

**Files:**
- Create: `apps/081-live-danmaku/index.html`
- Create: `apps/081-live-danmaku/styles.css`
- Test: `apps/081-live-danmaku/ui.test.js`

1. Write a static contract test that requires the live region, stage, danmaku layer, chat feed, composer, signal controls, status copy, and accessible labels.
2. Run `node --test apps/081-live-danmaku/ui.test.js`; expect missing-markup failure.
3. Implement the HTML structure and the broadcast-console token system from the design document.
4. Run the UI contract test; expect it to pass.

### Task 3: Implement interaction and realtime simulation

**Files:**
- Create: `apps/081-live-danmaku/app.js`
- Modify: `apps/081-live-danmaku/index.html`
- Modify: `apps/081-live-danmaku/styles.css`
- Test: `apps/081-live-danmaku/ui.test.js`

1. Extend the static test with required hooks for send, mode/color selection, reactions, pause, mute, danmaku visibility, theater mode and settings.
2. Implement state initialization, preference persistence, ambient message scheduling, live counters, send validation and DOM rendering.
3. Add `BroadcastChannel` with a `storage` event fallback and loop prevention.
4. Implement keyboard shortcuts and reduced-motion behavior.
5. Run all App 081 Node tests; expect them to pass.

### Task 4: Add browser acceptance and documentation

**Files:**
- Create: `apps/081-live-danmaku/qa/browser-smoke.mjs`
- Create: `apps/081-live-danmaku/README.md`
- Create: `apps/081-live-danmaku/assets/screenshot-desktop.png`
- Create: `apps/081-live-danmaku/assets/screenshot-mobile.png`

1. Add a browser script that starts a local static server, checks console/page errors, exercises the main controls, verifies a sent message appears, and captures desktop/mobile screenshots.
2. Run the browser script using the installed Playwright runtime; expect all checks to pass.
3. Inspect both screenshots and fix layout or contrast defects before rerunning.
4. Document the product boundary, feature list, local run command, test commands, keyboard shortcuts, storage behavior, deployment URL, tech stack, and screenshot.

### Task 5: Publish through the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch `origin` and integrate the latest `origin/main` before changing tracker files.
2. Add a failing tracker test for App 081's name, branded description, Pages URL and official completion state.
3. Update the 81st `IDEAS` entry and add `81:"done"` without changing parallel project registrations.
4. Run the App 081 tests, browser acceptance and root tracker tests.
5. Commit only App 081, its plan files, and the tracker files; verify the diff excludes unrelated work.
6. Push the completed branch to GitHub `origin` only, then update `origin/main` in the safest non-destructive way available and verify the remote commit.
