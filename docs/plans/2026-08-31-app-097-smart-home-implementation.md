# HABITAT/97 Smart Home Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a zero-dependency smart-home control center with room navigation, simulated devices, linked scenes, automations, energy feedback, and persistent browser state.

**Architecture:** Keep deterministic domain behavior in a UMD-style `smart-home-core.js` module that runs in Node tests and the browser. Render the app from one serializable state object in `app.js`, persist it to localStorage, and keep the HTML/CSS as a GitHub Pages-compatible static shell.

**Tech Stack:** Semantic HTML, modern CSS, vanilla JavaScript, Node.js built-in test runner, Playwright-compatible browser smoke test.

---

### Task 1: Create and test the domain model

**Files:**
- Create: `apps/097-smart-home-control/smart-home-core.test.js`
- Create: `apps/097-smart-home-control/smart-home-core.js`

**Steps:**
1. Write failing tests for fresh defaults, safe device patches, scene linkage, energy metrics, automation evaluation, and cache hydration.
2. Run `node --test apps/097-smart-home-control/smart-home-core.test.js` and confirm the module-not-found failure.
3. Implement immutable state helpers, scene recipes, derived metrics, rule evaluation, and defensive hydration.
4. Re-run the test and require all cases to pass.
5. Run `node --check apps/097-smart-home-control/smart-home-core.js`.

### Task 2: Build the semantic application shell

**Files:**
- Create: `apps/097-smart-home-control/index.html`
- Create: `apps/097-smart-home-control/styles.css`

**Steps:**
1. Add semantic regions for home status, scenes, floor plan, device controls, energy view, automation rules, activity, toast, and reset confirmation.
2. Implement the architectural daylight token system, responsive three-column layout, interactive room plan, visible focus states, and reduced-motion behavior.
3. Confirm the document contains a useful title, viewport, descriptions, labels, live region, and keyboard-reachable controls.
4. Check mobile CSS at 390px and desktop CSS at 1440px.

### Task 3: Wire interactions and persistence

**Files:**
- Create: `apps/097-smart-home-control/app.js`

**Steps:**
1. Render all regions from the core state and bind event delegation for scenes, rooms, devices, rule toggles, demo alert, and reset.
2. Persist every accepted change to namespaced localStorage and recover safely from missing or malformed data.
3. Add device-specific controls for switches, sliders, thermostat, curtain position, and lock state.
4. Add scene pulse choreography, updated metrics, energy graph, action history, and accessible toast announcements.
5. Run `node --check apps/097-smart-home-control/app.js`.

### Task 4: Add project documentation and browser verification

**Files:**
- Create: `apps/097-smart-home-control/README.md`
- Create: `apps/097-smart-home-control/qa/browser-smoke.mjs`
- Create: `apps/097-smart-home-control/assets/screenshot-desktop.png`
- Create: `apps/097-smart-home-control/assets/screenshot-mobile.png`

**Steps:**
1. Document capabilities, run instructions, privacy/simulation boundaries, keyboard support, and exact verification commands.
2. Write a browser test that starts a temporary local server and isolated browser profile.
3. Exercise scene changes, room filtering, device control, persistence after reload, demo automation, reset, responsive layouts, and runtime-error capture.
4. Save desktop and mobile screenshots and inspect both for overflow, clipped text, contrast, and misleading states.
5. Re-run the complete app test set.

### Task 5: Publish app 097 in the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Steps:**
1. Fetch `origin/main` and merge the newest tracker state before editing.
2. Remove any stale merge-conflict markers without dropping either project 078 or project 080 completion state.
3. Replace app 097 with `HABITAT/97` final copy and `https://jokerlixing.github.io/100apps/apps/097-smart-home-control/`.
4. Mark 97 officially complete in `INIT_DONE`.
5. Add a focused tracker test for app number, name, description, URL, and completion state.
6. Run `node --test qa/tracker.test.js` and the app tests.

### Task 6: Commit and synchronize GitHub

**Files:**
- Commit all app 097, plan, screenshot, tracker, and test files.

**Steps:**
1. Review `git diff --check`, `git status --short`, and the scoped diff.
2. Commit with a project-specific message.
3. Fetch and integrate the newest `origin/main`; re-run tracker and app verification after conflict resolution.
4. Push only to GitHub with `git push origin HEAD:main`.
5. Verify `origin/main` contains the commit and that local tests still pass.
