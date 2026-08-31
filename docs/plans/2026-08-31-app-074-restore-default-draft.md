# App 074 Restore Default Draft Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a guarded button that restores GALLEY/74's built-in default publication draft in local and WebSocket collaboration modes.

**Architecture:** Reuse the existing restore confirmation dialog and the existing revision-protected `document:update` path. The client builds the default draft from `createInitialState`, preserves the current draft as a normal historical version, and refuses to auto-retry if a collaborator updates the room during confirmation or before the reset is accepted.

**Tech Stack:** Semantic HTML dialog, native CSS and JavaScript, BroadcastChannel/localStorage, WebSocket, Chrome DevTools Protocol browser smoke tests, Node.js test runner.

---

## Product design

- Place “恢复默认发布稿” above the permanent-delete action in the current proof card.
- Use GALLEY's route blue and the label `HOUSE COPY` so restoration reads as a constructive editorial action, while permanent deletion remains proof red.
- Keep the action available for edited and deleted drafts.
- Confirm before restoring. Explain that the current draft is retained in version history and the room remains connected.
- If another member updates or restores a version while confirmation is open, close the dialog and require a new review.
- If the server rejects the reset because the base revision is stale, show the authoritative latest draft and do not retry the reset automatically.

### Task 1: Failing browser acceptance

**Files:**
- Modify: `apps/074-collaborative-document/qa/browser-smoke.mjs`

1. After online deletion, open the default-restore button and assert the confirmation copy.
2. Update the room from the second client and assert the first client's confirmation closes.
3. Reconfirm, restore, and assert both clients receive the built-in title/body with a new version.
4. Repeat the restore after deletion in two local-mode tabs.
5. Run `npm run test:browser` and confirm it fails because the new controls do not exist.

### Task 2: Restore button and guarded data flow

**Files:**
- Modify: `apps/074-collaborative-document/index.html`
- Modify: `apps/074-collaborative-document/styles.css`
- Modify: `apps/074-collaborative-document/app.js`

1. Add the `HOUSE COPY / 恢复默认发布稿` action to the current proof card.
2. Reuse the restore dialog with dynamic title, copy, confirm label, and blue/red action styling.
3. Build the default draft from `Core.createInitialState(room)`.
4. In local mode, require the stored revision to match before applying a normal document update.
5. In online mode, send one revision-protected document update and handle its conflict separately so it is never auto-retried.
6. Close a pending restore confirmation when a collaborator update arrives.

### Task 3: Documentation, tracker, and visual proof

**Files:**
- Modify: `apps/074-collaborative-document/README.md`
- Modify: `apps/074-collaborative-document/assets/screenshot-desktop.png`
- Modify: `apps/074-collaborative-document/assets/screenshot-mobile.png`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Document default restoration, version preservation, and stale-revision behavior.
2. Update the app 074 tracker description and assertion to mention default restoration.
3. Regenerate desktop/mobile screenshots and inspect the restored-action hierarchy and layout.

### Task 4: Verify and publish

**Files:**
- Commit all scoped changes directly on root `main`.

1. Run app tests, browser smoke, tracker tests, JavaScript syntax checks, dependency audit, and `git diff --check`.
2. Fetch and verify the latest `origin/main` without overwriting parallel work.
3. Commit on `main`, push only to GitHub `origin/main`, and confirm the Pages app and root tracker contain the new copy.
