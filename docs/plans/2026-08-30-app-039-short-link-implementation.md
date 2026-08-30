# CUT/39 Short Link Service Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency local short-link manager with Hash routing, click recording, search, filters, and seven-day analytics.

**Architecture:** Keep the app in one HTML file for GitHub Pages. Store a normalized link directory and click events in versioned localStorage, route `#go=<slug>` to a safe redirect gate, and derive every dashboard metric from the same local state.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, localStorage, URL, History and Clipboard browser APIs.

---

### Task 1: Build the routing-workbench shell

**Files:**
- Create: `apps/039-short-link/index.html`

**Steps:**
1. Add the CUT/39 header, hero cutter form, output ticket, summary metrics, link library, analytics rail, redirect gate and toast region.
2. Add the named visual tokens, perforated-label treatment and responsive breakpoints.
3. Verify one H1, labelled controls, visible focus states and reduced-motion handling.

### Task 2: Implement validation and link creation

**Files:**
- Modify: `apps/039-short-link/index.html`

**Steps:**
1. Add normalized sample links and a versioned localStorage state.
2. Implement safe http/https URL parsing, slug normalization, automatic aliases and duplicate resolution.
3. Add create and edit flows with inline actionable errors.
4. Verify invalid schemes, duplicate custom aliases and malicious display text cannot create executable HTML.

### Task 3: Implement routing, management and analytics

**Files:**
- Modify: `apps/039-short-link/index.html`

**Steps:**
1. Parse `#go=<slug>`, record exactly one click per route load and render a redirect gate.
2. Add copy, open-test, search, tag filtering and two-step deletion.
3. Derive total, today, seven-day, per-link and top-link analytics from click events.
4. Verify route refresh behavior, filtering, editing, chart values and delete arming in a browser.

### Task 4: Document and register App #039

**Files:**
- Create: `apps/039-short-link/README.md`
- Modify: `index.html`

**Steps:**
1. Document features, static-hosting boundary, data model and visual direction.
2. Add the GitHub Pages URL to the App #039 tracker entry.
3. Add 39 to `INIT_DONE` so the tracker renders 39/100.
4. Run a source check for 39 consecutive completion ids and the App #039 link.

### Task 5: Verify and deliver

**Files:**
- Verify: `apps/039-short-link/index.html`
- Verify: `index.html`

**Steps:**
1. Run script syntax, duplicate-id, typed-button and tracker checks.
2. Serve locally and test create, validation, copy, routing, click recording, filters and analytics.
3. Test the 390px layout and inspect browser console errors.
4. Run `git diff --check`, commit the App #039 files and push only `origin/main`.
5. Match the local commit with GitHub and verify both Pages URLs expose the new content.
