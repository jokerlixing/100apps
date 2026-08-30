# App 049 Screen Recorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a polished browser-only screen recorder with optional microphone audio, pause/resume, local preview, and WebM/MP4 download.

**Architecture:** A static GitHub Pages app keeps MediaRecorder orchestration in the browser controller and extracts deterministic selection/formatting helpers into a small tested module. Recording data remains local in memory and is released when a new take begins or the page unloads.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Media Capture and Streams API, MediaRecorder API, Node.js built-in test runner.

---

### Task 1: Create and test deterministic recorder helpers

**Files:**
- Create: `apps/049-screen-recorder/recorder-core.test.js`
- Create: `apps/049-screen-recorder/recorder-core.js`

**Step 1: Write the failing tests**

Test `selectMimeType`, `formatDuration`, `formatBytes`, `captureProfile`, and `buildRecordingName` using `node:test` and strict assertions. Stub `MediaRecorder.isTypeSupported` so MIME selection is deterministic.

**Step 2: Run the tests and verify failure**

Run: `node --test apps/049-screen-recorder/recorder-core.test.js`

Expected: FAIL because `recorder-core.js` does not exist.

**Step 3: Implement the helpers**

Expose a browser global and CommonJS export. Prefer VP9 WebM, then VP8 WebM, generic WebM, and MP4. Format elapsed milliseconds as `HH:MM:SS`, use binary byte units, map `original`/`1080`/`720` to display constraints, and generate filesystem-safe timestamped names.

**Step 4: Run the tests and verify success**

Run: `node --test apps/049-screen-recorder/recorder-core.test.js`

Expected: all helper tests PASS.

### Task 2: Build the broadcast-console interface

**Files:**
- Create: `apps/049-screen-recorder/index.html`
- Create: `apps/049-screen-recorder/styles.css`

**Step 1: Add semantic structure**

Create the `FRAME/49` masthead, privacy note, monitor with video/empty/result states, timecode, capture settings, transport controls, result panel, browser-support alert, and `aria-live` status node.

**Step 2: Implement the visual system**

Define the six-color token palette and three-font role system from the design. Build a two-column broadcast desk at wide widths and a stacked layout below 820 px. Add viewfinder corners, one purposeful monitor scan animation, visible focus, and reduced-motion overrides.

**Step 3: Check static references**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('apps/049-screen-recorder/index.html','utf8');for(const p of ['styles.css','recorder-core.js','app.js'])if(!s.includes(p))throw Error(p)"`

Expected: PASS with no output after `app.js` is added in Task 3.

### Task 3: Implement the recording state machine

**Files:**
- Create: `apps/049-screen-recorder/app.js`

**Step 1: Add capability and preference handling**

Detect `getDisplayMedia` and `MediaRecorder`, restore source/profile/countdown preferences, and disable recording with an actionable message when unavailable.

**Step 2: Add capture and recording flow**

Request display capture, optionally request a microphone, merge audio tracks through `AudioContext` when both sources exist, start MediaRecorder after the countdown, update timecode/byte telemetry, and handle native surface termination.

**Step 3: Add transport and result flow**

Pause/resume without counting paused time, stop all tracks, build a Blob/object URL, swap the monitor to playback, expose download/new-take actions, and revoke stale URLs. Keep all failure paths recoverable.

**Step 4: Verify JavaScript syntax and helpers**

Run: `node --check apps/049-screen-recorder/app.js && node --check apps/049-screen-recorder/recorder-core.js && node --test apps/049-screen-recorder/recorder-core.test.js`

Expected: syntax checks succeed and all tests PASS.

### Task 4: Document and visually verify the app

**Files:**
- Create: `apps/049-screen-recorder/README.md`
- Create: `apps/049-screen-recorder/assets/screenshot.png`

**Step 1: Write the app README**

Document features, privacy, local use, browser requirements, test command, technical stack, and known capture/audio limitations. Embed the verified screenshot.

**Step 2: Serve and inspect the app**

Run: `python -m http.server 8049`

Open: `http://127.0.0.1:8049/apps/049-screen-recorder/`

Expected: the ready state renders without overflow at desktop and mobile widths, all controls have visible labels/focus, and the browser permission request starts from the primary button.

**Step 3: Capture the verified ready state**

Save a desktop screenshot to `apps/049-screen-recorder/assets/screenshot.png`, inspect it, and fix any visible defects before keeping it.

### Task 5: Integrate App 049 into the challenge tracker

**Files:**
- Modify: `index.html`

**Step 1: Update the built-in idea**

Change App 049 to `FRAME/49：本地录屏+双路音频+暂停与下载` and add `https://jokerlixing.github.io/100apps/apps/049-screen-recorder/`.

**Step 2: Mark official completion**

Add `49:"done"` to `INIT_DONE` without changing custom local data behavior.

**Step 3: Run the repository verification**

Run helper tests, syntax checks, static asset checks, and `git diff --check`. Confirm only App 049 files, its plans, and the intended tracker lines are included.

**Step 4: Commit and synchronize**

Commit with scoped messages, integrate the isolated branch into the shared challenge branch, and push completed code only to GitHub `origin` after verifying no unrelated task changes are included.
