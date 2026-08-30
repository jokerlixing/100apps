# STAMP/41 QR Business Card Implementation Plan

**Goal:** Build a browser-only vCard composer that turns validated contact details into a live business card, scannable QR code, VCF download and PNG export.

**Architecture:** Keep the app in one HTML file for GitHub Pages. Derive a vCard 3.0 string from form state, render its UTF-8 QR matrix to Canvas, persist only the editable draft, and generate every export locally on demand.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, localStorage, Canvas, Blob, Object URL, Clipboard and Download APIs, qrcode-generator 1.4.4.

---

### Task 1: Build the print-room shell

**Files:**
- Create: `apps/041-qr-business-card/index.html`

**Steps:**
1. Add the STAMP/41 masthead, thesis, contact form, print status, card preview and export rail.
2. Add the peach-paper visual tokens, registration marks, crop lines, overprint shadows and responsive breakpoints.
3. Verify one H1, labelled fields, semantic buttons, visible focus and reduced-motion handling.

### Task 2: Implement contact state and vCard generation

**Files:**
- Modify: `apps/041-qr-business-card/index.html`

**Steps:**
1. Model name, role, company, phone, email, website, address and note in one serializable draft.
2. Escape vCard text, normalize phone and URL values, and assemble a CRLF vCard 3.0 document.
3. Validate required and typed fields, render inline errors and keep the card preview synchronized.
4. Add local draft recovery, sample data and an armed clear action.

### Task 3: Implement QR rendering and exports

**Files:**
- Modify: `apps/041-qr-business-card/index.html`

**Steps:**
1. Configure qrcode-generator for UTF-8 and medium error correction.
2. Render the matrix to a high-resolution Canvas with a fixed quiet zone and expose version/module/byte metrics.
3. Export the Canvas to PNG, download a UTF-8 VCF Blob and copy the current vCard text.
4. Disable exports while validation, dependency or capacity errors are present.

### Task 4: Document and register App #041

**Files:**
- Create: `apps/041-qr-business-card/README.md`
- Modify: `index.html`

**Steps:**
1. Document features, privacy boundary, vCard behavior, validation and dependency.
2. Add the GitHub Pages URL to the App #041 tracker entry.
3. Add 41 to `INIT_DONE` so the tracker renders 41/100.
4. Run a source check for 41 consecutive completion ids and the App #041 link.

### Task 5: Verify and deliver

**Files:**
- Verify: `apps/041-qr-business-card/index.html`
- Verify: `index.html`

**Steps:**
1. Run script syntax, duplicate-id, typed-button, tracker and vCard source checks.
2. Serve locally and test sample loading, live editing, invalid states, draft recovery and download readiness.
3. Inspect desktop and narrow responsive layouts and the browser console.
4. Run `git diff --check`, commit App #041 and push only `origin/main`.
5. Match the local commit with GitHub and verify both GitHub Pages URLs expose the new content.
