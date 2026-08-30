(function () {
  'use strict';

  const Core = window.WallpaperCore;
  const STORAGE_KEY = 'lumen61.state.v1';
  const API_URL = 'https://bing.biturl.top/';
  const DEPLOYED_URL = 'https://jokerlixing.github.io/100apps/apps/061-daily-wallpaper/';
  const FORCE_OFFLINE = new URLSearchParams(window.location.search).has('offline');
  const $ = (selector) => document.querySelector(selector);

  const elements = {
    main: $('#main-content'),
    heroImage: $('#hero-image'),
    title: $('#wallpaper-title'),
    date: $('#wallpaper-date'),
    copyright: $('#copyright-line'),
    copyrightLink: $('#copyright-link'),
    exposureIndex: $('#exposure-index'),
    sourceState: $('#source-state'),
    loadingCount: $('#loading-count'),
    filmstrip: $('#filmstrip'),
    previous: $('#previous-button'),
    next: $('#next-button'),
    refresh: $('#refresh-button'),
    favorite: $('#favorite-button'),
    favoriteCount: $('#favorite-count'),
    download: $('#download-button'),
    homepage: $('#homepage-button'),
    openFavorites: $('#open-favorites'),
    favoritesDialog: $('#favorites-dialog'),
    favoriteGrid: $('#favorite-grid'),
    emptyFavorites: $('#empty-favorites'),
    homepageDialog: $('#homepage-dialog'),
    homepageUrl: $('#homepage-url'),
    copyHomepage: $('#copy-homepage'),
    toast: $('#toast'),
    liveRegion: $('#live-region'),
  };

  const state = {
    archive: [],
    timeline: [],
    favorites: [],
    homepageId: null,
    selectedId: null,
    source: 'loading',
    liveCount: 0,
    refreshController: null,
    toastTimer: null,
  };

  const fallbackScenes = [
    ['#d7a977', '#5f6f78', '#24373d', '#f5d9a4', '潮汐线上的晨光'],
    ['#8095b5', '#2d4058', '#17263a', '#e3d8bd', '蓝色山口的薄雾'],
    ['#d9946c', '#7c4646', '#302c3a', '#ffd398', '旷野最后一束光'],
    ['#91ad9c', '#425d50', '#1f3431', '#e5d6a9', '森林把风留住'],
    ['#b6a7c8', '#665c7a', '#28283e', '#efe2bc', '月色落在远岭'],
    ['#88b7c1', '#357283', '#173d4a', '#f0d9a1', '海面安静的清晨'],
    ['#c6ad84', '#6f684d', '#303927', '#f5dfaa', '草原深处的回声'],
    ['#a8b4c2', '#586879', '#24303f', '#f2c985', '雪线之外的晴空'],
  ];

  function isoDaysAgo(days) {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  function fallbackSvg(index) {
    const scene = fallbackScenes[index % fallbackScenes.length];
    const [sky, middle, deep, light] = scene;
    const sunX = 330 + (index % 4) * 380;
    const ridge = 480 + (index % 3) * 76;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${middle}"/></linearGradient>
        <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${middle}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
      </defs>
      <rect width="1920" height="1080" fill="url(#sky)"/>
      <circle cx="${sunX}" cy="270" r="104" fill="${light}" opacity=".88" filter="url(#soft)"/>
      <circle cx="${sunX}" cy="270" r="72" fill="${light}" opacity=".92"/>
      <path d="M0 710 L260 ${ridge} 470 690 760 ${ridge - 95} 990 690 1260 ${ridge - 35} 1520 680 1740 ${ridge - 120} 1920 650 1920 1080 0 1080Z" fill="${middle}" opacity=".76"/>
      <path d="M0 790 L290 630 520 780 850 570 1110 760 1450 610 1680 750 1920 620 1920 1080 0 1080Z" fill="url(#land)"/>
      <path d="M0 880 C360 790 560 920 900 825 S1500 760 1920 860 V1080 H0Z" fill="${deep}" opacity=".94"/>
      <g opacity=".2" fill="none" stroke="${light}" stroke-width="3"><path d="M0 840 Q480 740 960 840 T1920 840"/><path d="M0 874 Q480 774 960 874 T1920 874"/></g>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function createFallbackItem(index, date = isoDaysAgo(index)) {
    const scene = fallbackScenes[index % fallbackScenes.length];
    return {
      id: `fallback-${date}-${index}`,
      date,
      url: fallbackSvg(index),
      title: scene[4],
      copyright: 'LUMEN 本地精选插画 · 离线可用',
      copyrightLink: '',
      source: 'fallback',
    };
  }

  function createFallbackCollection() {
    return fallbackScenes.map((scene, index) => createFallbackItem(index));
  }

  function completeTimeline(records) {
    const timeline = records.slice(0, 8);
    if (!timeline.length) return createFallbackCollection();
    const usedDates = new Set(timeline.map((item) => item.date));
    const cursor = new Date(`${timeline[timeline.length - 1].date}T12:00:00Z`);
    let fallbackIndex = 0;
    while (timeline.length < 8) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      const date = cursor.toISOString().slice(0, 10);
      if (usedDates.has(date)) continue;
      timeline.push(createFallbackItem(fallbackIndex, date));
      usedDates.add(date);
      fallbackIndex += 1;
    }
    return timeline;
  }

  function readSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const cached = Array.isArray(saved.cache)
        ? Core.normalizeCollection(saved.cache.map((item) => ({ ...item, source: 'cache' })))
        : [];
      return {
        cache: cached,
        favorites: Array.isArray(saved.favorites) ? saved.favorites.filter((id) => typeof id === 'string') : [],
        homepageId: typeof saved.homepageId === 'string' ? saved.homepageId : null,
        selectedId: typeof saved.selectedId === 'string' ? saved.selectedId : null,
      };
    } catch {
      return { cache: [], favorites: [], homepageId: null, selectedId: null };
    }
  }

  function saveState() {
    const cache = state.archive
      .filter((item) => item.source !== 'fallback')
      .slice(0, 40)
      .map(({ date, url, title, copyright, copyrightLink }) => ({ date, url, title, copyright, copyrightLink }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cache,
        favorites: state.favorites,
        homepageId: state.homepageId,
        selectedId: state.selectedId,
      }));
    } catch {
      announce('浏览器没有保存本次更改，请检查存储权限。');
    }
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    window.requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
  }

  function toast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  function currentItem() {
    return state.archive.find((item) => item.id === state.selectedId)
      || state.timeline.find((item) => item.id === state.selectedId)
      || state.timeline[0]
      || null;
  }

  function sourceCopy() {
    if (state.source === 'live') return 'LIVE / BING';
    if (state.source === 'mixed') return `LIVE ${state.liveCount}/8 + LOCAL`;
    if (state.source === 'cache') return 'CACHED / 最近记录';
    if (state.source === 'fallback') return 'OFFLINE / 精选兜底';
    return '正在显影';
  }

  function renderSource() {
    document.body.dataset.source = state.source;
    elements.sourceState.textContent = sourceCopy();
  }

  function renderHero() {
    const item = currentItem();
    if (!item) return;
    state.selectedId = item.id;
    const timelineIndex = state.timeline.findIndex((entry) => entry.id === item.id);

    elements.main.classList.add('is-developing');
    elements.heroImage.dataset.itemId = item.id;
    elements.heroImage.dataset.recovered = 'false';
    elements.heroImage.src = item.url;
    elements.title.textContent = item.title;
    elements.date.textContent = Core.formatDisplayDate(item.date);
    elements.copyright.textContent = item.copyright;
    elements.exposureIndex.textContent = timelineIndex >= 0
      ? `NEGATIVE ${String(timelineIndex + 1).padStart(2, '0')} / ${String(state.timeline.length).padStart(2, '0')}`
      : 'PINNED NEGATIVE / ARCHIVE';

    if (item.copyrightLink) {
      elements.copyrightLink.href = item.copyrightLink;
      elements.copyrightLink.hidden = false;
    } else {
      elements.copyrightLink.hidden = true;
    }

    document.title = `${item.title} · LUMEN/61`;
  }

  function displayShortDate(date) {
    return date.slice(5).replace('-', '.');
  }

  function renderFilmstrip() {
    elements.filmstrip.replaceChildren();
    state.timeline.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'film-frame';
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-label', `${Core.formatDisplayDate(item.date)}，${item.title}`);
      button.setAttribute('aria-current', String(item.id === state.selectedId));
      button.classList.toggle('is-favorite', state.favorites.includes(item.id));
      button.dataset.id = item.id;

      const image = document.createElement('img');
      image.src = item.url;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        if (!image.dataset.recovered) {
          image.dataset.recovered = 'true';
          image.src = fallbackSvg(state.timeline.indexOf(item));
        }
      });

      const label = document.createElement('span');
      label.className = 'frame-label';
      label.textContent = displayShortDate(item.date);
      button.append(image, label);
      button.addEventListener('click', () => selectItem(item.id));
      elements.filmstrip.append(button);
    });
  }

  function allKnownItems() {
    const known = new Map();
    [...state.archive, ...state.timeline].forEach((item) => known.set(item.id, item));
    return known;
  }

  function renderFavorites() {
    const known = allKnownItems();
    const items = state.favorites.map((id) => known.get(id)).filter(Boolean);
    elements.favoriteGrid.replaceChildren();
    elements.favoriteCount.textContent = String(items.length);
    elements.favoriteGrid.hidden = items.length === 0;
    elements.emptyFavorites.hidden = items.length > 0;

    items.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'favorite-card';
      card.setAttribute('aria-label', `显示收藏：${item.title}`);
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => { image.src = fallbackSvg(items.indexOf(item)); }, { once: true });
      const title = document.createElement('span');
      title.textContent = `${displayShortDate(item.date)} · ${item.title}`;
      const badge = document.createElement('i');
      badge.textContent = item.id === state.homepageId ? '首页' : '收藏';
      card.append(image, title, badge);
      card.addEventListener('click', () => {
        selectItem(item.id);
        elements.favoritesDialog.close();
      });
      elements.favoriteGrid.append(card);
    });
  }

  function renderActions() {
    const item = currentItem();
    if (!item) return;
    const isFavorite = state.favorites.includes(item.id);
    const isHomepage = state.homepageId === item.id;
    elements.favorite.setAttribute('aria-pressed', String(isFavorite));
    elements.favorite.querySelector('.action-icon').textContent = isFavorite ? '★' : '☆';
    elements.favorite.querySelector('b').textContent = isFavorite ? '已收藏' : '收藏';
    elements.homepage.setAttribute('aria-pressed', String(isHomepage));
    elements.homepage.querySelector('b').textContent = isHomepage ? '取消固定' : '固定为首页';
  }

  function renderAll() {
    renderSource();
    renderHero();
    renderFilmstrip();
    renderFavorites();
    renderActions();
    document.body.classList.add('ready');
  }

  function preloadNeighbors() {
    const index = state.timeline.findIndex((item) => item.id === state.selectedId);
    if (index < 0) return;
    [state.timeline[index - 1], state.timeline[index + 1]].filter(Boolean).forEach((item) => {
      const image = new Image();
      image.src = item.url;
    });
  }

  function selectItem(id, options = {}) {
    const item = allKnownItems().get(id);
    if (!item) return;
    state.selectedId = item.id;
    saveState();
    renderHero();
    renderFilmstrip();
    renderActions();
    preloadNeighbors();
    const frame = elements.filmstrip.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (frame) frame.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (options.announce !== false) announce(`已显示 ${item.title}`);
  }

  function moveSelection(step) {
    if (!state.timeline.length) return;
    const index = state.timeline.findIndex((item) => item.id === state.selectedId);
    const base = index < 0 ? 0 : index;
    const next = (base + step + state.timeline.length) % state.timeline.length;
    selectItem(state.timeline[next].id);
  }

  async function fetchDaily(index, signal) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      resolution: 'UHD',
      format: 'json',
      index: String(index),
      mkt: 'zh-CN',
    }).toString();
    const response = await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Wallpaper API ${response.status}`);
    return response.json();
  }

  async function refreshWallpapers(options = {}) {
    if (state.refreshController) state.refreshController.abort();
    state.refreshController = new AbortController();
    const { signal } = state.refreshController;
    const timeout = window.setTimeout(() => state.refreshController.abort(), 9000);
    elements.refresh.disabled = true;
    elements.sourceState.textContent = '正在刷新 00/08';
    let settledCount = 0;

    try {
      let results = [];
      if (!FORCE_OFFLINE) {
        const requests = Array.from({ length: 8 }, (_, index) => fetchDaily(index, signal).finally(() => {
          settledCount += 1;
          elements.loadingCount.textContent = String(settledCount).padStart(2, '0');
          elements.sourceState.textContent = `正在刷新 ${String(settledCount).padStart(2, '0')}/08`;
        }));
        results = await Promise.allSettled(requests);
      }

      const live = Core.normalizeCollection(results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => ({ ...result.value, source: 'bing' })));

      const previousSelected = state.selectedId;
      const merged = Core.mergeWithCache(live, state.archive, 40);
      if (merged.length) {
        state.timeline = completeTimeline(merged);
        const supplements = state.timeline.filter((item) => item.source === 'fallback');
        state.archive = [...merged, ...supplements];
        state.liveCount = live.length;
        state.source = live.length ? (supplements.length ? 'mixed' : 'live') : 'cache';
      } else {
        state.archive = createFallbackCollection();
        state.timeline = [...state.archive];
        state.source = 'fallback';
        state.liveCount = 0;
      }

      const known = allKnownItems();
      state.favorites = Core.hydratePreferenceIds(state.favorites, [...known.values()]);
      if (!known.has(state.homepageId)) state.homepageId = null;
      state.selectedId = known.has(previousSelected)
        ? previousSelected
        : (known.has(state.homepageId) ? state.homepageId : state.timeline[0].id);
      saveState();
      renderAll();

      if (!options.silent) {
        const message = state.source === 'live' || state.source === 'mixed'
          ? `已显影 ${live.length} 张 Bing 每日图片。`
          : state.source === 'cache'
            ? '网络暂不可用，继续展示最近保存的图片。'
            : '网络暂不可用，已切换到本地精选画面。';
        toast(message);
        announce(message);
      }
    } catch (error) {
      if (error.name !== 'AbortError') console.warn('LUMEN refresh failed', error);
      state.source = state.archive.some((item) => item.source !== 'fallback') ? 'cache' : 'fallback';
      state.liveCount = 0;
      renderAll();
      if (!options.silent) toast(state.source === 'cache' ? '刷新失败，继续使用最近记录。' : '刷新失败，继续使用本地精选。');
    } finally {
      window.clearTimeout(timeout);
      elements.refresh.disabled = false;
      renderSource();
    }
  }

  function toggleFavorite() {
    const item = currentItem();
    if (!item) return;
    const wasFavorite = state.favorites.includes(item.id);
    state.favorites = Core.toggleFavorite(state.favorites, item.id);
    saveState();
    renderFilmstrip();
    renderFavorites();
    renderActions();
    const message = wasFavorite ? `已从收藏移除：${item.title}` : `已收藏：${item.title}`;
    toast(message);
    announce(message);
  }

  function toggleHomepage() {
    const item = currentItem();
    if (!item) return;
    const wasHomepage = state.homepageId === item.id;
    state.homepageId = Core.selectHomepage(state.homepageId, item.id);
    saveState();
    renderFavorites();
    renderActions();
    if (wasHomepage) {
      toast('已取消固定，明天会重新显示最新图片。');
      announce('已取消首页固定。');
      return;
    }
    elements.homepageUrl.value = DEPLOYED_URL;
    elements.homepageDialog.showModal();
    announce(`已把 ${item.title} 固定为首页背景。`);
  }

  async function downloadCurrent() {
    const item = currentItem();
    if (!item) return;
    elements.download.disabled = true;
    toast('正在准备原图…');
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`Image ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = Core.createDownloadName(item);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast('原图下载已开始。');
      announce(`正在下载 ${item.title}`);
    } catch {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      toast('原图已在新标签打开，可长按或右键保存。');
      announce('浏览器阻止直接下载，已在新标签打开原图。');
    } finally {
      elements.download.disabled = false;
    }
  }

  async function copyHomepageUrl() {
    elements.homepageUrl.value = DEPLOYED_URL;
    try {
      await navigator.clipboard.writeText(DEPLOYED_URL);
    } catch {
      elements.homepageUrl.select();
      document.execCommand('copy');
    }
    elements.copyHomepage.textContent = '已复制';
    toast('LUMEN 首页地址已复制。');
    window.setTimeout(() => { elements.copyHomepage.textContent = '复制地址'; }, 1600);
  }

  function bindEvents() {
    elements.heroImage.addEventListener('load', () => {
      window.requestAnimationFrame(() => elements.main.classList.remove('is-developing'));
    });
    elements.heroImage.addEventListener('error', () => {
      if (elements.heroImage.dataset.recovered === 'true') return;
      elements.heroImage.dataset.recovered = 'true';
      const index = Math.max(0, state.timeline.findIndex((item) => item.id === state.selectedId));
      elements.heroImage.src = fallbackSvg(index);
      toast('原图加载失败，已显示本地显影版本。');
    });
    elements.previous.addEventListener('click', () => moveSelection(-1));
    elements.next.addEventListener('click', () => moveSelection(1));
    elements.favorite.addEventListener('click', toggleFavorite);
    elements.homepage.addEventListener('click', toggleHomepage);
    elements.download.addEventListener('click', downloadCurrent);
    elements.refresh.addEventListener('click', () => refreshWallpapers());
    elements.openFavorites.addEventListener('click', () => elements.favoritesDialog.showModal());
    elements.copyHomepage.addEventListener('click', copyHomepageUrl);

    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog').close());
    });
    [elements.favoritesDialog, elements.homepageDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    });

    document.addEventListener('keydown', (event) => {
      if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveSelection(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveSelection(1); }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFavorite(); }
    });
  }

  function init() {
    if (!Core) throw new Error('WallpaperCore failed to load');
    bindEvents();
    elements.homepageUrl.value = DEPLOYED_URL;
    const saved = readSavedState();
    const initialArchive = saved.cache.length ? saved.cache : createFallbackCollection();
    state.timeline = completeTimeline(initialArchive);
    state.archive = [...initialArchive, ...state.timeline.filter((item) => item.source === 'fallback' && !initialArchive.includes(item))];
    state.source = saved.cache.length ? 'cache' : 'fallback';
    state.favorites = Core.hydratePreferenceIds(saved.favorites, state.archive);
    state.homepageId = state.archive.some((item) => item.id === saved.homepageId) ? saved.homepageId : null;
    state.selectedId = state.archive.some((item) => item.id === saved.selectedId)
      ? saved.selectedId
      : (state.homepageId || state.timeline[0].id);
    renderAll();
    refreshWallpapers({ silent: true });
  }

  init();
})();
