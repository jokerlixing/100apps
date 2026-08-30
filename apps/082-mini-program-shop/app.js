(function bootstrapYunxiuShop() {
  'use strict';

  const Core = window.ShopCore;
  if (!Core) throw new Error('ShopCore failed to load');

  const STORAGE_KEY = 'yunxiu_shop_v1';
  const CATEGORIES = ['全部', '茶饮', '山珍', '甜藏', '菜篮', '果干'];
  const CATALOG = [
    {
      id: 'tea',
      name: '云雾绿茶',
      category: '茶饮',
      priceCents: 4500,
      unit: '80g / 罐',
      stock: 18,
      tag: '谷雨前摘',
      origin: '浙江 · 临安龙须坞',
      altitude: '海拔 1,180m',
      harvest: '2026 春 · 手工炒青',
      subtitle: '豆香清亮，三泡仍有回甘。适合清晨和饭后。',
      detail: '合作茶园按小批次炒制，使用避光纸罐分装。建议 85℃ 水温冲泡，开封后 45 天内饮用。',
      colors: ['#b9ce9d', '#315b45', '#f0b94b'],
      art: 'leaf',
    },
    {
      id: 'mushroom',
      name: '椴木香菇',
      category: '山珍',
      priceCents: 5400,
      unit: '150g / 袋',
      stock: 12,
      tag: '冬菇厚肉',
      origin: '福建 · 古田杉洋村',
      altitude: '林下椴木栽培',
      harvest: '2026 冬 · 日晒 3 天',
      subtitle: '菇盖厚、香气足，泡发水也能直接煲汤。',
      detail: '只挑完整厚盖冬菇，日晒收干后手工分级。冷水泡发 6 小时，泡菇水过滤后可用于炖鸡或焖饭。',
      colors: ['#dcc7a2', '#86563a', '#284c3e'],
      art: 'mushroom',
    },
    {
      id: 'honey',
      name: '百花蜂蜜',
      category: '甜藏',
      priceCents: 6800,
      unit: '500g / 瓶',
      stock: 9,
      tag: '自然成熟',
      origin: '云南 · 高黎贡山',
      altitude: '海拔 1,650m',
      harvest: '2026 夏 · 百花蜜',
      subtitle: '花香有层次，甜感干净；低温时自然结晶。',
      detail: '成熟封盖蜜经粗滤后直接装瓶，不做高温浓缩。结晶是天然蜂蜜的正常变化，可隔温水慢慢融化。',
      colors: ['#f3cb64', '#d8782f', '#315b45'],
      art: 'honey',
    },
    {
      id: 'bamboo',
      name: '手剥笋干',
      category: '山珍',
      priceCents: 3900,
      unit: '200g / 袋',
      stock: 16,
      tag: '春尖嫩段',
      origin: '江西 · 井冈山茅坪',
      altitude: '毛竹林鲜笋',
      harvest: '2026 春 · 盐水煮晒',
      subtitle: '纤维细、笋味浓，泡发后适合烧肉或煲汤。',
      detail: '春笋出土当天剥壳、煮制、压榨并日晒。烹饪前用清水泡 8 小时，中途换水两次。',
      colors: ['#d9d19d', '#718b58', '#b87c38'],
      art: 'bamboo',
    },
    {
      id: 'potato',
      name: '高山小土豆',
      category: '菜篮',
      priceCents: 2600,
      unit: '1kg / 箱',
      stock: 20,
      tag: '粉糯黄心',
      origin: '贵州 · 威宁草海镇',
      altitude: '海拔 2,200m',
      harvest: '8 月新挖 · 带泥发',
      subtitle: '个头不齐但粉糯，连皮煎烤尤其香。',
      detail: '小农分批采挖，不做抛光和催芽处理。收到后放在阴凉避光处，建议两周内吃完。',
      colors: ['#d8b56a', '#9a6c3f', '#526b43'],
      art: 'potato',
    },
    {
      id: 'wine',
      name: '桂花米酿',
      category: '甜藏',
      priceCents: 4800,
      unit: '500ml / 瓶',
      stock: 10,
      tag: '0.5%vol',
      origin: '广西 · 桂林会仙镇',
      altitude: '糯米低温发酵',
      harvest: '金桂入酿 · 冷藏发',
      subtitle: '桂花清香，酒精度低，可直接喝也可煮小圆子。',
      detail: '糯米糖化后加入当季金桂，低温短发酵保留米香。到货后冷藏，开瓶三天内饮用。',
      colors: ['#f4d57c', '#c78834', '#315b45'],
      art: 'bottle',
    },
    {
      id: 'persimmon',
      name: '日晒柿饼',
      category: '果干',
      priceCents: 3600,
      unit: '300g / 盒',
      stock: 14,
      tag: '无糖霜染',
      origin: '陕西 · 富平曹村',
      altitude: '尖柿自然吊晒',
      harvest: '霜降后 · 反复揉捏',
      subtitle: '软糯流心，表面柿霜来自果糖自然析出。',
      detail: '只用成熟尖柿，自然吊晒并多次揉捏整形。不额外加糖，独立托装减少粘连。',
      colors: ['#e78143', '#b4472e', '#f4cf8c'],
      art: 'persimmon',
    },
    {
      id: 'chestnut',
      name: '油栗仁',
      category: '果干',
      priceCents: 4200,
      unit: '250g / 袋',
      stock: 13,
      tag: '熟制开袋吃',
      origin: '河北 · 燕山青龙',
      altitude: '老栗树当季果',
      harvest: '糖炒熟制 · 独立小包',
      subtitle: '栗香浓、口感绵，剥好壳更适合办公室。',
      detail: '当季油栗蒸烤熟制后去壳，小袋充氮包装。开袋即食，也可以切碎拌进酸奶或燕麦。',
      colors: ['#c99755', '#704733', '#6d8054'],
      art: 'chestnut',
    },
  ];

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const productMap = new Map(CATALOG.map((product) => [product.id, product]));
  const defaultState = () => ({
    cart: [],
    favorites: [],
    address: { receiver: '', phone: '', region: '', detail: '' },
    orders: [],
    couponCode: '',
  });

  let state = loadState();
  let activeCategory = '全部';
  let searchTerm = '';
  let currentProductId = null;
  let detailQuantity = 1;
  let lastOrder = null;
  let toastTimer = 0;
  let paymentTimer = 0;
  let storageReady = true;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function sanitizeState(value) {
    const base = defaultState();
    if (!value || typeof value !== 'object') return base;

    const cart = Array.isArray(value.cart)
      ? value.cart.reduce((next, line) => {
        const product = productMap.get(line && line.productId);
        if (!product) return next;
        return Core.setCartQuantity(next, product.id, line.quantity, CATALOG);
      }, [])
      : [];
    const favorites = Array.isArray(value.favorites)
      ? [...new Set(value.favorites.filter((id) => productMap.has(id)))]
      : [];
    const address = value.address && typeof value.address === 'object'
      ? {
        receiver: String(value.address.receiver || '').slice(0, 30),
        phone: String(value.address.phone || '').slice(0, 20),
        region: String(value.address.region || '').slice(0, 80),
        detail: String(value.address.detail || '').slice(0, 160),
      }
      : base.address;
    const orders = Array.isArray(value.orders)
      ? value.orders.filter((order) => order && typeof order.id === 'string' && order.summary).slice(0, 20)
      : [];

    return {
      cart,
      favorites,
      address,
      orders,
      couponCode: String(value.couponCode || '').slice(0, 30),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
    } catch (error) {
      console.warn('Local shop state could not be restored.', error);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageReady = true;
    } catch (error) {
      storageReady = false;
      console.warn('Local shop state could not be saved.', error);
    }
    $('#storageNotice').hidden = storageReady;
  }

  function renderArt(product, compact = false) {
    const [background, accent, highlight] = product.colors;
    const shapes = {
      leaf: '<path d="M103 164c24-71 70-91 119-76-14 50-49 86-119 76Z" fill="var(--accent)"/><path d="M118 154c37-18 63-38 87-61"/><path d="M94 151c-23-45-5-79 29-102 24 39 19 79-29 102Z" fill="var(--highlight)"/><path d="M100 141c3-37 12-58 25-81"/>',
      mushroom: '<path d="M72 135c2-50 39-79 82-79s80 29 82 79H72Z" fill="var(--accent)"/><path d="M120 127h68l13 85c-32 20-66 20-94 0l13-85Z" fill="var(--highlight)"/><circle cx="111" cy="100" r="9"/><circle cx="163" cy="82" r="7"/><circle cx="200" cy="111" r="8"/>',
      honey: '<path d="M105 65h100v38l20 24v93H85v-93l20-24V65Z" fill="var(--highlight)"/><path d="M112 53h86v22h-86z" fill="var(--accent)"/><path d="M119 128h72v58h-72z" fill="var(--accent)"/><path d="m134 157 21-21 21 21-21 21-21-21Z" fill="var(--highlight)"/>',
      bamboo: '<path d="m104 48 69 18-33 158-69-18 33-158Z" fill="var(--highlight)"/><path d="m167 62 56 26-63 137-55-26 62-137Z" fill="var(--accent)"/><path d="m91 105 67 18M76 165l67 18M147 107l55 25M123 160l55 25"/>',
      potato: '<ellipse cx="111" cy="144" rx="60" ry="50" fill="var(--highlight)"/><ellipse cx="194" cy="130" rx="57" ry="64" fill="var(--accent)"/><ellipse cx="162" cy="196" rx="60" ry="38" fill="var(--highlight)"/><circle cx="97" cy="134" r="4"/><circle cx="208" cy="113" r="5"/><circle cx="177" cy="199" r="4"/>',
      bottle: '<path d="M129 50h52v42l25 29v99H104v-99l25-29V50Z" fill="var(--highlight)"/><path d="M122 43h66v22h-66z" fill="var(--accent)"/><path d="M117 129h76v59h-76z" fill="var(--accent)"/><path d="M133 159c15-25 30-25 45 0-16 20-31 20-45 0Z" fill="var(--highlight)"/>',
      persimmon: '<circle cx="112" cy="147" r="60" fill="var(--accent)"/><circle cx="195" cy="151" r="57" fill="var(--highlight)"/><path d="m82 93 29-22 30 23M168 96l28-24 28 25" fill="none"/><path d="M79 160c22 18 45 22 67 8M164 166c22 15 43 16 63 5" fill="none"/>',
      chestnut: '<path d="M63 179c20-90 78-130 137-112 28 9 51 31 61 67-46 69-132 99-198 45Z" fill="var(--accent)"/><path d="M109 198c15-75 54-115 109-120 33 41 27 92-18 135-35 10-65 5-91-15Z" fill="var(--highlight)"/><path d="M89 164c42 22 91 18 139-21"/>',
    };
    const safeName = escapeHtml(product.name);
    const artwork = shapes[product.art]
      .replaceAll('var(--accent)', accent)
      .replaceAll('var(--highlight)', highlight);
    return `
      <svg viewBox="0 0 310 270" role="img" aria-label="${safeName}包装插画">
        <rect width="310" height="270" fill="${background}"/>
        <path d="M0 214 73 147l54 46 48-84 48 60 38-32 49 51v82H0Z" fill="rgba(23,60,53,.12)"/>
        <circle cx="258" cy="49" r="31" fill="${highlight}" stroke="#173c35" stroke-width="3"/>
        <g stroke="#173c35" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${artwork}</g>
        ${compact ? '' : `<rect x="18" y="213" width="142" height="37" rx="4" fill="#fffdf6" stroke="#173c35" stroke-width="2"/><text x="31" y="238" fill="#173c35" font-family="KaiTi,serif" font-size="18" font-weight="700">${safeName}</text>`}
      </svg>`;
  }

  function getCartQuantity(productId) {
    return state.cart.find((line) => line.productId === productId)?.quantity || 0;
  }

  function setQuantity(productId, quantity, { announce = true } = {}) {
    const product = productMap.get(productId);
    if (!product) return;
    const previous = getCartQuantity(productId);
    state.cart = Core.setCartQuantity(state.cart, productId, quantity, CATALOG);
    const next = getCartQuantity(productId);
    saveState();
    renderCartEverywhere();
    renderProducts();
    if (currentProductId === productId && $('#productDialog').open) renderProductDialog();

    if (!announce) return;
    if (next === 0 && previous > 0) showToast(`${product.name}已移出竹篮`);
    else if (next === product.stock && quantity > product.stock) showToast(`${product.name}最多还能选 ${product.stock} 件`);
    else if (next > previous) showToast(`${product.name}已放进竹篮`);
  }

  function addOne(productId) {
    setQuantity(productId, getCartQuantity(productId) + 1);
    const button = $(`[data-action="add"][data-product-id="${productId}"]`);
    if (button) {
      button.classList.add('is-added');
      window.setTimeout(() => button.classList.remove('is-added'), 420);
    }
  }

  function renderCategories() {
    $('#categoryTabs').innerHTML = CATEGORIES.map((category) => `
      <button class="category-button${category === activeCategory ? ' is-active' : ''}" type="button" data-category="${category}" aria-pressed="${category === activeCategory}">${category}</button>
    `).join('');
  }

  function filteredProducts() {
    const needle = searchTerm.trim().toLocaleLowerCase('zh-CN');
    return CATALOG.filter((product) => {
      const categoryMatches = activeCategory === '全部' || product.category === activeCategory;
      const searchMatches = !needle || [product.name, product.category, product.origin, product.subtitle, product.tag]
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(needle);
      return categoryMatches && searchMatches;
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    $('#productCount').textContent = `${products.length} 件山货`;
    $('#emptyMarket').hidden = products.length > 0;
    $('#productGrid').hidden = products.length === 0;
    $('#productGrid').innerHTML = products.map((product) => {
      const quantity = getCartQuantity(product.id);
      const favorite = state.favorites.includes(product.id);
      return `
        <article class="product-card" data-product-card="${product.id}">
          <span class="product-tag">${escapeHtml(product.tag)}</span>
          <button class="favorite-button" type="button" data-action="favorite" data-product-id="${product.id}" aria-label="${favorite ? '取消收藏' : '收藏'}${escapeHtml(product.name)}" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button>
          <button class="product-art-button" type="button" data-action="details" data-product-id="${product.id}" aria-label="查看${escapeHtml(product.name)}详情">
            <span class="product-art">${renderArt(product)}</span>
          </button>
          <div class="product-info">
            <p class="product-origin">${escapeHtml(product.origin)}</p>
            <button class="product-name-button" type="button" data-action="details" data-product-id="${product.id}">${escapeHtml(product.name)}</button>
            <p class="product-description">${escapeHtml(product.subtitle)}</p>
            <div class="product-buy-row">
              <span class="product-price">${Core.formatMoney(product.priceCents)}<small>${escapeHtml(product.unit)}</small></span>
              <button class="add-button${quantity ? ' is-added' : ''}" type="button" data-action="add" data-product-id="${product.id}" aria-label="将${escapeHtml(product.name)}加入购物车">${quantity ? `篮中 ${quantity}` : '加入竹篮'}</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function summaryFor(deliveryType = 'delivery', couponCode = '') {
    return Core.calculateCart({ cart: state.cart, products: CATALOG, couponCode, deliveryType });
  }

  function receiptLines(summary) {
    return summary.lineItems.map((line) => `
      <div class="receipt-line">
        <div><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.unit)} × ${line.quantity}</small></div>
        <span>${Core.formatMoney(line.lineTotalCents)}</span>
      </div>`).join('');
  }

  function renderCartEverywhere() {
    const summary = summaryFor();
    $('#headerCartCount').textContent = summary.itemCount;
    $('#mobileCartCount').textContent = summary.itemCount;
    $('#railCartItems').innerHTML = receiptLines(summary);
    $('#railCartItems').hidden = summary.itemCount === 0;
    $('#railEmpty').hidden = summary.itemCount > 0;
    $('#railSubtotal').textContent = Core.formatMoney(summary.subtotalCents);
    $('#railShipping').textContent = summary.shippingCents === 0 && summary.itemCount > 0 ? '已免' : Core.formatMoney(summary.shippingCents);
    $('#railTotal').textContent = Core.formatMoney(summary.totalCents);
    $('#railCheckoutCount').textContent = `${summary.itemCount} 件`;
    $('#railCheckoutButton').disabled = summary.itemCount === 0;

    const percent = Math.min(100, Math.round((summary.subtotalCents / summary.freeShippingThresholdCents) * 100));
    const shippingMessage = summary.itemCount === 0
      ? '再选 ¥99.00 包邮'
      : summary.amountUntilFreeShippingCents > 0
        ? `再选 ${Core.formatMoney(summary.amountUntilFreeShippingCents)} 包邮`
        : '已享山路快递包邮';
    $('#shippingMessage').textContent = shippingMessage;
    $('#shippingPercent').textContent = `${percent}%`;
    $('#shippingBar').style.width = `${percent}%`;

    renderCartDialog(summary, shippingMessage);
    if ($('#checkoutDialog').open) renderCheckoutSummary();
  }

  function renderCartDialog(summary, shippingMessage) {
    $('#cartDialogEmpty').hidden = summary.itemCount > 0;
    $('#cartDialogItems').hidden = summary.itemCount === 0;
    $('#cartDialogSummary').hidden = summary.itemCount === 0;
    $('#cartShippingMessage').textContent = shippingMessage;
    $('#cartDialogTotal').textContent = Core.formatMoney(summary.totalCents);
    $('#cartDialogItems').innerHTML = summary.lineItems.map((line) => {
      const product = productMap.get(line.productId);
      return `
        <div class="cart-line">
          <div class="cart-line-art">${renderArt(product, true)}</div>
          <div class="cart-line-copy"><strong>${escapeHtml(line.name)}</strong><span>${Core.formatMoney(line.priceCents)} / ${escapeHtml(line.unit)}</span></div>
          <div class="cart-line-controls" aria-label="调整${escapeHtml(line.name)}数量">
            <button type="button" data-action="decrease" data-product-id="${line.productId}" aria-label="减少${escapeHtml(line.name)}">−</button>
            <span>${line.quantity}</span>
            <button type="button" data-action="increase" data-product-id="${line.productId}" aria-label="增加${escapeHtml(line.name)}">+</button>
          </div>
        </div>`;
    }).join('');
  }

  function toggleFavorite(productId) {
    const favorite = state.favorites.includes(productId);
    state.favorites = favorite
      ? state.favorites.filter((id) => id !== productId)
      : [...state.favorites, productId];
    saveState();
    renderProducts();
    showToast(favorite ? '已取消收藏' : '已收进本地收藏');
  }

  function openProduct(productId) {
    if (!productMap.has(productId)) return;
    currentProductId = productId;
    detailQuantity = 1;
    renderProductDialog();
    openDialog($('#productDialog'));
  }

  function renderProductDialog() {
    const product = productMap.get(currentProductId);
    if (!product) return;
    const inCart = getCartQuantity(product.id);
    $('#productDialogContent').innerHTML = `
      <article class="product-detail">
        <div class="product-detail-art" style="background:${product.colors[0]}">${renderArt(product, true)}</div>
        <div class="product-detail-copy">
          <p class="product-origin">${escapeHtml(product.origin)} / ${escapeHtml(product.category)}</p>
          <h2>${escapeHtml(product.name)}</h2>
          <p class="detail-subtitle">${escapeHtml(product.detail)}</p>
          <p class="detail-price">${Core.formatMoney(product.priceCents)} <small>${escapeHtml(product.unit)}</small></p>
          <dl class="detail-notes">
            <div><dt>生长</dt><dd>${escapeHtml(product.altitude)}</dd></div>
            <div><dt>批次</dt><dd>${escapeHtml(product.harvest)}</dd></div>
            <div><dt>库存</dt><dd>本批还剩 ${product.stock} 件${inCart ? `，竹篮已有 ${inCart} 件` : ''}</dd></div>
          </dl>
          <div class="detail-buy">
            <div class="quantity-control" aria-label="购买数量">
              <button type="button" data-detail-action="decrease" aria-label="减少数量">−</button>
              <span>${detailQuantity}</span>
              <button type="button" data-detail-action="increase" aria-label="增加数量">+</button>
            </div>
            <button class="detail-add-button" type="button" data-detail-action="add">加入竹篮 · ${Core.formatMoney(product.priceCents * detailQuantity)}</button>
          </div>
        </div>
      </article>`;
  }

  function checkoutInput() {
    const data = new FormData($('#checkoutForm'));
    return {
      cart: state.cart,
      products: CATALOG,
      address: {
        receiver: String(data.get('receiver') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        region: String(data.get('region') || '').trim(),
        detail: String(data.get('detail') || '').trim(),
      },
      couponCode: String(data.get('coupon') || '').trim(),
      deliveryType: data.get('deliveryType') === 'pickup' ? 'pickup' : 'delivery',
      paymentMethod: String(data.get('paymentMethod') || ''),
    };
  }

  function openCheckout() {
    if (state.cart.length === 0) {
      showToast('竹篮还是空的，请先挑选商品');
      return;
    }
    if ($('#cartDialog').open) $('#cartDialog').close();
    const form = $('#checkoutForm');
    form.reset();
    $('#receiverInput').value = state.address.receiver;
    $('#phoneInput').value = state.address.phone;
    $('#regionInput').value = state.address.region;
    $('#detailInput').value = state.address.detail;
    $('#couponInput').value = state.couponCode;
    clearErrors();
    updateDeliveryVisibility();
    renderCheckoutSummary();
    openDialog($('#checkoutDialog'));
  }

  function renderCheckoutSummary() {
    const input = checkoutInput();
    const summary = Core.calculateCart(input);
    $('#checkoutLineItems').innerHTML = summary.lineItems.map((line) => `
      <div class="checkout-line"><div><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.unit)} × ${line.quantity}</small></div><span>${Core.formatMoney(line.lineTotalCents)}</span></div>
    `).join('');
    $('#checkoutSubtotal').textContent = Core.formatMoney(summary.subtotalCents);
    $('#checkoutDiscount').textContent = `−${Core.formatMoney(summary.discountCents)}`;
    $('#checkoutShipping').textContent = summary.shippingCents === 0 ? '已免' : Core.formatMoney(summary.shippingCents);
    $('#checkoutTotal').textContent = Core.formatMoney(summary.totalCents);
    $('#payButtonTotal').textContent = Core.formatMoney(summary.totalCents);

    const couponInput = String(input.couponCode || '').trim();
    const feedback = $('#couponFeedback');
    feedback.classList.toggle('is-error', Boolean(couponInput && !summary.coupon.applied));
    feedback.textContent = couponInput ? summary.coupon.reason : '输入 WELCOME12，商品小计满 ¥68 可减 ¥12。';
  }

  function updateDeliveryVisibility() {
    const pickup = new FormData($('#checkoutForm')).get('deliveryType') === 'pickup';
    $$('.delivery-address').forEach((field) => { field.hidden = pickup; });
    renderCheckoutSummary();
  }

  function clearErrors() {
    $$('[data-error-for]').forEach((element) => { element.textContent = ''; });
    $$('#checkoutForm [aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
  }

  function showErrors(errors) {
    clearErrors();
    Object.entries(errors).forEach(([field, message]) => {
      const output = $(`[data-error-for="${field}"]`);
      const input = $(`[name="${field}"]`);
      if (output) output.textContent = message;
      if (input) input.setAttribute('aria-invalid', 'true');
    });
    const firstField = Object.keys(errors).find((field) => $(`[name="${field}"]`));
    if (firstField) $(`[name="${firstField}"]`).focus();
    else $('#checkoutLineItems').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submitCheckout(event) {
    event.preventDefault();
    window.clearTimeout(paymentTimer);
    const input = checkoutInput();
    const validation = Core.validateCheckout(input);
    if (!validation.valid) {
      showErrors(validation.errors);
      showToast('还有订单信息需要补全');
      return;
    }

    clearErrors();
    const payButton = $('#payButton');
    const previousMarkup = payButton.innerHTML;
    payButton.disabled = true;
    payButton.innerHTML = '<span>正在装箱并生成订单…</span><strong>请稍候</strong>';

    paymentTimer = window.setTimeout(() => {
      try {
        const order = Core.createOrder(input);
        state.address = { ...input.address };
        state.orders = [order, ...state.orders].slice(0, 20);
        state.cart = [];
        state.couponCode = '';
        lastOrder = order;
        saveState();
        $('#checkoutDialog').close();
        renderAll();
        renderSuccess(order);
        openDialog($('#successDialog'));
      } finally {
        payButton.disabled = false;
        payButton.innerHTML = previousMarkup;
      }
    }, 520);
  }

  function renderSuccess(order) {
    $('#successReceipt').innerHTML = `
      <div><span>订单号</span><strong>${escapeHtml(order.id)}</strong></div>
      <div><span>共计</span><strong>${order.summary.itemCount} 件 · ${Core.formatMoney(order.summary.totalCents)}</strong></div>
      <div><span>配送</span><strong>${escapeHtml(order.deliveryLabel)}</strong></div>
      <div><span>状态</span><strong>${escapeHtml(order.status)}</strong></div>`;
  }

  function renderOrders() {
    $('#ordersEmpty').hidden = state.orders.length > 0;
    $('#ordersList').hidden = state.orders.length === 0;
    $('#ordersList').innerHTML = state.orders.map((order) => {
      const names = Array.isArray(order.lines)
        ? order.lines.map((line) => `${escapeHtml(line.name)} × ${Number(line.quantity) || 0}`).join('、')
        : '订单商品';
      const created = new Date(order.createdAt);
      const dateLabel = Number.isNaN(created.getTime())
        ? '本地订单'
        : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(created);
      return `
        <article class="order-card"${lastOrder && order.id === lastOrder.id ? ' data-latest-order="true"' : ''}>
          <div class="order-card-head"><div><strong>${escapeHtml(order.id)}</strong><time>${escapeHtml(dateLabel)}</time></div><span class="order-status">${escapeHtml(order.status || '待发货')}</span></div>
          <p class="order-products">${names}</p>
          <div class="order-card-foot"><span>${escapeHtml(order.deliveryLabel || '山路快递')} · ${Number(order.summary?.itemCount) || 0} 件</span><strong>${Core.formatMoney(Number(order.summary?.totalCents) || 0)}</strong></div>
        </article>`;
    }).join('');
  }

  function openOrders() {
    renderOrders();
    openDialog($('#ordersDialog'));
  }

  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  }

  function showToast(message) {
    const toast = $('#toast');
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2100);
  }

  function renderAll() {
    renderCategories();
    renderProducts();
    renderCartEverywhere();
    renderOrders();
  }

  function resetFilters() {
    activeCategory = '全部';
    searchTerm = '';
    $('#searchInput').value = '';
    $('#clearSearchButton').hidden = true;
    renderCategories();
    renderProducts();
  }

  function bindEvents() {
    $('#searchInput').addEventListener('input', (event) => {
      searchTerm = event.target.value;
      $('#clearSearchButton').hidden = searchTerm.length === 0;
      renderProducts();
    });
    $('#clearSearchButton').addEventListener('click', resetFilters);
    $('#resetFilterButton').addEventListener('click', resetFilters);
    $('#categoryTabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      activeCategory = button.dataset.category;
      renderCategories();
      renderProducts();
    });
    $('#productGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action][data-product-id]');
      if (!button) return;
      const { action, productId } = button.dataset;
      if (action === 'details') openProduct(productId);
      if (action === 'add') addOne(productId);
      if (action === 'favorite') toggleFavorite(productId);
    });
    $('#productDialogContent').addEventListener('click', (event) => {
      const button = event.target.closest('[data-detail-action]');
      if (!button || !currentProductId) return;
      const product = productMap.get(currentProductId);
      if (button.dataset.detailAction === 'decrease') detailQuantity = Math.max(1, detailQuantity - 1);
      if (button.dataset.detailAction === 'increase') detailQuantity = Math.min(product.stock, detailQuantity + 1);
      if (button.dataset.detailAction === 'add') {
        setQuantity(currentProductId, getCartQuantity(currentProductId) + detailQuantity);
        closeDialog('productDialog');
        return;
      }
      renderProductDialog();
    });

    ['headerCartButton', 'mobileCartButton'].forEach((id) => {
      document.getElementById(id).addEventListener('click', () => openDialog($('#cartDialog')));
    });
    ['ordersButton', 'mobileOrdersButton'].forEach((id) => {
      document.getElementById(id).addEventListener('click', openOrders);
    });
    $('#railCheckoutButton').addEventListener('click', openCheckout);
    $('#cartCheckoutButton').addEventListener('click', openCheckout);
    $('#cartDialogItems').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action][data-product-id]');
      if (!button) return;
      const current = getCartQuantity(button.dataset.productId);
      setQuantity(button.dataset.productId, button.dataset.action === 'increase' ? current + 1 : current - 1);
    });
    $('#showCouponButton').addEventListener('click', () => {
      state.couponCode = 'WELCOME12';
      saveState();
      showToast('新人券 WELCOME12 已放进结算页');
    });
    $('#applyCouponButton').addEventListener('click', () => {
      state.couponCode = $('#couponInput').value.trim().toUpperCase();
      $('#couponInput').value = state.couponCode;
      saveState();
      renderCheckoutSummary();
    });
    $('#couponInput').addEventListener('input', renderCheckoutSummary);
    $('#checkoutForm').addEventListener('change', (event) => {
      if (event.target.name === 'deliveryType') updateDeliveryVisibility();
      else renderCheckoutSummary();
    });
    $('#checkoutForm').addEventListener('submit', submitCheckout);
    $('#continueShoppingButton').addEventListener('click', () => {
      closeDialog('successDialog');
      $('#market').scrollIntoView({ behavior: 'smooth' });
    });
    $('#viewOrderButton').addEventListener('click', () => {
      closeDialog('successDialog');
      openOrders();
    });
    $$('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(button.dataset.closeDialog));
    });
    $$('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function init() {
    $('#receiptDate').textContent = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date());
    bindEvents();
    renderAll();
    document.body.classList.add('ready');
  }

  init();
}());
