# PULSE/38 Online Survey Implementation Plan

**Goal:** Build a zero-dependency survey builder that can share a survey through its URL, collect local responses, and visualize results.

**Architecture:** Keep the application in one HTML file for static hosting. Use a normalized versioned localStorage state, pure payload and aggregation helpers, delegated DOM events, and a Hash payload for shared fill mode.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, localStorage, URL, Clipboard, TextEncoder and TextDecoder browser APIs.

---

### Task 1: Build the application shell

**Files:**
- Create: apps/038-online-survey/index.html

**Steps:**
1. Add the PULSE/38 header, thesis hero, mode navigation, builder, live preview, fill view, results view and toast region.
2. Add the named visual tokens, OMR-style controls and responsive breakpoints.
3. Verify semantic headings, labelled controls, visible focus styles and reduced-motion handling.

### Task 2: Implement survey data and editing

**Files:**
- Modify: apps/038-online-survey/index.html

**Steps:**
1. Add normalized sample data and versioned local persistence.
2. Implement survey metadata, four question types, required state, option editing, add, reorder and two-step delete.
3. Keep the respondent preview synchronized with every edit.
4. Run a Node harness against normalization and HTML escaping helpers.

### Task 3: Implement sharing, filling and analytics

**Files:**
- Modify: apps/038-online-survey/index.html

**Steps:**
1. Encode a normalized survey as UTF-8 base64url in #fill= and safely decode it on load.
2. Render fill progress, required validation, submission receipt and another-response flow.
3. Persist responses locally and aggregate choice counts, percentages, rating averages and text answers.
4. Verify invalid payload handling and two-step response reset.

### Task 4: Document and register App #038

**Files:**
- Create: apps/038-online-survey/README.md
- Modify: index.html

**Steps:**
1. Document features, static sharing boundary, data model and visual direction.
2. Add the GitHub Pages URL to the App #038 tracker entry.
3. Add 38 to INIT_DONE so the tracker renders 38/100.
4. Run a source check for 38 consecutive completion ids and the App #038 link.

### Task 5: Complete visual and delivery verification

**Files:**
- Verify: apps/038-online-survey/index.html
- Verify: index.html

**Steps:**
1. Serve the repository locally and inspect the full desktop page.
2. Test the complete build, share, fill, submit and results path.
3. Test 390px layout and assert no horizontal overflow or console errors.
4. Run git diff --check, commit all App #038 files, and push only origin main.
5. Match the local commit hash to GitHub and verify both Pages URLs return the new content.
