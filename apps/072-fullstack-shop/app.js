(function () {
  'use strict';

  const core = window.CounterShop;
  if (!core) throw new Error('COUNTER/72 core failed to load');

  const CART_KEY = 'counter72_cart_v1';
  const ORDERS_KEY = 'counter72_orders_v1';
  const SHOP_KEY = 'counter72_shop_key_v1';
  const offline = new URLSearchParams(location.search).get('offline') === '1';
  const productById = new Map(core.PRODUCTS.map((product) => [product.id, product]));
  const stalls = [
    { id: 'all', label: '全部摊位' },
    { id: 'paper', label: '折页纸局' },
    { id: 'clay', label: '慢烧陶室' },
    { id: 'textile', label: '经纬织所' },
    { id: 'light', label: '微光装配站' }
  ];
  const pickupLabels = {
    'sat-am': '周六 10:00—13:00', 'sat-pm': '周六 13:00—18:00',
    'sun-am': '周日 10:00—13:00', 'sun-pm': '周日 13:00—18:00'
  };
  const statusLabels = { preparing: '待备货', ready: '可取货', completed: '已完成', cancelled: '已取消' };

  const state = {
    query: '',
    stall: 'all',
    cart: core.cleanCart(readJson(CART_KEY, [])),
    localOrders: readJson(ORDERS_KEY, []),
    serverOrders: [],
    shopKey: getShopKey(),
    mode: offline ? 'local' : 'checking',
    idempotencyKey: '',
    highlightOrderId: ''
  };

  const $ = (id) => document.getElementById(id);
  const elements = {
    searchInput: $('searchInput'), stallFilters: $('stallFilters'), productGrid: $('productGrid'), resultCount: $('resultCount'),
    ticket: $('ticket'), ticketLines: $('ticketLines'), ticketTotals: $('ticketTotals'), ticketCount: $('ticketCount'),
    checkoutButton: $('checkoutButton'), ticketPanel: $('ticketPanel'), ticketClose: $('ticketClose'), ticketBackdrop: $('ticketBackdrop'),
    mobileTicketButton: $('mobileTicketButton'), mobileTicketTotal: $('mobileTicketTotal'), mobileTicketCount: $('mobileTicketCount'),
    checkoutDialog: $('checkoutDialog'), checkoutForm: $('checkoutForm'), dialogClose: $('dialogClose'),
    checkoutItems: $('checkoutItems'), checkoutTotal: $('checkoutTotal'), submitOrderButton: $('submitOrderButton'), submitError: $('submitError'),
    nicknameInput: $('nicknameInput'), phoneSuffixInput: $('phoneSuffixInput'), pickupSlotInput: $('pickupSlotInput'),
    ordersList: $('ordersList'), orderCountBadge: $('orderCountBadge'), refreshOrdersButton: $('refreshOrdersButton'),
    modeChip: $('modeChip'), toast: $('toast')
  };

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode can reject writes */ }
  }

  function randomKey(prefix) {
    const raw = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${raw.slice(0, 32).padEnd(16, '0')}`;
  }

  function getShopKey() {
    const saved = localStorage.getItem(SHOP_KEY);
    if (/^shop_[A-Za-z0-9_-]{16,64}$/.test(saved || '')) return saved;
    const key = randomKey('shop');
    try { localStorage.setItem(SHOP_KEY, key); } catch (_) { /* keep in memory */ }
    return key;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function money(cents) {
    return `¥${(Number(cents || 0) / 100).toFixed(0)}`;
  }

  function saveCart() {
    state.cart = core.cleanCart(state.cart);
    writeJson(CART_KEY, state.cart);
  }

  function saveLocalOrders() {
    state.localOrders = state.localOrders.filter((order) => order && order.shopKey === state.shopKey).slice(0, 30);
    writeJson(ORDERS_KEY, state.localOrders);
  }

  function cartQty(id) {
    return state.cart.find((row) => row.id === id)?.qty || 0;
  }

  function renderFilters() {
    elements.stallFilters.innerHTML = stalls.map((stall) => `
      <button class="filter-chip ${state.stall === stall.id ? 'active' : ''}" type="button" data-stall="${stall.id}" aria-pressed="${state.stall === stall.id}">${stall.label}</button>
    `).join('');
  }

  function filteredProducts() {
    const query = state.query.trim().toLocaleLowerCase('zh-CN');
    return core.PRODUCTS.filter((product) => {
      const stallMatch = state.stall === 'all' || product.stall === state.stall;
      const haystack = `${product.name} ${product.stallName} ${product.material} ${product.tag}`.toLocaleLowerCase('zh-CN');
      return stallMatch && (!query || haystack.includes(query));
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    elements.resultCount.textContent = `${products.length} 件商品`;
    if (!products.length) {
      elements.productGrid.innerHTML = '<div class="empty-products"><strong>这一排没有匹配商品</strong><p>换个关键词，或回到全部摊位继续逛。</p><button type="button" data-reset-filters>清除筛选</button></div>';
      return;
    }
    elements.productGrid.innerHTML = products.map((product) => {
      const qty = cartQty(product.id);
      const sold = qty >= product.stock;
      return `<article class="product-card">
        <div class="product-art" style="--product-color:${product.color}">
          <span class="product-id">${product.id.toUpperCase()}</span>
          <span class="product-stock ${product.stock <= 4 ? 'low' : ''}">${sold ? '袋中已达上限' : `余 ${product.stock}`}</span>
          <span class="product-mark" aria-hidden="true">${product.mark}</span>
        </div>
        <div class="product-copy">
          <p class="product-stall">${product.stallName} / ${product.tag}</p>
          <h3>${product.name}</h3>
          <p class="product-detail">${product.material} · 现场取货</p>
          <div class="product-bottom"><span class="product-price">${money(product.price)}<small> / 件</small></span><button class="add-product" type="button" data-add="${product.id}" ${sold ? 'disabled' : ''} aria-label="${sold ? `${product.name}已达库存上限` : `将${product.name}加入取货票`}">${sold ? '✓' : '+'}</button></div>
        </div>
      </article>`;
    }).join('');
  }

  function renderTicket(animate) {
    const totals = core.calculateTotals(state.cart);
    elements.ticketCount.textContent = String(totals.itemCount).padStart(2, '0');
    elements.mobileTicketCount.textContent = String(totals.itemCount);
    elements.mobileTicketTotal.textContent = money(totals.total);
    elements.checkoutButton.disabled = totals.itemCount === 0;
    if (!totals.lines.length) {
      elements.ticketLines.innerHTML = '<div class="empty-ticket"><span aria-hidden="true">▤</span><b>取货票还是空白的</b><p>从左边挑一件喜欢的小物，票据会在这里打印出来。</p></div>';
    } else {
      elements.ticketLines.innerHTML = totals.lines.map((line) => `
        <div class="ticket-row">
          <div><h3>${escapeHtml(line.name)}</h3><p>${escapeHtml(line.stallName)} · ${money(line.price)}</p>
            <div class="qty-buttons"><button type="button" data-qty="${line.id}" data-delta="-1" aria-label="减少${escapeHtml(line.name)}数量">−</button><span>${line.qty}</span><button type="button" data-qty="${line.id}" data-delta="1" aria-label="增加${escapeHtml(line.name)}数量">+</button><button class="remove-line" type="button" data-remove="${line.id}">移除</button></div>
          </div><strong>${money(line.lineTotal)}</strong>
        </div>`).join('');
    }
    elements.ticketTotals.innerHTML = `<div class="total-row"><span>商品件数</span><b>${totals.itemCount} 件</b></div><div class="total-row"><span>取货服务</span><b>免费</b></div><div class="total-row grand"><span>到场支付</span><b>${money(totals.total)}</b></div>`;
    if (animate) {
      elements.ticket.classList.remove('feed');
      void elements.ticket.offsetWidth;
      elements.ticket.classList.add('feed');
    }
  }

  function allVisibleOrders() {
    const seen = new Set();
    return [...state.serverOrders, ...state.localOrders.filter((order) => order.shopKey === state.shopKey)]
      .filter((order) => order && order.id && !seen.has(order.id) && seen.add(order.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function orderActions(order) {
    if (order.status === 'preparing') return `<button type="button" data-order-id="${escapeHtml(order.id)}" data-next-status="ready">标记可取货</button><button class="cancel-order" type="button" data-order-id="${escapeHtml(order.id)}" data-next-status="cancelled">取消订单</button>`;
    if (order.status === 'ready') return `<button type="button" data-order-id="${escapeHtml(order.id)}" data-next-status="completed">完成交付</button>`;
    return '';
  }

  function renderOrders() {
    const orders = allVisibleOrders();
    elements.orderCountBadge.textContent = String(orders.length);
    if (!orders.length) {
      elements.ordersList.innerHTML = '<div class="empty-orders"><b>订单台正在等第一张票</b><p>选好商品并生成取货码，履约进度会出现在这里。</p></div>';
      return;
    }
    elements.ordersList.innerHTML = orders.map((order) => {
      const safe = core.publicOrder(order);
      const itemSummary = safe.lines.map((line) => `${line.name} × ${line.qty}`).join('、');
      return `<article class="order-card ${safe.id === state.highlightOrderId ? 'highlight' : ''}">
        <div class="order-card-head"><span>${escapeHtml(safe.id)}</span><b class="status-tag ${safe.status}">${statusLabels[safe.status]}</b></div>
        <div class="pickup-code"><small>现场取货码</small><strong>${escapeHtml(safe.pickupCode)}</strong></div>
        <dl><div><dt>取货人</dt><dd>${escapeHtml(safe.customer.nickname)} · *${escapeHtml(safe.customer.phoneSuffix)}</dd></div><div><dt>时段</dt><dd>${escapeHtml(pickupLabels[safe.customer.pickupSlot] || '未指定')}</dd></div><div><dt>商品</dt><dd>${escapeHtml(itemSummary)}</dd></div><div><dt>到场支付</dt><dd>${money(safe.totals.total)}</dd></div><div><dt>订单模式</dt><dd>${safe.source === 'server' ? '服务端订单' : '本地订单'}</dd></div></dl>
        <div class="order-actions">${orderActions(safe)}</div>
      </article>`;
    }).join('');
  }

  function renderMode() {
    elements.modeChip.className = `mode-chip ${state.mode === 'server' ? 'server' : state.mode === 'local' ? 'local' : ''}`;
    elements.modeChip.innerHTML = `<span></span>${state.mode === 'server' ? '服务端订单台' : state.mode === 'local' ? '本地演示订单' : '正在检查订单台'}`;
  }

  function renderAll() {
    renderFilters();
    renderProducts();
    renderTicket(false);
    renderOrders();
    renderMode();
  }

  function setCartQty(id, nextQty, animate) {
    const product = productById.get(id);
    if (!product) return;
    const row = state.cart.find((item) => item.id === id);
    if (nextQty <= 0) state.cart = state.cart.filter((item) => item.id !== id);
    else if (row) row.qty = Math.min(product.stock, nextQty);
    else state.cart.push({ id, qty: 1 });
    saveCart();
    renderProducts();
    renderTicket(animate);
  }

  function addProduct(id) {
    const product = productById.get(id);
    if (!product) return;
    const next = cartQty(id) + 1;
    if (next > product.stock) return showToast(`${product.name} 已达库存上限`);
    setCartQty(id, next, true);
    showToast(`${product.name} 已打印到取货票`);
  }

  function openTicket() {
    elements.ticketPanel.classList.add('open');
    elements.ticketBackdrop.classList.add('show');
    elements.mobileTicketButton.setAttribute('aria-expanded', 'true');
    elements.ticketPanel.setAttribute('aria-hidden', 'false');
    elements.ticketClose.focus();
  }

  function closeTicket() {
    const wasOpen = elements.ticketPanel.classList.contains('open');
    elements.ticketPanel.classList.remove('open');
    elements.ticketBackdrop.classList.remove('show');
    elements.mobileTicketButton.setAttribute('aria-expanded', 'false');
    if (wasOpen) elements.mobileTicketButton.focus();
  }

  function clearFieldErrors() {
    ['nickname', 'phoneSuffix', 'pickupSlot'].forEach((field) => {
      $(`${field}Error`).textContent = '';
      $(`${field}Input`).removeAttribute('aria-invalid');
    });
    elements.submitError.textContent = '';
  }

  function openCheckout() {
    const totals = core.calculateTotals(state.cart);
    if (!totals.itemCount) return;
    closeTicket();
    clearFieldErrors();
    state.idempotencyKey = randomKey('idem');
    elements.checkoutItems.textContent = `${totals.itemCount} 件商品`;
    elements.checkoutTotal.textContent = money(totals.total);
    elements.checkoutDialog.showModal();
    requestAnimationFrame(() => elements.nicknameInput.focus());
  }

  function showValidationErrors(errors) {
    Object.entries(errors).forEach(([field, message]) => {
      const input = $(`${field}Input`);
      const target = $(`${field}Error`);
      if (input && target) { input.setAttribute('aria-invalid', 'true'); target.textContent = message; }
    });
    const first = Object.keys(errors)[0];
    if (first && $(`${first}Input`)) $(`${first}Input`).focus();
  }

  async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 3500);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options && options.headers) } });
      let data = null;
      try { data = await response.json(); } catch (_) { /* non-JSON is unavailable */ }
      if (!response.ok) {
        const error = new Error(data && data.message ? data.message : '订单台暂时未响应');
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function detectMode() {
    if (offline) { state.mode = 'local'; renderMode(); return; }
    try {
      const result = await fetchJson('/api/products', {}, 1800);
      if (!result || !Array.isArray(result.products)) throw new Error('invalid catalog response');
      state.mode = 'server';
      await refreshOrders(false);
    } catch (_) {
      state.mode = 'local';
    }
    renderMode();
  }

  function createLocalOrder(customer) {
    const existing = state.localOrders.find((order) => order.shopKey === state.shopKey && order.idempotencyKey === state.idempotencyKey);
    if (existing) return core.publicOrder(existing);
    const order = core.createOrder({ cart: state.cart, customer, shopKey: state.shopKey, idempotencyKey: state.idempotencyKey, source: 'local' });
    state.localOrders.unshift(order);
    saveLocalOrders();
    return core.publicOrder(order);
  }

  async function submitOrder(event) {
    event.preventDefault();
    clearFieldErrors();
    const checkout = core.validateCheckout({ nickname: elements.nicknameInput.value, phoneSuffix: elements.phoneSuffixInput.value, pickupSlot: elements.pickupSlotInput.value });
    if (!checkout.valid) return showValidationErrors(checkout.errors);
    if (!state.cart.length) { elements.submitError.textContent = '购物袋已为空，请重新选择商品。'; return; }
    if (!state.idempotencyKey) state.idempotencyKey = randomKey('idem');

    elements.submitOrderButton.disabled = true;
    elements.submitOrderButton.setAttribute('aria-busy', 'true');
    elements.submitOrderButton.firstChild.textContent = '正在生成取货码 ';
    try {
      let order;
      if (state.mode === 'server') {
        const result = await fetchJson('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart: state.cart, customer: checkout.value, shopKey: state.shopKey, idempotencyKey: state.idempotencyKey })
        }, 5000);
        order = result.order;
        state.serverOrders = [order, ...state.serverOrders.filter((item) => item.id !== order.id)];
      } else {
        order = createLocalOrder(checkout.value);
      }
      state.highlightOrderId = order.id;
      state.cart = [];
      saveCart();
      state.idempotencyKey = '';
      elements.checkoutDialog.close();
      renderProducts(); renderTicket(false); renderOrders();
      document.getElementById('orders').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      showToast(`取货码 ${order.pickupCode} 已生成`);
    } catch (error) {
      elements.submitError.textContent = error && error.message ? `${error.message}。购物袋已保留，请稍后重试。` : '订单台暂时未响应。购物袋已保留，请稍后重试。';
    } finally {
      elements.submitOrderButton.disabled = false;
      elements.submitOrderButton.removeAttribute('aria-busy');
      elements.submitOrderButton.firstChild.textContent = '生成取货码 ';
    }
  }

  async function refreshOrders(notify) {
    if (state.mode !== 'server') {
      renderOrders();
      if (notify) showToast('本地订单已刷新');
      return;
    }
    try {
      const result = await fetchJson(`/api/orders?shopKey=${encodeURIComponent(state.shopKey)}`, {}, 3500);
      state.serverOrders = Array.isArray(result.orders) ? result.orders : [];
      renderOrders();
      if (notify) showToast('服务端订单已刷新');
    } catch (error) {
      if (notify) showToast('刷新失败，已保留当前订单');
      throw error;
    }
  }

  async function updateOrder(orderId, nextStatus) {
    const order = allVisibleOrders().find((item) => item.id === orderId);
    if (!order) return;
    try {
      let updated;
      if (order.source === 'server' && state.mode === 'server') {
        const result = await fetchJson(`/api/orders/${encodeURIComponent(orderId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopKey: state.shopKey, status: nextStatus })
        }, 4000);
        updated = result.order;
        state.serverOrders = state.serverOrders.map((item) => item.id === orderId ? updated : item);
      } else {
        const index = state.localOrders.findIndex((item) => item.id === orderId && item.shopKey === state.shopKey);
        if (index < 0) return;
        state.localOrders[index] = core.transitionOrder(state.localOrders[index], nextStatus);
        updated = core.publicOrder(state.localOrders[index]);
        saveLocalOrders();
      }
      state.highlightOrderId = updated.id;
      renderOrders();
      showToast(`订单已更新为“${statusLabels[updated.status]}”`);
    } catch (error) {
      showToast(error && error.message ? error.message : '订单状态更新失败');
    }
  }

  let toastTimer;
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
  }

  elements.searchInput.addEventListener('input', (event) => { state.query = event.target.value; renderProducts(); });
  elements.stallFilters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-stall]');
    if (!button) return;
    state.stall = button.dataset.stall; renderFilters(); renderProducts();
  });
  elements.productGrid.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    const reset = event.target.closest('[data-reset-filters]');
    if (add) addProduct(add.dataset.add);
    if (reset) { state.query = ''; state.stall = 'all'; elements.searchInput.value = ''; renderFilters(); renderProducts(); }
  });
  elements.ticketLines.addEventListener('click', (event) => {
    const qty = event.target.closest('[data-qty]');
    const remove = event.target.closest('[data-remove]');
    if (qty) setCartQty(qty.dataset.qty, cartQty(qty.dataset.qty) + Number(qty.dataset.delta), true);
    if (remove) { setCartQty(remove.dataset.remove, 0, true); showToast('商品已从取货票移除'); }
  });
  elements.mobileTicketButton.addEventListener('click', openTicket);
  elements.ticketClose.addEventListener('click', closeTicket);
  elements.ticketBackdrop.addEventListener('click', closeTicket);
  elements.checkoutButton.addEventListener('click', openCheckout);
  elements.dialogClose.addEventListener('click', () => elements.checkoutDialog.close());
  elements.checkoutForm.addEventListener('submit', submitOrder);
  elements.refreshOrdersButton.addEventListener('click', () => refreshOrders(true).catch(() => {}));
  elements.ordersList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-order-id][data-next-status]');
    if (button) updateOrder(button.dataset.orderId, button.dataset.nextStatus);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeTicket(); });

  renderAll();
  detectMode();
})();

