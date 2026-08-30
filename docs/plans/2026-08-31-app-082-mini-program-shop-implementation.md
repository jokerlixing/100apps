# App 082 Mini Program Shop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub Pages-compatible mini-program shop simulator that completes browsing, cart, checkout, simulated payment, and local order history.

**Architecture:** Keep business rules in a DOM-free UMD module shared by Node tests and the browser. Render a responsive single-page storefront with native JavaScript, persist user state in `localStorage`, and exercise the actual interface with a Chromium CDP smoke test.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, Node.js built-in test runner, Node HTTP server, Chromium DevTools Protocol.

---

### Task 1: Define and test the commerce core

**Files:**
- Create: `apps/082-mini-program-shop/shop-core.test.js`
- Create: `apps/082-mini-program-shop/shop-core.js`

**Steps:**

1. Write failing tests for cart item merging, inventory limits, free-shipping threshold, `WELCOME12`, checkout validation, and deterministic order creation.
2. Run `node --test apps/082-mini-program-shop/shop-core.test.js`; expect failure because the module does not exist.
3. Implement integer-cent helpers, `setCartQuantity`, `calculateCart`, `validateCheckout`, and `createOrder` in a UMD module.
4. Run the test file again and expect all tests to pass.
5. Commit the core and tests with `test: add app 082 commerce core`.

### Task 2: Build the storefront shell and visual system

**Files:**
- Create: `apps/082-mini-program-shop/index.html`
- Create: `apps/082-mini-program-shop/styles.css`

**Steps:**

1. Add semantic regions for storefront header, category/search controls, product shelf, desktop receipt rail, mobile tab bar, cart dialog, product dialog, checkout dialog, success dialog, and live status.
2. Define the six-color “云岫山货铺” token system, deliberate type roles, responsive grid, paper receipt motif, focus states, reduced motion, and mobile safe-area behavior.
3. Use inline SVG product art placeholders so the published experience has no external image dependency.
4. Open the static shell at desktop and mobile widths to check structure before wiring behavior.
5. Commit the shell with `feat: build app 082 storefront shell`.

### Task 3: Implement interaction and persistence

**Files:**
- Create: `apps/082-mini-program-shop/app.js`
- Modify: `apps/082-mini-program-shop/index.html`

**Steps:**

1. Add eight realistic catalog products with categories, prices, inventory, tags, descriptions, origin notes, and SVG palettes.
2. Implement search, category filtering, product details, favorite toggles, cart quantity controls, cart drawer, and desktop receipt synchronization.
3. Implement checkout validation, address saving, coupon feedback, delivery choice, payment simulation, success receipt, and order history.
4. Persist cart, address, favorites, and orders with defensive JSON parsing and visible fallback when storage fails.
5. Run `node --check` for both JavaScript files and rerun the core unit tests.
6. Commit the interaction with `feat: complete app 082 shopping flow`.

### Task 4: Add runtime documentation and browser verification

**Files:**
- Create: `apps/082-mini-program-shop/server.js`
- Create: `apps/082-mini-program-shop/README.md`
- Create: `apps/082-mini-program-shop/qa/browser-smoke.mjs`
- Create: `apps/082-mini-program-shop/assets/screenshot-desktop.png`
- Create: `apps/082-mini-program-shop/assets/screenshot-mobile.png`

**Steps:**

1. Add a zero-dependency static server with safe path handling and a documented optional port.
2. Document the experience, limitations, data/privacy model, run commands, tests, keyboard support, and screenshot links.
3. Add a Chromium CDP smoke script that starts the server, uses an isolated profile, clears storage, verifies search/cart/checkout errors/success/order history, reload persistence, responsive overflow, and console errors.
4. Run `node apps/082-mini-program-shop/qa/browser-smoke.mjs`; expect exit code 0 and both screenshots.
5. Inspect both screenshots and fix any visual or content defects before continuing.
6. Commit verification assets with `test: verify app 082 browser flow`.

### Task 5: Register App 082 in the root tracker

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Steps:**

1. Fetch `origin` and verify/merge the newest tracker state before editing so parallel registrations are preserved.
2. Add a failing tracker assertion for ID 82, final Chinese name, a description starting with the product codename, the GitHub Pages URL, and official done state.
3. Run `node --test qa/tracker.test.js`; expect the new assertion to fail.
4. Update only `IDEAS[81]` and append only ID 82 to `INIT_DONE`, preserving every other project entry and status.
5. Run the tracker test again and expect all assertions to pass.

### Task 6: Final verification and GitHub synchronization

**Files:**
- Verify all files under `apps/082-mini-program-shop/`
- Verify `index.html` and `qa/tracker.test.js`

**Steps:**

1. Run `node --test apps/082-mini-program-shop/shop-core.test.js qa/tracker.test.js`.
2. Run `node --check apps/082-mini-program-shop/shop-core.js`, `app.js`, `server.js`, and the browser smoke script.
3. Rerun the full browser smoke and inspect generated screenshots.
4. Check `git diff --check`, review the scoped diff, and confirm unrelated working-tree files are not staged.
5. Commit the tracker closeout, integrate the branch into the latest `main`, rerun verification, and push only GitHub `origin`.
6. Confirm `origin/main` contains the final commit and probe the GitHub Pages project URL. Report the start time, finish time, elapsed duration, tests, commit, push, and that user runtime acceptance is still pending.
