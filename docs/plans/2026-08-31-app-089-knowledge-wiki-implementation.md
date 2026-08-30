# LOOM/89 Personal Knowledge Wiki Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deployable local-first personal wiki with linked notes, full-text search, backlinks, a clickable relationship graph, and verified backup/restore.

**Architecture:** Keep all note-domain behavior in a dependency-free UMD module so Node tests and the browser share the same implementation. Keep DOM orchestration and local persistence in a separate browser script, render the graph as accessible SVG, and deploy the static files through the repository's existing GitHub Pages structure.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, SVG, localStorage, Node.js test runner, headless Chrome DevTools Protocol smoke test.

---

### Task 1: Create and test the knowledge core

**Files:**
- Create: `apps/089-knowledge-wiki/knowledge-core.test.js`
- Create: `apps/089-knowledge-wiki/knowledge-core.js`

**Step 1: Write failing tests**

Cover `extractWikiLinks`, `renderMarkdown`, `searchNotes`, `getBacklinks`, `buildGraph`, `renameNote`, and `importBackup`; include duplicate links, HTML injection, unresolved nodes, stale titles, and malformed backups.

**Step 2: Verify failure**

Run: `node --test apps/089-knowledge-wiki/knowledge-core.test.js`
Expected: FAIL because `knowledge-core.js` does not exist.

**Step 3: Implement the core**

Export a frozen API with deterministic pure functions. Escape HTML before Markdown transformations, accept only `http` and `https` Markdown URLs, normalize imported objects into `{id,title,content,tags,createdAt,updatedAt}`, and never mutate caller-owned arrays.

**Step 4: Verify pass**

Run: `node --test apps/089-knowledge-wiki/knowledge-core.test.js`
Expected: all tests pass.

### Task 2: Build the responsive workspace

**Files:**
- Create: `apps/089-knowledge-wiki/index.html`
- Create: `apps/089-knowledge-wiki/styles.css`
- Create: `apps/089-knowledge-wiki/app.js`
- Create: `apps/089-knowledge-wiki/ui.test.js`

**Step 1: Write the UI contract test**

Assert the page has labelled search, note list, title/content inputs, preview, context rail, graph dialog, import input, status region, local scripts, responsive viewport, and no remote runtime dependency.

**Step 2: Verify failure**

Run: `node --test apps/089-knowledge-wiki/ui.test.js`
Expected: FAIL until the workspace exists.

**Step 3: Implement the workspace**

Build seeded local data, create/edit/delete flows, autosave, preview, resolved and unresolved wiki-link navigation, backlinks, tag filtering, JSON import/export, Markdown export, keyboard shortcuts, and an accessible SVG graph. Use the LOOM/89 visual tokens and responsive layout from the design document.

**Step 4: Verify pass**

Run: `node --test apps/089-knowledge-wiki/ui.test.js`
Expected: all tests pass.

### Task 3: Add browser verification and documentation

**Files:**
- Create: `apps/089-knowledge-wiki/qa/browser-smoke.mjs`
- Create: `apps/089-knowledge-wiki/README.md`
- Create: `apps/089-knowledge-wiki/assets/screenshot-desktop.png`
- Create: `apps/089-knowledge-wiki/assets/screenshot-mobile.png`

**Step 1: Add a browser smoke flow**

Serve the repository with the smoke script's local static server and drive an installed Chrome or Edge instance through the DevTools Protocol. Verify seed load, new-note creation, edit persistence, a created `[[双链]]`, search, preview navigation, graph opening, reload persistence, and mobile overflow.

**Step 2: Run browser verification**

Run: `node apps/089-knowledge-wiki/qa/browser-smoke.mjs`
Expected: PASS and two current screenshots.

**Step 3: Document the product**

Explain the feature set, privacy boundary, GitHub Pages URL, local run command, shortcuts, backup format, test commands, technology choices, and known local-only scope. Embed both screenshots.

### Task 4: Publish through the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Refresh the publication base**

Run: `git fetch origin main`
Expected: the latest GitHub `origin/main` is available before tracker edits.

**Step 2: Add a failing tracker assertion**

Require app 89 to be named `个人知识库 Wiki`, have a `LOOM/89` description, link to `https://jokerlixing.github.io/100apps/apps/089-knowledge-wiki/`, and appear in `INIT_DONE`.

**Step 3: Update tracker data**

Change only the app 89 tuple and official completion map, preserving all newer parallel registrations.

**Step 4: Run the complete verification suite**

Run: `node --test apps/089-knowledge-wiki/*.test.js qa/tracker.test.js`
Expected: all tests pass. Then rerun the browser smoke flow and inspect generated desktop/mobile screenshots.

**Step 5: Commit and synchronize GitHub**

Stage only App 89, its two plan documents, and the root tracker changes. Commit with `feat: add app 089 personal knowledge wiki`, fetch/rebase onto the latest `origin/main`, rerun tracker tests if the base changed, then push only to GitHub `origin`.
