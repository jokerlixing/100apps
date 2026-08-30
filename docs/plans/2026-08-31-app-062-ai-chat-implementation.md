# App 062 AI Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub Pages-compatible BYOK chat client with OpenAI-compatible streaming, local conversations, explicit key-safety boundaries, and polished responsive interaction.

**Architecture:** Keep URL validation, message normalization, request construction, and incremental SSE parsing in a dependency-free UMD module tested by Node. Keep the API key in page memory only; let a browser controller own persistence, Fetch streaming, cancellation, and accessible DOM updates. Validate the complete UI against a local mock streaming endpoint so no real credential is required.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Fetch API, ReadableStream, AbortController, localStorage, Node.js built-in `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define connection, conversation, and stream rules with TDD

**Files:**
- Create: `apps/062-ai-chat/chat-core.test.js`
- Create: `apps/062-ai-chat/chat-core.js`

**Step 1: Write the failing tests**

Cover `normalizeEndpoint`, `sanitizeSettings`, `sanitizeConversation`, `createConversation`, `deriveTitle`, `buildRequestMessages`, `buildRequestBody`, `createSSEParser`, `extractDeltaText`, and malformed/hostile inputs. Assert that public HTTP, embedded credentials, fragments, non-HTTP protocols, unknown roles, empty messages, and prototype-bearing stored data are rejected or normalized.

**Step 2: Run the red test**

Run: `node --test apps/062-ai-chat/chat-core.test.js`

Expected: FAIL because `chat-core.js` does not exist.

**Step 3: Implement the minimal UMD core**

Export through CommonJS and `window.ChatCore`. Normalize a base ending in `/v1` to `/v1/chat/completions`, preserve an already complete `/chat/completions` path, allow plain HTTP only for loopback hosts, cap stored content and history, and keep parsing state inside each SSE parser instance.

**Step 4: Run green and syntax checks**

Run: `node --test apps/062-ai-chat/chat-core.test.js`

Run: `node --check apps/062-ai-chat/chat-core.js`

Expected: all tests PASS and syntax check exits 0.

**Step 5: Commit**

```powershell
git add apps/062-ai-chat/chat-core.js apps/062-ai-chat/chat-core.test.js
git commit -m "test: define app 062 chat core"
```

### Task 2: Build the WIRE/62 responsive interface

**Files:**
- Create: `apps/062-ai-chat/index.html`
- Create: `apps/062-ai-chat/styles.css`

**Step 1: Add semantic structure**

Create a skip link, session sidebar, message timeline, empty-state starters, composer, connection patchbay, settings fields, destructive-action dialog, mobile drawer controls, toast, and assertive/polite live regions. Use real labels and button text; do not use inline handlers.

**Step 2: Implement the communication-room system**

Apply the documented six tokens, narrow display type, body and mono roles, paper-tape center, patchbay controls, and one continuous message signal line. Make every control at least 44px, keep line lengths readable, preserve visible focus, collapse sidebars into modal drawers below 900px, and disable pulse/typing motion for reduced-motion users.

**Step 3: Run structural assertions**

Run a Node script that asserts one `h1`, required element IDs, labelled dialog/drawers, no inline event attributes, stylesheet/script paths, and viewport metadata.

Expected: exit 0.

**Step 4: Commit**

```powershell
git add apps/062-ai-chat/index.html apps/062-ai-chat/styles.css
git commit -m "feat: build app 062 communication console"
```

### Task 3: Connect persistence and OpenAI-compatible streaming

**Files:**
- Create: `apps/062-ai-chat/app.js`
- Modify: `apps/062-ai-chat/index.html`

**Step 1: Implement local non-secret state**

Load and sanitize settings and conversations; keep only endpoint/model/system prompt/temperature and conversations in localStorage. Hold the API key in a module variable, clear its field after handoff, and prove with an exported debug snapshot that no secret is serialized.

**Step 2: Implement chat actions**

Add new/select/rename/delete conversations, suggestion starters, auto-growing composer, Enter to send, Shift+Enter for newline, copy, retry, and clear. Save complete and interrupted assistant messages, but remove empty failed placeholders.

**Step 3: Implement streaming transport**

POST `{model,messages,temperature,stream:true}` with Bearer authentication. Feed decoded chunks into `createSSEParser`, append deltas without interpreting model output as HTML, stop with AbortController, map HTTP/provider/CORS errors to actionable messages, and prevent concurrent sends.

**Step 4: Run core, controller syntax, and persistence checks**

Run: `node --test apps/062-ai-chat/chat-core.test.js`

Run: `node --check apps/062-ai-chat/app.js`

Expected: PASS / exit 0.

**Step 5: Commit**

```powershell
git add apps/062-ai-chat/app.js apps/062-ai-chat/index.html
git commit -m "feat: stream app 062 chat responses"
```

### Task 4: Add browser-level mock streaming verification

**Files:**
- Create: `apps/062-ai-chat/qa/browser-smoke.mjs`

**Step 1: Start an isolated test server**

Serve repository files and a CORS-enabled `/v1/chat/completions` mock. Emit role and text chunks across awkward byte boundaries with deliberate pauses; expose a retry counter and a long stream for abort testing.

**Step 2: Drive the critical flows through CDP**

Launch local Chrome/Edge with a temporary profile. Configure loopback endpoint/model/key, send a prompt, assert progressive text and finished state, retry, stop a long stream, create/switch/delete conversations, reload, and assert the secret value is absent from localStorage and DOM after configuration.

**Step 3: Check responsive/accessibility invariants**

Capture 1440x1000 and 390x844 screenshots, confirm no horizontal overflow, drawers work, the composer remains visible, focus is visible, live status updates, and no console/runtime errors occur.

**Step 4: Run browser smoke**

Run: `node apps/062-ai-chat/qa/browser-smoke.mjs`

Expected: a JSON summary with every scenario `true` and screenshot paths.

**Step 5: Commit**

```powershell
git add apps/062-ai-chat/qa/browser-smoke.mjs apps/062-ai-chat/assets/screenshot.png
git commit -m "test: cover app 062 browser flows"
```

### Task 5: Document and integrate challenge metadata

**Files:**
- Create: `apps/062-ai-chat/README.md`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document safe operation and limitations**

Explain temporary-key behavior, official browser-key warning, CORS requirements, compatible endpoint format, data persistence, keyboard controls, mock test command, and the recommendation to use a server-side proxy for production.

**Step 2: Update tracker metadata**

Replace app 062's placeholder with `WIRE/62`, the GitHub Pages URL, and its concise feature line. Add 62 to `INIT_DONE` without changing any earlier status.

**Step 3: Extend tracker regression coverage**

Assert app 062 metadata, official completion, and migration of a stale cached app 062 entry.

**Step 4: Run documentation and tracker checks**

Run: `node --test qa/tracker.test.js apps/062-ai-chat/chat-core.test.js`

Expected: all tests PASS.

**Step 5: Commit**

```powershell
git add apps/062-ai-chat/README.md index.html qa/tracker.test.js
git commit -m "chore: mark app 062 complete"
```

### Task 6: Verify, review, and synchronize

**Files:**
- Verify all files above.

**Step 1: Run the full project checks**

Run unit tests, syntax checks, browser smoke, tracker tests, `git diff --check`, and link/path assertions. Inspect screenshots at original resolution and fix every visible issue before continuing.

**Step 2: Review repository state**

Run: `git status --short --branch`

Run: `git log --oneline origin/main..HEAD`

Run: `git diff --stat origin/main...HEAD`

Expected: only App 062 plans, implementation, verification artifacts, README, tracker test, and tracker metadata are changed.

**Step 3: Push GitHub only**

Run: `git push -u origin codex/app-062-ai-chat`

Expected: branch is present on GitHub `origin`. Do not push to Gitee or any other remote.

**Step 4: Verify remote commit**

Run: `git ls-remote origin refs/heads/codex/app-062-ai-chat`

Expected: remote hash equals local `HEAD`.
