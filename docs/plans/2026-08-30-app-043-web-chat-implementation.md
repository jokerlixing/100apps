# PATCH/43 Web Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a room-based web chat with recent history, online members, typing indicators, replies, WebSocket synchronization and local-tab fallback.

**Architecture:** Keep the browser client in one HTML file and share a versioned JSON protocol across WebSocket and BroadcastChannel transports. A small Node HTTP/WebSocket server owns room history and presence for real multi-device use; static hosting uses room-scoped BroadcastChannel history exchange without overstating its reach.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, BroadcastChannel, WebSocket, Node.js, `ws` 8.21.3 and Node's built-in test runner.

---

### Task 1: Define and test chat messages

**Files:**
- Create: `apps/043-web-chat/package.json`
- Create: `apps/043-web-chat/server.js`
- Create: `apps/043-web-chat/server.test.js`

**Steps:**
1. Define validators for room, client, message, name, color, text and reply ID.
2. Write tests for whitespace, HTML-like text, 600-character limit, idempotency and 120-message trimming.
3. Implement room history reducers and snapshots.
4. Run `npm test` and confirm unit tests pass.

### Task 2: Add WebSocket rooms and safety limits

**Files:**
- Modify: `apps/043-web-chat/server.js`
- Test: `apps/043-web-chat/server.test.js`

**Steps:**
1. Add HTTP serving, `/health` and `/ws` upgrade handling.
2. Implement join/snapshot/presence, chat send, typing, ping/pong and cleanup.
3. Add 32KB payload, room-size, chat-rate and generic-rate limits.
4. Add integration tests for relay, history, isolation, duplicate ID and reconnect replacement.

### Task 3: Build the patch-bay chat interface

**Files:**
- Create: `apps/043-web-chat/index.html`

**Steps:**
1. Add PATCH/43 masthead, room controls, paper-tape message stream, composer and member jack board.
2. Implement the mint/plum/coral/cobalt visual tokens and responsive member strip.
3. Verify semantic landmarks, labels, live regions, focus visibility and reduced motion.

### Task 4: Implement browser chat state

**Files:**
- Modify: `apps/043-web-chat/index.html`

**Steps:**
1. Render messages as text nodes with sender, time, reply preview and delivery state.
2. Add optimistic sending, Enter/Shift+Enter behavior, 600-character counter and reply selection.
3. Add online members, typing expiry, auto-scroll only near the bottom and a new-message jump button.
4. Add WebSocket reconnect, outbox merge and BroadcastChannel history/presence fallback.

### Task 5: Document and register App #043

**Files:**
- Create: `apps/043-web-chat/README.md`
- Create: `apps/043-web-chat/.gitignore`
- Modify: `index.html`

**Steps:**
1. Document local WebSocket startup, GitHub Pages scope, limits, privacy and history lifetime.
2. Add the GitHub Pages URL to the App #043 tracker entry.
3. Add 43 to `INIT_DONE` so the tracker renders 43/100.
4. Run source checks for 43 consecutive completion ids and the App #043 link.

### Task 6: Verify and deliver

**Files:**
- Verify: `apps/043-web-chat/index.html`
- Verify: `apps/043-web-chat/server.js`
- Verify: `index.html`

**Steps:**
1. Run service tests, script syntax, duplicate-id, typed-button, tracker and dependency audit checks.
2. Start the local service and validate `/health`, WebSocket history, isolation, typing and reconnect replacement.
3. Use multiple tabs to verify messages, online members, history recovery, replies and local fallback.
4. Inspect desktop and 390px rules and browser console errors.
5. Run `git diff --check`, commit App #043 and push only `origin/main`.
6. Match local HEAD with GitHub and verify both Pages URLs expose the new content.
