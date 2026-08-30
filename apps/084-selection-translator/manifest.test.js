const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appDir = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.json'), 'utf8'));

test('manifest declares a minimal MV3 permission boundary', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://api.mymemory.translated.net/*']);
  assert.equal(manifest.background.service_worker, 'background.js');
});

test('content scripts load the shared contract before the isolated UI', () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['translator-core.js', 'content.js']);
  assert.deepEqual(manifest.content_scripts[0].css, ['content.css']);
});

test('every declared extension file exists and manifest icons are real PNG files', () => {
  const declared = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
  ];
  declared.forEach((relative) => assert.equal(fs.existsSync(path.join(appDir, relative)), true, `${relative} should exist`));

  Object.values(manifest.icons).forEach((relative) => {
    const signature = fs.readFileSync(path.join(appDir, relative)).subarray(0, 8).toString('hex');
    assert.equal(signature, '89504e470d0a1a0a', `${relative} should use the PNG signature`);
  });
});
