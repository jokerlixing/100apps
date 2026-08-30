# App 049 Screen Recorder Design

## Product direction

App 049 is a browser-only screen recorder for people who need to capture a quick demo, walkthrough, or bug report without installing software. Its single job is to move the user cleanly from choosing sources to recording and downloading a local file. The recommended scope is the balanced version: capture a screen, window, or tab; optionally include shared system audio and a microphone; provide a three-second preparation countdown; allow pause and resume; then preview and download the result. Camera overlays and timeline editing are deliberately excluded because they turn a focused utility into a small video editor.

Nothing is uploaded. Browser capture and recording APIs produce the file in memory, and a temporary object URL powers playback and download. The interface explains browser limitations before asking for permission, treats the native share picker as the source of truth, and stops safely if the shared surface ends from the browser UI. Unsupported or insecure environments receive a specific recovery message rather than a generic failure.

## Visual system and interaction

The visual language is a broadcast patch bay rather than a generic dashboard. The palette uses aluminium `#dfe5ec`, frost `#f5f7fa`, ink `#17202b`, channel blue `#2457e6`, record red `#ed4b3e`, and signal lime `#c8e64c`. Impact/Arial Black gives the restrained `FRAME/49` display identity, Bahnschrift/Segoe UI carries interface copy, and Cascadia Mono renders timecode and telemetry. The memorable element is the monitor: a live viewfinder with safe-area corners, a quiet scan line, and a large SMPTE-style timecode strip.

Desktop layout places the monitor on the left and a narrow source/control rack on the right. Mobile stacks the rack under the monitor while keeping the primary record control reachable. Controls are grouped by the order in which they matter: source options, capture profile, then transport. During recording, settings lock, the transport exposes pause and stop, and the monitor status changes from READY to REC. After stopping, the same monitor becomes a playable result and the rack becomes a download card with duration and file size. Keyboard focus is always visible, reduced-motion preferences disable the scan/countdown motion, and status changes are announced through a live region.

## Architecture and verification

The static app uses `index.html`, `styles.css`, `recorder-core.js`, and `app.js`. Pure formatting and capability-selection logic lives in `recorder-core.js` with a CommonJS-compatible export so Node can test it without a DOM. `app.js` owns browser permissions, stream composition, the MediaRecorder state machine, timers, object URL cleanup, and UI rendering. The app never stores recordings; only lightweight option preferences are saved locally.

Automated tests cover MIME fallback, time and byte formatting, capture profiles, and safe filenames. A source-level smoke check verifies that the HTML references every required asset. Browser verification covers responsive layout, ready/unsupported messages, focus treatment, and post-stop controls where the capture permission flow can be exercised manually. The final repository check runs the core test file, checks JavaScript syntax, verifies internal asset paths, and confirms that the tracker points App 049 at its GitHub Pages URL.
