/**
 * Payment route tests – Razorpay is mocked so no real keys are needed.
 *
 * We stub require('razorpay') before app.js loads, then exercise:
 *  – order creation (happy path, no-price fallback, already-paid guard)
 *  – signature verification (valid, tampered)
 *  – failure marking
 */
process.env.DB_PATH = ':memory:';
process.env.ADMIN_EMAIL = 'boss2@example.com';
process.env.ADMIN_PASSWORD = 'AdminPass123';
process.env.RAZORPAY_KEY_ID = 'rzp_test_FAKE_ID';
process.env.RAZORPAY_KEY_SECRET = 'FAKE_SECRET';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { db, inDays, makeCostume } = require('./helpers');
const { ensureAdmin } = require('../db/seed');

// ── Stub Razorpay before app loads ────────────────────────────────────────
let _nextOrderId = 'order_TEST001';
const fakeOrders = new Map(); // orderId → { amount, currency }

const RazorpayMock = function () {};
RazorpayMock.prototype.orders = {
  create: async (opts) => {
    const id = _nextOrderId;
    fakeOrders.set(id, opts);
    return { id, amount: opts.amount, currency: opts.currency, receipt: opts.receipt };
  }
};

// Replace require cache BEFORE app loads
require.cache[require.resolve('razorpay')] = { id: 'razorpay', filename: 'razorpay', loaded: true, exports: RazorpayMock };

const app = require('../app');

// ── Setup ─────────────────────────────────────────────────────────────────
let base, server, token, costumeId, bookingId, priceOnRequestCostumeId, priceOnRequestBookingId;

test.before(async () => {
  ensureAdmin();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // Register a customer
  db.prepare("INSERT INTO categories (id, name, description, accent_color, sort_order) VALUES ('frock', 'Frock', 'd', '#000', 1)").run();
  costumeId = makeCostume({ stock: [{ size: 34, qty: 2 }], category: 'frock', rentPrice: 400 });
  priceOnRequestCostumeId = makeCostume({ stock: [{ size: 36, qty: 1 }], category: 'frock', rentPrice: null });

  const r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Priya', email: 'priya@example.com', password: 'Test1234' })
  });
  token = (await r.json()).token;

  // Create a bookable booking (2 days: deposit = ceil(400*2/2) = 400)
  const bRes = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ costumeId, size: 34, startDate: inDays(10), endDate: inDays(11) })
  });
  bookingId = (await bRes.json()).id;

  // A booking for a price-on-request costume
  const bRes2 = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ costumeId: priceOnRequestCostumeId, size: 36, startDate: inDays(15), endDate: inDays(16) })
  });
  priceOnRequestBookingId = (await bRes2.json()).id;
  // Confirm the bookings so payment is unlocked (per workflow requirement)
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id IN (?, ?)").run(bookingId, priceOnRequestBookingId);
});

test.after(() => server.close());

async function call(method, path, { body, tok } = {}) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

// ── helpers ───────────────────────────────────────────────────────────────
function makeSignature(orderId, paymentId) {
  return crypto.createHmac('sha256', 'FAKE_SECRET').update(`${orderId}|${paymentId}`).digest('hex');
}

// ── Tests ─────────────────────────────────────────────────────────────────
test('creating a payment order requires auth', async () => {
  const r = await call('POST', '/api/payments/orders', { body: { bookingId } });
  assert.equal(r.status, 401);
});

test('cannot create a payment order for an unconfirmed (pending) booking', async () => {
  const bRes = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ costumeId, size: 34, startDate: inDays(30), endDate: inDays(31) })
  });
  const unconfirmedId = (await bRes.json()).id;
  const r = await call('POST', '/api/payments/orders', { body: { bookingId: unconfirmedId }, tok: token });
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('confirmed'));
});

test('creates a Razorpay order and returns client details', async () => {
  _nextOrderId = 'order_ABC';
  const r = await call('POST', '/api/payments/orders', { body: { bookingId }, tok: token });
  assert.equal(r.status, 200);
  assert.equal(r.json.orderId, 'order_ABC');
  assert.equal(r.json.currency, 'INR');
  // 2 days × ₹400 / 2 = ₹400 deposit = 40 000 paise
  assert.equal(r.json.amountPaise, 40000);
  assert.equal(r.json.keyId, 'rzp_test_FAKE_ID');

  // booking should now be 'awaiting'
  const b = db.prepare('SELECT deposit_status FROM bookings WHERE id = ?').get(bookingId);
  assert.equal(b.deposit_status, 'awaiting');
});

test('price-on-request costume falls back gracefully', async () => {
  const r = await call('POST', '/api/payments/orders', { body: { bookingId: priceOnRequestBookingId }, tok: token });
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('WhatsApp'));
});

test('verifying a valid signature marks booking deposit-paid', async () => {
  _nextOrderId = 'order_VER';
  await call('POST', '/api/payments/orders', { body: { bookingId }, tok: token });

  const sig = makeSignature('order_VER', 'pay_001');
  const r = await call('POST', '/api/payments/verify', {
    body: { razorpay_order_id: 'order_VER', razorpay_payment_id: 'pay_001', razorpay_signature: sig },
    tok: token
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.depositStatus, 'paid');

  const b = db.prepare('SELECT deposit_status FROM bookings WHERE id = ?').get(bookingId);
  assert.equal(b.deposit_status, 'paid');
});

test('verifying a tampered signature is rejected', async () => {
  _nextOrderId = 'order_TAMPER';
  // need a fresh booking for this
  const bRes = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ costumeId, size: 34, startDate: inDays(20), endDate: inDays(21) })
  });
  const bid2 = (await bRes.json()).id;
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(bid2);
  await call('POST', '/api/payments/orders', { body: { bookingId: bid2 }, tok: token });

  const r = await call('POST', '/api/payments/verify', {
    body: { razorpay_order_id: 'order_TAMPER', razorpay_payment_id: 'pay_hack', razorpay_signature: 'wrongsig' },
    tok: token
  });
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('invalid'));
});

test('marking payment failed updates booking deposit_status', async () => {
  _nextOrderId = 'order_FAIL';
  const bRes = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ costumeId, size: 34, startDate: inDays(25), endDate: inDays(26) })
  });
  const bid3 = (await bRes.json()).id;
  db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(bid3);
  await call('POST', '/api/payments/orders', { body: { bookingId: bid3 }, tok: token });

  const r = await call('POST', '/api/payments/order_FAIL/fail', { tok: token });
  assert.equal(r.status, 200);
  assert.equal(r.json.depositStatus, 'failed');
});

test('cannot create a second order after deposit is paid', async () => {
  _nextOrderId = 'order_PAID2';
  // bookingId was already paid in an earlier test
  const r = await call('POST', '/api/payments/orders', { body: { bookingId }, tok: token });
  assert.equal(r.status, 400);
  assert.ok(r.json.error.includes('already paid'));
});
