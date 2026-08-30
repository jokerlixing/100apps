# App 084 Selection Translator Design

## Product boundary

App 084 is **MARGIN / 84**, a Manifest V3 browser extension and public demo for people who read mixed-language articles. Its single job is to turn a browser text selection into a compact, trustworthy translation without leaving the page. The shipped repository must remain useful without credentials: the demo has a deterministic local phrasebook, while the installed extension can call MyMemory and falls back cleanly when the network is unavailable.

The scope is deliberately small: selection capture, language choice, translation, copy, pronunciation, recent history, and a pause switch. It does not inject arbitrary HTML, collect page content beyond the explicit selection, send analytics, or pretend the small local phrasebook is a general offline translation model.

## Approaches considered

1. **Cloud-only extension.** Smallest build, but the public demo and offline review would be hollow and outages would make the core flow unverifiable.
2. **Bundled machine-translation model.** Fully offline, but too heavy for this challenge and difficult to audit or ship through GitHub Pages.
3. **Dual channel (chosen).** A deterministic local phrasebook supports the demo and graceful fallback; the extension service worker owns the remote request, timeout, cache, and response validation. This gives a real extension architecture without making review depend on an API key.

## Experience and visual language

The interface borrows from a translator's blue-pencil proof sheet rather than a generic SaaS dashboard. The palette is proof blue `#194B7A`, carbon `#17212B`, paper `#F3F0E8`, correction red `#D6523C`, index yellow `#E9C75D`, and clean white `#FCFCF8`. `Arial Narrow`/`Aptos Narrow` carries display headings, `Segoe UI` carries reading text, and `Consolas` carries language codes and timing labels.

The signature is the **margin ribbon**: selected source text and its translation sit on opposing sides of a vertical proof line, while a clipped annotation tab follows the selection in the page. One restrained line-drawing transition connects source to target; reduced-motion users receive an instant state change.

```text
+----------------------+----------------------------------+
| MARGIN / 84          |  READER PROOF                    |
| language + settings  |  source text | translated note   |
| recent slips         |              | copy / speak       |
| privacy ledger       |  selectable sample article       |
+----------------------+----------------------------------+
```

On narrow screens the control rail stacks above the proof sheet. Keyboard focus is always visible, buttons keep 44px targets, live status uses `aria-live`, and the UI remains usable without animation.

## Architecture and data flow

- `translator-core.js` is dependency-free and shared by Node tests, the GitHub Pages demo, the content script, and the service worker. It owns text normalization, language-pair validation, cache keys, local fallback, response parsing, and history deduplication.
- `background.js` is the network boundary. It accepts only translation messages, limits text length, reads preferences, checks the local cache, requests MyMemory over HTTPS with a timeout, validates the payload, and returns a typed success or failure.
- `content.js` watches `selectionchange` and pointer/keyboard completion, positions an accessible action tab, renders the result card in a closed visual namespace, and never transmits text until the user activates Translate (unless auto-translate is enabled).
- `popup.html` manages target language, auto-translate, pause state, and recent history using `chrome.storage.local`.
- `index.html` is the public, credential-free inspection surface. It uses the same core functions and simulates the complete selection-to-translation flow with deterministic local data.

## Failure handling and verification

Empty, collapsed, editable-field, oversized, and unsupported selections do not trigger a request. Remote timeouts, quota responses, malformed payloads, and offline states produce specific guidance and preserve the source text. Cached results are labeled; local fallback is never labeled as remote translation.

Node tests cover normalization, language validation, cache identity, payload parsing, local fallback, and bounded/deduplicated history. A browser smoke test covers mouse selection, translation, copy affordance, language switching, persistence, mobile layout, keyboard focus, and console/page errors. The final closeout also validates `manifest.json`, tracker entry 84, the published GitHub Pages URL, and official completion migration.
