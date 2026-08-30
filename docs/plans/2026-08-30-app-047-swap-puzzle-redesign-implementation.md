# App 047 Swap Puzzle Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the empty-cell sliding puzzle with a full-image drag-and-swap puzzle and ship a more attractive, puzzle-friendly built-in desk illustration.

**Architecture:** Keep board transitions in the UMD pure-function core, replacing adjacency moves with immutable arbitrary swaps and Fisher–Yates shuffling. The controller renders all `N²` tiles and unifies pointer drag, HTML drag/drop, click selection, and keyboard selection through one swap action.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Pointer Events, HTML Drag and Drop, Node.js built-in `node:test`, localStorage, FileReader/Canvas, built-in image generation.

---

### Task 1: Redefine the board contract with failing tests

**Files:**
- Modify: `apps/047-sliding-puzzle/puzzle-core.test.js`

**Step 1:** Change solved-board expectations to `[1,2,...,N²]` with no zero.

**Step 2:** Replace adjacency/move tests with `swapTiles(board, sourceIndex, targetIndex, dimension)` tests covering immutable swaps, same-index no-op and invalid indexes.

**Step 3:** Replace solvability tests with deterministic Fisher–Yates checks: all tiles occur once, output is not solved, same random stream gives the same board.

**Step 4:** Run `node --test apps/047-sliding-puzzle/puzzle-core.test.js` and expect failure against the old API.

### Task 2: Implement the full-board swap core

**Files:**
- Modify: `apps/047-sliding-puzzle/puzzle-core.js`
- Test: `apps/047-sliding-puzzle/puzzle-core.test.js`

**Step 1:** Make `createSolved(dimension)` return `1` through `dimension²`.

**Step 2:** Export `swapTiles`; clone the board, validate both indexes, swap distinct positions, and return `{ board, swapped, sourceIndex, targetIndex }`.

**Step 3:** Implement unbiased Fisher–Yates `shuffleBoard(dimension, random)` and swap the first two entries if the random result remains solved.

**Step 4:** Remove `isAdjacent`, `getMovableIndexes`, and `moveTile` exports.

**Step 5:** Run the unit tests and expect all tests to pass.

### Task 3: Generate and integrate the new built-in image

**Files:**
- Create: `apps/047-sliding-puzzle/assets/colorful-desk-puzzle.png`
- Delete: `apps/047-sliding-puzzle/assets/default-puzzle.svg`

**Step 1:** Generate a square top-down editorial illustration of a colorful creative desk with distinct objects distributed across the full canvas, no text, logos, watermarks, large empty regions, or repeated patterns.

**Step 2:** Inspect the result at full resolution for object separation, edge coverage, artifacts, text-like marks and puzzle suitability.

**Step 3:** Copy the selected generated bitmap into the project asset directory and update the default image path and display name.

### Task 4: Replace sliding controls with swap interactions

**Files:**
- Modify: `apps/047-sliding-puzzle/app.js`
- Modify: `apps/047-sliding-puzzle/index.html`
- Modify: `apps/047-sliding-puzzle/styles.css`

**Step 1:** Render all tiles as draggable buttons; remove empty-cell and trail rendering.

**Step 2:** Add selection state. First click/Enter selects, second swaps, repeated source cancels.

**Step 3:** Add pointer drag state and target hit-testing with `document.elementFromPoint`; commit only when source and target differ.

**Step 4:** Add HTML `dragstart`, `dragover`, `dragleave`, `drop`, and `dragend` handlers for desktop semantics.

**Step 5:** Make arrow keys move focus by row/column and Enter/space invoke the same selection path.

**Step 6:** Route every valid exchange through `performSwap`, which starts the timer, increments moves, renders, restores focus and checks completion.

**Step 7:** Replace all empty-cell copy and visuals with drag/selection instructions, source lift, target slot, and swap pulse styles.

### Task 5: Synchronize documentation and tracker copy

**Files:**
- Modify: `apps/047-sliding-puzzle/README.md`
- Modify: `docs/plans/2026-08-30-app-047-sliding-puzzle-design.md`
- Modify: `docs/plans/2026-08-30-app-047-sliding-puzzle-implementation.md`
- Modify: `index.html`

**Step 1:** Document full-board drag swaps, click/keyboard fallback and the new built-in desk image.

**Step 2:** Remove stale references to an empty cell, adjacency-only moves and guaranteed-solvable sliding shuffles.

**Step 3:** Change the root tracker description to `SHIFT/47：全图拖拽交换+本地图片+计时纪录` while preserving completion status and URL.

### Task 6: Verify, commit and publish

**Files:**
- Verify: `apps/047-sliding-puzzle/**`
- Verify: `docs/plans/*app-047*`
- Verify: `index.html`

**Step 1:** Run unit tests, JavaScript syntax checks, HTTP asset checks and `git diff --check`.

**Step 2:** Test 1440×900 and 390×844 browser layouts, all tile counts, drag/click/keyboard swaps, completion, confirmation and console logs.

**Step 3:** Stage only App 047, its plan files and root tracker entry; commit with `feat: redesign app 047 as swap puzzle`.

**Step 4:** Push only `origin HEAD:main`, then verify GitHub Pages returns the new image and updated page.
