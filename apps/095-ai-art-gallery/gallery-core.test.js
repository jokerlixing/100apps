const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_USER_ARTWORKS,
  STYLES,
  RATIOS,
  BUILTIN_ARTWORKS,
  cleanPrompt,
  normalizeStyle,
  normalizeRatio,
  hashText,
  createRng,
  paletteForPrompt,
  createArtwork,
  normalizeArtwork,
  normalizeGalleryState,
  toggleFavorite,
  removeUserArtwork,
  clearUserArtworks,
  filterArtworks,
  getCanvasSize,
  buildShareText
} = require('./gallery-core');

test('cleans prompts without control characters or unbounded length', () => {
  assert.equal(cleanPrompt('  海边\u0000 的   漂浮图书馆\n蓝色时刻  '), '海边 的 漂浮图书馆 蓝色时刻');
  assert.equal(Array.from(cleanPrompt('光'.repeat(240))).length, 180);
  assert.equal(cleanPrompt(' \n\t '), '');
});

test('normalizes supported style and ratio identifiers', () => {
  assert.equal(normalizeStyle('ink'), 'ink');
  assert.equal(normalizeStyle('missing'), 'dream');
  assert.equal(normalizeRatio('portrait'), 'portrait');
  assert.equal(normalizeRatio(null), 'square');
  assert.equal(STYLES.poster.label, '几何海报');
  assert.deepEqual(RATIOS.landscape.value, [3, 2]);
});

test('hashing and seeded random sequences are deterministic', () => {
  assert.equal(hashText('MUSE/95'), hashText('MUSE/95'));
  assert.notEqual(hashText('MUSE/95'), hashText('MUSE/96'));
  const first = createRng(9511);
  const second = createRng(9511);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
  const values = Array.from({ length: 20 }, () => first());
  assert.equal(values.every((value) => value >= 0 && value < 1), true);
});

test('maps recognizable prompt imagery to an intentional palette', () => {
  assert.equal(paletteForPrompt('午夜海面与月光', 'dream').name, '深海蓝调');
  assert.equal(paletteForPrompt('森林里的苔藓和树影', 'ink').name, '林地标本');
  assert.equal(paletteForPrompt('一座未来城市', 'poster').name, '都市电波');
  assert.equal(paletteForPrompt('抽象的记忆切片', 'terrain').colors.length, 5);
});

test('creates stable artwork recipes from prompt controls', () => {
  const artwork = createArtwork({
    prompt: '  珊瑚色太阳下的漂浮图书馆  ',
    style: 'architecture',
    ratio: 'landscape',
    seed: 9511,
    createdAt: 1788110000000
  });

  assert.deepEqual(artwork, {
    id: `user-9511-${hashText('珊瑚色太阳下的漂浮图书馆').toString(36)}`,
    prompt: '珊瑚色太阳下的漂浮图书馆',
    style: 'architecture',
    ratio: 'landscape',
    seed: 9511,
    createdAt: 1788110000000,
    liked: false,
    source: 'user'
  });
  assert.equal(createArtwork({ prompt: '  ' }), null);
});

test('repairs persisted artwork records and rejects malformed entries', () => {
  const repaired = normalizeArtwork({
    id: ' user-01 ',
    prompt: ' 夜色里的纸灯 ',
    style: 'bad',
    ratio: 'portrait',
    seed: '42',
    createdAt: '1788110000000',
    liked: 1,
    source: 'user'
  });
  assert.equal(repaired.id, 'user-01');
  assert.equal(repaired.style, 'dream');
  assert.equal(repaired.seed, 42);
  assert.equal(repaired.liked, true);
  assert.equal(normalizeArtwork({ id: '<bad>', prompt: 'ok', seed: 1 }), null);
  assert.equal(normalizeArtwork({ id: 'good', prompt: '', seed: 1 }), null);
});

test('normalizes, deduplicates, sorts and caps saved user artworks', () => {
  const many = Array.from({ length: MAX_USER_ARTWORKS + 5 }, (_, index) => ({
    id: `user-${index}`,
    prompt: `作品 ${index}`,
    style: 'dream',
    ratio: 'square',
    seed: index + 1,
    createdAt: index + 1,
    source: 'user'
  }));
  many.push({ ...many[0], prompt: '重复' });
  const state = normalizeGalleryState({ artworks: many, likedIds: ['exhibit-library', '<bad>', 'exhibit-library'] });
  assert.equal(state.artworks.length, MAX_USER_ARTWORKS);
  assert.equal(state.artworks[0].id, `user-${MAX_USER_ARTWORKS + 4}`);
  assert.deepEqual(state.likedIds, ['exhibit-library']);
});

test('toggles favorites without mutating the source artwork list', () => {
  const source = [normalizeArtwork(BUILTIN_ARTWORKS[0]), normalizeArtwork(BUILTIN_ARTWORKS[1])];
  const toggled = toggleFavorite(source, source[0].id);
  assert.equal(toggled[0].liked, true);
  assert.equal(source[0].liked, false);
  assert.equal(toggleFavorite(toggled, source[0].id)[0].liked, false);
});

test('removes one user artwork and its favorite reference', () => {
  const first = createArtwork({ prompt: '紫色雨夜', seed: 11, createdAt: 1 });
  const second = createArtwork({ prompt: '珊瑚色清晨', seed: 12, createdAt: 2 });
  const source = { artworks: [first, second], likedIds: [first.id, second.id, 'exhibit-library'] };
  const result = removeUserArtwork(source, first.id);

  assert.deepEqual(result.artworks.map((artwork) => artwork.id), [second.id]);
  assert.deepEqual(result.likedIds, [second.id, 'exhibit-library']);
  assert.equal(source.artworks.length, 2, 'source state should not be mutated');
  assert.deepEqual(removeUserArtwork(source, 'exhibit-library').artworks.map((artwork) => artwork.id), [second.id, first.id]);
});

test('clears every user artwork while preserving curated favorites', () => {
  const first = createArtwork({ prompt: '雾中车站', seed: 21, createdAt: 1 });
  const second = createArtwork({ prompt: '月光花园', seed: 22, createdAt: 2 });
  const result = clearUserArtworks({
    artworks: [first, second],
    likedIds: [first.id, 'exhibit-library', second.id, 'builtin-02']
  });

  assert.deepEqual(result.artworks, []);
  assert.deepEqual(result.likedIds, ['exhibit-library', 'builtin-02']);
});

test('filters all, personal and liked artworks with keyword search', () => {
  const mine = [createArtwork({ prompt: '雾里的橙色车站', style: 'poster', seed: 88, createdAt: 4 })];
  const builtins = BUILTIN_ARTWORKS.map((artwork) => ({ ...artwork }));
  builtins[0].liked = true;

  assert.equal(filterArtworks(builtins, mine, { filter: 'mine' }).length, 1);
  assert.equal(filterArtworks(builtins, mine, { filter: 'liked' }).length, 1);
  assert.equal(filterArtworks(builtins, mine, { query: '橙色' })[0].source, 'user');
  assert.equal(filterArtworks(builtins, mine, { query: '版画建筑' }).some((artwork) => artwork.style === 'architecture'), true);
});

test('computes bounded export sizes for every aspect ratio', () => {
  assert.deepEqual(getCanvasSize('square', 1200), { width: 1200, height: 1200 });
  assert.deepEqual(getCanvasSize('portrait', 1200), { width: 900, height: 1200 });
  assert.deepEqual(getCanvasSize('landscape', 1200), { width: 1200, height: 800 });
  assert.deepEqual(getCanvasSize('bad', 400), { width: 400, height: 400 });
});

test('builds a complete shareable prompt recipe', () => {
  const artwork = createArtwork({ prompt: '月光下会呼吸的花园', style: 'ink', ratio: 'portrait', seed: 2026, createdAt: 1 });
  const text = buildShareText(artwork);
  assert.match(text, /月光下会呼吸的花园/);
  assert.match(text, /墨线生长/);
  assert.match(text, /竖幅 3:4/);
  assert.match(text, /Seed 2026/);
  assert.match(text, /MUSE\/95/);
});
