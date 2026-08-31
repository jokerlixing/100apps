# App 074 Delete Collaborative Draft Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a guarded action that permanently clears the current collaborative draft for every participant in local or WebSocket mode.

**Architecture:** Add one authoritative `deleteDocument` state transition to the shared core. Local mode persists and broadcasts the cleared state through the existing local room channel; online mode sends `document:delete` to the room server, which applies the same transition and broadcasts `document:deleted`. The room remains open, while title, body, comments, and history are reset so collaborators can start a new draft without rejoining.

**Tech Stack:** Semantic HTML dialog, native CSS and JavaScript, BroadcastChannel/localStorage, Node.js, WebSocket (`ws`), `node:test`, Chrome DevTools Protocol browser smoke test.

---

## Product design

- Add one destructive action to the current-file card, labelled “删除协作稿”.
- Require the user to type the current room code in a modal before enabling confirmation.
- Explain the scope dynamically: local mode affects this browser's same-room tabs; online mode affects every member in the shared room.
- Treat deletion as irreversible: the next state is revision `n + 1`, titled “未命名文档”, with an empty body, no comments, and no version history.
- Keep the room and presence session alive, so collaborators see the cleared page immediately and may continue writing.
- Use the existing proof-red accent only for the destructive action; preserve the editorial proof-desk visual language and keyboard focus behavior.

### Task 1: Shared state transition

**Files:**
- Modify: `apps/074-collaborative-document/sync-core.test.js`
- Modify: `apps/074-collaborative-document/sync-core.js`

1. Add a failing test proving deletion rejects a stale revision.
2. Add a failing test proving accepted deletion increments the revision and clears title, body, comments, and history.
3. Run `node --test sync-core.test.js` and confirm the new tests fail because `deleteDocument` is missing.
4. Implement and export `deleteDocument` using the existing conflict and actor/time normalization.
5. Re-run the core test and confirm it passes.

### Task 2: WebSocket deletion protocol

**Files:**
- Modify: `apps/074-collaborative-document/server.test.js`
- Modify: `apps/074-collaborative-document/server.js`

1. Add a two-client test that sends `document:delete` and expects both clients to receive `document:deleted` with an empty state and source member.
2. Add a stale-delete assertion that receives `document:conflict` without clearing the room.
3. Run `node --test server.test.js` and confirm the protocol test fails.
4. Route `document:delete` through rate limiting and the shared core transition, then broadcast the authoritative snapshot.
5. Re-run service tests and confirm they pass.

### Task 3: Guarded deletion UI and synchronization

**Files:**
- Modify: `apps/074-collaborative-document/index.html`
- Modify: `apps/074-collaborative-document/styles.css`
- Modify: `apps/074-collaborative-document/app.js`

1. Add the destructive current-draft button and a semantic confirmation dialog.
2. Disable confirmation until the typed normalized room code exactly matches the active room.
3. In online mode send `document:delete`; in local mode call `deleteDocument`, persist, and broadcast the new revision.
4. Handle `document:deleted` as an authoritative snapshot, cancel pending saves, clear comments/versions, focus the blank editor, and announce success.
5. Verify syntax with `node --check` for the three JavaScript entrypoints.

### Task 4: Browser regression, documentation, and tracker

**Files:**
- Modify: `apps/074-collaborative-document/qa/browser-smoke.mjs`
- Modify: `apps/074-collaborative-document/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Extend the two-browser smoke flow to delete after restore and assert both clients have the empty title/body, zero comments, and zero versions.
2. Regenerate desktop/mobile screenshots with the new destructive control and inspect both images.
3. Document confirmation semantics and the `document:delete` / `document:deleted` protocol.
4. Update the root tracker description for app 074 and assert the tracker text includes deletion.
5. Run app tests, browser smoke, tracker tests, syntax checks, and `npm audit --audit-level=high`.

### Task 5: Publish

**Files:**
- Commit all scoped files on root `main`.

1. Fetch `origin/main` and verify the tracker still contains parallel project registrations.
2. Re-run affected tests after any synchronization.
3. Commit the feature directly on `main`.
4. Push only to GitHub with `git push origin main`.
5. Verify the GitHub Pages URL is reachable and report the exact start, finish, and elapsed time.
