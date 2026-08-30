# PANTRY/67 AI Recipe Recommendation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive ingredient-to-recipe application that works locally with deterministic recommendations and upgrades to safely proxied AI results when a server provider is configured.

**Architecture:** Keep normalization, filtering, scoring, fallback selection, and AI-output validation in a dependency-free UMD core shared by Node tests, the browser, and the HTTP server. Render the full workflow with semantic HTML/CSS/JavaScript; use a dependency-free Node server to host static assets and proxy an OpenAI-compatible Chat Completions request without exposing credentials.

**Tech Stack:** Semantic HTML, handcrafted CSS, vanilla JavaScript, Node.js built-in HTTP/Fetch APIs, localStorage, Clipboard API, `node:test`, Chrome DevTools Protocol.

---

### Task 1: Define the recommendation domain with TDD

**Files:**
- Create: `apps/067-ai-recipe/recipe-core.test.js`
- Create: `apps/067-ai-recipe/recipe-core.js`

**Step 1: Write failing tests**

Test `normalizeIngredient`, `parseIngredients`, `normalizeRequest`, `scoreRecipe`, `recommendRecipes`, `relaxAndRecommend`, and `sanitizeAIRecipes`. Assertions must cover Chinese aliases such as `西红柿 → 番茄`, mixed delimiters, deduplication, exclusions, vegan/vegetarian constraints, maximum time, stable ordering, missing ingredients, and removal of HTML or invalid AI fields.

**Step 2: Run the red test**

Run: `node --test apps/067-ai-recipe/recipe-core.test.js`
Expected: FAIL because `recipe-core.js` does not exist.

**Step 3: Implement the minimal domain module**

Export immutable helpers through CommonJS and `window.RecipeCore`. Normalize at most 30 ingredients; score pantry coverage, useful matches, time, cuisine and diet; exclude forbidden allergens before scoring; return three enriched records with `matchPercent`, `missing`, `available`, `reason`, and `relaxed` metadata. Accept AI recipes only when title, ingredients, steps and numeric time are valid, strip markup, cap arrays, and assign stable IDs.

**Step 4: Run green and syntax checks**

Run: `node --test apps/067-ai-recipe/recipe-core.test.js`
Run: `node --check apps/067-ai-recipe/recipe-core.js`
Expected: all tests PASS and both commands exit 0.

### Task 2: Build the PANTRY/67 interface

**Files:**
- Create: `apps/067-ai-recipe/index.html`
- Create: `apps/067-ai-recipe/styles.css`

**Step 1: Add semantic structure**

Create one `h1`, a skip link, ingredient form, live region, preference fieldsets, quick ingredient buttons, printer status, three result selectors, detailed recipe ticket, shopping clipboard, saved-recipe dialog, and useful loading/error/empty states. Do not use inline handlers.

**Step 2: Implement the visual system**

Use the six documented tokens, stainless-steel texture, magnetic ingredient chips, a black printer slot, serrated paper edges, one ticket-print animation, visible focus, 44px targets, 390px responsive layout, and reduced-motion overrides.

**Step 3: Run structural assertions**

Run a Node check that reads `index.html` and asserts one `h1`, required IDs, labelled form controls, no inline `onclick`, and script order `recipe-core.js` before `app.js`.

### Task 3: Connect local recommendations and persistence

**Files:**
- Create: `apps/067-ai-recipe/app.js`
- Modify: `apps/067-ai-recipe/index.html`

**Step 1: Add the recipe catalog and state**

Define at least 15 varied Chinese-friendly recipes with explicit required/optional ingredients, diet tags, allergens, cuisine, time, servings, utensils, steps, substitutions and nutrition estimates. Keep browser state for ingredients, constraints, recommendation source, selected ID, shopping items and favorites.

**Step 2: Implement input and recommendation flow**

Support Enter and Chinese/English separators, chip removal, quick adds, sample pantry, clear, validation, local recommendation, relaxed fallback, result selection, servings scaling, and source labels.

**Step 3: Implement shopping, favorites and restoration**

Add missing ingredients to a checked shopping list, copy its plain text, favorite/unfavorite recipes, and restore only validated state from `pantry67.state.v1`. Announce changes through the live region.

**Step 4: Verify syntax and core integration**

Run: `node --check apps/067-ai-recipe/app.js`
Run: `node --test apps/067-ai-recipe/recipe-core.test.js`
Expected: exit 0 and all tests PASS.

### Task 4: Add secure optional AI enhancement

**Files:**
- Create: `apps/067-ai-recipe/server.js`
- Create: `apps/067-ai-recipe/server.test.js`
- Modify: `apps/067-ai-recipe/app.js`

**Step 1: Write failing server tests**

Start the exported server on an ephemeral port. Assert `GET /` serves the app; `POST /api/recommend` rejects non-JSON and oversized bodies, returns 503 without credentials, returns sanitized recipes with a stubbed successful provider, and hides upstream failure details.

**Step 2: Run the red test**

Run: `node --test apps/067-ai-recipe/server.test.js`
Expected: FAIL because `server.js` does not exist.

**Step 3: Implement server and browser enhancement**

Export `createPantryServer`, `buildMessages`, and `requestAIRecipes`. Read `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL`; never serialize the key to clients. Limit request bodies to 32 KiB, add an upstream timeout, validate provider output through `sanitizeAIRecipes`, and return stable JSON errors. In the browser, retain local results immediately, attempt `/api/recommend`, replace results only on a valid response, and expose local/AI source status.

**Step 4: Run server and full static checks**

Run: `node --test apps/067-ai-recipe/recipe-core.test.js apps/067-ai-recipe/server.test.js`
Run: `node --check apps/067-ai-recipe/server.js`
Run: `node --check apps/067-ai-recipe/app.js`
Expected: all tests PASS and syntax checks exit 0.

### Task 5: Document, integrate, and verify in a browser

**Files:**
- Create: `apps/067-ai-recipe/README.md`
- Create: `apps/067-ai-recipe/qa/browser-smoke.mjs`
- Modify: `index.html`
- Modify: `qa/tracker.test.js`

**Step 1: Document honest operating modes**

Explain static local recommendation, optional AI server environment variables, privacy, allergy and nutrition limitations, localStorage, keyboard use, test commands, and the GitHub Pages URL.

**Step 2: Integrate challenge metadata**

Replace idea 67 with the `PANTRY/67` description and published path, add 67 to `INIT_DONE`, and extend tracker tests without changing completion state 62–66.

**Step 3: Add and run the browser smoke test**

Serve through `node apps/067-ai-recipe/server.js`. Use a temporary Chrome/Edge profile and CDP to verify ingredient entry, three results, ticket selection, shopping list, favorite persistence, explicit local fallback, 1440px and 390px layouts, no horizontal overflow, and no runtime errors. Save desktop and mobile screenshots under `apps/067-ai-recipe/assets/`.

**Step 4: Run full verification**

Run: `node --test apps/067-ai-recipe/recipe-core.test.js apps/067-ai-recipe/server.test.js qa/tracker.test.js`
Run: `node --check apps/067-ai-recipe/recipe-core.js`
Run: `node --check apps/067-ai-recipe/app.js`
Run: `node --check apps/067-ai-recipe/server.js`
Run: `node apps/067-ai-recipe/qa/browser-smoke.mjs`
Run: `git diff --check`
Expected: all tests PASS, screenshots exist, no runtime errors, and diff check is clean.

### Task 6: Commit and synchronize GitHub only

**Files:**
- Verify every file listed above.

**Step 1: Inspect the exact branch diff**

Run: `git status --short`, `git diff --stat origin/main...HEAD`, and `git diff --check`.

**Step 2: Create focused commits**

Commit the design/plan, core tests/implementation, interface/server, and docs/tracker/QA in auditable groups on `codex/app-067-ai-recipe`.

**Step 3: Push only to GitHub**

Run: `git push -u origin codex/app-067-ai-recipe`
Expected: GitHub `origin` accepts the branch. Do not push to Gitee or any other remote.

**Step 4: Verify synchronization and record finish time**

Compare local `HEAD` with `origin/codex/app-067-ai-recipe`, rerun `git status --short --branch`, record the finish timestamp, and report the auditable elapsed duration from the first implementation command through verification and GitHub synchronization.
