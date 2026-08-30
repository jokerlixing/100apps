# App 098 Blockchain Explorer Design

## Product decision

App 098 is **Trace/98**, a portfolio-grade blockchain explorer for developers, analysts, and curious newcomers. Its single job is to make one chain snapshot easy to interrogate: paste an address, transaction hash, or block height and immediately see the relevant record, its status, and how it connects to nearby activity.

Three delivery approaches were considered. A public-chain API would feel live, but GitHub Pages deployments are vulnerable to rate limits, CORS changes, and provider keys. A custom indexer would be more realistic but would add a backend and operations burden far beyond this challenge. The selected approach is a deterministic local chain snapshot with a simulated head block. It preserves the complete search and drill-down experience, works offline, and can later be swapped for an RPC adapter without changing the view layer.

## Experience and visual system

The interface follows a **chain forensics desk** direction rather than the common black-and-neon crypto dashboard. The palette is Ledger Paper `#F3F5F2`, Graphite `#18202A`, Blueprint `#2958D6`, Oxide `#E86F3D`, Mint Seal `#A9DCC3`, and Alert `#C83F49`. `Arial Narrow`/`Bahnschrift Condensed` carries terse headlines, `Segoe UI Variable` handles reading, and `Cascadia Code` renders hashes and numeric evidence.

The signature element is a horizontal **block tape**: linked, notched block cards ordered around the chain head. Selecting a card opens its evidence sheet, making the chain structure functional rather than decorative. Motion is limited to one head-block pulse and result transitions; reduced-motion users receive the same state changes without animation.

```text
┌ network + finality ─────────────────────────────── app mark ┐
│ Search any address / transaction / block         [Inspect] │
│ [sample address] [sample tx] [sample block]                 │
├ chain tape:  #21450938 ─ #21450937 ─ #21450936 ─ … ────────┤
│ Evidence sheet                         │ Network ledger      │
│ selected entity summary + fields       │ latest blocks       │
│ related transactions                   │ pending transactions│
└────────────────────────────────────────┴─────────────────────┘
```

## Architecture and behavior

`chain-data.js` owns a small coherent snapshot: blocks, transactions, and addresses reference one another. `explorer-core.js` provides pure UMD functions for query classification, lookup, formatting, address activity aggregation, and snapshot validation. `app.js` owns DOM rendering, URL query state, copying, selection, and the simulated head indicator. No user input is inserted with `innerHTML`; dynamic values are assigned through text nodes.

The universal search normalizes whitespace and recognizes decimal block heights, 64-nybble transaction hashes, and 40-nybble addresses. Known entities render a detailed evidence sheet and related records. Valid-but-unknown identifiers produce a specific empty state with sample actions; malformed queries explain accepted formats. Search updates `?q=` so results are shareable and browser navigation works.

Verification covers exported core behavior, snapshot referential integrity, malformed/unknown queries, URL-driven search, keyboard focus, desktop/mobile overflow, touch target sizing, and runtime console errors. Screenshots are produced only after the browser smoke test passes.
