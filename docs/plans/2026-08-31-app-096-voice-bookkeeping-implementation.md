# TALLY/96 Voice Bookkeeping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first voice bookkeeping app that turns a Chinese utterance into an editable transaction, persists a ledger, summarizes the month, and exports trustworthy data.

**Architecture:** Use a zero-dependency static application. Keep deterministic parsing and ledger calculations in a UMD domain module, browser persistence in a small storage adapter, and DOM/Web Speech orchestration in the UI module so logic can be tested with Node without a browser.

**Tech Stack:** Semantic HTML, native CSS, native JavaScript, Web Speech API, localStorage, Blob downloads, Node `node:test`, Chrome DevTools Protocol.

---

### Task 1: Build and test the bookkeeping domain

**Files:**
- Create: `apps/096-voice-bookkeeping/bookkeeping-core.test.js`
- Create: `apps/096-voice-bookkeeping/bookkeeping-core.js`

**Steps:**
1. Add failing tests for Chinese/Arabic amounts, transaction type, categories, accounts, dates, validation, summaries, filters and CSV escaping.
2. Run `node --test apps/096-voice-bookkeeping/bookkeeping-core.test.js` and confirm the missing module failure.
3. Implement pure parsing and ledger functions with explicit error and confidence metadata.
4. Run the test again and require all cases to pass.

### Task 2: Add safe local persistence

**Files:**
- Create: `apps/096-voice-bookkeeping/storage.js`
- Test: `apps/096-voice-bookkeeping/bookkeeping-core.test.js`

**Steps:**
1. Add tests for malformed and oversized stored data through the exported normalization helpers.
2. Implement versioned load/save/reset behavior, capped to 500 normalized records.
3. Run the domain suite and JavaScript syntax checks.

### Task 3: Build the receipt-counter interface

**Files:**
- Create: `apps/096-voice-bookkeeping/index.html`
- Create: `apps/096-voice-bookkeeping/styles.css`
- Create: `apps/096-voice-bookkeeping/app.js`

**Steps:**
1. Build semantic regions for capture, parse receipt, monthly totals, category tape, filters and ledger.
2. Connect text/demo input, optional SpeechRecognition, editable fields, save/update/delete, filters, empty states and toasts.
3. Add CSV/JSON export, demo reset and accessible dialogs/confirmation behavior.
4. Verify `node --check` for every script and manually serve the static route.

### Task 4: Document and browser-test the complete flow

**Files:**
- Create: `apps/096-voice-bookkeeping/README.md`
- Create: `apps/096-voice-bookkeeping/qa/browser-smoke.mjs`
- Create: `apps/096-voice-bookkeeping/assets/screenshot-desktop.png`
- Create: `apps/096-voice-bookkeeping/assets/screenshot-mobile.png`

**Steps:**
1. Add a CDP smoke test that starts an isolated static server and temporary browser profile.
2. Exercise parse, correction, save, edit, delete, filter, persistence and CSV download flows.
3. Assert desktop/mobile overflow, 44px touch controls, keyboard focus, reduced motion and zero runtime exceptions.
4. Generate and visually inspect both screenshots; fix defects and rerun until clean.
5. Document features, local run instructions, privacy limits, test commands and the generated screenshots.

### Task 5: Commit and publish the application

**Files:**
- Add only: `docs/plans/2026-08-31-app-096-*`
- Add only: `apps/096-voice-bookkeeping/**`

**Steps:**
1. Run all domain, syntax and browser tests plus `git diff --check`.
2. Inspect the exact staged file list and scan for secrets or temporary artifacts.
3. Commit the isolated application changes.
4. Fetch and merge the latest `origin/main`, resolve only additive parallel changes, rerun tests, then push `HEAD:main` to GitHub `origin`.

### Task 6: Register and publish the tracker entry

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Steps:**
1. Fetch and merge the latest `origin/main` before editing the tracker.
2. Add a failing tracker test for app number 96, final name/description, Pages URL and official done status.
3. Update only the 96th idea and `INIT_DONE`, preserving every parallel project entry.
4. Run app and tracker suites, syntax checks, browser smoke and `git diff --check`.
5. Commit the tracker files, fetch/merge once more, and push `HEAD:main` to GitHub `origin`.
6. Verify remote commit ancestry and the deployed Pages URL before reporting completion.
