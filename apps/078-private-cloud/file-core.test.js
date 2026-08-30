const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./file-core.js');

test('safeName removes path and control characters without losing the extension', () => {
  assert.equal(Core.safeName('  ../季度\u0000报告?.pdf  '), '..-季度-报告-.pdf');
  assert.equal(Core.safeName('   '), '未命名文件');
  assert.equal(Core.safeName('a'.repeat(140) + '.txt').length <= 120, true);
  assert.match(Core.safeName('a'.repeat(140) + '.txt'), /\.txt$/);
});

test('classifyFile uses MIME first and falls back to useful extensions', () => {
  assert.equal(Core.classifyFile({ name: 'cover.bin', type: 'image/png' }), 'image');
  assert.equal(Core.classifyFile({ name: 'interview.mp3', type: '' }), 'media');
  assert.equal(Core.classifyFile({ name: 'notes.md', type: '' }), 'document');
  assert.equal(Core.classifyFile({ name: 'archive.zip', type: 'application/zip' }), 'other');
});

test('formatBytes keeps small values exact and larger values readable', () => {
  assert.equal(Core.formatBytes(0), '0 B');
  assert.equal(Core.formatBytes(986), '986 B');
  assert.equal(Core.formatBytes(1536), '1.5 KB');
  assert.equal(Core.formatBytes(10 * 1024 * 1024), '10 MB');
});

test('uniqueName resolves duplicates case-insensitively inside a folder', () => {
  const existing = ['合同.pdf', '合同 (2).pdf', 'photo.JPG'];
  assert.equal(Core.uniqueName('合同.pdf', existing), '合同 (3).pdf');
  assert.equal(Core.uniqueName('PHOTO.jpg', existing), 'PHOTO (2).jpg');
  assert.equal(Core.uniqueName('readme', existing), 'readme');
});

test('validateBatch accounts for existing bytes and names across one batch', () => {
  const existing = [{ name: '说明.txt', size: 30, folderId: 'root' }];
  const result = Core.validateBatch([
    { name: '说明.txt', size: 20, type: 'text/plain' },
    { name: '图片.png', size: 60, type: 'image/png' },
    { name: '空.txt', size: 0, type: 'text/plain' },
  ], existing, { folderId: 'root', limitBytes: 100 });

  assert.deepEqual(result.accepted.map((file) => file.name), ['说明 (2).txt']);
  assert.equal(result.accepted[0].kind, 'document');
  assert.deepEqual(result.rejected.map((item) => item.code), ['QUOTA_EXCEEDED', 'EMPTY_FILE']);
  assert.equal(result.projectedBytes, 50);
});

test('buildUsage includes trash because recycled files still occupy storage', () => {
  const usage = Core.buildUsage([
    { size: 100, kind: 'document', deletedAt: null },
    { size: 300, kind: 'image', deletedAt: '2026-08-31T01:00:00.000Z' },
    { size: 600, kind: 'media', deletedAt: null },
  ], 2000);

  assert.equal(usage.total, 1000);
  assert.equal(usage.available, 1000);
  assert.equal(usage.percent, 50);
  assert.equal(usage.trash, 300);
  assert.deepEqual(usage.byKind, { document: 100, image: 300, media: 600, other: 0 });
});

test('filterAndSort respects archive views, text query, kind, and stable ordering', () => {
  const records = [
    { id: 'a', name: 'Zeta.pdf', kind: 'document', size: 20, folderId: 'root', createdAt: '2026-08-30T08:00:00.000Z', deletedAt: null, share: null },
    { id: 'b', name: 'Alpha.png', kind: 'image', size: 10, folderId: 'photos', createdAt: '2026-08-31T08:00:00.000Z', deletedAt: null, share: { token: 'ACTIVE' } },
    { id: 'c', name: 'Old.txt', kind: 'document', size: 30, folderId: 'root', createdAt: '2026-07-01T08:00:00.000Z', deletedAt: '2026-08-31T09:00:00.000Z', share: null },
  ];

  assert.deepEqual(Core.filterAndSort(records, { view: 'trash' }).map((file) => file.id), ['c']);
  assert.deepEqual(Core.filterAndSort(records, { view: 'shared' }).map((file) => file.id), ['b']);
  assert.deepEqual(Core.filterAndSort(records, { view: 'folder', folderId: 'root', sort: 'name' }).map((file) => file.id), ['a']);
  assert.deepEqual(Core.filterAndSort(records, { query: 'alpha', kind: 'image' }).map((file) => file.id), ['b']);
  assert.deepEqual(Core.filterAndSort(records, { sort: 'size' }).map((file) => file.id), ['a', 'b']);
});

test('createShare is deterministic with injected randomness and expiry is honest', () => {
  const now = Date.parse('2026-08-31T00:00:00.000Z');
  const share = Core.createShare({ id: 'f1' }, { days: 7, now: () => now, random: () => 0 });

  assert.equal(share.token, 'AAAAAAAA');
  assert.equal(share.createdAt, '2026-08-31T00:00:00.000Z');
  assert.equal(share.expiresAt, '2026-09-07T00:00:00.000Z');
  assert.equal(Core.shareIsActive(share, now + 1), true);
  assert.equal(Core.shareIsActive(share, Date.parse(share.expiresAt)), false);
  assert.equal(Core.shareIsActive(Core.createShare({ id: 'f2' }, { days: 0, now: () => now, random: () => 0.5 }), now + 10 ** 10), true);
});
