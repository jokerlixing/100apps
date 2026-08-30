# Trace/98 Blockchain Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a deterministic, responsive blockchain explorer that searches addresses, transactions, and blocks from a coherent local chain snapshot.

**Architecture:** Keep blockchain business rules in a browser-and-Node-compatible UMD core, keep the immutable demo snapshot separate, and let a small DOM controller render entity-specific views. Use Node's built-in test runner for zero-install unit coverage and a Chrome DevTools Protocol smoke script for true browser verification and screenshots.

**Tech Stack:** Semantic HTML, modern CSS, vanilla JavaScript, Node.js `node:test`, Chrome/Edge headless CDP, GitHub Pages.

---

### Task 1: Specify and build the explorer core

**Files:**
- Create: `apps/098-blockchain-explorer/explorer-core.test.js`
- Create: `apps/098-blockchain-explorer/explorer-core.js`

1. Write failing tests for query classification, checksummed display shortening, amount/fee formatting, entity lookup, address aggregation, and invalid snapshot references.
2. Run `node --test apps/098-blockchain-explorer/explorer-core.test.js`; expect failure because the module does not exist.
3. Implement pure functions with explicit `INVALID_QUERY`, `NOT_FOUND`, and `INVALID_SNAPSHOT` error codes.
4. Re-run the test command; expect all tests to pass.

### Task 2: Create one coherent demo chain

**Files:**
- Create: `apps/098-blockchain-explorer/chain-data.js`
- Modify: `apps/098-blockchain-explorer/explorer-core.test.js`

1. Add snapshot-integrity tests requiring unique hashes/heights and valid transaction/block/address references.
2. Define at least five consecutive blocks, eight mixed-status transactions, and six labeled addresses using immutable plain objects.
3. Run the core tests; expect integrity checks to pass.

### Task 3: Build the semantic explorer interface

**Files:**
- Create: `apps/098-blockchain-explorer/index.html`
- Create: `apps/098-blockchain-explorer/styles.css`
- Create: `apps/098-blockchain-explorer/app.js`

1. Create the navigation/status rail, universal search, sample-query controls, linked block tape, evidence sheet, recent blocks, and transaction ledger.
2. Bind search, URL history, popstate, copy actions, block/transaction/address drill-down, and precise error/empty states.
3. Implement the Ledger Paper / Blueprint / Oxide token system, notched block tape, responsive layouts, visible focus, 44px touch targets, and reduced-motion behavior.
4. Run `node --check` on all JavaScript files and re-run the core tests.

### Task 4: Add browser proof and project documentation

**Files:**
- Create: `apps/098-blockchain-explorer/qa/browser-smoke.mjs`
- Create: `apps/098-blockchain-explorer/README.md`
- Create: `apps/098-blockchain-explorer/assets/screenshot-desktop.png`
- Create: `apps/098-blockchain-explorer/assets/screenshot-mobile.png`

1. Add CDP smoke checks for initial render, all three query types, unknown and malformed queries, drill-down, URL state, copy availability, runtime errors, responsive overflow, focus, and touch sizes.
2. Run `node apps/098-blockchain-explorer/qa/browser-smoke.mjs`; expect JSON evidence and two screenshots.
3. Inspect both screenshots; fix defects and repeat until the visual proof is clean.
4. Document the product, core flows, sample queries, static-data boundary, test commands, technology, and screenshot evidence.

### Task 5: Publish code, then register completion

**Files:**
- Modify after latest-main synchronization: `index.html`
- Modify after latest-main synchronization: `qa/tracker.test.js`

1. Commit only the design, application, tests, README, and screenshot evidence.
2. Push `codex/app-098-blockchain-explorer` to GitHub `origin`.
3. Fetch `origin/main`, rebase/merge without dropping other project registrations, and update idea 98 to `Trace/98 区块链浏览器`, a specific description, and `https://jokerlixing.github.io/100apps/apps/098-blockchain-explorer/`.
4. Add tracker tests for name, description, exact URL, official completion, and stale-cache migration.
5. Run the app unit tests, browser smoke test, and full `node --test qa/*.test.js` tracker suite.
6. Commit the tracker update and push the integrated branch to `origin/main`; if rejected, re-sync, preserve concurrent entries, re-run tests, and retry.
7. Verify remote commit ancestry and the deployed GitHub Pages URL before final reporting.
