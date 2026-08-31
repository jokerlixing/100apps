# GALLEY/74 Delete Room Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Deleting a collaborative draft removes the active room instance and its local traces, then moves every connected collaborator into one shared replacement room.

**Architecture:** Add a revision-protected `room:delete` WebSocket command alongside the legacy document-clear command. The server broadcasts one replacement room code, removes the old in-memory room, and closes its sockets; local-only tabs use BroadcastChannel plus a storage event fallback to perform the same coordinated redirect. A room code is reusable later and creates a new default room rather than becoming permanently blacklisted.

**Tech Stack:** Vanilla JavaScript, WebSocket (`ws`), BroadcastChannel, localStorage, Node.js test runner, Chrome DevTools Protocol browser smoke tests.

---

### Task 1: Specify room deletion at the protocol boundary

- **Files:** Modify `apps/074-collaborative-document/server.test.js`.
- **Output:** Tests prove stale deletion conflicts, successful deletion notifies all members, closes their connections, removes the in-memory room, and lets the old code reopen as a fresh default room.
- **Test:** Run `node --test server.test.js` and observe the new tests fail before implementation.

### Task 2: Implement server-side room lifecycle deletion

- **Files:** Modify `apps/074-collaborative-document/server.js`.
- **Output:** `room:delete` validates the current revision and replacement code, broadcasts `room:deleted`, deletes the room map entry, and closes old sockets without scheduling stale cleanup.
- **Test:** Run `node --test server.test.js` and confirm all server tests pass.

### Task 3: Coordinate browser cleanup and migration

- **Files:** Modify `apps/074-collaborative-document/app.js`, `apps/074-collaborative-document/index.html`, and `apps/074-collaborative-document/qa/browser-smoke.mjs`.
- **Output:** The confirmation explains room deletion, local data and recent-room entries are removed, all open collaborators navigate to the same new room, and unload/reconnect logic cannot recreate the deleted room.
- **Test:** Run the browser smoke test in online and local modes; verify the old room is absent locally and reopens with the default draft.

### Task 4: Document and register the completed behavior

- **Files:** Modify `apps/074-collaborative-document/README.md`, root `index.html`, and `qa/tracker.test.js`.
- **Output:** Protocol and product copy describe room-instance deletion/reuse semantics; the official tracker advertises “删除房间” and retains App #074's published URL and done status.
- **Test:** Run app tests, tracker tests, syntax checks, browser smoke tests, and dependency audit.

### Task 5: Synchronize GitHub

- **Files:** Commit all scoped changes on `main`.
- **Output:** Latest `origin/main` is preserved, the completed change is committed, and GitHub `origin/main` contains the result.
- **Test:** Fetch after push and confirm `HEAD`, `main`, and `origin/main` resolve to the same commit with a clean working tree.
