# App 060 Image Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-only image editor that imports a local image, applies non-destructive crop/filter/text edits, and exports the finished bitmap.

**Architecture:** Keep the original decoded image separate from a serializable edit recipe. Pure helpers calculate crop geometry, filter strings, output sizes, and export names; the UI renders the recipe to a preview Canvas and a full-resolution export Canvas.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Canvas 2D, Node.js built-in test runner.

---

### Task 1: Define and test the editing core

**Files:**
- Create: `apps/060-image-editor/editor-core.test.js`
- Create: `apps/060-image-editor/editor-core.js`

**Step 1: Write failing tests**

Cover numeric clamping, aspect crops on landscape and portrait sources, nested crop mapping, Canvas filter serialization, scaled export dimensions, filter presets, and filesystem-safe export names.

**Step 2: Verify the tests fail**

Run: `node --test apps/060-image-editor/editor-core.test.js`

Expected: FAIL because `editor-core.js` does not exist.

**Step 3: Implement the pure helpers**

Expose a UMD-style `EditorCore` object so the same file works with `require()` in Node and a normal `<script>` tag in the browser. Clamp invalid values to conservative defaults and round output pixels to positive integers.

**Step 4: Verify the tests pass**

Run: `node --test apps/060-image-editor/editor-core.test.js`

Expected: all tests PASS.

**Step 5: Commit**

Commit: `test: add app 060 editing core`

### Task 2: Build the responsive darkroom workspace

**Files:**
- Create: `apps/060-image-editor/index.html`
- Create: `apps/060-image-editor/styles.css`

**Step 1: Create semantic workspace markup**

Add the top file bar, accessible import control, tool rail, Canvas stage, crop overlay, inspector sections, history controls, status region, and export controls. Every icon-only control receives a visible or accessible label.

**Step 2: Implement the visual system**

Use the darkroom palette and three-role typography from the design. Build a three-column desktop workspace, a horizontal mobile tool rail, visible focus states, reduced-motion handling, and the RGB calibration rail.

**Step 3: Run static checks**

Run a source check that every local stylesheet and script reference exists and that the page contains one `h1`, one main landmark, and a live status region.

Expected: all referenced assets exist and semantic checks PASS.

**Step 4: Commit**

Commit: `feat: build app 060 darkroom workspace`

### Task 3: Implement import, editing, history, and export

**Files:**
- Create: `apps/060-image-editor/app.js`
- Modify: `apps/060-image-editor/index.html`

**Step 1: Implement image loading**

Generate a built-in demo image, then support file selection, drag/drop, and image paste. Reject unsupported types, files over 20 MB, and decoded images over 40 MP with a specific recovery message.

**Step 2: Implement the render recipe**

Render the current normalized crop from the original image, apply Canvas filters only to the bitmap, reset the filter, then draw the text overlay. Keep preview resolution bounded while export uses the requested output dimensions.

**Step 3: Implement crop interaction**

Support free, 1:1, 4:5, and 16:9 centered selections. Move the selection from its body, resize it from four handles, and map the applied selection back into the existing normalized crop.

**Step 4: Implement controls and history**

Connect presets, sliders, text controls, reset, undo, redo, and keyboard shortcuts. Store at most 30 serializable snapshots and coalesce slider drags into one history action on change.

**Step 5: Implement export**

Render PNG, JPEG, or WebP into a hidden full-resolution Canvas, apply the configured scale and quality, download a timestamped `PRISM60` file, and revoke the Blob URL.

**Step 6: Verify JavaScript and core behavior**

Run:
- `node --test apps/060-image-editor/editor-core.test.js`
- `node --check apps/060-image-editor/editor-core.js`
- `node --check apps/060-image-editor/app.js`

Expected: all commands PASS.

**Step 7: Commit**

Commit: `feat: implement app 060 image workflow`

### Task 4: Document, register, and visually verify App 060

**Files:**
- Create: `apps/060-image-editor/README.md`
- Modify: `index.html`

**Step 1: Write the app README**

Document the privacy boundary, supported imports/exports, interactions, keyboard shortcuts, browser requirements, test commands, and GitHub Pages URL.

**Step 2: Update the challenge tracker**

Change App 060 to `PRISM/60：本地裁剪+非破坏调色+文字导出` and add `https://jokerlixing.github.io/100apps/apps/060-image-editor/` without disturbing concurrent App 052–059 entries.

**Step 3: Run browser verification**

Serve the worktree locally. Verify the demo state, crop flow, filter/text edits, undo/redo, export controls, keyboard focus, and desktop/mobile layouts. Save a representative screenshot under `apps/060-image-editor/assets/`.

**Step 4: Run final repository checks**

Run tests, syntax checks, internal asset checks, tracker checks, and `git diff --check`. Confirm the branch contains only App 060, its two plan files, and the intended tracker line.

**Step 5: Commit and synchronize**

Commit: `feat: complete app 060 image editor`

Push completed code only to GitHub `origin`, incorporating the latest `origin/main` without pushing to any other remote.
