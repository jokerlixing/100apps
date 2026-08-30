# App 100 · INDEX/100 Portfolio Design

## Purpose

INDEX/100 is the closing project of the 100 Apps Challenge. Its subject is not a generic software engineer profile; it is the practice of learning by shipping one hundred small, inspectable products. The audience is a recruiter, collaborator, or fellow builder who wants to see evidence quickly. The page has one job: turn the challenge into a navigable body of work and provide direct routes into live projects.

## Chosen direction

Three directions were considered. A conventional resume landing page would be fast and familiar, but it would hide the strongest asset: the projects themselves. A dashboard that mirrors the root tracker would expose progress, but would duplicate App 001 and feel operational rather than personal. The selected direction is an editorial project archive: a clear personal thesis, a few evidence-led case studies, and a searchable ledger containing every tracked project.

The page remains a static GitHub Pages application. It reads the root tracker at runtime, extracts the `IDEAS` catalog and official completion map without evaluating tracker code, and normalizes the first one hundred entries. This lets the portfolio inherit later tracker updates instead of maintaining a second source of truth. If the tracker cannot be loaded, the application shows a curated fallback set and an explicit data-status message rather than presenting stale data as complete.

## Visual system

- **Palette:** Blueprint `#2458e6`, Carbon `#102a2a`, Signal `#ff5c35`, Glacier `#e7eef0`, Paper `#fdfdfb`, Ledger `#8d9ca0`.
- **Type:** condensed system sans for the display voice, a highly legible UI sans for body copy, and a monospace face for project IDs and data.
- **Layout:** an asymmetric cover-like hero places the challenge thesis beside the live archive instrument; later sections use disciplined rails and generous whitespace rather than dashboard cards.
- **Signature:** a ten-by-ten project punchboard. Every cell is a real project, its fill communicates official state, and focus or hover reveals that project's title. The grid is information, not decoration.

The initial draft risked becoming the familiar cream editorial portfolio. The revised system uses a cool industrial blueprint surface, sharp cobalt blocks, and a single signal-orange cursor. It also avoids decorative section numbering: only real application IDs are numbered.

## Components and interaction

The masthead links to Selected work, Practice, Archive, and Contact. The hero contains the thesis, current completion summary, primary actions, and punchboard. Selecting a punchboard cell updates the adjacent project readout and provides a live link when one exists.

Selected work uses three representative case-study rows with concrete constraints and outcomes. Practice explains the loop used across the challenge: define a small promise, build the complete path, and preserve verification evidence. The Archive offers text search plus level and completion filters, announces result counts, and renders semantic project buttons. A project dialog exposes description, level, status, and deployment link. Users can download the current normalized catalog as JSON.

Keyboard focus is always visible, the dialog restores focus on close, touch targets are at least 44px, and motion is disabled when reduced motion is requested. The layout collapses to one column on narrow screens without horizontal overflow.

## Error handling and verification

Tracker parsing validates structure, limits the result to IDs 1–100, and sanitizes names, descriptions, levels, and links. Fetch failure falls back locally and leaves a visible notice. Empty archive results explain how to broaden filters.

Unit tests cover tracker parsing, first-100 enforcement, filters, summaries, and safe link handling. A headless-browser smoke test covers tracker loading, punchboard selection, archive filtering, dialog behavior, catalog download wiring, desktop/mobile overflow, focus visibility, and runtime console errors. Desktop and mobile screenshots are inspected before delivery.
