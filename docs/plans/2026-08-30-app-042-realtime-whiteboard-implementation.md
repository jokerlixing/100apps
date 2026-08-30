# BOARD/42 Realtime Whiteboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive collaborative whiteboard with drawing tools, presence, cursor trails, WebSocket rooms, local-tab fallback and PNG export.

**Architecture:** Keep the browser client in one HTML file and share a versioned JSON event protocol across WebSocket and BroadcastChannel transports. A small Node HTTP/WebSocket server owns room snapshots for real multi-device use; GitHub Pages falls back to same-browser collaboration without misrepresenting its reach.

**Tech Stack:** HTML5 Canvas, Pointer Events, BroadcastChannel, WebSocket, vanilla JavaScript, Node.js, `ws` 8.21.3 and Node's built-in test runner.

---

### Task 1: Define and test the room protocol

**Files:**
- Create: `apps/042-realtime-whiteboard/package.json`
- Create: `apps/042-realtime-whiteboard/server.js`
- Create: `apps/042-realtime-whiteboard/server.test.js`

**Steps:**
1. Export message limits, sanitizers and room-state functions from `server.js`.
2. Write Node tests for room validation, stroke normalization, point limits, unknown messages and snapshot state.
3. Run `npm test` and confirm protocol unit tests pass.
4. Add the HTTP static server, WebSocket upgrade, join/snapshot/presence, drawing events and cleanup.

### Task 2: Build the tracing-paper interface

**Files:**
- Create: `apps/042-realtime-whiteboard/index.html`

**Steps:**
1. Add the BOARD/42 masthead, room bar, tool rack, Canvas stage, meeting pinboard and status rail.
2. Add the tracing-paper token system, blueprint grid, intentional cursor trails and responsive breakpoints.
3. Verify semantic buttons, labelled controls, visible focus and reduced-motion support.

### Task 3: Implement drawing and history

**Files:**
- Modify: `apps/042-realtime-whiteboard/index.html`

**Steps:**
1. Convert pointer coordinates into resolution-independent 0–1 board coordinates.
2. Implement pen, highlighter, line and whole-stroke eraser with live preview.
3. Keep committed and transient stroke maps, redraw by animation frame and cap point counts.
4. Implement owner-scoped undo/redo, armed clear, board reset and PNG export.

### Task 4: Implement collaboration transport

**Files:**
- Modify: `apps/042-realtime-whiteboard/index.html`
- Test: `apps/042-realtime-whiteboard/server.test.js`

**Steps:**
1. Add room/client identity, versioned messages and idempotent reducers.
2. Try WebSocket first, use exponential reconnect, and fall back to room-scoped BroadcastChannel.
3. Synchronize snapshots, transient point batches, commits, removals, clears, cursors and presence.
4. Add stale-cursor cleanup and accurate WebSocket/local/offline status copy.

### Task 5: Document and register App #042

**Files:**
- Create: `apps/042-realtime-whiteboard/README.md`
- Create: `apps/042-realtime-whiteboard/.gitignore`
- Modify: `index.html`

**Steps:**
1. Document GitHub Pages behavior, local WebSocket startup, room URLs, limits and privacy.
2. Add the GitHub Pages URL to the App #042 tracker entry.
3. Add 42 to `INIT_DONE` so the tracker renders 42/100.
4. Run source checks for 42 consecutive completion ids and the App #042 link.

### Task 6: Verify and deliver

**Files:**
- Verify: `apps/042-realtime-whiteboard/index.html`
- Verify: `apps/042-realtime-whiteboard/server.js`
- Verify: `index.html`

**Steps:**
1. Run `npm test`, script syntax, duplicate-id, typed-button and tracker checks.
2. Start the local server and validate HTTP, WebSocket snapshot, isolation and presence.
3. Use two browser tabs to verify shared-room drawing, cursor/presence, clear and different-room isolation.
4. Inspect desktop and narrow responsive rules and browser console behavior.
5. Run `git diff --check`, commit App #042 and push only `origin/main`.
6. Match local HEAD with GitHub and verify both Pages URLs expose the new content.
