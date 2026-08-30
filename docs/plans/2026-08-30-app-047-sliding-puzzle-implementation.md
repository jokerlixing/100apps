# App 047 Sliding Puzzle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive, accessible sliding-picture puzzle with guaranteed-solvable shuffles, local image input, timing, move counts, and per-difficulty local records.

**Architecture:** Keep all board transitions in a CommonJS/browser-compatible pure-function module so Node's built-in test runner can verify game rules without a DOM. Render numbered DOM buttons over CSS background slices; the page controller owns timer, gestures, persistence, upload validation, and inline confirmation/feedback.

**Tech Stack:** Semantic HTML, modern CSS, vanilla JavaScript, Node.js built-in `node:test`, localStorage, FileReader.

---

### Task 1: Specify the puzzle state machine with failing tests

**Files:**
- Create: `apps/047-sliding-puzzle/puzzle-core.test.js`
- Test: `apps/047-sliding-puzzle/puzzle-core.test.js`

**Step 1: Write tests for solved boards and legal adjacency**

Assert that `createSolved(3)` returns `[1,2,3,4,5,6,7,8,0]`, rejects dimensions outside 3–5, and only treats orthogonally adjacent indexes as neighbors.

**Step 2: Write tests for state transitions**

Assert that `moveTile` swaps a neighboring tile with zero without mutating the source, rejects a distant tile, and that applying the inverse move restores the board.

**Step 3: Write tests for shuffle and records**

Use an injected deterministic random function. Assert each shuffle is not already solved, contains every expected tile once, is reproducible for the same random sequence, and preserves the better record by time then moves.

**Step 4: Run the test to verify red state**

Run: `node --test apps/047-sliding-puzzle/puzzle-core.test.js`
Expected: FAIL because `puzzle-core.js` does not exist.

### Task 2: Implement the pure game core

**Files:**
- Create: `apps/047-sliding-puzzle/puzzle-core.js`
- Test: `apps/047-sliding-puzzle/puzzle-core.test.js`

**Step 1: Implement board primitives**

Export `createSolved`, `isAdjacent`, `getMovableIndexes`, `moveTile`, and `isSolved` through a UMD-style wrapper usable by both Node and the browser.

**Step 2: Implement guaranteed-solvable shuffle**

Start solved and apply `dimension * dimension * 24` legal moves. Exclude the previous blank index where another choice exists, and force one more legal move if the result happens to be solved.

**Step 3: Implement record comparison**

`pickBestRecord(current, candidate)` accepts finite non-negative milliseconds and moves, preferring lower time and using fewer moves as a tie-breaker.

**Step 4: Run the tests to verify green state**

Run: `node --test apps/047-sliding-puzzle/puzzle-core.test.js`
Expected: all tests PASS.

### Task 3: Build the SHIFT/47 interface

**Files:**
- Create: `apps/047-sliding-puzzle/index.html`
- Create: `apps/047-sliding-puzzle/styles.css`
- Create: `apps/047-sliding-puzzle/app.js`
- Create: `apps/047-sliding-puzzle/assets/default-puzzle.svg`

**Step 1: Create the semantic page shell**

Add the title/intro, status display, puzzle grid, difficulty control, image controls, preview button, new-game action, inline notice region, confirmation strip, and completion dialog.

**Step 2: Implement the responsive visual system**

Use the documented five-color repair-console palette, a two-column desktop shell, one-column mobile flow, visible focus styles, and reduced-motion overrides. Keep every puzzle cell square and prevent horizontal overflow.

**Step 3: Render and operate the board**

Render one button per tile with CSS background slices based on its solved row/column. Start timing on the first valid move; update time with `requestAnimationFrame`; show recent blank positions as a short-lived trail.

**Step 4: Add keyboard, pointer, and swipe input**

Tile clicks use the same `tryMove` path as arrow keys. A swipe chooses the adjacent tile opposite the gesture so the tile moves into the blank. Ignore gestures shorter than 24 px.

**Step 5: Add preview, upload, confirmation, and records**

Preview is active only while pointer/key is held. Validate image type and the 8 MB limit before reading. Route destructive in-progress changes through the inline confirmation strip. Persist best results with guarded JSON parsing.

### Task 4: Document and register App 047

**Files:**
- Create: `apps/047-sliding-puzzle/README.md`
- Modify: `index.html`

**Step 1: Write the app README**

Document the product, controls, feature list, local-data behavior, tech stack, tests, and GitHub Pages URL.

**Step 2: Update the root tracker entry**

Replace App 047's placeholder with `SHIFT/47`, set its GitHub Pages URL, and let the tracker compute 47 available apps.

### Task 5: Verify behavior and presentation

**Files:**
- Verify: `apps/047-sliding-puzzle/*`
- Verify: `index.html`

**Step 1: Run automated tests**

Run: `node --test apps/047-sliding-puzzle/puzzle-core.test.js`
Expected: all tests PASS.

**Step 2: Run static integrity checks**

Start a local HTTP server and verify the app route returns HTTP 200. Check for duplicate DOM IDs, missing local file references, and accidental remote runtime dependencies.

**Step 3: Verify desktop and mobile flows visually**

Use browser automation at 1440×900 and 390×844. Exercise start, tile movement, keyboard focus, preview, difficulty change confirmation, and completion. Inspect screenshots for clipping, overflow, illegible contrast, or generic visual drift; fix before continuing.

### Task 6: Commit and synchronize only App 047

**Files:**
- Stage: `apps/047-sliding-puzzle/**`
- Stage: `docs/plans/2026-08-30-app-047-sliding-puzzle-*.md`
- Stage: `index.html`

**Step 1: Confirm unrelated changes remain unstaged**

Run: `git status --short` and `git diff --cached --name-only`.
Expected: App 046 changes remain unstaged; only App 047 and its tracker/docs are staged.

**Step 2: Commit**

Run: `git commit -m "feat: add sliding puzzle app 047"`.

**Step 3: Push only GitHub origin**

Run: `git push origin HEAD:main`.
Expected: GitHub `origin/main` advances; no Gitee command is issued.
