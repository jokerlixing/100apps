# THREADLINE/73 Forum Community Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static-first creator critique forum with local demo identities, persistent server accounts, topic publishing, quoted replies, likes, bookmarks, and a complete public Pages experience.

**Architecture:** A zero-dependency UMD core owns validation, normalized public models, sorting, and interaction rules. The browser controller talks to either a localStorage adapter or a Node built-in HTTP API backed by an atomically rewritten JSON repository; server sessions determine authorship and all public responses are serialized through explicit field pickers.

**Tech Stack:** Semantic HTML, native CSS and JavaScript, Node.js built-in HTTP/Crypto/File APIs, localStorage, native `<dialog>`, `node:test`, and Chrome DevTools Protocol.

---

### Task 1: Build and test the forum domain

**Files:**
- Create: `apps/073-forum-community/forum-core.test.js`
- Create: `apps/073-forum-community/forum-core.js`

**Step 1: Write failing domain tests**

Cover user/profile validation, topic validation, comment and quote validation, safe public serialization, newest/hot/unanswered sorting, like/bookmark toggles, authorship checks, and deterministic ID generation.

**Step 2: Run the red test**

Run: `node --test apps/073-forum-community/forum-core.test.js`
Expected: FAIL because `forum-core.js` does not exist.

**Step 3: Implement the minimal pure module**

Export `SEED_USERS`, `SEED_POSTS`, `normalizeRegistration`, `normalizeProfile`, `normalizePostInput`, `normalizeCommentInput`, `createPost`, `createComment`, `toggleReaction`, `publicUser`, `publicPost`, `sortPosts`, and `canEdit`. Accept injected clocks and ID factories so tests remain deterministic. Throw stable domain errors with a `code` property.

**Step 4: Run the domain tests**

Run: `node --test apps/073-forum-community/forum-core.test.js`
Expected: all domain tests PASS.

### Task 2: Build the responsive static-first interface

**Files:**
- Create: `apps/073-forum-community/index.html`
- Create: `apps/073-forum-community/styles.css`
- Create: `apps/073-forum-community/app.js`

**Step 1: Create semantic landmarks and dialogs**

Add identity/mode header, searchable tag and sort controls, thread list, profile ticket, community notes, topic detail drawer, authentication dialog, publish dialog, reply composer, toast region, and mobile identity controls. Use real buttons and associated labels.

**Step 2: Implement the THREADLINE visual system**

Derive every color and type role from the design document. Build the sequential thread line, pinned critique cards, restrained quote connectors, responsive sidebar collapse, visible focus, reduced motion, and no external font or image dependency.

**Step 3: Implement adapters and browser interactions**

Support API bootstrap with honest local fallback, local identity creation/switching, server registration/login/logout, search/tag/sort, publish, detail opening, comments, quote selection, likes, bookmarks, profile summaries, draft preservation, local persistence, and `?offline=1`.

**Step 4: Run syntax checks**

Run: `node --check apps/073-forum-community/forum-core.js`
Run: `node --check apps/073-forum-community/app.js`
Expected: both commands exit 0.

### Task 3: Add the persistent Node API

**Files:**
- Create: `apps/073-forum-community/server.test.js`
- Create: `apps/073-forum-community/server.js`

**Step 1: Write failing API tests**

Cover static files and traversal rejection; bootstrap; registration validation and duplicates; scrypt password login; opaque sessions; logout; protected publishing and replies; quote validity; like and bookmark toggles; author isolation; body limits; idempotent writes; and persistence across repository reloads.

**Step 2: Run the red service test**

Run: `node --test apps/073-forum-community/server.test.js`
Expected: FAIL because `server.js` does not exist.

**Step 3: Implement the modular-monolith service**

Export `createForumServer`, `createForumRepository`, `hashPassword`, `verifyPassword`, and `resolvePublicFile`. Serve an explicit asset allowlist, parse JSON up to 48 KiB, accept bearer sessions, serialize repository writes, atomically rewrite a configurable JSON file, return stable JSON errors, and never expose password or session records.

**Step 4: Run combined tests**

Run: `node --test apps/073-forum-community/forum-core.test.js apps/073-forum-community/server.test.js`
Expected: all tests PASS.

### Task 4: Document and browser-verify the application

**Files:**
- Create: `apps/073-forum-community/README.md`
- Create: `apps/073-forum-community/qa/browser-smoke.mjs`
- Create: `apps/073-forum-community/assets/screenshot-desktop.png`
- Create: `apps/073-forum-community/assets/screenshot-mobile.png`

**Step 1: Document modes, privacy, API, limits, and commands**

Explain the Pages/local identity path, Node registration/session path, JSON single-process boundary, lack of production moderation/email recovery, storage keys, environment variables, keyboard access, test commands, and public URL.

**Step 2: Implement a temporary-profile browser acceptance test**

Use the installed Chrome/Edge executable and CDP with a temporary profile. Verify local identity creation, publishing, filters, likes, bookmarks, quoted reply, reload persistence, Node registration/login, 1440px and 390px layouts, no overflow, visible focus, and no uncaught runtime error. Write deterministic screenshots.

**Step 3: Run all app checks**

Run: `node --test apps/073-forum-community/forum-core.test.js apps/073-forum-community/server.test.js`
Run: `node apps/073-forum-community/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: tests and browser flows PASS, screenshots exist, and the diff is clean.

### Task 5: Synchronize project code, then the root tracker

**Files:**
- Modify after project push: `index.html`
- Modify after project push: `qa/tracker.test.js`

**Step 1: Commit and push project-only code**

Fetch GitHub `origin`, rebase the focused app commit if necessary, then push `main` only to `origin`. Verify local `HEAD` equals `origin/main`; do not push Gitee.

**Step 2: Refresh the tracker baseline and write the failing assertion**

Pull or verify the latest `origin/main`, then add assertions for app 73 name, `THREADLINE/73` description, `https://jokerlixing.github.io/100apps/apps/073-forum-community/`, and official done state. Run `node --test qa/tracker.test.js` and confirm the new assertion fails.

**Step 3: Update tracker metadata and migrate stale caches**

Change only idea 73 and add only ID 73 to `INIT_DONE`; retain every previously published app and allow `syncOfficial()` to overwrite stale local metadata.

**Step 4: Run final verification**

Run: `node --test apps/073-forum-community/forum-core.test.js apps/073-forum-community/server.test.js qa/tracker.test.js`
Run: `node apps/073-forum-community/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS and browser evidence remains valid.

**Step 5: Commit and push tracker-only changes**

Fetch/rebase on GitHub `origin/main` if needed, commit the tracker test and metadata, push only to `origin`, verify local/remote hashes and clean status, then record the finish timestamp and elapsed duration.
