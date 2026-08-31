(function initMuseCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MuseCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMuseCore() {
  'use strict';

  const MAX_PROMPT_LENGTH = 180;
  const MAX_USER_ARTWORKS = 18;
  const MAX_SEED = 2147483646;

  const STYLES = Object.freeze({
    dream: Object.freeze({ id: 'dream', label: '梦境拼贴', short: 'DREAM', description: '柔光、漂浮形体与纸张层次' }),
    architecture: Object.freeze({ id: 'architecture', label: '版画建筑', short: 'ARCH', description: '拱门、结构线与印刷颗粒' }),
    ink: Object.freeze({ id: 'ink', label: '墨线生长', short: 'INK', description: '呼吸曲线、留白与有机枝条' }),
    poster: Object.freeze({ id: 'poster', label: '几何海报', short: 'POSTER', description: '强对比色块与编辑构图' }),
    terrain: Object.freeze({ id: 'terrain', label: '地形光谱', short: 'TERRAIN', description: '层叠地貌、光带与远景' })
  });

  const RATIOS = Object.freeze({
    square: Object.freeze({ id: 'square', label: '方形 1:1', value: [1, 1] }),
    portrait: Object.freeze({ id: 'portrait', label: '竖幅 3:4', value: [3, 4] }),
    landscape: Object.freeze({ id: 'landscape', label: '横幅 3:2', value: [3, 2] })
  });

  const PALETTES = Object.freeze({
    ocean: Object.freeze({ name: '深海蓝调', colors: ['#10182F', '#2745A5', '#5C8DE4', '#B7E5E7', '#FF806A'] }),
    forest: Object.freeze({ name: '林地标本', colors: ['#172A24', '#356B56', '#83AF7D', '#D7D6A5', '#F4EEE0'] }),
    city: Object.freeze({ name: '都市电波', colors: ['#211B2D', '#6552D9', '#A891F2', '#FF735E', '#E7E9F1'] }),
    floral: Object.freeze({ name: '花房微光', colors: ['#2A1E35', '#AA5C92', '#F29AA3', '#FFD1B7', '#B7E5E7'] }),
    sunset: Object.freeze({ name: '日落胶片', colors: ['#37243F', '#8D466D', '#E45E55', '#FFAA68', '#F5E5B8'] }),
    night: Object.freeze({ name: '夜航信号', colors: ['#111426', '#303B83', '#6B62CB', '#A8B7EF', '#F0C96B'] }),
    neutral: Object.freeze({ name: '记忆切片', colors: ['#211B2D', '#6552D9', '#B7E5E7', '#FF735E', '#FBFAFC'] })
  });

  const BUILTIN_ARTWORKS = Object.freeze([
    Object.freeze({
      id: 'exhibit-library',
      prompt: '蓝色时刻，漂浮在镜面海上的不可能图书馆，珊瑚色太阳与纸片穿过拱门',
      style: 'architecture', ratio: 'square', seed: 9511, createdAt: 1788105600000, liked: false, source: 'ai', image: 'assets/floating-library.png'
    }),
    Object.freeze({
      id: 'exhibit-orbit',
      prompt: '午夜的轨道花园，月亮像一枚旧唱片，银色植物沿着声音生长',
      style: 'dream', ratio: 'portrait', seed: 42095, createdAt: 1788019200000, liked: false, source: 'builtin'
    }),
    Object.freeze({
      id: 'exhibit-market',
      prompt: '雨后的未来夜市，紫色屋顶与橙色路牌倒映在街面，俯视构图',
      style: 'poster', ratio: 'landscape', seed: 79531, createdAt: 1787932800000, liked: false, source: 'builtin'
    }),
    Object.freeze({
      id: 'exhibit-forest',
      prompt: '森林深处的植物标本室，墨线枝条穿过半透明的绿色玻璃',
      style: 'ink', ratio: 'portrait', seed: 18420, createdAt: 1787846400000, liked: false, source: 'builtin'
    }),
    Object.freeze({
      id: 'exhibit-coast',
      prompt: '粉橙日落下的海岸地形，风把岛屿切成层叠的光谱',
      style: 'terrain', ratio: 'landscape', seed: 61137, createdAt: 1787760000000, liked: false, source: 'builtin'
    }),
    Object.freeze({
      id: 'exhibit-flower',
      prompt: '一朵会记录梦境的机械花，花瓣里藏着清晨的蓝色房间',
      style: 'dream', ratio: 'square', seed: 30518, createdAt: 1787673600000, liked: false, source: 'builtin'
    })
  ]);

  function cleanPrompt(value) {
    if (typeof value !== 'string') return '';
    return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
      .slice(0, MAX_PROMPT_LENGTH)
      .join('');
  }

  function normalizeStyle(value) {
    return typeof value === 'string' && STYLES[value] ? value : 'dream';
  }

  function normalizeRatio(value) {
    return typeof value === 'string' && RATIOS[value] ? value : 'square';
  }

  function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(seedValue) {
    let seed = (Number(seedValue) || 1) >>> 0;
    return function nextRandom() {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function paletteForPrompt(promptValue) {
    const prompt = cleanPrompt(promptValue).toLocaleLowerCase('zh-CN');
    if (/海|浪|水|鲸|潮|ocean|sea|wave/.test(prompt)) return PALETTES.ocean;
    if (/森林|树|苔藓|植物|叶|forest|tree|moss/.test(prompt)) return PALETTES.forest;
    if (/城市|街|建筑|车站|霓虹|city|street|station/.test(prompt)) return PALETTES.city;
    if (/花|花园|玫瑰|绽放|flower|garden|rose/.test(prompt)) return PALETTES.floral;
    if (/日落|黄昏|夕阳|橙色太阳|sunset|dusk/.test(prompt)) return PALETTES.sunset;
    if (/夜|午夜|月|星|宇宙|night|moon|star|space/.test(prompt)) return PALETTES.night;
    return PALETTES.neutral;
  }

  function normalizeSeed(value, fallbackText) {
    const numeric = Math.floor(Number(value));
    if (Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_SEED) return numeric;
    return (hashText(fallbackText) % MAX_SEED) + 1;
  }

  function createArtwork(input) {
    const source = input && typeof input === 'object' ? input : {};
    const prompt = cleanPrompt(source.prompt);
    if (!prompt) return null;
    const style = normalizeStyle(source.style);
    const ratio = normalizeRatio(source.ratio);
    const seed = normalizeSeed(source.seed, `${prompt}|${style}|${ratio}`);
    const createdAtValue = Number(source.createdAt);
    const createdAt = Number.isFinite(createdAtValue) && createdAtValue >= 0 ? createdAtValue : Date.now();
    return {
      id: `user-${seed}-${hashText(prompt).toString(36)}`,
      prompt,
      style,
      ratio,
      seed,
      createdAt,
      liked: false,
      source: 'user'
    };
  }

  function normalizeArtwork(value) {
    if (!value || typeof value !== 'object') return null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const prompt = cleanPrompt(value.prompt);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id) || !prompt) return null;
    const source = ['user', 'builtin', 'ai'].includes(value.source) ? value.source : 'user';
    const createdAtValue = Number(value.createdAt);
    const normalized = {
      id,
      prompt,
      style: normalizeStyle(value.style),
      ratio: normalizeRatio(value.ratio),
      seed: normalizeSeed(value.seed, `${prompt}|${id}`),
      createdAt: Number.isFinite(createdAtValue) && createdAtValue >= 0 ? createdAtValue : 0,
      liked: Boolean(value.liked),
      source
    };
    if (source === 'ai' && typeof value.image === 'string' && /^[a-z0-9_./-]+$/i.test(value.image)) normalized.image = value.image;
    return normalized;
  }

  function normalizeGalleryState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const seen = new Set();
    const artworks = [];
    for (const candidate of Array.isArray(source.artworks) ? source.artworks : []) {
      const artwork = normalizeArtwork(candidate);
      if (!artwork || artwork.source !== 'user' || seen.has(artwork.id)) continue;
      seen.add(artwork.id);
      artworks.push(artwork);
    }
    artworks.sort((left, right) => right.createdAt - left.createdAt);

    const likedIds = [];
    const seenLikes = new Set();
    for (const id of Array.isArray(source.likedIds) ? source.likedIds : []) {
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(id) || seenLikes.has(id)) continue;
      seenLikes.add(id);
      likedIds.push(id);
    }
    return { artworks: artworks.slice(0, MAX_USER_ARTWORKS), likedIds };
  }

  function toggleFavorite(artworks, requestedId) {
    return (Array.isArray(artworks) ? artworks : []).map((artwork) => ({
      ...artwork,
      liked: artwork.id === requestedId ? !artwork.liked : artwork.liked
    }));
  }

  function removeUserArtwork(value, requestedId) {
    const state = normalizeGalleryState(value);
    const id = typeof requestedId === 'string' ? requestedId.trim() : '';
    if (!id || !state.artworks.some((artwork) => artwork.id === id)) return state;
    return {
      artworks: state.artworks.filter((artwork) => artwork.id !== id),
      likedIds: state.likedIds.filter((likedId) => likedId !== id)
    };
  }

  function clearUserArtworks(value) {
    const state = normalizeGalleryState(value);
    const userIds = new Set(state.artworks.map((artwork) => artwork.id));
    return {
      artworks: [],
      likedIds: state.likedIds.filter((id) => !userIds.has(id))
    };
  }

  function filterArtworks(builtinInput, userInput, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const builtins = (Array.isArray(builtinInput) ? builtinInput : []).map(normalizeArtwork).filter(Boolean);
    const users = (Array.isArray(userInput) ? userInput : []).map(normalizeArtwork).filter(Boolean).sort((left, right) => right.createdAt - left.createdAt);
    const filter = ['all', 'mine', 'liked'].includes(settings.filter) ? settings.filter : 'all';
    const query = cleanPrompt(settings.query || '').toLocaleLowerCase('zh-CN');
    let combined = filter === 'mine' ? users : [...users, ...builtins];
    if (filter === 'liked') combined = combined.filter((artwork) => artwork.liked);
    if (!query) return combined;
    return combined.filter((artwork) => {
      const haystack = [artwork.prompt, STYLES[artwork.style].label, RATIOS[artwork.ratio].label, paletteForPrompt(artwork.prompt).name]
        .join(' ')
        .toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    });
  }

  function getCanvasSize(ratioValue, longEdgeValue) {
    const ratio = RATIOS[normalizeRatio(ratioValue)];
    const longEdge = Math.max(320, Math.min(2400, Math.round(Number(longEdgeValue) || 1200)));
    const [widthRatio, heightRatio] = ratio.value;
    if (widthRatio === heightRatio) return { width: longEdge, height: longEdge };
    if (widthRatio < heightRatio) return { width: Math.round(longEdge * widthRatio / heightRatio), height: longEdge };
    return { width: longEdge, height: Math.round(longEdge * heightRatio / widthRatio) };
  }

  function buildShareText(value) {
    const artwork = normalizeArtwork(value);
    if (!artwork) return '';
    return `「${artwork.prompt}」\n风格：${STYLES[artwork.style].label} · 画幅：${RATIOS[artwork.ratio].label} · Seed ${artwork.seed}\n由 MUSE/95 提示词画室生成`;
  }

  return Object.freeze({
    MAX_PROMPT_LENGTH,
    MAX_USER_ARTWORKS,
    STYLES,
    RATIOS,
    PALETTES,
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
  });
});
