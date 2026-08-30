# MUSE/95 AI Art Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency prompt-to-art studio with a persistent gallery, prompt sharing, favorites, search, PNG download, and an original AI-generated featured exhibit.

**Architecture:** Put deterministic prompt cleaning, palette selection, artwork normalization, filtering, sharing, and seeded recipe generation in a UMD `gallery-core.js`. Use `art-engine.js` for Canvas rendering and `app.js` for DOM, localStorage, clipboard/download, filters, and responsive interactions; store recipes rather than image data.

**Tech Stack:** Semantic HTML, native CSS, native JavaScript, Canvas 2D, localStorage, Clipboard/Blob APIs, Node `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define and test gallery recipes

**Files:**
- Create: `apps/095-ai-art-gallery/gallery-core.test.js`
- Create: `apps/095-ai-art-gallery/gallery-core.js`

**Steps:**
1. Write failing tests for prompt cleaning, style/ratio normalization, deterministic hashing and seeded random values, keyword palettes, artwork repair, user-gallery limits, favorites, filters, search, canvas sizing, and prompt-share text.
2. Run `node --test apps/095-ai-art-gallery/gallery-core.test.js` and confirm the missing module failure.
3. Implement the pure UMD module with no DOM dependencies.
4. Re-run tests and `node --check apps/095-ai-art-gallery/gallery-core.js`; require all checks to pass.

### Task 2: Implement the Canvas art engine and studio UI

**Files:**
- Create: `apps/095-ai-art-gallery/art-engine.js`
- Create: `apps/095-ai-art-gallery/index.html`
- Create: `apps/095-ai-art-gallery/styles.css`
- Create: `apps/095-ai-art-gallery/app.js`
- Add: `apps/095-ai-art-gallery/assets/floating-library.png`

**Steps:**
1. Copy the selected built-in imagegen output into the project assets folder without altering the source file.
2. Implement five Canvas render strategies from deterministic recipes; do not load remote URLs or use `Math.random` for artwork pixels.
3. Build the prompt studio, style filmstrip, aspect controls, live artwork stage, generation status, action controls, gallery filters/search, artwork cards, empty state, toast, and accessibility announcements.
4. Implement creation, seed variation, persistent user recipes, favorites, search/filter, copy fallback, PNG download, and reset of studio controls.
5. Run syntax checks for all JavaScript files.

### Task 3: Verify real browser behavior and document the project

**Files:**
- Create: `apps/095-ai-art-gallery/qa/browser-smoke.mjs`
- Create: `apps/095-ai-art-gallery/README.md`
- Generate: `apps/095-ai-art-gallery/assets/screenshot-desktop.png`
- Generate: `apps/095-ai-art-gallery/assets/screenshot-mobile.png`

**Steps:**
1. Build a dependency-free Chrome DevTools Protocol smoke test and local static server.
2. Verify generation, deterministic canvas output, new gallery card, persistence after reload, favorite/filter/search, share copy fallback, download trigger, no runtime errors, desktop split layout, mobile single-column layout, no horizontal overflow, focus style, and 44px controls.
3. Capture 1440px desktop and 390px mobile screenshots, inspect both, fix visual issues, and repeat until clean.
4. Document features, local run/deployment URLs, generation boundary, image provenance, privacy, tests, and technical stack.

### Task 4: Publish code first, then register completion

**Files:**
- Modify after refreshing remote state: `index.html`
- Modify: `qa/tracker.test.js`

**Steps:**
1. Commit only the MUSE/95 project and its plan documents. Integrate onto the latest GitHub `origin/main`, run project verification, and push the code-only result without force.
2. Fetch latest `origin/main` again using command-scoped proxy configuration and preserve every parallel project registration.
3. Register app 095 as `AI 绘画广场`, description beginning `MUSE/95`, GitHub Pages URL, and official done id; add identity/link/status and stale-cache migration tests.
4. Run tracker and project tests, commit only tracker files, push without force, and confirm the pushed remote commit equals the local publish commit.

