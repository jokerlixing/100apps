# ROOM/93 Collaborative Whiteboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a local-first collaborative whiteboard with templates, cross-tab presence, editing history, persistence, and JSON/PNG export.

**Architecture:** A dependency-free static application uses a pure UMD core for board state and validation, a DOM renderer for board objects, localStorage for room persistence, and BroadcastChannel for same-origin collaboration. The root tracker remains the source of truth for official completion and deployment URL.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, localStorage, BroadcastChannel, Canvas 2D, Node.js built-in test runner.

---

### Task 1: Define the board state contract

**Files:**
- Create: `apps/093-collab-whiteboard/board-core.test.js`
- Create: `apps/093-collab-whiteboard/board-core.js`

1. Write failing tests for board creation, unique object IDs, immutable object updates, deletion, template cloning, history bounds, import validation, and content bounds.
2. Run `node --test apps/093-collab-whiteboard/board-core.test.js` and confirm the missing-module failure.
3. Implement only the pure functions required by the tests, with no browser globals at module load time.
4. Rerun the tests and confirm all cases pass.

### Task 2: Build the application shell and visual system

**Files:**
- Create: `apps/093-collab-whiteboard/index.html`
- Create: `apps/093-collab-whiteboard/styles.css`
- Create: `apps/093-collab-whiteboard/app.js`

1. Add semantic topbar, template shelf, central board surface, collaboration panel, inspector, dialogs, toast, and live region.
2. Implement the project-war-room token system, blueprint grid, paper objects, responsive layouts, focus states, touch targets, and reduced-motion behavior.
3. Render board objects and connectors from the core state; support selection, drag, inline editing, color, layer, duplicate, and delete operations.
4. Add undo/redo, zoom controls, keyboard shortcuts, object counter, and status copy.
5. Run `node --check` on both JavaScript files.

### Task 3: Add persistence, collaboration, templates, and export

**Files:**
- Modify: `apps/093-collab-whiteboard/app.js`
- Modify: `apps/093-collab-whiteboard/index.html`

1. Persist each room under a versioned localStorage key and recover safely from malformed data.
2. Broadcast state, presence, and cursor messages; ignore self messages and prevent state rebroadcast loops.
3. Implement room-code switching and an invite-link copy action that explains the same-browser collaboration boundary.
4. Implement template confirmation, validated JSON import/export, and deterministic Canvas 2D PNG export.
5. Verify unavailable clipboard, BroadcastChannel, storage, and file parsing paths show actionable messages.

### Task 4: Add documentation and browser verification

**Files:**
- Create: `apps/093-collab-whiteboard/README.md`
- Create: `apps/093-collab-whiteboard/qa/browser-smoke.mjs`
- Create: `apps/093-collab-whiteboard/assets/screenshot-desktop.png`
- Create: `apps/093-collab-whiteboard/assets/screenshot-mobile.png`

1. Document the public URL, local server command, capabilities, shortcuts, data/privacy boundary, and exact verification commands.
2. Add a browser script that serves the repository, opens two pages, verifies sync and persistence, exports a board, checks runtime errors, and captures desktop/mobile screenshots.
3. Run the core tests, syntax checks, and browser smoke test; inspect both screenshots and fix visible issues before continuing.

### Task 5: Publish App 093 in the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch `origin/main` and merge it into the project branch to preserve parallel tracker updates.
2. Add a failing tracker test for App 093 name, ROOM/93 description, Pages URL, and official completion status.
3. Update IDEAS and INIT_DONE without changing other project entries.
4. Run `node --test qa/tracker.test.js` and the App 093 verification suite.

### Task 6: Commit and synchronize GitHub

**Files:** All App 093, plan, tracker, test, README, and screenshot files.

1. Review `git diff --check`, `git status --short`, and the staged diff.
2. Commit the implementation and tracker publication with focused commit messages.
3. Fetch and merge any newer `origin/main`; resolve only App 093 overlap, then rerun all verification.
4. Push `HEAD:main` to GitHub `origin` only, retrying the fetch/merge/test/push loop if the remote advanced.
5. Confirm `origin/main` contains the final commit and record the completion timestamp.
