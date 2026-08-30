# App 099: Mica UI Design

## Product decision

Mica UI is a small, dependency-free Web Components library for developers who want a coherent interface without adopting a framework. The page has one job: let someone inspect, exercise, copy, and package the components from a single live documentation site.

The deliverable is intentionally publish-ready rather than publicly published. Public npm publication requires the repository owner's npm identity and token; `npm pack --dry-run` is the reproducible completion boundary inside this repository.

## Chosen approach

Three approaches were considered:

1. A framework-specific React kit would offer strong composition, but would make the GitHub Pages demo depend on a build pipeline and narrow the audience.
2. A CSS-only kit would be easy to host, but could not honestly demonstrate dialogs, tabs, toasts, or component lifecycle behavior.
3. Dependency-free Web Components work in the static tracker deployment, provide real custom elements, and can still ship as an npm package.

The third approach is the best fit. It keeps installation to one stylesheet and one module, while the documentation site stays runnable from any static server.

## Visual direction

The interface behaves like a materials sample room rather than a SaaS dashboard. The palette is `Porcelain #F4F5F2`, `Graphite #202321`, `Cobalt #3157D5`, `Pollen #F2C94C`, `Clay #D9734D`, and `Mist #DCE3DE`. Display type uses Georgia for an editorial, specimen-book voice; body text uses Segoe UI; measurements and code use Consolas.

The signature interaction is a live specimen bench near the top of the page. Visitors can change scale, corner shape, accent color, and theme, then see those tokens affect real components immediately. The rest of the page is quiet and grid-led so the bench remains the single visual risk.

```text
┌ brand / navigation / theme ─────────────────────────────────────┐
│ large thesis                         package command             │
├ live token controls ──────────────── live component specimen ───┤
│ component index │ searchable specimen documentation             │
│                 │ button / field / tabs / dialog / toast ...    │
├ installation / package facts / footer ──────────────────────────┤
```

The layout collapses to one column on narrow screens. Keyboard focus is conspicuous, motion is disabled with `prefers-reduced-motion`, and component status is never communicated by color alone.

## Component and data architecture

`mica-ui.js` registers twelve custom elements: button, input, select, checkbox, switch, badge, alert, progress, tabs, accordion, dialog, and toast. Each element owns an open shadow root and consumes shared CSS custom properties from `mica-ui.css`. Native controls remain inside every interactive component so keyboard and assistive-technology behavior starts from browser semantics.

`component-core.js` contains deterministic helpers for token validation, catalog search, code snippets, and percentage normalization. The documentation shell in `app.js` owns only page-level state: the selected theme, design tokens, search query, active specimen, copied snippet, dialog state, and toast queue. Preferences are stored locally and safely fall back when browser storage is unavailable.

## Error handling and verification

Invalid token values are normalized to supported defaults. Progress values are clamped to 0–100. Empty component searches show a recovery action. Clipboard failures fall back to selecting the snippet and provide a clear message. Dialog and toast controls remain usable without storage or network access.

Verification covers helper behavior with Node's built-in test runner, custom-element registration and live interaction with a browser smoke test, package contents with `npm pack --dry-run`, responsive screenshots, and the root tracker contract for app 099.
