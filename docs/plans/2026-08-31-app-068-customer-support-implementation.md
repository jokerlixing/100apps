# RELAY/68 Intelligent Customer Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive customer-support console that answers from an editable FAQ knowledge base with visible intent routing, trustworthy local fallback, and optional server-side AI enhancement.

**Architecture:** Keep normalization, FAQ validation, intent scoring, answer routing, and AI-output validation in a dependency-free UMD core shared by Node tests, the browser, and the HTTP server. Render the workflow with semantic HTML/CSS/JavaScript; use a dependency-free Node server to host static assets and proxy an OpenAI-compatible request without exposing credentials.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Node.js built-in HTTP/Fetch APIs, localStorage, Clipboard API, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the support-routing domain with TDD

**Files:**
- Create: `apps/068-customer-support/support-core.test.js`
- Create: `apps/068-customer-support/support-core.js`

**Step 1: Write the failing test**

Test `normalizeText`, `tokenize`, `sanitizeFaq`, `normalizeKnowledgeBase`, `classifyIntent`, `rankFaqs`, `routeQuestion`, and `sanitizeAIReply`. Assertions must cover Chinese and English text, punctuation, intent aliases, disabled cards, stable ordering, intent/FAQ keyword weighting, low-confidence handoff, duplicate IDs, HTML removal, unknown citations, and bounded suggested replies.

**Step 2: Run the red test**

Run: `node --test apps/068-customer-support/support-core.test.js`

Expected: FAIL because `support-core.js` does not exist.

**Step 3: Implement the minimal domain module**

Export immutable helpers through CommonJS and `window.SupportCore`. Normalize at most 40 FAQ cards and 120-character questions. Score nine documented intents with phrase and token matches; score FAQ question, aliases, keywords, answer and intent with explicit weights and stable tie-breaking. Return `intent`, `confidence`, `faqIds`, `answer`, `suggestedReplies`, `needsHandoff`, and a short routing reason. Sanitize AI replies to plain text, accept only existing enabled citation IDs, and reject unverifiable responses.

**Step 4: Run green and syntax checks**

Run: `node --test apps/068-customer-support/support-core.test.js`

Run: `node --check apps/068-customer-support/support-core.js`

Expected: all tests PASS and both commands exit 0.

**Step 5: Commit the core**

Run: `git add apps/068-customer-support/support-core.js apps/068-customer-support/support-core.test.js && git commit -m "feat: add app 068 support routing core"`

### Task 2: Build the RELAY/68 interface

**Files:**
- Create: `apps/068-customer-support/index.html`
- Create: `apps/068-customer-support/styles.css`

**Step 1: Add semantic structure**

Create one `h1`, a skip link, mode status, conversation log, welcome state, quick-question buttons, composer, live region, three-stage route trace, intent/confidence panel, cited knowledge card, feedback controls, handoff action, knowledge-base search, knowledge manager dialog, and useful loading/error/empty states. Do not use inline handlers.

**Step 2: Implement the switchboard visual system**

Use the six documented tokens, enamel-paper surfaces, restrained copper patch cords, intent jacks, a calibrated confidence meter, one answer-feed animation, visible focus, 44px targets, 390px responsive layout, and reduced-motion overrides. The route trace must encode the current question, detected intent, and cited FAQ rather than acting as decoration.

**Step 3: Run structural assertions**

Run a Node assertion that reads `index.html` and checks one `h1`, required IDs, labelled controls, dialog form fields, no inline `onclick`, and script order `support-core.js` before `app.js`.

Expected: exit 0.

### Task 3: Connect local support, knowledge management, and persistence

**Files:**
- Create: `apps/068-customer-support/app.js`
- Modify: `apps/068-customer-support/index.html`

**Step 1: Add the seeded knowledge base and state**

Define at least 14 realistic Chinese-friendly FAQ cards across order, shipping, return, refund, payment, invoice, account, product, coupon, and contact intents. Keep browser state for normalized knowledge cards, recent conversation, current route, feedback counters, and the latest handoff case.

**Step 2: Implement the local conversation flow**

Support Enter-to-send, Shift+Enter newline, quick questions, visible typing state, deterministic local routing, reply suggestions, cited knowledge selection, confidence, feedback, clear conversation, and low-confidence handoff. Never imply access to real order or payment data.

**Step 3: Implement FAQ CRUD and restoration**

Add search/filter, enable/disable, add/edit/delete custom cards, validation, reset defaults, and restoration from `relay68.state.v1`. Default cards may be edited in local state but destructive reset requires a confirmation step. Restore only sanitized data and cap saved conversation length.

**Step 4: Verify syntax and core integration**

Run: `node --check apps/068-customer-support/app.js`

Run: `node --test apps/068-customer-support/support-core.test.js`

Expected: exit 0 and all tests PASS.

### Task 4: Add secure optional AI enhancement

**Files:**
- Create: `apps/068-customer-support/server.js`
- Create: `apps/068-customer-support/server.test.js`
- Modify: `apps/068-customer-support/app.js`

**Step 1: Write failing server tests**

Start the exported server on an ephemeral port. Assert `GET /` serves the app; `POST /api/reply` rejects non-JSON and oversized bodies, returns 503 without credentials, returns a validated reply with a stubbed successful provider, rejects unknown citations, and hides upstream failure details.

**Step 2: Run the red test**

Run: `node --test apps/068-customer-support/server.test.js`

Expected: FAIL because `server.js` does not exist.

**Step 3: Implement server and browser enhancement**

Export `createRelayServer`, `buildMessages`, and `requestAIReply`. Read `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`; never serialize the key to clients. Limit request bodies to 64 KiB, sanitize at most 40 enabled FAQ cards, include only the last 8 messages, add an upstream timeout, validate provider output through `sanitizeAIReply`, and return stable JSON errors. In the browser, retain the local answer immediately, attempt `/api/reply`, replace it only on a valid response, and expose local/AI source status.

**Step 4: Run server and full static checks**

Run: `node --test apps/068-customer-support/support-core.test.js apps/068-customer-support/server.test.js`

Run: `node --check apps/068-customer-support/server.js`

Run: `node --check apps/068-customer-support/app.js`

Expected: all tests PASS and syntax checks exit 0.

### Task 5: Document, integrate, and verify in a browser

**Files:**
- Create: `apps/068-customer-support/README.md`
- Create: `apps/068-customer-support/qa/browser-smoke.mjs`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest operating modes**

Explain static local routing, editable FAQ persistence, optional AI environment variables, privacy and order-data limitations, keyboard use, test commands, and the GitHub Pages URL.

**Step 2: Integrate challenge metadata**

Replace idea 68 with the `RELAY/68` description and published path, add 68 to `INIT_DONE`, and extend tracker tests without changing completion state 62–67.

**Step 3: Add and run the browser smoke test**

Serve through `node apps/068-customer-support/server.js`. Use a temporary Chrome/Edge profile and CDP to verify a shipping question, intent and citation routing, feedback, custom FAQ creation and persistence, low-confidence handoff, explicit local fallback, 1440px and 390px layouts, keyboard focus, no horizontal overflow, and no runtime errors. Save desktop and mobile screenshots under `apps/068-customer-support/assets/`.

**Step 4: Run full verification**

Run: `node --test apps/068-customer-support/support-core.test.js apps/068-customer-support/server.test.js qa/tracker.test.js`

Run: `node --check apps/068-customer-support/support-core.js`

Run: `node --check apps/068-customer-support/app.js`

Run: `node --check apps/068-customer-support/server.js`

Run: `node apps/068-customer-support/qa/browser-smoke.mjs`

Run: `git diff --check`

Expected: all tests PASS, screenshots exist, no runtime errors, and diff check is clean.

### Task 6: Commit and synchronize GitHub only

**Files:**
- Verify every file listed above.

**Step 1: Inspect the exact branch diff**

Run: `git status --short`, `git diff --stat origin/main...HEAD`, and `git diff --check`.

**Step 2: Create focused commits**

Commit the design/plan, core tests/implementation, interface/server, and docs/tracker/QA in auditable groups on `codex/app-068-customer-support`.

**Step 3: Push only to GitHub**

Run: `git push -u origin codex/app-068-customer-support`

Expected: GitHub `origin` accepts the branch. Do not push to Gitee or any other remote.

**Step 4: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-068-customer-support`, rerun `git status --short --branch`, record the finish timestamp, and report the auditable elapsed duration from the first implementation command through verification and GitHub synchronization.
