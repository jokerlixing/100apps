# GALLEY/74 Collaborative Document Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable collaborative editor with local multi-tab sync, optional WebSocket rooms, comments, version recovery, and import/export.

**Architecture:** A dependency-free browser client owns the editor and local fallback; a small Node.js `ws` server owns authoritative room revisions when available. Shared validation and state-transition helpers live in a UMD module so the browser client and Node tests exercise the same rules.

**Tech Stack:** HTML, CSS, vanilla JavaScript, BroadcastChannel, localStorage, Node.js 18+, `ws`, `node:test`.

---

### Task 1: Define the collaboration state core

**Files:**
- Create: `apps/074-collaborative-document/sync-core.js`
- Create: `apps/074-collaborative-document/sync-core.test.js`

1. Write failing tests for room/name normalization, initial document shape, document/comment limits, version conflicts, and history trimming.
2. Run `node --test apps/074-collaborative-document/sync-core.test.js`; expect missing-module failure.
3. Implement the UMD helpers and immutable state transitions.
4. Re-run the test; expect all tests to pass.

### Task 2: Add the WebSocket room service

**Files:**
- Create: `apps/074-collaborative-document/server.js`
- Create: `apps/074-collaborative-document/server.test.js`
- Create: `apps/074-collaborative-document/package.json`
- Generate: `apps/074-collaborative-document/package-lock.json`

1. Write integration tests for health response, join/snapshot, room isolation, accepted update, stale revision rejection, presence, and input validation.
2. Run `npm install` and `npm test` from the app directory; expect server tests to fail before implementation is complete.
3. Implement bounded in-memory rooms, protocol validation, presence broadcasts, rate limiting, and cleanup.
4. Run `npm test`; expect core and server suites to pass.

### Task 3: Build the editor interface

**Files:**
- Create: `apps/074-collaborative-document/index.html`
- Create: `apps/074-collaborative-document/styles.css`
- Create: `apps/074-collaborative-document/app.js`

1. Build semantic three-panel markup with editor toolbar, document list, comments, versions, dialogs, toasts, and accessible labels.
2. Implement local persistence, BroadcastChannel, WebSocket fallback, debounced updates, comment/resolve flow, history restore, JSON import/export, HTML export, and share link.
3. Apply the GALLEY visual tokens, responsive drawers, visible focus, and reduced-motion handling.
4. Run `node --check` for each JavaScript file and `npm test`.

### Task 4: Document and visually verify the product

**Files:**
- Create: `apps/074-collaborative-document/README.md`
- Create: `apps/074-collaborative-document/assets/screenshot-desktop.png`
- Create: `apps/074-collaborative-document/assets/screenshot-mobile.png`

1. Document the GitHub Pages local mode, WebSocket launch command, protocol, safety limits, features, and known last-write-wins limitation.
2. Start the app on an ephemeral local port and run the browser smoke flow in two tabs.
3. Capture and inspect a desktop screenshot; fix overflow, focus, copy, or contrast defects before accepting it.
4. Run the full application test command once more.

### Task 5: Publish through the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch `origin/main` and rebase the isolated branch so registrations from parallel apps are preserved.
2. Add a failing tracker assertion for #074 name, `GALLEY/74` description, Pages URL, and official done state.
3. Update only the #074 idea tuple and official completion map.
4. Run `node --test qa/tracker.test.js` and the app tests.
5. Commit, rebase on the latest `origin/main`, push `HEAD:main` to GitHub `origin`, and verify local HEAD equals `origin/main`.
