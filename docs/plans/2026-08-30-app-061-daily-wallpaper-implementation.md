# App 061 Daily Wallpaper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive daily-wallpaper homepage that loads the latest eight Bing images, supports favorites and a pinned homepage background, and remains fully usable with an explicit offline fallback.

**Architecture:** Put normalization, sorting, storage transitions, date formatting, and cache merging in a dependency-free UMD core module so Node can test every state rule. Keep network requests, localStorage, image preloading, keyboard controls, downloads, clipboard behavior, and DOM rendering in a browser controller; ship semantic HTML and handcrafted CSS with no build step.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Fetch API, localStorage, Clipboard API, Node.js built-in test runner.

---

### Task 1: Define wallpaper and storage behavior with TDD

**Files:**
- Create: `apps/061-daily-wallpaper/wallpaper-core.test.js`
- Create: `apps/061-daily-wallpaper/wallpaper-core.js`

**Step 1: Write failing tests**

Cover `normalizeWallpaper`, `normalizeCollection`, `formatDisplayDate`, `toggleFavorite`, `selectHomepage`, `mergeWithCache`, and malformed or duplicate records.

**Step 2: Run red**

Run: `node --test apps/061-daily-wallpaper/wallpaper-core.test.js`
Expected: FAIL because `wallpaper-core.js` does not exist.

**Step 3: Implement the dependency-free core**

Export through CommonJS and `window.WallpaperCore`. Accept only HTTPS image URLs, derive stable IDs from date and URL, preserve explicit source labels, and return new state values rather than mutating inputs.

**Step 4: Run green**

Run: `node --test apps/061-daily-wallpaper/wallpaper-core.test.js`
Expected: all tests PASS.

### Task 2: Build the LUMEN/61 interface

**Files:**
- Create: `apps/061-daily-wallpaper/index.html`
- Create: `apps/061-daily-wallpaper/styles.css`

**Step 1: Add semantic structure**

Create a skip link, masthead and source status, full-bleed image stage, descriptive caption, three primary actions, eight-day filmstrip, favorites drawer, homepage instructions dialog, live status region, and useful loading/error/empty states.

**Step 2: Implement the darkroom visual system**

Use the documented six-color palette, restrained compressed typography, real film perforations tied to the date strip, readable overlays, visible keyboard focus, 44px touch targets, responsive mobile composition, and reduced-motion overrides.

**Step 3: Run structural checks**

Verify one `h1`, labelled buttons/dialogs, no inline event handlers, and no fixed width that forces horizontal scrolling at 390px.

### Task 3: Connect live data, persistence, and actions

**Files:**
- Create: `apps/061-daily-wallpaper/app.js`
- Modify: `apps/061-daily-wallpaper/index.html`

**Step 1: Add live and fallback adapters**

Request indices 0–7 from `https://bing.biturl.top/` with a timeout and `Promise.allSettled`. Normalize successful records, merge cached records, and use labelled curated fallbacks only when no live or cached records exist.

**Step 2: Implement selection and preloading**

Render the selected image and filmstrip, preload adjacent images, preserve selection during refresh, and recover from broken image URLs without an infinite retry loop.

**Step 3: Implement favorites and homepage state**

Persist only favorite IDs, pinned homepage ID, and last good metadata. Restore valid entries, prune orphaned IDs, and announce every change through the live region.

**Step 4: Implement keyboard, download, and clipboard actions**

Support left/right and `F`, create an explicit original-image download link, copy the deployed page URL when possible, and keep a manual-copy fallback in the homepage dialog.

**Step 5: Run unit and syntax checks**

Run: `node --test apps/061-daily-wallpaper/wallpaper-core.test.js`
Run: `node --check apps/061-daily-wallpaper/wallpaper-core.js`
Run: `node --check apps/061-daily-wallpaper/app.js`
Expected: PASS / exit 0.

### Task 4: Document and integrate challenge metadata

**Files:**
- Create: `apps/061-daily-wallpaper/README.md`
- Modify: `index.html`

**Step 1: Document behavior and limitations**

Explain the live source, labelled fallback, browser-homepage limitation, local-only storage, keyboard controls, copyright attribution, test command, and supported browser features.

**Step 2: Mark app 061 complete in the tracker**

Add the GitHub Pages URL and concise `LUMEN/61` description without changing completion state for apps 052–060.

### Task 5: Verify, review, and synchronize

**Files:**
- Verify all files above.

**Step 1: Run static verification**

Run tests, syntax checks, `git diff --check`, link/path assertions, and inspect the exact diff.

**Step 2: Run browser verification**

Serve the worktree locally. Validate live and forced-offline paths, all eight days, keyboard navigation, favorites, persistence, download/copy actions, dialogs, image fallback, 1280px desktop and 390px mobile layouts, accessibility focus, and console output.

**Step 3: Create focused commits**

Commit plan, tests, implementation, docs, and tracker changes only on `codex/app-061-daily-wallpaper`.

**Step 4: Push GitHub only**

Push the completed branch only to `origin`, verify the remote commit hash, and do not push to Gitee or another remote.
