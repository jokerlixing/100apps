# App 085 Tabloom Design

## Product intent

App 085 is a Chrome Manifest V3 extension for people whose browser window has become a working memory dump. Its single job is to turn an overloaded window into a readable set of tab groups without making the user configure rules first.

The official challenge brief is “标签页管理插件：一键整理浏览器标签组”. The finished project must therefore include a real unpacked extension, not only a visual mock. Because the challenge tracker needs a link that can be opened from GitHub Pages, it also includes an interactive demo that uses the same interface and grouping logic with sample tabs.

## Approach decision

Three shapes were considered:

1. A popup-only extension is the smallest valid implementation, but a GitHub Pages visitor would only see source files.
2. A side-panel extension gives more room, but adds a higher Chrome version requirement and turns a quick action into a persistent workspace.
3. A popup extension plus an online demo keeps the product fast in Chrome and makes the tracker link meaningful.

The third approach is selected. It satisfies the challenge definition of done and remains small enough to inspect in one sitting.

## Core experience

- “整理本窗口” groups eligible tabs by normalized domain. Singletons, pinned tabs, and browser-internal pages are left alone.
- Search filters every open tab in the current window; selecting a result activates it.
- “清理重复页” keeps the active or first copy of each normalized URL and closes the rest.
- “释放后台页” asks Chrome to discard inactive, unpinned tabs so they can reload when revisited.
- “保存现场” records a compact local snapshot; “恢复现场” reopens its URLs later.
- “取消分组” returns all grouped tabs in the current window to the ungrouped state.

The demo performs safe simulated versions of the same actions and labels itself clearly as demonstration data.

## Architecture and data flow

`tab-domain.js` is an environment-independent ES module. It normalizes URLs, extracts display domains, creates deterministic group plans and colors, and identifies duplicate tabs. Node tests import it directly.

`popup.js` owns presentation state and talks through a small browser adapter. In extension mode the adapter calls `chrome.tabs`, `chrome.tabGroups`, and `chrome.storage.local`. On an ordinary web page it uses an in-memory demo adapter. The popup never injects scripts into visited pages and requests no host permissions.

Grouping is deliberately conservative: only `http:` and `https:` tabs with numeric IDs are eligible, groups require at least two tabs, and pinned tabs are excluded. If an API operation fails, the interface keeps its last rendered state and gives a concrete action message in the status region.

## Visual direction

The visual language is a quiet browser dispatch board inspired by airport flight strips: tabs appear as slim paper-like rows with a colored routing rail, not generic dashboard cards.

### Tokens

- `Paper` `#F3F6FA`: calm control-surface background.
- `Ink` `#17253B`: primary text and controls.
- `Cobalt` `#315BFF`: primary action and focus.
- `Coral` `#F06B50`: duplicate/warning signal.
- `Citron` `#D9E66B`: live/organized signal.
- `Mist` `#DCE4ED`: dividers and secondary surfaces.

Typography uses `Arial Narrow` for the compact product wordmark, `Segoe UI` for interface copy, and `Cascadia Mono` for counts and domains. The extension ships without remote fonts so its CSP stays minimal and it works offline.

### Layout

```text
┌ TABLOOM ─── 12 OPEN ┐
│ [ Find a tab…      ]│
│ ┌──────────────────┐│
│ │ 整理本窗口    →  ││  signature action
│ └──────────────────┘│
│ 3 GROUPS / 2 DUPES  │
│ ▌Docs       title   │
│ ▌github.com  title  │  flight-strip tab list
│ ▌Music      title   │
│ [保存现场] [更多…]  │
└─────────────────────┘
```

On GitHub Pages, the popup is framed beside a short installation runway. The interface itself remains responsive and can collapse to one column on a narrow screen. Keyboard focus is always visible, status updates use `aria-live`, and motion is disabled when reduced motion is requested.

### Self-critique

An earlier dark “developer tool” direction was rejected because it could belong to any browser utility. The light dispatch-board direction is grounded in the actual act of routing many tabs, and its colored edge rails encode grouping rather than serving as decoration. Rounded containers are limited to controls; the tab strips remain square and procedural.

## Verification

- Node’s built-in test runner verifies URL normalization, domain labels, stable group plans, protected-tab exclusions, and duplicate selection.
- A manifest check verifies Manifest V3, required permissions, local script references, and the popup entry point.
- The demo is opened in a browser-sized viewport and visually checked for loading, primary actions, responsive layout, focus, and console errors.
- The unpacked extension is documented for the user’s manual Chrome check after delivery.

## Definition of done

The project is done when the pure tests and manifest check pass, the online demo is visually verified, the README explains installation and privacy, the root tracker links App 085 to its GitHub Pages path and marks it officially complete, and the branch is pushed to GitHub `origin`.
