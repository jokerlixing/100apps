# REEL/79 Music Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first browser music player with persistent playlists, local audio import, synchronized LRC lyrics, and an offline demo that works on GitHub Pages.

**Architecture:** Keep deterministic playlist, queue, time, and lyric behavior in a dependency-free UMD core shared by Node tests and the browser. Use semantic HTML, handcrafted CSS and vanilla JavaScript for the interface, Web Audio for original demo tracks, `<audio>` for imported files, IndexedDB for local blobs, and localStorage for bounded metadata and preferences.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Web Audio API, HTMLMediaElement, IndexedDB, Media Session API, Node.js `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the player domain with TDD

**Files:**
- Create: `apps/079-music-player/player-core.test.js`
- Create: `apps/079-music-player/player-core.js`

**Step 1: Write failing tests**

Cover `formatTime`, `parseLRC`, `findActiveLyric`, `normalizeTrack`, `normalizePlaylist`, `normalizeState`, `moveTrack`, `removeTrackEverywhere`, `buildPlayOrder`, and `resolveNextTrack`. Include multiple LRC timestamps, global offsets, malformed lines, duplicate IDs, bounded text, missing tracks, deterministic shuffle, previous/next edges, repeat-one and repeat-all.

**Step 2: Run the red test**

Run: `node --test apps/079-music-player/player-core.test.js`
Expected: FAIL because the core module does not exist.

**Step 3: Implement the UMD module**

Expose pure immutable helpers through CommonJS and `window.PlayerCore`. Cap track and playlist counts, sanitize scalar fields, retain only known track IDs, preserve the fixed sample playlist, parse timecodes to seconds, and use injected random values for testable shuffle behavior.

**Step 4: Run green and syntax checks**

Run: `node --test apps/079-music-player/player-core.test.js`
Run: `node --check apps/079-music-player/player-core.js`
Expected: all tests PASS and syntax check exits 0.

### Task 2: Build the REEL/79 listening desk

**Files:**
- Create: `apps/079-music-player/index.html`
- Create: `apps/079-music-player/styles.css`

**Step 1: Add semantic application structure**

Create one `h1`, skip link, playlist navigation, library/import actions, cassette transport, track metadata, seek and volume controls, playback-mode controls, queue, lyric reader, live region, playlist editor, audio/LRC file inputs, track actions, delete confirmations and storage disclosure. Use real buttons and labels with no inline handlers.

**Step 2: Implement the visual system**

Use the six documented tape-deck tokens, data-bearing reel sizes, restrained mechanical motion, responsive three-column-to-stack layouts, visible focus, 44px targets, lyric current-line treatment and reduced-motion overrides. Avoid generic gradients, glass cards and decorative equalizer data.

**Step 3: Run structural checks**

Assert one `h1`, labelled range inputs, labelled dialogs, required IDs, no inline `onclick`, and script order `player-core.js` before `app.js`.

### Task 3: Connect playback and local state

**Files:**
- Create: `apps/079-music-player/app.js`
- Modify: `apps/079-music-player/index.html`

**Step 1: Implement demo playback**

Schedule the three original sample arrangements with Web Audio from arbitrary offsets. Keep a trusted clock for duration, pause/resume, seek, previous/next, shuffle, repeat and ended handling. Update the cassette, time readout, title and lyrics without faking playback.

**Step 2: Implement imported audio playback**

Load local blobs from IndexedDB, create and revoke object URLs, use one `<audio>` element, normalize events into the same playback state, and show actionable codec/storage errors.

**Step 3: Implement playlist and lyric lifecycle**

Create, rename and delete custom playlists; add, remove, move and select tracks; import bounded audio files; import LRC for the current local track; click lyrics to seek; persist normalized metadata, preferences and last position without autoplaying after refresh.

**Step 4: Add platform and accessibility behavior**

Register supported Media Session handlers, update metadata without remote artwork, implement Space/arrow/M shortcuts outside editable fields, announce state changes, and maintain dialog focus through native dialog behavior.

**Step 5: Run integration syntax tests**

Run: `node --check apps/079-music-player/app.js`
Run: `node --test apps/079-music-player/player-core.test.js`
Expected: exit 0 and all tests PASS.

### Task 4: Document and verify the product

**Files:**
- Create: `apps/079-music-player/README.md`
- Create: `apps/079-music-player/qa/browser-smoke.mjs`
- Create: `apps/079-music-player/assets/screenshot-desktop.png`
- Create: `apps/079-music-player/assets/screenshot-mobile.png`

**Step 1: Document honest operation**

Explain offline samples, local import, storage limits, file privacy, lyrics, controls, shortcuts, compatibility, exact local URL and verification commands. Include the verified desktop screenshot.

**Step 2: Add browser smoke coverage**

Use a temporary Chrome/Edge profile and CDP to verify the sample playlist, real playback progress, pause/seek, active lyric, volume and mode controls, playlist create/rename/delete, a generated local WAV import, LRC import, reorder/remove, refresh restoration, keyboard focus, 1440px and 390px layouts, no overflow and no runtime errors.

**Step 3: Run product verification**

Run: `node --test apps/079-music-player/player-core.test.js`
Run: `node --check apps/079-music-player/player-core.js`
Run: `node --check apps/079-music-player/app.js`
Run: `node apps/079-music-player/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all checks PASS and screenshots show the verified interface.

### Task 5: Merge current tracker state and publish

**Files:**
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Refresh the integration base**

Fetch GitHub `origin`, inspect new 073–080 entries and completion IDs, then rebase or merge current `origin/main` without discarding parallel registrations.

**Step 2: Register app 079**

Set the official name to `音乐播放器`, description to a final `REEL/79` capability summary, URL to `https://jokerlixing.github.io/100apps/apps/079-music-player/`, and add 79 to `INIT_DONE` while preserving every other official completion state.

**Step 3: Extend tracker coverage**

Add an app-specific assertion for number, name, description, exact URL and completion status. Run the full tracker test with the project tests.

**Step 4: Commit and push GitHub only**

Inspect status and diff, commit the completed app and tracker integration, fetch/rebase once more if `origin/main` advanced, push `HEAD:main` only to `origin`, verify the remote SHA, and record the finish timestamp. Do not push to Gitee or any other remote.
