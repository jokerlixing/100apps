import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = join(testDirectory, "..");
const manifestPath = join(appDirectory, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

test("manifest is a least-privilege Manifest V3 extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number(manifest.minimum_chrome_version) >= 102);
  assert.deepEqual([...manifest.permissions].sort(), ["storage", "tabGroups", "tabs"]);
  assert.equal(Object.hasOwn(manifest, "host_permissions"), false);
  assert.equal(Object.hasOwn(manifest, "content_scripts"), false);
  assert.equal(Object.hasOwn(manifest, "externally_connectable"), false);
});

test("manifest popup and every local popup asset exist", () => {
  const popupPath = join(appDirectory, manifest.action.default_popup);
  assert.ok(existsSync(popupPath), `Missing popup: ${popupPath}`);

  const popup = readFileSync(popupPath, "utf8");
  const localReferences = [
    ...popup.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/gi),
  ].map((match) => match[1]);

  assert.deepEqual(localReferences.sort(), ["popup.css", "popup.js"]);
  for (const reference of localReferences) {
    assert.ok(existsSync(join(appDirectory, reference)), `Missing popup asset: ${reference}`);
  }

  const scriptTags = [...popup.matchAll(/<script\b([^>]*)>/gi)];
  assert.ok(scriptTags.length > 0);
  assert.ok(scriptTags.every((match) => /\bsrc="[^"]+"/.test(match[1])), "Popup scripts must stay external for extension CSP");
});

test("GitHub Pages entry point exposes the shared demo safely", () => {
  const demoPath = join(appDirectory, "index.html");
  assert.ok(existsSync(demoPath));
  const demo = readFileSync(demoPath, "utf8");

  assert.match(demo, /<iframe\s+src="popup\.html\?demo=1"/);
  assert.match(demo, /chrome:\/\/extensions/);
  assert.doesNotMatch(demo, /<script\b/i);
});
