(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CounterShop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRODUCTS = Object.freeze([
    { id: 'mk-01', name: '蓝线工作簿', stall: 'paper', stallName: '折页纸局', price: 6800, stock: 12, tag: '手工锁线', material: '再生纸', mark: '▤', color: '#FFD86B' },
    { id: 'mk-02', name: '城市切片卡', stall: 'paper', stallName: '折页纸局', price: 4200, stock: 18, tag: '一组 8 张', material: '棉质纸', mark: '▧', color: '#F2A6C4' },
    { id: 'mk-03', name: '夜游孔版画', stall: 'paper', stallName: '折页纸局', price: 8800, stock: 7, tag: '限量编号', material: '孔版印刷', mark: '◩', color: '#A9C4FF' },
    { id: 'mk-04', name: '云口马克杯', stall: 'clay', stallName: '慢烧陶室', price: 12800, stock: 6, tag: '手拉坯', material: '高温陶', mark: '◡', color: '#EAE4FF' },
    { id: 'mk-05', name: '弧面香座', stall: 'clay', stallName: '慢烧陶室', price: 9800, stock: 5, tag: '窑变釉', material: '粗陶', mark: '⌒', color: '#FFB28C' },
    { id: 'mk-06', name: '潮痕小盘', stall: 'clay', stallName: '慢烧陶室', price: 16800, stock: 4, tag: '每件不同', material: '白瓷', mark: '◯', color: '#B9D8F2' },
    { id: 'mk-07', name: '摊主工具袋', stall: 'textile', stallName: '经纬织所', price: 9600, stock: 10, tag: '双层帆布', material: '棉帆布', mark: '⌑', color: '#F3C86A' },
    { id: 'mk-08', name: '棋盘杯垫组', stall: 'textile', stallName: '经纬织所', price: 5800, stock: 12, tag: '一组 4 枚', material: '再生织物', mark: '▦', color: '#84D6C5' },
    { id: 'mk-09', name: '午后腰靠', stall: 'textile', stallName: '经纬织所', price: 13800, stock: 6, tag: '可拆洗', material: '棉麻', mark: '▰', color: '#F2A6C4' },
    { id: 'mk-10', name: '折角桌灯', stall: 'light', stallName: '微光装配站', price: 23800, stock: 3, tag: 'USB-C', material: '铝合金', mark: '◢', color: '#FF8A64' },
    { id: 'mk-11', name: '绕线气氛灯', stall: 'light', stallName: '微光装配站', price: 18800, stock: 4, tag: '三档调光', material: '硅胶与铜', mark: '∿', color: '#B8A7FF' },
    { id: 'mk-12', name: '月相夜灯', stall: 'light', stallName: '微光装配站', price: 15800, stock: 6, tag: '暖光', material: '磨砂亚克力', mark: '◒', color: '#B9D8F2' }
  ].map(Object.freeze));

  const PRODUCT_BY_ID = new Map(PRODUCTS.map((product) => [product.id, product]));
  const PICKUP_SLOTS = new Set(['sat-am', 'sat-pm', 'sun-am', 'sun-pm']);
  const TRANSITIONS = Object.freeze({
    preparing: Object.freeze(['ready', 'cancelled']),
    ready: Object.freeze(['completed']),
    completed: Object.freeze([]),
    cancelled: Object.freeze([])
  });

  function createDomainError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[<>\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function cleanCart(input, catalog) {
    const list = Array.isArray(catalog) ? catalog : PRODUCTS;
    const productMap = new Map(list.map((product) => [product.id, product]));
    const quantities = new Map();
    if (!Array.isArray(input)) return [];

    input.slice(0, 50).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const id = String(row.id || '');
      const product = productMap.get(id);
      const qty = Number(row.qty);
      if (!product || !Number.isFinite(qty) || qty <= 0) return;
      const next = (quantities.get(id) || 0) + Math.floor(qty);
      quantities.set(id, Math.min(product.stock, next));
    });

    return list
      .filter((product) => quantities.has(product.id))
      .map((product) => ({ id: product.id, qty: quantities.get(product.id) }));
  }

  function calculateTotals(input, catalog) {
    const list = Array.isArray(catalog) ? catalog : PRODUCTS;
    const productMap = new Map(list.map((product) => [product.id, product]));
    const cart = cleanCart(input, list);
    const lines = cart.map((row) => {
      const product = productMap.get(row.id);
      return {
        id: product.id,
        name: product.name,
        stallName: product.stallName,
        price: product.price,
        qty: row.qty,
        lineTotal: product.price * row.qty
      };
    });
    const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    return { lines, itemCount, subtotal, total: subtotal };
  }

  function validateCheckout(input) {
    const source = input && typeof input === 'object' ? input : {};
    const value = {
      nickname: cleanText(source.nickname, 20),
      phoneSuffix: String(source.phoneSuffix == null ? '' : source.phoneSuffix).trim(),
      pickupSlot: String(source.pickupSlot || '')
    };
    const errors = {};
    if (value.nickname.length < 1) errors.nickname = '请填写取货称呼';
    if (!/^\d{4}$/.test(value.phoneSuffix)) errors.phoneSuffix = '请输入手机号后四位';
    if (!PICKUP_SLOTS.has(value.pickupSlot)) errors.pickupSlot = '请选择取货时段';
    return { valid: Object.keys(errors).length === 0, errors, value };
  }

  function validateScopedKey(value, prefix) {
    const pattern = new RegExp(`^${prefix}_[A-Za-z0-9_-]{16,64}$`);
    return pattern.test(String(value || ''));
  }

  function assertServerCart(input) {
    if (!Array.isArray(input) || input.length === 0) throw createDomainError('EMPTY_CART', '购物袋为空');
    if (input.length > 24) throw createDomainError('INVALID_CART', '购物袋商品过多');
    const quantities = new Map();
    for (const row of input) {
      if (!row || typeof row !== 'object') throw createDomainError('INVALID_CART', '购物袋格式无效');
      const product = PRODUCT_BY_ID.get(String(row.id || ''));
      const qty = Number(row.qty);
      if (!product || !Number.isInteger(qty) || qty < 1) throw createDomainError('INVALID_CART', '购物袋包含无效商品');
      const totalQty = (quantities.get(product.id) || 0) + qty;
      if (totalQty > product.stock) throw createDomainError('OUT_OF_STOCK', `${product.name} 库存不足`);
      quantities.set(product.id, totalQty);
    }
    return PRODUCTS
      .filter((product) => quantities.has(product.id))
      .map((product) => ({ id: product.id, qty: quantities.get(product.id) }));
  }

  function createOrder(input, options) {
    const source = input && typeof input === 'object' ? input : {};
    const settings = options || {};
    const cart = assertServerCart(source.cart);
    const checkout = validateCheckout(source.customer);
    if (!checkout.valid) {
      const error = createDomainError('INVALID_CHECKOUT', '取货信息不完整');
      error.fields = checkout.errors;
      throw error;
    }
    if (!validateScopedKey(source.shopKey, 'shop')) throw createDomainError('INVALID_SHOP_KEY', '店铺键无效');
    if (!validateScopedKey(source.idempotencyKey, 'idem')) throw createDomainError('INVALID_IDEMPOTENCY_KEY', '提交键无效');

    const now = typeof settings.now === 'function' ? settings.now() : new Date();
    const instant = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(instant.getTime())) throw createDomainError('INVALID_TIME', '订单时间无效');
    const random = typeof settings.random === 'function' ? settings.random : Math.random;
    const sample = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
    const date = instant.toISOString().slice(2, 10).replace(/-/g, '');
    const suffix = Math.floor(sample * 60466176).toString(36).toUpperCase().padStart(5, '0');
    const pickupCode = String(Math.floor(sample * 1000000)).padStart(6, '0');
    const totals = calculateTotals(cart);
    const createdAt = instant.toISOString();

    return {
      id: `MK${date}-${suffix}`,
      pickupCode,
      shopKey: String(source.shopKey),
      idempotencyKey: String(source.idempotencyKey),
      customer: checkout.value,
      lines: totals.lines,
      totals: { itemCount: totals.itemCount, subtotal: totals.subtotal, total: totals.total },
      status: 'preparing',
      source: source.source === 'server' ? 'server' : 'local',
      createdAt,
      updatedAt: createdAt,
      version: 1
    };
  }

  function publicOrder(input) {
    const order = input && typeof input === 'object' ? input : {};
    const customer = order.customer && typeof order.customer === 'object' ? order.customer : {};
    const totals = order.totals && typeof order.totals === 'object' ? order.totals : {};
    return {
      id: cleanText(order.id, 32),
      pickupCode: cleanText(order.pickupCode, 6),
      customer: {
        nickname: cleanText(customer.nickname, 20),
        phoneSuffix: /^\d{4}$/.test(String(customer.phoneSuffix || '')) ? String(customer.phoneSuffix) : '',
        pickupSlot: PICKUP_SLOTS.has(customer.pickupSlot) ? customer.pickupSlot : ''
      },
      lines: Array.isArray(order.lines) ? order.lines.slice(0, 24).map((line) => ({
        id: cleanText(line.id, 16),
        name: cleanText(line.name, 40),
        stallName: cleanText(line.stallName, 40),
        price: Number.isInteger(line.price) ? line.price : 0,
        qty: Number.isInteger(line.qty) ? line.qty : 0,
        lineTotal: Number.isInteger(line.lineTotal) ? line.lineTotal : 0
      })) : [],
      totals: {
        itemCount: Number.isInteger(totals.itemCount) ? totals.itemCount : 0,
        subtotal: Number.isInteger(totals.subtotal) ? totals.subtotal : 0,
        total: Number.isInteger(totals.total) ? totals.total : 0
      },
      status: Object.prototype.hasOwnProperty.call(TRANSITIONS, order.status) ? order.status : 'preparing',
      source: order.source === 'server' ? 'server' : 'local',
      createdAt: cleanText(order.createdAt, 32),
      updatedAt: cleanText(order.updatedAt, 32),
      version: Number.isInteger(order.version) ? order.version : 1
    };
  }

  function findIdempotentOrder(orders, shopKey, idempotencyKey) {
    if (!Array.isArray(orders)) return null;
    return orders.find((order) => order && order.shopKey === shopKey && order.idempotencyKey === idempotencyKey) || null;
  }

  function canTransition(current, next) {
    return Boolean(TRANSITIONS[current] && TRANSITIONS[current].includes(next));
  }

  function transitionOrder(input, nextStatus, options) {
    if (!input || typeof input !== 'object' || !canTransition(input.status, nextStatus)) {
      throw createDomainError('INVALID_TRANSITION', '当前订单不能执行此状态变更');
    }
    const settings = options || {};
    const now = typeof settings.now === 'function' ? settings.now() : new Date();
    const instant = now instanceof Date ? now : new Date(now);
    return {
      ...input,
      status: nextStatus,
      updatedAt: instant.toISOString(),
      version: (Number.isInteger(input.version) ? input.version : 0) + 1
    };
  }

  return {
    PRODUCTS,
    cleanCart,
    calculateTotals,
    validateCheckout,
    createOrder,
    publicOrder,
    findIdempotentOrder,
    canTransition,
    transitionOrder
  };
});

