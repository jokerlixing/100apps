# SIGNAL/37 Personal Blog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-dependency personal blog with Markdown authoring, article discovery, drafts, local persistence, and deep-linked reading.

**Architecture:** Keep the app in one HTML file so it works from file or static hosting. Use a normalized localStorage state, pure Markdown and filtering helpers, delegated DOM events, and Hash routing for article reading.

**Tech Stack:** HTML5, responsive CSS, vanilla JavaScript, localStorage, History and Clipboard browser APIs.

---

### Task 1: Build the application shell

**Files:**
- Create: apps/037-personal-blog/index.html

**Steps:**
1. Add the SIGNAL/37 header, hero broadcast, frequency filter, article grid, archive rail, reader layer and editor layer.
2. Add the named visual tokens and responsive breakpoints at 980px, 760px and 560px.
3. Verify the HTML contains one H1, labelled controls, visible focus styles and reduced-motion handling.

### Task 2: Implement article data and Markdown rendering

**Files:**
- Modify: apps/037-personal-blog/index.html

**Steps:**
1. Add normalized default posts and a versioned localStorage state.
2. Implement HTML escaping, safe URL filtering, inline Markdown, block parsing, word count and reading time.
3. Run a Node syntax harness that extracts the inline script and checks parser output against safe and malicious Markdown.
4. Expect script syntax to pass, script tags to remain escaped and javascript links to be rejected.

### Task 3: Implement discovery, authoring and routing

**Files:**
- Modify: apps/037-personal-blog/index.html

**Steps:**
1. Render published, draft, search, tag and archive views from state.
2. Add article reader Hash routing and copy-link fallback.
3. Add editor validation, live preview, create/edit/status flows and two-step deletion.
4. Verify create, edit, publish, draft filter, persistence, reader open/close and delete arming in a browser.

### Task 4: Document and register App #037

**Files:**
- Create: apps/037-personal-blog/README.md
- Modify: index.html

**Steps:**
1. Document features, data model, Markdown safety and visual direction.
2. Add the GitHub Pages URL to the App #037 tracker entry.
3. Add 37 to INIT_DONE so the tracker renders 37/100.
4. Run a source check for 37 consecutive completion ids and the App #037 link.

### Task 5: Complete visual and delivery verification

**Files:**
- Verify: apps/037-personal-blog/index.html
- Verify: index.html

**Steps:**
1. Serve the repository locally and inspect the full desktop page.
2. Test 390px layout and assert no horizontal overflow.
3. Check browser console warnings and errors.
4. Run git diff --check, commit all App #037 files, and push only origin main.
5. Match the local commit hash to GitHub and verify both Pages URLs return the new content.
