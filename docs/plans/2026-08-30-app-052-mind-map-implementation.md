# App 052 Mind Map Editor Implementation Plan

**Goal:** Build a responsive, local-first SVG mind map editor with branch folding, history, viewport controls, persistence, and deterministic PNG export.

**Architecture:** Keep tree mutations, validation, traversal, and layout in a dependency-free UMD core. Let the browser controller own document history, localStorage, SVG interaction, keyboard commands, rendering, and download behavior. Use semantic HTML and external CSS with no build step.

**Tech stack:** HTML, CSS, vanilla JavaScript, SVG, Canvas export, localStorage, Node.js built-in test runner.

## Task 1: Define and test the tree model

- Create `apps/052-mind-map-editor/mind-core.test.js` with failing tests for normalization, immutable edits, root protection, duplicate IDs, validation, folding, and layout.
- Create `apps/052-mind-map-editor/mind-core.js` and make the test suite green.
- Run `node --test apps/052-mind-map-editor/mind-core.test.js` and `node --check apps/052-mind-map-editor/mind-core.js`.

## Task 2: Build the LINE/52 shell

- Create `index.html` with a compact topbar, dispatch sidebar, selected-node editor, outline tree, SVG workspace, viewport tools, announcements, and shortcut help.
- Create `styles.css` with the metro-control visual system, responsive desktop/mobile layouts, keyboard focus, touch targets, and reduced-motion handling.
- Keep every control usable at 390px without document-level horizontal overflow.

## Task 3: Connect editing and persistence

- Create `app.js` with a starter document, safe localStorage loading, a 50-entry undo/redo history, selection repair, and auto-save status.
- Render edges and nodes as accessible SVG groups, inheriting a stable color from each first-level branch.
- Implement add child, add sibling, rename, delete, fold/unfold, new map, outline navigation, keyboard commands, pan, wheel zoom, zoom buttons, and fit-to-content.
- Export a clean, full-content SVG snapshot through Canvas to a downloaded PNG.

## Task 4: Integrate challenge metadata

- Create the app README with features, local usage, privacy, limitations, shortcuts, and test command.
- Update the root tracker entry for App 052 with the GitHub Pages URL and the `LINE/52` description.

## Task 5: Verify and synchronize

- Run the unit suite, syntax checks, inline-script parse checks, `git diff --check`, and path assertions.
- Serve the repository locally and verify the full edit/persist/export flow at desktop and 390px widths, including console output and screenshot review.
- Commit focused changes, integrate against current `origin/main`, push only to GitHub `origin`, and confirm the remote commit before stopping the completion timer.
