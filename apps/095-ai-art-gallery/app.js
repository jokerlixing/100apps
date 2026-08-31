(function startMuseGallery() {
  'use strict';

  const Core = window.MuseCore;
  const Engine = window.MuseArtEngine;
  if (!Core || !Engine) throw new Error('MUSE/95 runtime failed to load.');

  const STORAGE_KEY = 'apps100_muse95_v1';
  const elements = {
    promptForm: document.querySelector('#promptForm'),
    promptInput: document.querySelector('#promptInput'),
    promptCount: document.querySelector('#promptCount'),
    promptError: document.querySelector('#promptError'),
    promptSuggestions: [...document.querySelectorAll('[data-prompt]')],
    styleOptions: document.querySelector('#styleOptions'),
    styleButtons: [...document.querySelectorAll('[data-style]')],
    styleDescription: document.querySelector('#styleDescription'),
    ratioOptions: document.querySelector('#ratioOptions'),
    ratioButtons: [...document.querySelectorAll('[data-ratio]')],
    seedInput: document.querySelector('#seedInput'),
    randomSeedButton: document.querySelector('#randomSeedButton'),
    generateButton: document.querySelector('#generateButton'),
    generationStatus: document.querySelector('#generationStatus'),
    artStage: document.querySelector('#artStage'),
    heroImage: document.querySelector('#heroImage'),
    heroCanvas: document.querySelector('#heroCanvas'),
    sourceBadge: document.querySelector('#sourceBadge'),
    currentPrompt: document.querySelector('#currentPrompt'),
    currentStyle: document.querySelector('#currentStyle'),
    currentRatio: document.querySelector('#currentRatio'),
    currentPalette: document.querySelector('#currentPalette'),
    currentSeed: document.querySelector('#currentSeed'),
    heroLikeButton: document.querySelector('#heroLikeButton'),
    heroShareButton: document.querySelector('#heroShareButton'),
    heroDownloadButton: document.querySelector('#heroDownloadButton'),
    headerArtworkCount: document.querySelector('#headerArtworkCount'),
    filterButtons: [...document.querySelectorAll('[data-filter]')],
    gallerySearch: document.querySelector('#gallerySearch'),
    galleryGrid: document.querySelector('#galleryGrid'),
    galleryEmpty: document.querySelector('#galleryEmpty'),
    clearFiltersButton: document.querySelector('#clearFiltersButton'),
    clearArtworksButton: document.querySelector('#clearArtworksButton'),
    allCount: document.querySelector('#allCount'),
    mineCount: document.querySelector('#mineCount'),
    likedCount: document.querySelector('#likedCount'),
    toast: document.querySelector('#toast'),
    liveRegion: document.querySelector('#liveRegion')
  };

  let state = loadState();
  let currentArtwork = decorateArtwork(Core.normalizeArtwork(Core.BUILTIN_ARTWORKS[0]));
  let selectedStyle = currentArtwork.style;
  let selectedRatio = currentArtwork.ratio;
  let currentFilter = 'all';
  let toastTimer = 0;
  let generationId = 0;

  function loadState() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return Core.normalizeGalleryState(value ? JSON.parse(value) : null);
    } catch (_) {
      return Core.normalizeGalleryState(null);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      showToast('浏览器存储空间不足。作品仍可下载，但这次配方没有保存。');
      return false;
    }
  }

  function likedSet() {
    return new Set(state.likedIds);
  }

  function decorateArtwork(artwork) {
    return artwork ? { ...artwork, liked: likedSet().has(artwork.id) } : null;
  }

  function decoratedBuiltins() {
    return Core.BUILTIN_ARTWORKS.map(Core.normalizeArtwork).filter(Boolean).map(decorateArtwork);
  }

  function decoratedUsers() {
    return state.artworks.map(decorateArtwork);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.liveRegion.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function setGenerationStatus(stateName, label) {
    elements.generationStatus.dataset.state = stateName;
    elements.generationStatus.querySelector('span').textContent = label;
  }

  function promptLength() {
    return Array.from(elements.promptInput.value).length;
  }

  function updatePromptCount() {
    elements.promptCount.textContent = String(Math.min(180, promptLength()));
    elements.promptError.textContent = '';
  }

  function updateControlState() {
    elements.styleButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.style === selectedStyle)));
    elements.ratioButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.ratio === selectedRatio)));
    elements.styleDescription.textContent = Core.STYLES[selectedStyle].description;
  }

  function sourceLabel(artwork) {
    if (artwork.source === 'ai') return 'AI ORIGINAL / FEATURED';
    if (artwork.source === 'user') return 'LOCAL GENERATIVE / YOUR WORK';
    return 'LOCAL EDITION / CURATED';
  }

  function updateHeroMetadata() {
    const palette = Core.paletteForPrompt(currentArtwork.prompt, currentArtwork.style);
    elements.artStage.dataset.ratio = currentArtwork.ratio;
    elements.currentPrompt.textContent = currentArtwork.prompt;
    elements.currentStyle.textContent = Core.STYLES[currentArtwork.style].label;
    elements.currentRatio.textContent = Core.RATIOS[currentArtwork.ratio].label;
    elements.currentPalette.textContent = palette.name;
    elements.currentSeed.textContent = `#${String(currentArtwork.seed).padStart(6, '0')}`;
    elements.sourceBadge.textContent = sourceLabel(currentArtwork);
    elements.heroLikeButton.setAttribute('aria-pressed', String(currentArtwork.liked));
    elements.heroLikeButton.querySelector('span').textContent = currentArtwork.liked ? '已收藏' : '收藏';
  }

  function renderHero(artwork, options) {
    currentArtwork = decorateArtwork(artwork);
    if (!currentArtwork) return;
    const settings = options && typeof options === 'object' ? options : {};
    if (currentArtwork.source === 'ai' && currentArtwork.image) {
      elements.heroImage.src = currentArtwork.image;
      elements.heroImage.alt = currentArtwork.prompt;
      elements.heroImage.hidden = false;
      elements.heroCanvas.hidden = true;
    } else {
      elements.heroImage.hidden = true;
      elements.heroCanvas.hidden = false;
      Engine.renderArtwork(elements.heroCanvas, currentArtwork, { longEdge: 1080 });
    }
    updateHeroMetadata();
    if (settings.status) setGenerationStatus(settings.status, settings.label || '画面已就绪');
  }

  function randomSeed() {
    const mixed = (Date.now() ^ Core.hashText(elements.promptInput.value) ^ Math.floor(performance.now() * 1000)) >>> 0;
    return (mixed % 2147483646) + 1;
  }

  function waitForRender(milliseconds) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : milliseconds));
  }

  async function generateArtwork(event) {
    if (event) event.preventDefault();
    const prompt = Core.cleanPrompt(elements.promptInput.value);
    if (!prompt) {
      elements.promptError.textContent = '先写下一句画面描述，再开始生成。';
      elements.promptInput.focus();
      setGenerationStatus('error', '缺少提示词');
      return null;
    }

    const generation = ++generationId;
    elements.generateButton.disabled = true;
    elements.artStage.classList.add('rendering');
    setGenerationStatus('rendering', '解释提示词中');
    await waitForRender(420);
    if (generation !== generationId) return null;

    const artwork = Core.createArtwork({
      prompt,
      style: selectedStyle,
      ratio: selectedRatio,
      seed: elements.seedInput.value,
      createdAt: Date.now()
    });
    renderHero(artwork);
    setGenerationStatus('rendering', '装配颜色与形体');
    await waitForRender(420);
    if (generation !== generationId) return null;

    const normalized = Core.normalizeGalleryState({
      artworks: [artwork, ...state.artworks.filter((item) => item.id !== artwork.id)],
      likedIds: state.likedIds
    });
    state = normalized;
    saveState();
    currentArtwork = decorateArtwork(artwork);
    updateHeroMetadata();
    renderGallery();
    updateCounts();
    elements.artStage.classList.remove('rendering');
    elements.generateButton.disabled = false;
    setGenerationStatus('ready', '已生成并收藏');
    showToast('新作品已加入“我的创作”。');
    return artwork;
  }

  function toggleFavorite(id) {
    const next = likedSet();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    state = Core.normalizeGalleryState({ artworks: state.artworks, likedIds: [...next] });
    saveState();
    if (currentArtwork.id === id) currentArtwork = decorateArtwork(currentArtwork);
    updateHeroMetadata();
    renderGallery();
    updateCounts();
    showToast(next.has(id) ? '作品已收藏。' : '已取消收藏。');
  }

  function showFallbackHeroIfDeleted(deletedIds) {
    if (!deletedIds.has(currentArtwork.id)) return;
    const fallback = Core.normalizeArtwork(Core.BUILTIN_ARTWORKS[0]);
    renderHero(fallback, { status: 'ready', label: '内置样片已就绪' });
  }

  function deleteArtwork(id) {
    const artwork = state.artworks.find((item) => item.id === id);
    if (!artwork) {
      showToast('内置样片会一直保留，只有自己的作品可以删除。');
      return false;
    }
    if (!window.confirm(`确定删除这张作品吗？\n\n「${artwork.prompt}」\n\n删除后无法恢复。`)) return false;
    state = Core.removeUserArtwork(state, id);
    saveState();
    showFallbackHeroIfDeleted(new Set([id]));
    renderGallery();
    updateCounts();
    showToast('作品已删除。');
    return true;
  }

  function clearAllArtworks() {
    const count = state.artworks.length;
    if (!count) {
      showToast('还没有可以清空的个人作品。');
      return false;
    }
    if (!window.confirm(`确定清空全部 ${count} 张个人作品吗？\n\n内置灵感样片会保留，删除后无法恢复。`)) return false;
    const deletedIds = new Set(state.artworks.map((artwork) => artwork.id));
    state = Core.clearUserArtworks(state);
    saveState();
    showFallbackHeroIfDeleted(deletedIds);
    elements.gallerySearch.value = '';
    currentFilter = 'all';
    elements.filterButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === 'all')));
    renderGallery();
    updateCounts();
    showToast(`已清空 ${count} 张个人作品，内置样片已保留。`);
    return true;
  }

  function createSvgIcon(pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
    return svg;
  }

  function createCardButton(label, action, iconPath, pressed) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (action === 'delete') button.classList.add('delete-action');
    if (typeof pressed === 'boolean') button.setAttribute('aria-pressed', String(pressed));
    button.append(createSvgIcon(iconPath));
    if (action === 'share') {
      const text = document.createElement('span');
      text.textContent = '复制配方';
      button.append(text);
    }
    return button;
  }

  function createArtworkCard(artwork, index) {
    const figure = document.createElement('figure');
    figure.className = `art-card${artwork.source === 'ai' ? ' featured' : ''}`;
    figure.dataset.artworkId = artwork.id;
    figure.dataset.ratio = artwork.ratio;

    const media = document.createElement('div');
    media.className = 'art-card-media';
    if (artwork.source === 'ai' && artwork.image) {
      const image = document.createElement('img');
      image.src = artwork.image;
      image.alt = artwork.prompt;
      image.loading = 'eager';
      image.addEventListener('error', () => {
        image.dataset.failed = 'true';
        const canvas = document.createElement('canvas');
        Engine.renderArtwork(canvas, artwork, { longEdge: 840 });
        media.append(canvas);
      }, { once: true });
      media.append(image);
    } else {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', artwork.prompt);
      Engine.renderArtwork(canvas, artwork, { longEdge: 720 });
      media.append(canvas);
    }

    const number = document.createElement('span');
    number.className = 'card-number';
    number.textContent = `PROOF ${String(index + 1).padStart(2, '0')}`;
    const source = document.createElement('span');
    source.className = 'card-source';
    source.textContent = artwork.source === 'ai' ? 'AI SAMPLE' : artwork.source === 'user' ? 'YOURS' : 'LOCAL';
    media.append(number, source);

    const caption = document.createElement('figcaption');
    caption.className = 'art-card-copy';
    const prompt = document.createElement('p');
    prompt.className = 'card-prompt';
    prompt.textContent = artwork.prompt;

    const recipe = document.createElement('div');
    recipe.className = 'card-recipe';
    [Core.STYLES[artwork.style].label, Core.RATIOS[artwork.ratio].label, `#${artwork.seed}`].forEach((value) => {
      const item = document.createElement('span');
      item.textContent = value;
      recipe.append(item);
    });

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const like = createCardButton(artwork.liked ? '取消收藏' : '收藏作品', 'like', 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z', artwork.liked);
    const share = createCardButton('复制提示词配方', 'share', 'M8 12h8M12 8l4 4-4 4M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z');
    const download = createCardButton('下载 PNG', 'download', 'M12 3v12m0 0 4-4m-4 4-4-4M5 20h14');
    actions.append(like, share, download);
    if (artwork.source === 'user') {
      actions.classList.add('has-delete');
      actions.append(createCardButton('删除这张作品', 'delete', 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5'));
    }

    actions.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'like') toggleFavorite(artwork.id);
      if (button.dataset.action === 'share') copyRecipe(artwork);
      if (button.dataset.action === 'download') downloadArtwork(artwork);
      if (button.dataset.action === 'delete') deleteArtwork(artwork.id);
    });

    caption.append(prompt, recipe, actions);
    figure.append(media, caption);
    return figure;
  }

  function visibleArtworks() {
    return Core.filterArtworks(decoratedBuiltins(), decoratedUsers(), {
      filter: currentFilter,
      query: elements.gallerySearch.value
    });
  }

  function renderGallery() {
    const artworks = visibleArtworks();
    const fragment = document.createDocumentFragment();
    artworks.forEach((artwork, index) => fragment.append(createArtworkCard(artwork, index)));
    elements.galleryGrid.replaceChildren(fragment);
    elements.galleryGrid.hidden = artworks.length === 0;
    elements.galleryEmpty.hidden = artworks.length !== 0;
  }

  function updateCounts() {
    const total = Core.BUILTIN_ARTWORKS.length + state.artworks.length;
    const liked = new Set(state.likedIds);
    const knownIds = new Set([...Core.BUILTIN_ARTWORKS, ...state.artworks].map((artwork) => artwork.id));
    const likedCount = [...liked].filter((id) => knownIds.has(id)).length;
    elements.headerArtworkCount.textContent = String(total).padStart(2, '0');
    elements.allCount.textContent = String(total).padStart(2, '0');
    elements.mineCount.textContent = String(state.artworks.length).padStart(2, '0');
    elements.likedCount.textContent = String(likedCount).padStart(2, '0');
    elements.clearArtworksButton.disabled = state.artworks.length === 0;
    elements.clearArtworksButton.setAttribute('aria-label', `清空全部个人作品，当前 ${state.artworks.length} 张`);
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    textarea.remove();
    return copied;
  }

  async function copyRecipe(artwork) {
    const copied = await copyText(Core.buildShareText(artwork));
    showToast(copied ? '提示词配方已复制。' : '浏览器没有开放剪贴板，请手动复制提示词。');
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.dataset.museDownload = 'true';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 700);
  }

  async function downloadArtwork(artwork) {
    const filename = `muse-95-${artwork.style}-${artwork.seed}.png`;
    try {
      if (artwork.source === 'ai' && artwork.image) {
        const response = await fetch(artwork.image);
        if (!response.ok) throw new Error('Image unavailable');
        triggerDownload(await response.blob(), filename);
      } else {
        const canvas = document.createElement('canvas');
        Engine.renderArtwork(canvas, artwork, { longEdge: 1600 });
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Canvas export failed');
        triggerDownload(blob, filename);
      }
      showToast(`正在下载 ${filename}`);
    } catch (_) {
      showToast('PNG 导出失败，请刷新页面后重试。');
    }
  }

  function setFilter(filter) {
    currentFilter = ['all', 'mine', 'liked'].includes(filter) ? filter : 'all';
    elements.filterButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === currentFilter)));
    renderGallery();
  }

  function bindEvents() {
    elements.promptInput.addEventListener('input', updatePromptCount);
    elements.promptForm.addEventListener('submit', generateArtwork);
    elements.promptSuggestions.forEach((button) => button.addEventListener('click', () => {
      elements.promptInput.value = button.dataset.prompt;
      updatePromptCount();
      elements.promptInput.focus();
    }));

    elements.styleOptions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-style]');
      if (!button) return;
      selectedStyle = Core.normalizeStyle(button.dataset.style);
      updateControlState();
    });
    elements.ratioOptions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ratio]');
      if (!button) return;
      selectedRatio = Core.normalizeRatio(button.dataset.ratio);
      updateControlState();
    });
    elements.randomSeedButton.addEventListener('click', () => {
      elements.seedInput.value = String(randomSeed());
      showToast('已换一枚灵感种子，点击生成查看新构图。');
    });

    elements.heroLikeButton.addEventListener('click', () => toggleFavorite(currentArtwork.id));
    elements.heroShareButton.addEventListener('click', () => copyRecipe(currentArtwork));
    elements.heroDownloadButton.addEventListener('click', () => downloadArtwork(currentArtwork));

    elements.filterButtons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
    elements.gallerySearch.addEventListener('input', renderGallery);
    elements.clearArtworksButton.addEventListener('click', clearAllArtworks);
    elements.clearFiltersButton.addEventListener('click', () => {
      elements.gallerySearch.value = '';
      setFilter('all');
    });
  }

  updatePromptCount();
  updateControlState();
  updateCounts();
  renderHero(currentArtwork);
  renderGallery();
  bindEvents();

  window.__MUSE95__ = Object.freeze({
    getState: () => JSON.parse(JSON.stringify(state)),
    getCurrent: () => JSON.parse(JSON.stringify(currentArtwork)),
    generate: generateArtwork,
    deleteArtwork,
    clearAllArtworks,
    renderGallery,
    storageKey: STORAGE_KEY
  });
})();
