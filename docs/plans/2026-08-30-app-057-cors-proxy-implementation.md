# Relay Bench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build App 057 as a secure, localhost-only CORS proxy with a distinctive browser request workbench.

**Architecture:** A dependency-free Node HTTP service separates pure target policy from network forwarding and static/UI routing. Every target and redirect is allowlisted, DNS-resolved, rejected if any selected address is private, then contacted by resolved IP while preserving the original Host header and TLS server name.

**Tech Stack:** Node.js built-in `http`, `https`, `dns`, `net`, `crypto`, `node:test`; semantic HTML; responsive CSS; vanilla JavaScript.

---

### Task 1: Target policy

**Files:**
- Create: `apps/057-cors-proxy/proxy-policy.test.js`
- Create: `apps/057-cors-proxy/proxy-policy.js`

**Step 1: Write the failing policy tests**

Cover exact and wildcard allowlist matching, protocol and credential rejection, IPv4/IPv6 private ranges, mixed public/private DNS answers, and request/response header filtering.

**Step 2: Run the tests to verify failure**

Run: `node --test apps/057-cors-proxy/proxy-policy.test.js`

Expected: FAIL because `proxy-policy.js` does not exist.

**Step 3: Implement the minimal policy module**

Export `parseAllowedHosts`, `hostMatchesAllowlist`, `isPrivateAddress`, `validateTarget`, `filterRequestHeaders`, and `filterResponseHeaders`. All validation failures use an error with a stable `code`, `statusCode`, and safe `message`.

**Step 4: Run the tests to verify passing behavior**

Run: `node --test apps/057-cors-proxy/proxy-policy.test.js`

Expected: all policy tests PASS.

**Step 5: Commit**

Commit: `test: define app 057 proxy policy`

### Task 2: Network proxy client

**Files:**
- Create: `apps/057-cors-proxy/proxy-client.test.js`
- Create: `apps/057-cors-proxy/proxy-client.js`

**Step 1: Write failing integration tests with a local upstream**

Inject a validator that resolves the fixture URL to `127.0.0.1`, then assert method/body forwarding, response header filtering, relative redirect following, timeout handling and response-size enforcement.

**Step 2: Run the focused tests**

Run: `node --test apps/057-cors-proxy/proxy-client.test.js`

Expected: FAIL because `proxy-client.js` does not exist.

**Step 3: Implement bounded forwarding**

Use a selected validated address for the socket connection, original host for HTTP Host/TLS SNI, `Connection: close`, buffered responses capped by `maxResponseBytes`, and recursive redirects capped by `maxRedirects`.

**Step 4: Run policy and client tests**

Run: `node --test apps/057-cors-proxy/*.test.js`

Expected: all tests PASS.

**Step 5: Commit**

Commit: `feat: add bounded cors proxy client`

### Task 3: HTTP service

**Files:**
- Create: `apps/057-cors-proxy/server.test.js`
- Create: `apps/057-cors-proxy/server.js`
- Create: `apps/057-cors-proxy/package.json`

**Step 1: Write failing route tests**

Start `createServer()` on an ephemeral port with an injected proxy function. Test `GET /health`, `GET /config`, `OPTIONS /proxy`, missing target, unsupported method, oversized body and a successful proxy response.

**Step 2: Run the route tests and confirm failure**

Run: `node --test apps/057-cors-proxy/server.test.js`

Expected: FAIL because the server factory does not exist.

**Step 3: Implement routes and stable error envelopes**

Serve only known static files, parse environment limits defensively, generate a short request id, avoid logging secret headers/bodies, and return `{ error: { code, message, requestId } }` for failures.

**Step 4: Run all tests and syntax checks**

Run: `npm test --prefix apps/057-cors-proxy`

Run: `node --check apps/057-cors-proxy/server.js`

Expected: all tests PASS and syntax check exits 0.

**Step 5: Commit**

Commit: `feat: expose app 057 cors proxy service`

### Task 4: Patch-panel workbench

**Files:**
- Create: `apps/057-cors-proxy/index.html`
- Create: `apps/057-cors-proxy/styles.css`
- Create: `apps/057-cors-proxy/app.js`

**Step 1: Build the semantic page shell**

Add the device header, four-jack request route, labeled request form, response monitor, copy action, safety strip and offline startup guidance. Keep every control reachable by keyboard.

**Step 2: Implement the visual system**

Derive all colors from the six design tokens, keep the patch cable as the sole strong decorative element, add one request pulse, visible focus styles, reduced-motion handling and a single-column mobile layout.

**Step 3: Wire the browser behavior**

Load `/config`, validate header JSON, submit through `/proxy`, format JSON/text safely, show status/duration/bytes/headers, copy a matching fetch snippet, persist the form draft and represent offline/rejected/success states on the cable.

**Step 4: Run syntax and static checks**

Run: `node --check apps/057-cors-proxy/app.js`

Expected: exit 0; labels, ARIA live regions and focus states are present.

**Step 5: Commit**

Commit: `feat: build app 057 relay workbench`

### Task 5: Delivery and verification

**Files:**
- Create: `apps/057-cors-proxy/README.md`
- Modify: `index.html` App 057 entry and `INIT_DONE`

**Step 1: Document setup and security boundaries**

Include Windows/macOS/Linux startup examples, environment variables, API usage, allowlist patterns, limits, deployment caveat, test command and future improvements.

**Step 2: Update the challenge tracker**

Set App 057 copy to `RELAY/57`, add its GitHub Pages URL, and mark 57 done without changing completion state for projects not present on this branch.

**Step 3: Run complete automated verification**

Run: `npm test --prefix apps/057-cors-proxy`

Run: `node --check apps/057-cors-proxy/proxy-policy.js && node --check apps/057-cors-proxy/proxy-client.js && node --check apps/057-cors-proxy/server.js && node --check apps/057-cors-proxy/app.js`

Expected: all tests PASS and every syntax check exits 0.

**Step 4: Run browser verification**

Start the service, exercise successful and rejected requests, then inspect 1440×900 and 390×844 screenshots for overflow, state clarity and console errors.

**Step 5: Commit and synchronize**

Commit: `chore: mark app 057 complete`

Fetch and rebase onto GitHub `origin/main`, resolve tracker-only drift without overwriting other apps, rerun verification, push only to `origin`, and confirm the remote commit hash.
