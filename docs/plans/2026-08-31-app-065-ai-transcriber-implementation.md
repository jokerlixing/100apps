# App 065 AI Transcriber Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a privacy-conscious browser speech-to-text workbench with live microphone transcription, local recording, editable timestamped segments, and TXT/SRT export.

**Architecture:** Keep all transcript validation, immutable segment transitions, metrics, persistence normalization, and export formatting in a dependency-free UMD core module. Use a browser controller for SpeechRecognition, MediaRecorder, localStorage, waveform animation, audio import/playback, DOM rendering, keyboard controls, and downloads; keep the page build-free so it deploys on GitHub Pages.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Web Speech API, MediaRecorder API, Web Audio API, localStorage, Node.js built-in test runner, Chrome DevTools Protocol.

---

### Task 1: Specify the transcript core with TDD

**Files:**
- Create: `apps/065-ai-transcriber/transcript-core.test.js`
- Create: `apps/065-ai-transcriber/transcript-core.js`

**Step 1: Write failing tests**

Cover text cleanup, valid/invalid segment normalization, deterministic sorting, immutable edit/delete, text metrics, persisted-session cleanup, TXT output, SRT output, SRT timecodes, and safe filenames.

**Step 2: Run the red test**

Run: `node --test apps/065-ai-transcriber/transcript-core.test.js`
Expected: FAIL because `transcript-core.js` does not exist.

**Step 3: Implement the smallest dependency-free core**

Export through CommonJS and `window.TranscriptCore`; return fresh objects and arrays, cap text/title lengths, accept only finite non-negative time values, and never inject untrusted HTML.

**Step 4: Run green and syntax checks**

Run: `node --test apps/065-ai-transcriber/transcript-core.test.js`
Run: `node --check apps/065-ai-transcriber/transcript-core.js`
Expected: all tests PASS and syntax check exits 0.

### Task 2: Build the SCRIBE/65 interface

**Files:**
- Create: `apps/065-ai-transcriber/index.html`
- Create: `apps/065-ai-transcriber/styles.css`

**Step 1: Add semantic structure**

Create a skip link, masthead, recording controls, language selector, waveform stage, interim transcript, source/status panel, imported/recorded audio player, editable transcript list, search, metrics, export controls, empty state, confirmation dialog, and live status region.

**Step 2: Implement the broadcast-console visual system**

Derive every token from the documented palette. Use the waveform/playhead as the only bold signature, make segment timing structural, keep focus visible, support reduced motion, and prevent horizontal scrolling at 390px.

**Step 3: Run structural checks**

Verify one `h1`, labelled inputs/buttons/dialog, no inline event handlers, local asset paths only, and 44px touch targets on mobile.

### Task 3: Connect recognition, recording, persistence, and exports

**Files:**
- Create: `apps/065-ai-transcriber/app.js`
- Modify: `apps/065-ai-transcriber/index.html`

**Step 1: Implement session state and rendering**

Restore a sanitized session, render only with DOM text properties, debounce persistence, keep search presentation separate from transcript state, and expose accurate empty/status messages.

**Step 2: Implement live speech recognition**

Detect standard and prefixed constructors, request continuous interim results, append final phrases with elapsed timestamps, recover from normal recognition restarts, and stop cleanly on permission or service errors.

**Step 3: Implement recording and waveform**

Acquire the same microphone once, record supported audio with MediaRecorder, visualize analyser samples without retaining them, stop every media track, and expose the final Blob through a local audio URL and download button.

**Step 4: Implement local audio import and demo mode**

Validate audio MIME/size before creating an object URL. Make clear that import is local playback, and let unsupported/test environments load a labelled deterministic demo transcript without requesting permission.

**Step 5: Implement edits and export actions**

Use the core for edit/delete/metrics. Support copy, TXT, SRT, recorded-audio download, session reset confirmation, keyboard shortcuts, and useful disabled states.

**Step 6: Run tests and syntax checks**

Run: `node --test apps/065-ai-transcriber/transcript-core.test.js`
Run: `node --check apps/065-ai-transcriber/app.js`
Expected: PASS / exit 0.

### Task 4: Document and integrate challenge metadata

**Files:**
- Create: `apps/065-ai-transcriber/README.md`
- Modify: `index.html`

**Step 1: Document behavior and boundaries**

Explain browser speech-service privacy, microphone permission, local recording lifetime, import limitation, browser support, demo mode, shortcuts, test commands, and local serving requirements.

**Step 2: Register App 065**

Update item 65 with the `SCRIBE/65` description and GitHub Pages URL. Mark only 65 complete in `INIT_DONE`; leave 62–64 untouched.

### Task 5: Automate browser verification

**Files:**
- Create: `apps/065-ai-transcriber/qa/browser-smoke.mjs`
- Create: `apps/065-ai-transcriber/assets/screenshot.png`

**Step 1: Add a dependency-free CDP smoke script**

Launch local Chrome/Edge, load `?demo=1`, assert ready/support states, populate the demo transcript, edit/search/delete, verify localStorage restoration, exercise reset confirmation, collect desktop/mobile layout data, and fail on runtime console errors.

**Step 2: Capture and inspect desktop/mobile views**

Capture 1440×1000 and 390×844 PNGs. Inspect the desktop result, fix visual defects, then copy the representative screenshot into the app assets directory.

**Step 3: Run the full verification matrix**

Run unit tests, syntax checks, browser smoke, tracker assertions, `git diff --check`, and inspect the full diff. Expected: every command passes, no overflow, no runtime error.

### Task 6: Commit and synchronize

**Files:**
- Verify all App 065, plan, README, tracker, and screenshot files.

**Step 1: Create focused commits**

Commit plans, core/test, interface/controller, and documentation/integration with descriptive messages on `codex/app-065-ai-transcriber`.

**Step 2: Rebase on current GitHub main if needed**

Fetch `origin`, rebase only if `origin/main` advanced, rerun affected verification, and never use Gitee as a push target.

**Step 3: Publish to GitHub**

Push the completed commits to GitHub `origin`, update `origin/main` for the Pages deployment only after verification, and confirm the remote commit hash matches the local commit.
