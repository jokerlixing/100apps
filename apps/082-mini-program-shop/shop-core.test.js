const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setCartQuantity,
  calculateCart,
  validateCheckout,
  createOrder,
  formatMoney,
} = require('./shop-core');

const products = [
  { id: 'tea', name: '云雾绿茶', priceCents: 4500, stock: 3, unit: '80g' },
  { id: 'mushroom', name: '椴木香菇', priceCents: 5400, stock: 8, unit: '150g' },
  { id: 'honey', name: '百花蜂蜜', priceCents: 6800, stock: 4, unit: '500g' },
];

test('setCartQuantity adds, replaces, clamps, and removes a cart line', () => {
  let cart = setCartQuantity([], 'tea', 1, products);
  assert.deepEqual(cart, [{ productId: 'tea', quantity: 1 }]);

  cart = setCartQuantity(cart, 'tea', 99, products);
  assert.deepEqual(cart, [{ productId: 'tea', quantity: 3 }]);

  cart = setCartQuantity(cart, 'mushroom', 2.8, products);
  assert.deepEqual(cart, [
    { productId: 'tea', quantity: 3 },
    { productId: 'mushroom', quantity: 2 },
  ]);

  cart = setCartQuantity(cart, 'tea', 0, products);
  assert.deepEqual(cart, [{ productId: 'mushroom', quantity: 2 }]);
  assert.throws(() => setCartQuantity(cart, 'missing', 1, products), /商品不存在/);
});

test('calculateCart applies delivery, coupon, and free-shipping rules in cents', () => {
  const paidShipping = calculateCart({
    cart: [{ productId: 'tea', quantity: 2 }],
    products,
    couponCode: ' welcome12 ',
    deliveryType: 'delivery',
  });

  assert.equal(paidShipping.subtotalCents, 9000);
  assert.equal(paidShipping.discountCents, 1200);
  assert.equal(paidShipping.shippingCents, 800);
  assert.equal(paidShipping.totalCents, 8600);
  assert.equal(paidShipping.coupon.applied, true);
  assert.equal(paidShipping.itemCount, 2);

  const freeShipping = calculateCart({
    cart: [
      { productId: 'tea', quantity: 1 },
      { productId: 'mushroom', quantity: 1 },
    ],
    products,
    couponCode: '',
    deliveryType: 'delivery',
  });
  assert.equal(freeShipping.subtotalCents, 9900);
  assert.equal(freeShipping.shippingCents, 0);
  assert.equal(freeShipping.totalCents, 9900);

  const pickup = calculateCart({
    cart: [{ productId: 'honey', quantity: 1 }],
    products,
    couponCode: 'WELCOME12',
    deliveryType: 'pickup',
  });
  assert.equal(pickup.shippingCents, 0);
  assert.equal(pickup.discountCents, 1200);
  assert.equal(pickup.totalCents, 5600);
});

test('calculateCart explains an unavailable or unknown coupon without changing totals', () => {
  const belowThreshold = calculateCart({
    cart: [{ productId: 'tea', quantity: 1 }],
    products,
    couponCode: 'WELCOME12',
    deliveryType: 'delivery',
  });
  assert.equal(belowThreshold.discountCents, 0);
  assert.equal(belowThreshold.coupon.reason, '商品小计满 ¥68.00 可用');

  const unknown = calculateCart({
    cart: [{ productId: 'honey', quantity: 1 }],
    products,
    couponCode: 'NOPE',
    deliveryType: 'delivery',
  });
  assert.equal(unknown.discountCents, 0);
  assert.equal(unknown.coupon.reason, '优惠码不存在');
});

test('validateCheckout returns actionable field errors', () => {
  const result = validateCheckout({
    cart: [{ productId: 'tea', quantity: 1 }],
    products,
    address: { receiver: '', phone: '123', region: '', detail: '' },
    deliveryType: 'delivery',
    paymentMethod: '',
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, {
    receiver: '请填写收货人姓名',
    phone: '请填写有效的 11 位手机号',
    region: '请填写所在地区',
    detail: '请填写详细地址',
    paymentMethod: '请选择支付方式',
  });

  const valid = validateCheckout({
    cart: [{ productId: 'tea', quantity: 1 }],
    products,
    address: { receiver: '林小满', phone: '13800138000', region: '浙江省 杭州市', detail: '青山路 18 号' },
    deliveryType: 'delivery',
    paymentMethod: 'wechat',
  });
  assert.deepEqual(valid, { valid: true, errors: {} });
});

test('validateCheckout catches empty and no-longer-available carts', () => {
  const base = {
    products,
    address: { receiver: '林小满', phone: '13800138000', region: '浙江省 杭州市', detail: '青山路 18 号' },
    deliveryType: 'delivery',
    paymentMethod: 'wechat',
  };
  assert.equal(validateCheckout({ ...base, cart: [] }).errors.cart, '购物车还是空的，请先挑选商品');
  assert.equal(
    validateCheckout({ ...base, cart: [{ productId: 'missing', quantity: 1 }] }).errors.cart,
    '购物车中的商品已下架，请返回购物车更新',
  );
});

test('createOrder produces a deterministic local receipt and calculated totals', () => {
  const order = createOrder({
    cart: [
      { productId: 'tea', quantity: 1 },
      { productId: 'mushroom', quantity: 1 },
    ],
    products,
    address: { receiver: '林小满', phone: '13800138000', region: '浙江省 杭州市', detail: '青山路 18 号' },
    couponCode: 'WELCOME12',
    deliveryType: 'delivery',
    paymentMethod: 'wechat',
  }, {
    now: () => new Date('2026-08-31T02:00:03.000Z'),
    random: () => 0.1234,
  });

  assert.equal(order.id, 'YX202608310200031234');
  assert.equal(order.status, '待发货');
  assert.equal(order.createdAt, '2026-08-31T02:00:03.000Z');
  assert.equal(order.summary.totalCents, 8700);
  assert.equal(order.summary.shippingCents, 0);
  assert.equal(order.summary.discountCents, 1200);
  assert.equal(order.lines[0].name, '云雾绿茶');
  assert.equal(order.lines[1].quantity, 1);
  assert.equal(order.paymentLabel, '微信支付（模拟）');
  assert.equal(formatMoney(order.summary.totalCents), '¥87.00');
});
