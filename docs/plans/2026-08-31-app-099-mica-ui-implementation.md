# Mica UI Component Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build app 099 as a dependency-free, publish-ready Web Components library with twelve accessible components and a live documentation site.

**Architecture:** A small pure helper module supports catalog search, design-token normalization, snippets, and progress validation. A browser module registers custom elements with open shadow roots, while a static documentation shell exercises the public API and persists only page preferences.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Web Components, Node.js built-in test runner, npm package tooling, Playwright-compatible browser smoke checks.

---

### Task 1: Model the catalog and design tokens

**Files:**
- Create: `apps/099-mica-ui/component-core.test.js`
- Create: `apps/099-mica-ui/component-core.js`

1. Write tests for catalog completeness, case-insensitive search, supported token normalization, progress clamping, and snippet lookup.
2. Run `node --test apps/099-mica-ui/component-core.test.js` and confirm it fails because the module is absent.
3. Implement the smallest UMD-compatible helper module that satisfies those contracts.
4. Re-run the test and require all cases to pass.

### Task 2: Build the installable component package

**Files:**
- Create: `apps/099-mica-ui/mica-ui.css`
- Create: `apps/099-mica-ui/mica-ui.js`
- Create: `apps/099-mica-ui/package.json`
- Create: `apps/099-mica-ui/LICENSE`

1. Define shared public tokens, focus treatment, light/dark surfaces, and reduced-motion behavior.
2. Register `mica-button`, `mica-input`, `mica-select`, `mica-checkbox`, `mica-switch`, `mica-badge`, `mica-alert`, `mica-progress`, `mica-tabs`, `mica-accordion`, `mica-dialog`, and `mica-toast`.
3. Use native controls inside open shadow roots and reflect relevant labels, values, and states through attributes and custom events.
4. Configure a scoped package with `exports`, `files`, license, and side-effect metadata.
5. Run `npm pack --dry-run --cache .npm-cache` in the app directory and verify only public package files are included.

### Task 3: Create the live documentation site

**Files:**
- Create: `apps/099-mica-ui/index.html`
- Create: `apps/099-mica-ui/styles.css`
- Create: `apps/099-mica-ui/app.js`
- Create: `apps/099-mica-ui/README.md`

1. Build the specimen-book header, searchable component rail, live token bench, component sections, installation guide, and package facts.
2. Wire theme, accent, radius, and density controls to CSS custom properties and safe local persistence.
3. Wire component filtering, snippet copy, dialog, tabs, accordion, form controls, progress controls, and toast interactions.
4. Add recovery messaging for empty search and clipboard failure.
5. Document local serving, package verification, public API, and accessibility decisions.

### Task 4: Verify browser behavior and visual quality

**Files:**
- Create: `apps/099-mica-ui/qa/browser-smoke.mjs`
- Create: `apps/099-mica-ui/assets/screenshot-desktop.png`
- Create: `apps/099-mica-ui/assets/screenshot-mobile.png`

1. Serve the repository over HTTP and load app 099 in a headless browser.
2. Assert twelve custom elements register, search filters the catalog, tokens change the specimen, tabs switch, dialog opens and closes, and toast feedback appears.
3. Capture desktop and mobile screenshots after fonts and layout settle.
4. Inspect both screenshots for overflow, clipped content, focus loss, or templated visual artifacts; fix and recapture if needed.

### Task 5: Publish in the root challenge tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

1. Fetch and merge the latest `origin/main` so parallel project registrations remain intact.
2. Change app 099 to the final name `Mica UI 组件库`, its final feature description, and the GitHub Pages URL.
3. Add app 099 to `INIT_DONE` without removing existing completion IDs.
4. Add tracker assertions for id, name, description, deployment URL, official completion, and stale-cache migration.
5. Run the app tests, browser smoke test, package dry run, tracker tests, and `git diff --check`.

### Task 6: Synchronize completed work

**Files:**
- Commit only app 099, its plans, and the root tracker changes.

1. Review the final diff and repository status for unrelated files.
2. Commit the implementation and tracker registration with focused messages.
3. Push the completed branch or integrated `main` only to GitHub `origin`.
4. Verify the remote commit and report the start time, finish time, elapsed duration, tests, deployment URL, commit, and push status.
