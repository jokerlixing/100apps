const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRODUCTS,
  cleanCart,
  calculateTotals,
  validateCheckout,
  createOrder,
  publicOrder,
  findIdempotentOrder,
  canTransition,
  transitionOrder
} = require('./shop-core');

test('ships a stable twelve-product market catalog', () => {
  assert.equal(PRODUCTS.length, 12);
  assert.equal(new Set(PRODUCTS.map((product) => product.id)).size, 12);
  for (const product of PRODUCTS) {
    assert.match(product.id, /^mk-\d{2}$/);
    assert.ok(product.name.length > 1);
    assert.ok(Number.isInteger(product.price) && product.price > 0);
    assert.ok(Number.isInteger(product.stock) && product.stock > 0);
  }
});

test('cleans, merges and stock-caps cart rows', () => {
  const cart = cleanCart([
    { id: 'mk-01', qty: 2 },
    { id: 'mk-01', qty: 99 },
    { id: 'mk-02', qty: '2' },
    { id: 'missing', qty: 4 },
    null
  ]);

  assert.deepEqual(cart, [
    { id: 'mk-01', qty: PRODUCTS[0].stock },
    { id: 'mk-02', qty: 2 }
  ]);
});

test('recalculates line totals from the trusted catalog', () => {
  const totals = calculateTotals([
    { id: 'mk-01', qty: 2, price: 1 },
    { id: 'mk-04', qty: 1, price: 1 }
  ]);

  assert.equal(totals.itemCount, 3);
  assert.equal(totals.subtotal, PRODUCTS[0].price * 2 + PRODUCTS[3].price);
  assert.equal(totals.total, totals.subtotal);
  assert.deepEqual(totals.lines.map(({ id, qty }) => ({ id, qty })), [
    { id: 'mk-01', qty: 2 },
    { id: 'mk-04', qty: 1 }
  ]);
});

test('validates pickup checkout fields and normalizes safe values', () => {
  const invalid = validateCheckout({ nickname: ' ', phoneSuffix: '12a4', pickupSlot: 'midnight' });
  assert.equal(invalid.valid, false);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ['nickname', 'phoneSuffix', 'pickupSlot']);

  const valid = validateCheckout({
    nickname: '  阿岚  ',
    phoneSuffix: '0831',
    pickupSlot: 'sun-pm'
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, { nickname: '阿岚', phoneSuffix: '0831', pickupSlot: 'sun-pm' });
});

test('creates a deterministic order without trusting client prices', () => {
  const order = createOrder({
    cart: [{ id: 'mk-03', qty: 2, price: 1 }],
    customer: { nickname: '青禾', phoneSuffix: '6628', pickupSlot: 'sat-am' },
    shopKey: 'shop_0123456789abcdef',
    idempotencyKey: 'idem_0123456789abcdef',
    source: 'server'
  }, {
    now: () => new Date('2026-08-31T01:30:00.000Z'),
    random: () => 0.123456
  });

  assert.match(order.id, /^MK260831-[A-Z0-9]{5}$/);
  assert.equal(order.pickupCode, '123456');
  assert.equal(order.status, 'preparing');
  assert.equal(order.totals.total, PRODUCTS[2].price * 2);
  assert.equal(order.shopKey, 'shop_0123456789abcdef');
  assert.equal(order.idempotencyKey, 'idem_0123456789abcdef');
  assert.equal(order.createdAt, '2026-08-31T01:30:00.000Z');
});

test('rejects empty, unknown and overstocked server carts', () => {
  assert.throws(() => createOrder({
    cart: [],
    customer: { nickname: '岚', phoneSuffix: '6628', pickupSlot: 'sat-am' },
    shopKey: 'shop_0123456789abcdef', idempotencyKey: 'idem_0123456789abcdef'
  }), { code: 'EMPTY_CART' });

  assert.throws(() => createOrder({
    cart: [{ id: 'missing', qty: 1 }],
    customer: { nickname: '岚', phoneSuffix: '6628', pickupSlot: 'sat-am' },
    shopKey: 'shop_0123456789abcdef', idempotencyKey: 'idem_0123456789abcdef'
  }), { code: 'INVALID_CART' });

  assert.throws(() => createOrder({
    cart: [{ id: 'mk-01', qty: PRODUCTS[0].stock + 1 }],
    customer: { nickname: '岚', phoneSuffix: '6628', pickupSlot: 'sat-am' },
    shopKey: 'shop_0123456789abcdef', idempotencyKey: 'idem_0123456789abcdef'
  }), { code: 'OUT_OF_STOCK' });
});

test('exposes only public fields and finds idempotent orders within one shop key', () => {
  const order = createOrder({
    cart: [{ id: 'mk-01', qty: 1 }],
    customer: { nickname: '木木', phoneSuffix: '1314', pickupSlot: 'sat-pm' },
    shopKey: 'shop_aaaaaaaaaaaaaaaa', idempotencyKey: 'idem_bbbbbbbbbbbbbbbb'
  }, { now: () => new Date('2026-08-31T02:00:00.000Z'), random: () => 0.2 });
  const exposed = publicOrder({ ...order, internalNote: '<script>alert(1)</script>' });

  assert.equal(exposed.shopKey, undefined);
  assert.equal(exposed.idempotencyKey, undefined);
  assert.equal(exposed.internalNote, undefined);
  assert.equal(findIdempotentOrder([order], order.shopKey, order.idempotencyKey), order);
  assert.equal(findIdempotentOrder([order], 'shop_cccccccccccccccc', order.idempotencyKey), null);
});

test('allows only the documented fulfillment transitions', () => {
  assert.equal(canTransition('preparing', 'ready'), true);
  assert.equal(canTransition('preparing', 'cancelled'), true);
  assert.equal(canTransition('ready', 'completed'), true);
  assert.equal(canTransition('ready', 'cancelled'), false);
  assert.equal(canTransition('completed', 'preparing'), false);

  const next = transitionOrder({ status: 'preparing', version: 1 }, 'ready', {
    now: () => new Date('2026-08-31T03:00:00.000Z')
  });
  assert.equal(next.status, 'ready');
  assert.equal(next.version, 2);
  assert.equal(next.updatedAt, '2026-08-31T03:00:00.000Z');
  assert.throws(() => transitionOrder(next, 'cancelled'), { code: 'INVALID_TRANSITION' });
});

