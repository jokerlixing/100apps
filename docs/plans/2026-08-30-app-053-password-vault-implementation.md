# App 053 Password Vault Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a responsive, zero-account local password vault whose saved and exported data is authenticated ciphertext protected by a master password.

**Architecture:** A dependency-free `vault-core.js` owns validation, cryptography and password generation and is shared by Node tests and the browser. `app.js` owns the unlocked in-memory state, serialized saves, inactivity locking and DOM interactions; `localStorage` contains only a versioned encrypted envelope.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Web Crypto (`PBKDF2` + `AES-GCM`), Node's built-in test runner.

---

### Task 1: Lock down the vault domain with TDD

**Files:**
- Create: `apps/053-password-vault/vault-core.test.js`
- Create: `apps/053-password-vault/vault-core.js`

**Step 1: Write failing validation tests**

Cover entry normalization, envelope shape and size bounds, password-strength feedback, safe URL parsing and invalid inputs.

**Step 2: Run the tests to verify red**

Run: `node --test apps/053-password-vault/vault-core.test.js`

Expected: FAIL because `vault-core.js` does not exist.

**Step 3: Implement the dependency-free validation helpers**

Export helpers through CommonJS and `window.VaultCore`. Clamp every user-controlled string, reject malformed Base64 and accept only version 1 envelopes with PBKDF2-HMAC-SHA-256 and AES-GCM parameters inside documented bounds.

**Step 4: Write failing cryptography tests**

Use `node:crypto.webcrypto` to cover an encrypt/decrypt round trip, wrong master password, ciphertext tampering, unique random material and encrypted-envelope plaintext absence.

**Step 5: Implement vault encryption and decryption**

Derive a non-extractable AES-256-GCM key with PBKDF2. Production defaults to 600,000 iterations, 16-byte salt and a new 12-byte IV per save. Authenticate the schema marker as additional data.

**Step 6: Write and satisfy password-generator tests**

Cover allowed character sets, required selected groups, length bounds, ambiguous-character exclusion and an injected deterministic random source. Use rejection sampling over `crypto.getRandomValues`; never use `Math.random`.

**Step 7: Run green and syntax checks**

Run:

```text
node --test apps/053-password-vault/vault-core.test.js
node --check apps/053-password-vault/vault-core.js
```

Expected: all tests PASS and syntax check exits 0.

### Task 2: Build the LOCKBOX/53 interface

**Files:**
- Create: `apps/053-password-vault/index.html`
- Create: `apps/053-password-vault/styles.css`

**Step 1: Add semantic locked and unlocked states**

Create onboarding/unlock forms, an account index, an accessible entry editor, generator controls, vault-status panel, confirmation dialog, import form and toast/live regions. Keep scripts and styles external so CSP can reject inline execution.

**Step 2: Implement the locksmith-workbench visual system**

Use the design tokens and physical metaphors from the design document. Add responsive layouts for 1280px, 768px and 390px, visible focus, touch targets, print-safe hiding and reduced-motion behavior.

**Step 3: Run static structure checks**

Verify unique IDs, associated labels, no inline event handlers, no third-party URLs and no width that forces horizontal scrolling at 390px.

### Task 3: Connect storage, lifecycle and interactions

**Files:**
- Create: `apps/053-password-vault/app.js`
- Modify: `apps/053-password-vault/index.html`

**Step 1: Implement create, unlock and lock**

Detect Web Crypto and secure-context support, create the initial encrypted envelope, unlock into memory, discard key/data on lock and restore the correct screen after refresh.

**Step 2: Implement entry CRUD and serialized encrypted saves**

Search and sort the in-memory entries, validate edits, save only on explicit submit, generate a fresh IV for every change and update the selected work ticket. Surface storage failures without claiming success.

**Step 3: Implement secret handling and generator controls**

Keep passwords masked by default, support show/hide and secure-context clipboard copy, populate the editor from the generator only after an explicit action, and expose strength feedback without displaying the secret elsewhere.

**Step 4: Implement inactivity lock and backup workflows**

Reset the deadline for keyboard/pointer/touch activity, support 1/5/15/30 minute settings, export the encrypted envelope, validate and decrypt an import before replacement, and require typed confirmation before destructive reset.

**Step 5: Run unit and syntax checks**

Run:

```text
node --test apps/053-password-vault/vault-core.test.js
node --check apps/053-password-vault/app.js
```

Expected: PASS / exit 0.

### Task 4: Document and integrate App 053

**Files:**
- Create: `apps/053-password-vault/README.md`
- Modify: `index.html`

**Step 1: Document use and security boundaries**

Explain HTTPS/localhost requirements, algorithms and parameters, local-only storage, auto-lock, encrypted backups, master-password non-recovery, browser/extension threat limits and exact test commands.

**Step 2: Mark App 053 complete in the tracker**

Add the GitHub Pages URL and a concise `LOCKBOX/53` description without changing App 052's pending state.

### Task 5: Verify, review and synchronize

**Files:**
- Verify every App 053 file and the root tracker.

**Step 1: Run automated verification**

Run unit tests, JavaScript syntax checks, HTML/static scans and focused security assertions. Confirm no App 053 source contains `Math.random`, remote asset URLs or the test plaintext after a browser save.

**Step 2: Run browser verification**

Serve the repository locally over localhost. Validate onboarding, wrong-password rejection, refresh/unlock persistence, CRUD, search, password generation, copy, manual and automatic lock, encrypted export/import, and destructive reset cancellation. Check 1280px desktop and 390px mobile screenshots, keyboard focus and console/network output.

**Step 3: Review the focused diff**

Check for accidental plaintext persistence, IV reuse, unsafe URL insertion, unsanitized HTML, race conditions and unrelated repository changes. Fix findings and rerun verification.

**Step 4: Commit and push GitHub only**

Create focused commits on `codex/app-053-password-vault`, integrate onto the latest `origin/main` without overwriting App 052, and push only to GitHub `origin`. Verify the remote main commit before stopping the timer.

