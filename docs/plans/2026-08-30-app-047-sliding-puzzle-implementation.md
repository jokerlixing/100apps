# App 047 Full-image Swap Puzzle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive, accessible full-image swap puzzle with drag interactions, local image input, timing, swap counts, and per-difficulty local records.

**Architecture:** Keep board transitions in a browser/CommonJS pure-function module so Node's built-in runner can test the rules without a DOM. Render all numbered pieces as DOM buttons over CSS background slices; route drag, pointer, click, and keyboard input through one immutable swap operation.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Pointer Events, Node.js `node:test`, localStorage, FileReader and Canvas.

---

### Task 1: Implement and test the board core

- `createSolved(dimension)` returns `1..N²` with no empty value.
- `swapTiles(board, source, target, dimension)` validates and immutably exchanges arbitrary positions.
- `shuffleBoard` uses injected-random Fisher–Yates and guarantees a non-solved initial result.
- Tests cover dimensions, complete tile sets, no-op swaps, invalid indexes, deterministic random, victory and records.

### Task 2: Build the full-board interface

- Render one button for every grid position and make the whole board pointer-draggable.
- Slice the selected image from each tile's target row and column.
- Show source lift, selected source and highlighted drop target states.
- Start timing on the first valid swap and stop on the solved board.

### Task 3: Support all input modes

- Mouse, touch and pen share one Pointer Events drag flow with element hit-testing.
- Clicking or Enter/space selects a source and target; Escape cancels.
- Arrow keys move a roving keyboard focus through the grid.

### Task 4: Handle images, records and destructive changes

- Use `assets/colorful-desk-puzzle.png` as the built-in puzzle-friendly image.
- Validate uploads, crop locally to a square and never transmit them.
- Persist guarded best records by image type, swap rules and difficulty.
- Require an inline confirmation before abandoning an active game.

### Task 5: Verify and publish

- Run unit tests, syntax checks, HTTP asset checks and diff checks.
- Verify 1440×900 and 390×844 layouts and all input flows in a real browser.
- Update README, design docs and root tracker copy.
- Commit the scoped changes and push only GitHub `origin`.
