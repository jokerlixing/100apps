# COUNTER/72 Full-stack Shop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static-first weekend design market with trusted cart totals, pickup checkout, persistent orders, and an auditable fulfillment queue.

**Architecture:** A zero-dependency UMD core owns products, cart rules, validation, totals, order serialization, and state transitions. The browser uses a localStorage adapter for GitHub Pages and upgrades to a Node modular-monolith API backed by an atomic JSON-file repository when available; the server always recalculates totals and scopes orders by an opaque demo shop key.

**Tech Stack:** Semantic HTML, native CSS and JavaScript, Node.js built-in HTTP/File APIs, localStorage, native `<dialog>`, `node:test`, and Chrome DevTools Protocol.

---

### Task 1: Define the shop domain with tests

**Files:**
- Create: `apps/072-fullstack-shop/shop-core.test.js`
- Create: `apps/072-fullstack-shop/shop-core.js`

**Step 1: Write failing tests**

Cover product catalog shape, cart row cleaning and merging, stock caps, trusted subtotal/shipping/total calculations, checkout validation, order creation, safe public serialization, idempotency, shop-key scoping, and allowed/cancelled status transitions.

**Step 2: Run the red test**

Run: `node --test apps/072-fullstack-shop/shop-core.test.js`
Expected: FAIL because `shop-core.js` does not exist.

**Step 3: Implement the minimal pure domain module**

Export `PRODUCTS`, `cleanCart`, `calculateTotals`, `validateCheckout`, `createOrder`, `publicOrder`, `findIdempotentOrder`, `canTransition`, and `transitionOrder`. Accept injected clocks/random values in order creation so tests remain deterministic. Never trust client product names or prices.

**Step 4: Run the core tests**

Run: `node --test apps/072-fullstack-shop/shop-core.test.js`
Expected: all core tests PASS.

### Task 2: Build the responsive market interface

**Files:**
- Create: `apps/072-fullstack-shop/index.html`
- Create: `apps/072-fullstack-shop/styles.css`
- Create: `apps/072-fullstack-shop/app.js`

**Step 1: Create semantic page landmarks**

Add a market header, stall filters, product shelf, persistent perforated pickup ticket, checkout dialog, order desk, offline/server status, toast status region, and mobile ticket controls. Keep all primary actions as real buttons and all form controls labeled.

**Step 2: Implement the design tokens and responsive layout**

Use only the palette, type roles, folding-stall layout, receipt signature, focus behavior, reduced motion, and mobile behavior specified in the design document. Avoid external fonts and images so Pages stays deterministic.

**Step 3: Implement browser state and local fallback**

Support searching, stall filters, add/increment/decrement/remove, inventory limits, cart persistence, checkout validation, idempotent submission, API upgrade, local order persistence, order refresh, status advance/cancel, dialog focus return, and `?offline=1`. Keep cart contents after failed network requests.

**Step 4: Run syntax checks**

Run: `node --check apps/072-fullstack-shop/shop-core.js`
Run: `node --check apps/072-fullstack-shop/app.js`
Expected: both commands exit 0.

### Task 3: Add the persistent Node order API

**Files:**
- Create: `apps/072-fullstack-shop/server.test.js`
- Create: `apps/072-fullstack-shop/server.js`

**Step 1: Write failing API tests**

Cover static files, path traversal, products, invalid content types, oversized JSON, server-side price calculation, invalid inventory, duplicate idempotency keys, shop-key isolation, allowed/rejected transitions, cancellation, persistence across server restarts, and stable malformed-store errors.

**Step 2: Run the red service test**

Run: `node --test apps/072-fullstack-shop/server.test.js`
Expected: FAIL because `server.js` does not exist.

**Step 3: Implement the modular-monolith server**

Export `createShopServer`, `createOrderRepository`, and `resolvePublicFile`. Serve an explicit asset allowlist, parse bodies up to 32 KiB, use stable JSON errors, serialize repository mutations, write through a same-directory temporary file plus rename, and use `ORDER_STORE_PATH` only when the caller does not inject a repository.

**Step 4: Run service and combined tests**

Run: `node --test apps/072-fullstack-shop/shop-core.test.js apps/072-fullstack-shop/server.test.js`
Expected: all tests PASS.

### Task 4: Document and integrate App 072

**Files:**
- Create: `apps/072-fullstack-shop/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest modes and limits**

Explain static local orders, Node JSON persistence, environment variables, no real payment/authentication, privacy boundaries, storage limitations, API endpoints, keyboard access, test commands, and the GitHub Pages URL.

**Step 2: Update challenge metadata test-first**

Add tracker assertions for app 72 name, `COUNTER/72` description, deployment URL, and official completion. Run the tracker test and confirm it fails before changing the card and `INIT_DONE`.

**Step 3: Update the tracker**

Set app 72 to `全栈电商 Demo`, describe the pickup-order loop, add `https://jokerlixing.github.io/100apps/apps/072-fullstack-shop/`, and mark only ID 72 newly done.

**Step 4: Run integration tests**

Run: `node --test apps/072-fullstack-shop/shop-core.test.js apps/072-fullstack-shop/server.test.js qa/tracker.test.js`
Expected: all tests PASS.

### Task 5: Add browser acceptance and finish the branch

**Files:**
- Create: `apps/072-fullstack-shop/qa/browser-smoke.mjs`
- Create: `apps/072-fullstack-shop/assets/screenshot-desktop.png`
- Create: `apps/072-fullstack-shop/assets/screenshot-mobile.png`

**Step 1: Implement a temporary-profile CDP smoke test**

Start an injected temporary order repository, then verify product filtering, cart arithmetic, invalid checkout, successful server order, receipt contents, order transition, refresh persistence, forced local mode, 1440px and 390px layouts, no horizontal overflow, visible focus, and no runtime errors. Save both screenshots.

**Step 2: Run all static and browser checks**

Run: `node --test apps/072-fullstack-shop/shop-core.test.js apps/072-fullstack-shop/server.test.js qa/tracker.test.js`
Run: `node --check apps/072-fullstack-shop/shop-core.js`
Run: `node --check apps/072-fullstack-shop/app.js`
Run: `node --check apps/072-fullstack-shop/server.js`
Run: `node apps/072-fullstack-shop/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS, screenshots exist, both viewport checks report no overflow, no runtime errors are captured, and the diff check is clean.

**Step 3: Review and commit focused changes**

Inspect the full branch diff, confirm no generated order store or secret was added, then commit domain, interface/server, and docs/tracker/QA in auditable groups.

**Step 4: Push only to GitHub**

Run: `git push -u origin codex/app-072-fullstack-shop`
Expected: GitHub `origin` accepts the branch. Do not push to Gitee or another remote.

**Step 5: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-072-fullstack-shop`, rerun `git status --short --branch`, record the finish timestamp, and report elapsed time from the first implementation command through verification and GitHub synchronization.
