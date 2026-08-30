# PRESS/40 Image Compressor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency browser image compressor with a batch queue, Canvas conversion, before/after previews, savings metrics, and local downloads.

**Architecture:** Keep the app in one HTML file for GitHub Pages. Hold files and Blob URLs only in memory, persist settings separately, process each queue item through a shared Canvas pipeline, and derive summary totals from completed items.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, File, Blob, Object URL, createImageBitmap, Canvas and Download APIs.

---

### Task 1: Build the pixel-press shell

**Files:**
- Create: `apps/040-image-compressor/index.html`

**Steps:**
1. Add the PRESS/40 header, hero upload bay, settings panel, press visualization, totals and contact-sheet queue.
2. Add the named visual tokens, quality-linked press plates and responsive breakpoints.
3. Verify one H1, labelled controls, keyboard-operable upload bay, visible focus and reduced motion.

### Task 2: Implement file intake and queue state

**Files:**
- Modify: `apps/040-image-compressor/index.html`

**Steps:**
1. Validate MIME type, 25MB per-file size, 20-file limit and duplicate signatures.
2. Decode image dimensions, create original Object URLs and render ready/error states.
3. Add a generated test image so the full workflow is available without personal files.
4. Verify invalid, duplicate and generated files enter the expected states.

### Task 3: Implement compression and downloads

**Files:**
- Modify: `apps/040-image-compressor/index.html`

**Steps:**
1. Resolve output format and scaled dimensions without upscaling.
2. Draw through Canvas, fill JPEG transparency, export Blob and create result URLs.
3. Render before/after previews, file metrics, savings, summary totals and download names.
4. Invalidate results when settings change and release every replaced Object URL.

### Task 4: Document and register App #040

**Files:**
- Create: `apps/040-image-compressor/README.md`
- Modify: `index.html`

**Steps:**
1. Document features, privacy boundary, format behavior, limits and visual direction.
2. Add the GitHub Pages URL to the App #040 tracker entry.
3. Add 40 to `INIT_DONE` so the tracker renders 40/100.
4. Run a source check for 40 consecutive completion ids and the App #040 link.

### Task 5: Verify and deliver

**Files:**
- Verify: `apps/040-image-compressor/index.html`
- Verify: `index.html`

**Steps:**
1. Run script syntax, duplicate-id, typed-button and tracker checks.
2. Serve locally and test generated sample intake, settings, compression, invalidation, removal arming and download readiness.
3. Test responsive layout and inspect browser console errors.
4. Run `git diff --check`, commit the App #040 files and push only `origin/main`.
5. Match the local commit with GitHub and verify both Pages URLs expose the new content.
