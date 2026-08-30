(function startStockWatchlist() {
  'use strict';

  const Core = window.MarketCore;
  if (!Core) return;

  const STORAGE_KEY = 'tick51_watchlist_v1';
  const REFRESH_INTERVAL = 60_000;
  const MAX_WATCHLIST = 8;
  const FORCE_SAMPLE = new URLSearchParams(window.location.search).has('demo');
  const DEFAULT_SYMBOLS = ['600519.SH', '300750.SZ', '00700.HK', 'AAPL'];
  const KNOWN_NAMES = Object.freeze({
    sh600519: '贵州茅台',
    sz300750: '宁德时代',
    hk00700: '腾讯控股',
    usAAPL: 'Apple',
  });
  const SAMPLE_BASES = Object.freeze({
    sh600519: 1297.4,
    sz300750: 352.8,
    hk00700: 612.5,
    usAAPL: 319.7,
  });

  const dom = {
    signalDot: document.querySelector('#signalDot'),
    refreshStatus: document.querySelector('#refreshStatus'),
    refreshCountdown: document.querySelector('#refreshCountdown'),
    refreshButton: document.querySelector('#refreshButton'),
    symbolForm: document.querySelector('#symbolForm'),
    symbolInput: document.querySelector('#symbolInput'),
    formMessage: document.querySelector('#formMessage'),
    watchCount: document.querySelector('#watchCount'),
    watchlist: document.querySelector('#watchlist'),
    sourceBadge: document.querySelector('#sourceBadge'),
    assetSymbol: document.querySelector('#assetSymbol'),
    assetName: document.querySelector('#assetName'),
    quoteTime: document.querySelector('#quoteTime'),
    currentPrice: document.querySelector('#currentPrice'),
    priceChange: document.querySelector('#priceChange'),
    metricOpen: document.querySelector('#metricOpen'),
    metricHigh: document.querySelector('#metricHigh'),
    metricLow: document.querySelector('#metricLow'),
    metricPrevious: document.querySelector('#metricPrevious'),
    metricVolume: document.querySelector('#metricVolume'),
    rangeButtons: [...document.querySelectorAll('[data-range]')],
    chartCanvas: document.querySelector('#chartCanvas'),
    chartState: document.querySelector('#chartState'),
    inspectorHeading: document.querySelector('#inspectorHeading'),
    candleOpen: document.querySelector('#candleOpen'),
    candleHigh: document.querySelector('#candleHigh'),
    candleLow: document.querySelector('#candleLow'),
    candleClose: document.querySelector('#candleClose'),
    candleVolume: document.querySelector('#candleVolume'),
    toast: document.querySelector('#toast'),
    announcer: document.querySelector('#announcer'),
  };

  const storedState = loadStoredState();
  const state = {
    watchlist: storedState.watchlist,
    selectedId: storedState.selectedId,
    quotes: new Map(),
    candles: [],
    candleSource: 'sample',
    rangeKey: '3m',
    selectedCandleIndex: -1,
    refreshing: false,
    lastRefreshAt: 0,
    nextRefreshAt: Date.now(),
    statusMode: 'loading',
    klineAbort: null,
    chartLayout: null,
  };

  let toastTimer = 0;
  let drawFrame = 0;

  seedSampleQuotes();
  seedSampleCandles();
  bindEvents();
  renderAll();
  refreshAll();
  window.setInterval(tickRefreshClock, 1_000);

  function loadStoredState() {
    const fallback = DEFAULT_SYMBOLS.map(Core.normalizeSymbol).filter(Boolean);
    try {
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const watchlist = Array.isArray(raw && raw.watchlist)
        ? raw.watchlist.map(Core.normalizeSymbol).filter(Boolean).slice(0, MAX_WATCHLIST)
        : [];
      const unique = [...new Map(watchlist.map((item) => [item.providerId, item])).values()];
      const finalList = unique.length ? unique : fallback;
      const selected = Core.normalizeSymbol(raw && raw.selected);
      return {
        watchlist: finalList,
        selectedId: selected && finalList.some((item) => item.providerId === selected.providerId)
          ? selected.providerId
          : finalList[0].providerId,
      };
    } catch {
      return { watchlist: fallback, selectedId: fallback[0].providerId };
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        watchlist: state.watchlist.map((item) => item.display),
        selected: selectedItem().display,
      }));
    } catch {
      showToast('浏览器没有允许本地保存；本次自选仍可继续使用。');
    }
  }

  function selectedItem() {
    return state.watchlist.find((item) => item.providerId === state.selectedId) || state.watchlist[0];
  }

  function selectedQuote() {
    return state.quotes.get(state.selectedId) || makeSampleQuote(selectedItem());
  }

  function bindEvents() {
    dom.symbolForm.addEventListener('submit', handleAddSymbol);
    dom.symbolInput.addEventListener('input', () => { dom.formMessage.textContent = ''; });
    dom.watchlist.addEventListener('click', handleWatchlistClick);
    dom.refreshButton.addEventListener('click', () => refreshAll({ manual: true }));

    dom.rangeButtons.forEach((button) => {
      button.addEventListener('click', () => selectRange(button.dataset.range));
    });

    dom.chartCanvas.addEventListener('pointermove', handleChartPointer);
    dom.chartCanvas.addEventListener('pointerdown', handleChartPointer);
    dom.chartCanvas.addEventListener('keydown', handleChartKeydown);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() >= state.nextRefreshAt) refreshAll();
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(scheduleChartDraw).observe(dom.chartCanvas);
    } else {
      window.addEventListener('resize', scheduleChartDraw);
    }
  }

  function handleAddSymbol(event) {
    event.preventDefault();
    const normalized = Core.normalizeSymbol(dom.symbolInput.value);
    if (!normalized) {
      dom.formMessage.textContent = '代码格式无法识别，请参考 600519、00700.HK 或 AAPL。';
      dom.symbolInput.focus();
      return;
    }
    if (state.watchlist.some((item) => item.providerId === normalized.providerId)) {
      dom.formMessage.textContent = `${normalized.display} 已经在自选中。`;
      return;
    }
    if (state.watchlist.length >= MAX_WATCHLIST) {
      dom.formMessage.textContent = '自选票据最多 8 个，请先移除一个。';
      return;
    }

    state.watchlist.push(normalized);
    state.selectedId = normalized.providerId;
    state.quotes.set(normalized.providerId, makeSampleQuote(normalized));
    dom.symbolInput.value = '';
    dom.formMessage.textContent = '';
    saveState();
    seedSampleCandles();
    renderAll();
    announce(`已添加 ${normalized.display}`);
    showToast(`已把 ${normalized.display} 钉到自选纸带。`);
    refreshAll({ manual: true });
  }

  function handleWatchlistClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const providerId = button.dataset.id;
    if (button.dataset.action === 'select') selectSymbol(providerId);
    if (button.dataset.action === 'remove') removeSymbol(providerId);
  }

  function selectSymbol(providerId) {
    if (providerId === state.selectedId || !state.watchlist.some((item) => item.providerId === providerId)) return;
    state.selectedId = providerId;
    state.selectedCandleIndex = -1;
    seedSampleCandles();
    saveState();
    renderAll();
    announce(`已切换到 ${selectedQuote().name}`);
    fetchSelectedKlines();
  }

  function removeSymbol(providerId) {
    if (state.watchlist.length <= 1) {
      showToast('至少保留一张自选票据。');
      return;
    }
    const removed = state.watchlist.find((item) => item.providerId === providerId);
    state.watchlist = state.watchlist.filter((item) => item.providerId !== providerId);
    state.quotes.delete(providerId);
    if (state.selectedId === providerId) {
      state.selectedId = state.watchlist[0].providerId;
      seedSampleCandles();
      fetchSelectedKlines();
    }
    saveState();
    renderAll();
    announce(`已移除 ${removed ? removed.display : '自选票据'}`);
  }

  function selectRange(rangeKey) {
    const config = Core.getRangeConfig(rangeKey);
    if (config.key === state.rangeKey) return;
    state.rangeKey = config.key;
    state.selectedCandleIndex = -1;
    seedSampleCandles();
    renderRangeTabs();
    renderChart();
    fetchSelectedKlines();
  }

  async function refreshAll({ manual = false } = {}) {
    if (state.refreshing) return;
    state.refreshing = true;
    state.statusMode = 'loading';
    dom.refreshButton.disabled = true;
    updateRefreshStatus('正在拉取最新行情…', 'loading');

    if (FORCE_SAMPLE) {
      await Promise.resolve();
      seedSampleQuotes();
      seedSampleCandles();
      finishRefresh('sample', '样例模式 · 未请求网络');
      renderAll();
      return;
    }

    let quoteMode = 'live';
    try {
      const quotes = await fetchQuotes(state.watchlist.map((item) => item.providerId));
      const received = new Set();
      quotes.forEach((quote) => {
        quote.source = 'live';
        quote.receivedAt = Date.now();
        state.quotes.set(quote.providerId, quote);
        received.add(quote.providerId);
      });
      if (!received.size) throw new Error('empty quote response');
      state.watchlist.forEach((item) => {
        if (!received.has(item.providerId) && !state.quotes.has(item.providerId)) {
          state.quotes.set(item.providerId, makeSampleQuote(item));
        }
      });
    } catch {
      quoteMode = hasLiveQuotes() ? 'stale' : 'sample';
      seedMissingSampleQuotes();
      if (manual) showToast(quoteMode === 'stale' ? '刷新失败，继续显示上一次行情。' : '行情接口暂不可用，已切换到样例数据。');
    }

    renderWatchlist();
    renderSelectedQuote();
    await fetchSelectedKlines();
    const finalMode = quoteMode === 'live' && state.candleSource === 'live'
      ? 'live'
      : quoteMode === 'stale' ? 'stale' : 'sample';
    const messages = {
      live: '接口行情已更新',
      stale: '刷新失败 · 显示缓存',
      sample: quoteMode === 'live' ? '报价已更新 · K 线为样例' : '样例行情 · 可离线体验',
    };
    finishRefresh(finalMode, messages[finalMode]);
    renderSelectedQuote();
  }

  function finishRefresh(mode, message) {
    state.refreshing = false;
    state.statusMode = mode;
    state.lastRefreshAt = Date.now();
    state.nextRefreshAt = state.lastRefreshAt + REFRESH_INTERVAL;
    dom.refreshButton.disabled = false;
    updateRefreshStatus(message, mode);
    tickRefreshClock();
  }

  async function fetchQuotes(providerIds) {
    const url = `https://qt.gtimg.cn/q=${providerIds.join(',')}`;
    const response = await fetchWithTimeout(url, { timeout: 9_000 });
    const buffer = await response.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('gb18030').decode(buffer);
    } catch {
      text = new TextDecoder().decode(buffer);
    }
    return Core.parseQuotePayload(text).filter((quote) => providerIds.includes(quote.providerId));
  }

  async function fetchSelectedKlines() {
    if (state.klineAbort) state.klineAbort.abort();
    const request = new AbortController();
    state.klineAbort = request;
    const item = selectedItem();
    const range = Core.getRangeConfig(state.rangeKey);
    setChartLoading(true, '正在穿入行情纸带…');

    if (FORCE_SAMPLE) {
      state.candleSource = 'sample';
      state.selectedCandleIndex = state.candles.length - 1;
      setChartLoading(false);
      renderChart();
      syncStatusForSelection();
      return;
    }

    try {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${item.providerId},day,,,${range.requestCount},qfq`;
      const response = await fetchWithTimeout(url, { timeout: 10_000, signal: request.signal });
      const payload = await response.json();
      if (request !== state.klineAbort) return;
      const candles = Core.parseKlineResponse(payload, item.providerId);
      if (candles.length < Math.min(5, range.requestCount)) throw new Error('insufficient kline data');
      state.candles = candles;
      state.candleSource = 'live';
      state.selectedCandleIndex = candles.length - 1;
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (request !== state.klineAbort) return;
      seedSampleCandles();
      state.candleSource = 'sample';
    } finally {
      if (request === state.klineAbort) {
        setChartLoading(false);
        renderChart();
        renderSelectedQuote();
        syncStatusForSelection();
      }
    }
  }

  function syncStatusForSelection() {
    if (state.refreshing) return;
    if (state.statusMode === 'stale') {
      updateRefreshStatus('刷新失败 · 显示缓存', 'stale');
      return;
    }
    const quote = selectedQuote();
    const allLive = quote.source === 'live' && state.candleSource === 'live';
    state.statusMode = allLive ? 'live' : 'sample';
    updateRefreshStatus(
      allLive
        ? '接口行情已更新'
        : quote.source === 'live' ? '报价已更新 · K 线为样例' : '样例行情 · 可离线体验',
      state.statusMode,
    );
  }

  async function fetchWithTimeout(url, { timeout, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    const timer = window.setTimeout(() => controller.abort(), timeout || 10_000);
    try {
      const response = await window.fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally {
      window.clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
    }
  }

  function seedSampleQuotes() {
    state.watchlist.forEach((item) => state.quotes.set(item.providerId, makeSampleQuote(item)));
  }

  function seedMissingSampleQuotes() {
    state.watchlist.forEach((item) => {
      if (!state.quotes.has(item.providerId)) state.quotes.set(item.providerId, makeSampleQuote(item));
    });
  }

  function makeSampleQuote(item) {
    const candles = generateSampleCandles(item, 30);
    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const change = Core.calculateChange(latest.close, previous.close);
    return {
      providerId: item.providerId,
      name: KNOWN_NAMES[item.providerId] || item.display,
      code: item.code,
      price: latest.close,
      previousClose: previous.close,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      change: change.amount,
      changePercent: change.percent,
      volume: latest.volume,
      amount: 0,
      timestamp: '',
      source: 'sample',
      receivedAt: Date.now(),
    };
  }

  function seedSampleCandles() {
    const range = Core.getRangeConfig(state.rangeKey);
    state.candles = generateSampleCandles(selectedItem(), range.requestCount);
    state.candleSource = 'sample';
    state.selectedCandleIndex = state.candles.length - 1;
  }

  function generateSampleCandles(item, count) {
    let seed = hashString(item.providerId);
    const base = SAMPLE_BASES[item.providerId] || 20 + (seed % 18_000) / 100;
    const dates = recentTradingDates(count);
    let previous = base * 0.88;
    return dates.map((date, index) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = ((seed / 4294967296) - 0.5) * 0.022;
      const cycle = Math.sin((index + (seed % 13)) / 7) * 0.006;
      const open = Math.max(0.01, previous * (1 + noise * 0.35));
      const close = Math.max(0.01, open * (1 + noise + cycle + 0.0015));
      const high = Math.max(open, close) * (1 + 0.004 + Math.abs(noise) * 0.38);
      const low = Math.min(open, close) * (1 - 0.004 - Math.abs(cycle) * 0.42);
      const volume = Math.round((260_000 + (seed % 1_800_000)) * (1 + Math.abs(noise) * 8));
      previous = close;
      return {
        date,
        open: roundPrice(open),
        close: roundPrice(close),
        high: roundPrice(high),
        low: roundPrice(low),
        volume,
      };
    });
  }

  function recentTradingDates(count) {
    const dates = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    while (dates.length < count) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) dates.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() - 1);
    }
    return dates.reverse();
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function roundPrice(value) {
    return Number(value.toFixed(value < 1 ? 4 : 2));
  }

  function hasLiveQuotes() {
    return [...state.quotes.values()].some((quote) => quote.source === 'live');
  }

  function renderAll() {
    renderWatchlist();
    renderSelectedQuote();
    renderRangeTabs();
    renderChart();
  }

  function renderWatchlist() {
    dom.watchCount.textContent = `${state.watchlist.length} / ${MAX_WATCHLIST}`;
    const fragment = document.createDocumentFragment();

    state.watchlist.forEach((item) => {
      const quote = state.quotes.get(item.providerId) || makeSampleQuote(item);
      const direction = directionClass(quote.change);
      const ticket = document.createElement('li');
      ticket.className = `watch-ticket${item.providerId === state.selectedId ? ' is-active' : ''}`;

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'ticket-select';
      select.dataset.action = 'select';
      select.dataset.id = item.providerId;
      select.setAttribute('aria-pressed', String(item.providerId === state.selectedId));
      select.setAttribute('aria-label', `查看 ${quote.name} ${item.display}`);

      const top = document.createElement('span');
      top.className = 'ticket-top';
      const name = document.createElement('span');
      name.className = 'ticket-name';
      name.textContent = quote.name;
      const symbol = document.createElement('span');
      symbol.className = 'ticket-symbol';
      symbol.textContent = item.display;
      top.append(name, symbol);

      const bottom = document.createElement('span');
      bottom.className = 'ticket-bottom';
      const price = document.createElement('span');
      price.className = `ticket-price ${direction}`;
      price.textContent = formatPrice(quote.price);
      const change = document.createElement('span');
      change.className = `ticket-change ${direction}`;
      change.textContent = formatPercent(quote.changePercent);
      bottom.append(price, change);
      select.append(top, bottom);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-ticket';
      remove.dataset.action = 'remove';
      remove.dataset.id = item.providerId;
      remove.setAttribute('aria-label', `移除 ${quote.name}`);
      remove.textContent = '×';
      ticket.append(select, remove);
      fragment.append(ticket);
    });

    dom.watchlist.replaceChildren(fragment);
  }

  function renderSelectedQuote() {
    const item = selectedItem();
    const quote = selectedQuote();
    const direction = directionClass(quote.change);
    const isMixed = quote.source === 'live' && state.candleSource !== 'live';
    const sourceMode = state.statusMode === 'stale' ? 'stale' : (quote.source === 'sample' || isMixed ? 'sample' : 'live');
    const sourceLabels = { live: '接口行情', sample: isMixed ? 'K 线样例' : '样例行情', stale: '缓存行情', loading: '读取中' };

    dom.sourceBadge.className = `source-badge${sourceMode === 'sample' ? ' is-sample' : sourceMode === 'stale' ? ' is-stale' : ''}`;
    dom.sourceBadge.textContent = sourceLabels[sourceMode];
    dom.assetSymbol.textContent = item.display;
    dom.assetName.textContent = quote.name;
    dom.currentPrice.textContent = formatPrice(quote.price);
    dom.currentPrice.className = direction;
    dom.priceChange.className = `price-change ${direction}`;
    dom.priceChange.textContent = `${formatSigned(quote.change)} · ${formatPercent(quote.changePercent, true)}`;
    dom.metricOpen.textContent = formatPrice(quote.open);
    dom.metricHigh.textContent = formatPrice(quote.high);
    dom.metricLow.textContent = formatPrice(quote.low);
    dom.metricPrevious.textContent = formatPrice(quote.previousClose);
    dom.metricVolume.textContent = Core.formatCompactNumber(quote.volume);
    dom.quoteTime.textContent = quote.source === 'sample'
      ? '样例数据 · 不代表真实行情'
      : `${formatQuoteTimestamp(quote.timestamp)} · 行情可能延迟`;
  }

  function renderRangeTabs() {
    dom.rangeButtons.forEach((button) => {
      const active = button.dataset.range === state.rangeKey;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderChart() {
    scheduleChartDraw();
    renderCandleInspector();
  }

  function scheduleChartDraw() {
    window.cancelAnimationFrame(drawFrame);
    drawFrame = window.requestAnimationFrame(drawChart);
  }

  function drawChart() {
    const canvas = dom.chartCanvas;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, rect.width);
    const height = Math.max(280, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!state.candles.length) {
      context.fillStyle = '#68727c';
      context.font = '12px Consolas, monospace';
      context.fillText('暂无 K 线数据', 22, 34);
      return;
    }

    const bounds = Core.calculateChartBounds(state.candles);
    const left = width < 520 ? 46 : 62;
    const right = 12;
    const top = 16;
    const bottom = height - 23;
    const volumeHeight = Math.max(48, height * 0.17);
    const volumeTop = bottom - volumeHeight;
    const priceBottom = volumeTop - 24;
    const plotWidth = width - left - right;
    const priceHeight = priceBottom - top;
    const step = plotWidth / state.candles.length;
    const bodyWidth = Math.max(1.5, Math.min(10, step * 0.58));
    state.chartLayout = { left, width: plotWidth };

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(23, 59, 114, 0.13)';
    context.fillStyle = '#68727c';
    context.font = '10px Consolas, monospace';
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    for (let index = 0; index <= 4; index += 1) {
      const y = top + (priceHeight / 4) * index;
      const value = bounds.priceMax - ((bounds.priceMax - bounds.priceMin) / 4) * index;
      context.beginPath();
      context.moveTo(left, Math.round(y) + 0.5);
      context.lineTo(left + plotWidth, Math.round(y) + 0.5);
      context.stroke();
      context.fillText(formatAxisPrice(value), 2, y);
    }

    const priceY = (value) => top + ((bounds.priceMax - value) / (bounds.priceMax - bounds.priceMin)) * priceHeight;
    const volumeY = (value) => bottom - (bounds.volumeMax ? (value / bounds.volumeMax) * volumeHeight : 0);

    state.candles.forEach((candle, index) => {
      const x = left + step * (index + 0.5);
      const rising = candle.close >= candle.open;
      const color = rising ? '#c84b31' : '#1f7a5a';
      const openY = priceY(candle.open);
      const closeY = priceY(candle.close);
      const highY = priceY(candle.high);
      const lowY = priceY(candle.low);
      context.strokeStyle = color;
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, highY);
      context.lineTo(Math.round(x) + 0.5, lowY);
      context.stroke();
      context.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1.5, Math.abs(closeY - openY)));

      context.globalAlpha = 0.28;
      context.fillRect(x - bodyWidth / 2, volumeY(candle.volume), bodyWidth, bottom - volumeY(candle.volume));
      context.globalAlpha = 1;
    });

    context.strokeStyle = 'rgba(23, 59, 114, 0.22)';
    context.beginPath();
    context.moveTo(left, volumeTop - 12.5);
    context.lineTo(left + plotWidth, volumeTop - 12.5);
    context.stroke();

    const labelIndexes = [...new Set([0, Math.floor((state.candles.length - 1) / 2), state.candles.length - 1])];
    context.textBaseline = 'alphabetic';
    labelIndexes.forEach((index) => {
      const x = left + step * (index + 0.5);
      context.textAlign = index === 0 ? 'left' : index === state.candles.length - 1 ? 'right' : 'center';
      context.fillText(state.candles[index].date.slice(5), x, height - 5);
    });

    const selectedIndex = clampCandleIndex(state.selectedCandleIndex);
    if (selectedIndex >= 0) {
      const candle = state.candles[selectedIndex];
      const x = left + step * (selectedIndex + 0.5);
      const y = priceY(candle.close);
      context.save();
      context.strokeStyle = '#173b72';
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.moveTo(left, y);
      context.lineTo(left + plotWidth, y);
      context.stroke();
      context.restore();

      const tag = formatPrice(candle.close);
      context.font = '700 10px Consolas, monospace';
      const tagWidth = context.measureText(tag).width + 10;
      const tagX = Math.min(left + plotWidth - tagWidth, Math.max(left, x - tagWidth / 2));
      context.fillStyle = '#173b72';
      context.fillRect(tagX, Math.max(top, y - 18), tagWidth, 16);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(tag, tagX + tagWidth / 2, Math.max(top + 8, y - 10));
    }

    const current = state.candles[clampCandleIndex(state.selectedCandleIndex)];
    dom.chartCanvas.setAttribute('aria-label', current
      ? `${selectedQuote().name} ${Core.getRangeConfig(state.rangeKey).label} K 线。当前 ${current.date}，开盘 ${formatPrice(current.open)}，收盘 ${formatPrice(current.close)}。使用左右方向键逐根查看。`
      : `${selectedQuote().name} K 线图。`);
  }

  function handleChartPointer(event) {
    if (!state.candles.length || !state.chartLayout) return;
    const rect = dom.chartCanvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const index = Core.findCandleIndex(pointerX, state.chartLayout.left, state.chartLayout.width, state.candles.length);
    if (index >= 0 && index !== state.selectedCandleIndex) {
      state.selectedCandleIndex = index;
      renderCandleInspector();
      scheduleChartDraw();
    }
  }

  function handleChartKeydown(event) {
    if (!state.candles.length) return;
    const current = clampCandleIndex(state.selectedCandleIndex);
    let next = current;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'ArrowRight') next = Math.min(state.candles.length - 1, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = state.candles.length - 1;
    else return;
    event.preventDefault();
    state.selectedCandleIndex = next;
    renderCandleInspector();
    scheduleChartDraw();
  }

  function renderCandleInspector() {
    const index = clampCandleIndex(state.selectedCandleIndex);
    const candle = state.candles[index];
    if (!candle) return;
    dom.inspectorHeading.textContent = candle.date;
    dom.candleOpen.textContent = formatPrice(candle.open);
    dom.candleHigh.textContent = formatPrice(candle.high);
    dom.candleLow.textContent = formatPrice(candle.low);
    dom.candleClose.textContent = formatPrice(candle.close);
    dom.candleVolume.textContent = Core.formatCompactNumber(candle.volume);
  }

  function clampCandleIndex(index) {
    if (!state.candles.length) return -1;
    if (!Number.isInteger(index) || index < 0) return state.candles.length - 1;
    return Math.min(index, state.candles.length - 1);
  }

  function setChartLoading(loading, message) {
    if (message) dom.chartState.lastElementChild.textContent = message;
    dom.chartState.hidden = !loading || state.candles.length > 0;
  }

  function tickRefreshClock() {
    const remaining = Math.max(0, state.nextRefreshAt - Date.now());
    const seconds = Math.ceil(remaining / 1_000);
    dom.refreshCountdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (!state.refreshing && !document.hidden && remaining === 0) refreshAll();
  }

  function updateRefreshStatus(message, mode) {
    dom.refreshStatus.textContent = message;
    dom.signalDot.className = `signal-dot${mode === 'live' ? ' is-live' : mode === 'stale' || mode === 'sample' ? ' is-error' : ''}`;
  }

  function directionClass(change) {
    return change > 0.000001 ? 'is-rise' : change < -0.000001 ? 'is-fall' : 'is-flat';
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return '—';
    const digits = Math.abs(value) < 1 ? 4 : 2;
    return new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatAxisPrice(value) {
    if (!Number.isFinite(value)) return '—';
    return value >= 1_000 ? value.toFixed(0) : value.toFixed(value < 10 ? 2 : 1);
  }

  function formatSigned(value) {
    if (!Number.isFinite(value)) return '—';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(Math.abs(value) < 1 ? 3 : 2)}`;
  }

  function formatPercent(value, includePlus = false) {
    if (!Number.isFinite(value)) return '—';
    const prefix = includePlus && value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  }

  function formatQuoteTimestamp(value) {
    if (!/^\d{14}$/.test(value || '')) return '刚刚更新';
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }

  function announce(message) {
    dom.announcer.textContent = '';
    window.setTimeout(() => { dom.announcer.textContent = message; }, 20);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2_600);
  }
})();
