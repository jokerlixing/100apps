(function initShopCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShopCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function shopCoreFactory() {
  'use strict';

  const FREE_SHIPPING_CENTS = 9900;
  const BASE_SHIPPING_CENTS = 800;
  const WELCOME_COUPON_MINIMUM_CENTS = 6800;
  const WELCOME_COUPON_DISCOUNT_CENTS = 1200;

  function toProductMap(products) {
    return new Map((Array.isArray(products) ? products : []).map((product) => [product.id, product]));
  }

  function normalizeQuantity(value) {
    const quantity = Math.floor(Number(value));
    return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  }

  function setCartQuantity(cart, productId, requestedQuantity, products) {
    const product = toProductMap(products).get(productId);
    if (!product) throw new Error('商品不存在');

    const nextQuantity = Math.min(normalizeQuantity(requestedQuantity), Math.max(0, Number(product.stock) || 0));
    const nextCart = (Array.isArray(cart) ? cart : [])
      .filter((line) => line && line.productId !== productId)
      .map((line) => ({ productId: line.productId, quantity: normalizeQuantity(line.quantity) }))
      .filter((line) => line.quantity > 0);

    if (nextQuantity > 0) nextCart.push({ productId, quantity: nextQuantity });
    return nextCart;
  }

  function calculateCart({ cart = [], products = [], couponCode = '', deliveryType = 'delivery' } = {}) {
    const productMap = toProductMap(products);
    const unavailableProductIds = [];
    const lineItems = [];

    for (const line of Array.isArray(cart) ? cart : []) {
      const product = productMap.get(line && line.productId);
      const requestedQuantity = normalizeQuantity(line && line.quantity);
      if (!product || requestedQuantity < 1 || Number(product.stock) < requestedQuantity) {
        if (line && line.productId) unavailableProductIds.push(line.productId);
        continue;
      }
      const quantity = Math.min(requestedQuantity, Number(product.stock));
      const lineTotalCents = Number(product.priceCents) * quantity;
      lineItems.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        priceCents: Number(product.priceCents),
        quantity,
        lineTotalCents,
      });
    }

    const subtotalCents = lineItems.reduce((total, line) => total + line.lineTotalCents, 0);
    const itemCount = lineItems.reduce((total, line) => total + line.quantity, 0);
    const normalizedCoupon = String(couponCode || '').trim().toUpperCase();
    const coupon = { code: normalizedCoupon, applied: false, reason: '' };
    let discountCents = 0;

    if (normalizedCoupon === 'WELCOME12') {
      if (subtotalCents >= WELCOME_COUPON_MINIMUM_CENTS) {
        discountCents = Math.min(WELCOME_COUPON_DISCOUNT_CENTS, subtotalCents);
        coupon.applied = true;
        coupon.reason = '已减 ¥12.00';
      } else {
        coupon.reason = '商品小计满 ¥68.00 可用';
      }
    } else if (normalizedCoupon) {
      coupon.reason = '优惠码不存在';
    }

    const isDelivery = deliveryType !== 'pickup';
    const shippingCents = subtotalCents > 0 && isDelivery && subtotalCents < FREE_SHIPPING_CENTS
      ? BASE_SHIPPING_CENTS
      : 0;
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

    return {
      lineItems,
      unavailableProductIds,
      subtotalCents,
      discountCents,
      shippingCents,
      totalCents,
      itemCount,
      freeShippingThresholdCents: FREE_SHIPPING_CENTS,
      amountUntilFreeShippingCents: isDelivery ? Math.max(0, FREE_SHIPPING_CENTS - subtotalCents) : 0,
      coupon,
    };
  }

  function validateCheckout({
    cart = [],
    products = [],
    address = {},
    deliveryType = 'delivery',
    paymentMethod = '',
  } = {}) {
    const errors = {};
    const summary = calculateCart({ cart, products, deliveryType });
    const rawCart = Array.isArray(cart) ? cart : [];

    if (rawCart.length === 0) {
      errors.cart = '购物车还是空的，请先挑选商品';
    } else if (summary.unavailableProductIds.length > 0 || summary.lineItems.length !== rawCart.length) {
      errors.cart = '购物车中的商品已下架，请返回购物车更新';
    }

    if (!String(address.receiver || '').trim()) errors.receiver = '请填写收货人姓名';
    if (!/^1[3-9]\d{9}$/.test(String(address.phone || '').trim())) errors.phone = '请填写有效的 11 位手机号';
    if (deliveryType !== 'pickup') {
      if (!String(address.region || '').trim()) errors.region = '请填写所在地区';
      if (!String(address.detail || '').trim()) errors.detail = '请填写详细地址';
    }
    if (paymentMethod !== 'wechat') errors.paymentMethod = '请选择支付方式';

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function pad(value, size = 2) {
    return String(value).padStart(size, '0');
  }

  function createOrder(input, dependencies = {}) {
    const validation = validateCheckout(input);
    if (!validation.valid) {
      const error = new Error('订单信息不完整');
      error.validationErrors = validation.errors;
      throw error;
    }

    const now = typeof dependencies.now === 'function' ? dependencies.now() : new Date();
    const random = typeof dependencies.random === 'function' ? dependencies.random() : Math.random();
    const instant = now instanceof Date ? now : new Date(now);
    const timestamp = [
      instant.getUTCFullYear(),
      pad(instant.getUTCMonth() + 1),
      pad(instant.getUTCDate()),
      pad(instant.getUTCHours()),
      pad(instant.getUTCMinutes()),
      pad(instant.getUTCSeconds()),
    ].join('');
    const randomPart = pad(Math.floor(Math.max(0, Math.min(0.9999, Number(random) || 0)) * 10000), 4);
    const summary = calculateCart(input);

    return {
      id: `YX${timestamp}${randomPart}`,
      status: '待发货',
      createdAt: instant.toISOString(),
      deliveryType: input.deliveryType === 'pickup' ? 'pickup' : 'delivery',
      deliveryLabel: input.deliveryType === 'pickup' ? '到店自提' : '山路快递',
      paymentMethod: 'wechat',
      paymentLabel: '微信支付（模拟）',
      address: {
        receiver: String(input.address.receiver || '').trim(),
        phone: String(input.address.phone || '').trim(),
        region: String(input.address.region || '').trim(),
        detail: String(input.address.detail || '').trim(),
      },
      lines: summary.lineItems.map((line) => ({ ...line })),
      summary: {
        subtotalCents: summary.subtotalCents,
        discountCents: summary.discountCents,
        shippingCents: summary.shippingCents,
        totalCents: summary.totalCents,
        itemCount: summary.itemCount,
      },
      couponCode: summary.coupon.applied ? summary.coupon.code : '',
    };
  }

  function formatMoney(cents) {
    const amount = Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : 0;
    return `¥${(amount / 100).toFixed(2)}`;
  }

  return {
    FREE_SHIPPING_CENTS,
    BASE_SHIPPING_CENTS,
    WELCOME_COUPON_MINIMUM_CENTS,
    WELCOME_COUPON_DISCOUNT_CENTS,
    setCartQuantity,
    calculateCart,
    validateCheckout,
    createOrder,
    formatMoney,
  };
}));
