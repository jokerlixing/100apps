# App 064 AI OCR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a privacy-conscious browser OCR workbench that recognizes up to 12 local images as editable Chinese or English text and exports per-image or combined TXT files.

**Architecture:** Keep validation, queue transitions, summaries, formatting, and text export in a dependency-free UMD core module. The browser controller owns image decoding, Canvas preprocessing, the lazily loaded Tesseract.js 7.0.0 Worker, DOM rendering, clipboard access, and Blob downloads; it reuses one Worker across a sequential batch.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Canvas 2D, Tesseract.js 7.0.0, Node.js built-in test runner, Chrome DevTools Protocol smoke test.

---

### Task 1: Define the OCR state core with TDD

**Files:**
- Create: `apps/064-ai-ocr/ocr-core.test.js`
- Create: `apps/064-ai-ocr/ocr-core.js`

**Step 1: Write failing tests**

Cover accepted MIME types, 15 MB and 12-file limits, language normalization, safe queue item creation, immutable updates, completed/pending summaries, preprocessing dimensions, progress labels, safe TXT names, normalized OCR text, and combined batch output.

**Step 2: Run red**

Run: `node --test apps/064-ai-ocr/ocr-core.test.js`

Expected: FAIL because `ocr-core.js` does not exist.

**Step 3: Implement the UMD core**

Expose `OcrCore` through CommonJS and `window`. Keep constants frozen, reject malformed input with specific Chinese messages, preserve line breaks in recognized text, and return new arrays/objects for every state transition.

**Step 4: Run green**

Run: `node --test apps/064-ai-ocr/ocr-core.test.js`

Expected: all tests PASS.

**Step 5: Commit**

Commit: `test: add app 064 ocr core`

### Task 2: Build the responsive proofing-table interface

**Files:**
- Create: `apps/064-ai-ocr/index.html`
- Create: `apps/064-ai-ocr/styles.css`

**Step 1: Add semantic markup**

Create a skip link, masthead, privacy note, language and enhancement controls, accessible import/drop zone, queue region, scanning preview, editable result region, batch actions, live status region, and reusable queue-item template. Use one `h1` and no inline event handlers.

**Step 2: Implement the visual system**

Apply the six documented colors and three typography roles. Build a three-column desktop proofing table, a single-column mobile flow, a progress-driven scan beam, visible focus states, 44px targets, empty/error states, and reduced-motion behavior.

**Step 3: Run structural checks**

Check local asset references, one `h1`, one `main`, labelled controls, live status, template presence, and no fixed width that forces overflow at 390px.

**Step 4: Commit**

Commit: `feat: build app 064 proofing table`

### Task 3: Implement import, preprocessing, OCR, and export

**Files:**
- Create: `apps/064-ai-ocr/app.js`
- Modify: `apps/064-ai-ocr/index.html`

**Step 1: Implement safe import**

Support picker, drag/drop, paste, and a generated bilingual sample. Validate type and size before decoding, reject images over 36 MP, create revocable preview URLs, select the first accepted item, and keep valid files when siblings fail.

**Step 2: Render queue and selected proof**

Render queue buttons with thumbnails, status, progress, and remove actions. Show the selected image, filename, dimensions, progress beam, editable output, confidence, characters, and elapsed time. Keep UI updates announced without flooding the live region.

**Step 3: Add Canvas preprocessing**

Decode the selected File, fit it within a 2600px/12MP processing budget, paint a white background, and optionally apply grayscale plus contrast. Return the Canvas directly to the OCR Worker without persisting image data.

**Step 4: Manage the OCR Worker**

Lazy-load `https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js`, create one Worker for the normalized language, forward logger progress into the active item, and process non-completed items sequentially. Terminate on language change, stop, or page unload; a single failed item must not stop the queue.

**Step 5: Implement editing and export**

Persist textarea edits in memory, copy the selected text, download a BOM-prefixed per-image TXT, and download a combined file containing all completed non-empty results. Disable actions when their preconditions are not met and revoke every Blob URL.

**Step 6: Verify behavior**

Run:
- `node --test apps/064-ai-ocr/ocr-core.test.js`
- `node --check apps/064-ai-ocr/ocr-core.js`
- `node --check apps/064-ai-ocr/app.js`

Expected: PASS / exit 0.

**Step 7: Commit**

Commit: `feat: implement app 064 ocr workflow`

### Task 4: Document, register, and visually verify App 064

**Files:**
- Create: `apps/064-ai-ocr/README.md`
- Create: `apps/064-ai-ocr/qa/browser-smoke.mjs`
- Create: `apps/064-ai-ocr/assets/screenshot.png`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Write documentation**

Document the privacy boundary, first-run model download, supported formats/languages, limits, workflow, stop/retry behavior, browser requirements, test commands, third-party license, and GitHub Pages URL.

**Step 2: Update the tracker with a regression test**

Register App 064 as `GLYPH/64：本地批量OCR+中英模型+校样导出`, add its GitHub Pages URL, and mark ID 64 complete without changing Apps 062–063.

**Step 3: Run the browser smoke test**

Serve the repository locally. Inject a deterministic Worker mock, add the sample, run a batch, verify editable recognized output and queue summaries, exercise remove/stop-safe actions, check desktop and 390px layouts, and capture the representative desktop screenshot.

**Step 4: Inspect the screenshot**

Confirm that the queue, preview, progress state, editable proof, and primary actions are visible without overlap. Fix issues and recapture until the frame is clean.

**Step 5: Commit**

Commit: `feat: complete app 064 ai ocr`

### Task 5: Final verification and GitHub synchronization

**Files:**
- Verify all files above.

**Step 1: Run repository checks**

Run unit tests, syntax checks, tracker tests, browser smoke, local reference assertions, `git diff --check`, and inspect the branch diff against `origin/main`.

**Step 2: Confirm repository scope**

Verify the branch contains only App 064, its two plan files, the intended tracker test, and the intended tracker line. Confirm no generated temp files or secrets are present.

**Step 3: Synchronize GitHub only**

Rebase or merge the latest `origin/main` if needed, rerun affected checks, push `codex/app-064-ai-ocr` only to `origin`, and verify the remote commit hash. Do not push to Gitee or another remote.
