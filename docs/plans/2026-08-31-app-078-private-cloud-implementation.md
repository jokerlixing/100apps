# DEPOT/78 Private Cloud Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first private file depot with real browser file storage, folders, preview/download, local share links, trash, and auditable quota management.

**Architecture:** A zero-dependency UMD domain module owns deterministic file and quota rules. A small IndexedDB adapter persists Blobs and metadata, while a semantic browser controller renders an archive-ledger interface and treats public deployment as an honest same-browser local vault.

**Tech Stack:** Semantic HTML, native CSS and JavaScript, IndexedDB, Blob/File APIs, `node:test`, and Chrome DevTools Protocol.

---

### Task 1: Define the file-depot domain with tests

**Files:**
- Create: `apps/078-private-cloud/file-core.test.js`
- Create: `apps/078-private-cloud/file-core.js`

**Step 1: Write the failing test**

Cover safe file names, stable type groups, byte labels, same-folder duplicate naming, logical quota rejection, usage segments, filter/sort behavior, share-token shape, and expiry checks.

**Step 2: Run test to verify it fails**

Run: `node --test apps/078-private-cloud/file-core.test.js`
Expected: FAIL because `file-core.js` does not exist.

**Step 3: Write the minimal implementation**

Export `LIMIT_BYTES`, `safeName`, `classifyFile`, `formatBytes`, `uniqueName`, `validateBatch`, `buildUsage`, `filterAndSort`, `createShare`, and `shareIsActive`. Accept injected time and randomness for deterministic tests.

**Step 4: Run test to verify it passes**

Run: `node --test apps/078-private-cloud/file-core.test.js`
Expected: all domain tests PASS.

### Task 2: Persist real files in IndexedDB

**Files:**
- Create: `apps/078-private-cloud/storage.js`
- Create: `apps/078-private-cloud/app.js`

**Step 1: Define a versioned storage adapter**

Create `files`, `folders`, and `settings` object stores. Expose list/get/put/delete functions and a transaction helper that reports stable, user-facing storage errors.

**Step 2: Add deterministic first-visit seed data**

Write three small text Blobs and two folders only when the database is empty. Preserve all existing records on later visits.

**Step 3: Implement state transitions**

Support batch upload, folder creation, selection, preview URL cleanup, download, share creation/revocation, soft delete, restore, permanent delete, filters, search, and sorting. Enforce the domain quota before writing.

**Step 4: Run syntax and domain checks**

Run: `node --check apps/078-private-cloud/storage.js`
Run: `node --check apps/078-private-cloud/app.js`
Run: `node --test apps/078-private-cloud/file-core.test.js`
Expected: all commands exit 0.

### Task 3: Build the responsive archive interface

**Files:**
- Create: `apps/078-private-cloud/index.html`
- Create: `apps/078-private-cloud/styles.css`

**Step 1: Create semantic landmarks**

Add the privacy boundary, cabinet navigation, upload drop zone, search/sort toolbar, file ledger, capacity ruler, inspector, folder/share/confirmation dialogs, mobile inspector, toast, and screen-reader live region.

**Step 2: Apply the design system**

Use only the archive palette, condensed display type, ledger structure, capacity-ruler signature, visible focus states, reduced-motion behavior, and responsive layout from the design document.

**Step 3: Wire accessible behavior**

Use native buttons, labels, dialog focus return, row keyboard activation, meaningful empty/error states, and 44px mobile targets. Avoid external assets and fonts.

**Step 4: Run static checks**

Run: `node --check apps/078-private-cloud/file-core.js`
Run: `node --check apps/078-private-cloud/storage.js`
Run: `node --check apps/078-private-cloud/app.js`
Expected: all commands exit 0.

### Task 4: Add browser acceptance and documentation

**Files:**
- Create: `apps/078-private-cloud/qa/browser-smoke.mjs`
- Create: `apps/078-private-cloud/README.md`
- Create: `apps/078-private-cloud/assets/screenshot-desktop.png`
- Create: `apps/078-private-cloud/assets/screenshot-mobile.png`

**Step 1: Implement a temporary-profile CDP smoke test**

Serve the app locally, launch a temporary Chrome profile, upload an in-memory file through the real input, verify persisted metadata and preview, create a folder and share, recycle and restore the file, refresh, force a small quota rejection, check keyboard focus and runtime errors, and capture 1440px/390px screenshots.

**Step 2: Document truthful storage boundaries**

Explain IndexedDB storage, same-browser share links, quota semantics, supported previews, privacy limitations, data reset, keyboard behavior, local serving, Pages URL, and test commands.

**Step 3: Run browser and static verification**

Run: `node apps/078-private-cloud/qa/browser-smoke.mjs`
Run: `node --test apps/078-private-cloud/file-core.test.js`
Run: `git diff --check`
Expected: smoke assertions and tests PASS, screenshots exist, no overflow or runtime errors are reported, and the diff is clean.

### Task 5: Integrate App 078 and synchronize GitHub

**Files:**
- Modify: `qa/tracker.test.js`
- Modify: `index.html`

**Step 1: Add the failing tracker assertions**

Assert the 78th idea name, DEPOT/78 description, `https://jokerlixing.github.io/100apps/apps/078-private-cloud/` URL, and official completion state. Confirm the test fails before editing the tracker.

**Step 2: Update the latest tracker**

Re-fetch `origin`, verify no parallel tracker changes are missing, then update only the 78th idea and append ID 78 to `INIT_DONE` without disturbing other records.

**Step 3: Run the full verification set**

Run: `node --test apps/078-private-cloud/file-core.test.js qa/tracker.test.js`
Run: `node apps/078-private-cloud/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS with no runtime errors or overflow.

**Step 4: Review and commit focused changes**

Inspect the complete diff, verify no database/profile artifacts or secrets are tracked, then create focused commits for the domain/UI and docs/tracker/QA.

**Step 5: Push only to GitHub**

Push the completed branch to `origin`, fast-forward `main` to the verified commits, and push `main` only to `origin`. Do not push `gitee` or any other remote.

**Step 6: Verify synchronization and record finish time**

Confirm local `main`, `origin/main`, and the completion commit match; inspect final status; record the finish timestamp and elapsed duration from the first implementation command through GitHub synchronization.

