/**
 * /api/payments
 *
 * POST /api/payments/orders          – create a Razorpay order for a booking
 * POST /api/payments/verify          – verify signature and mark booking deposit-paid
 * POST /api/payments/:orderId/fail   – customer cancelled / payment failed on the client
 */
const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { serializeBooking, BOOKING_SELECT } = require('./bookings');

const router = express.Router();

// ── Razorpay client (lazy-init so test env without keys doesn't blow up) ──
let _rzp = null;
function getRazorpay() {
  if (_rzp) return _rzp;
  const Razorpay = require('razorpay');
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured.');
  _rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _rzp;
}

// ── Helper: deposit amount in rupees ─────────────────────────────────────
// 50% of (rent_price × days), rounded up to the nearest rupee.
function depositRupees(rentPrice, startDate, endDate) {
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return Math.ceil((rentPrice * days) / 2);
}

// ── POST /api/payments/orders ─────────────────────────────────────────────
// Body: { bookingId }
router.post('/orders', requireAuth, (req, res) => {
  const bookingId = Number(req.body.bookingId);
  if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });

  // Load the booking (must belong to the calling user)
  const booking = db.prepare(
    `${BOOKING_SELECT} WHERE b.id = ? AND b.user_id = ?`
  ).get(bookingId, req.user.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot pay for a cancelled booking.' });
  }
  if (booking.deposit_status === 'paid') {
    return res.status(400).json({ error: 'Deposit already paid.' });
  }
  if (!booking.rent_price) {
    // No rent_price set → should not reach here, but guard anyway.
    return res.status(400).json({ error: 'This costume has no online price. Please contact us on WhatsApp.' });
  }

  const amountRupees = depositRupees(booking.rent_price, booking.start_date, booking.end_date);
  const amountPaise = amountRupees * 100;

  let rzp;
  try { rzp = getRazorpay(); } catch (e) {
    return res.status(503).json({ error: 'Online payment is not configured. Please contact us on WhatsApp.' });
  }

  rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `bk_${bookingId}`,
    notes: { booking_id: bookingId, user_id: req.user.id }
  }).then((order) => {
    // Upsert payment row (replace if a previous attempt for this booking exists)
    db.prepare(
      `INSERT INTO payments (booking_id, razorpay_order_id, amount_paise, status)
       VALUES (?, ?, ?, 'created')
       ON CONFLICT(razorpay_order_id) DO NOTHING`
    ).run(bookingId, order.id, amountPaise);

    // Mark booking as awaiting deposit
    db.prepare(`UPDATE bookings SET deposit_status = 'awaiting' WHERE id = ? AND deposit_status != 'paid'`)
      .run(bookingId);

    res.json({
      orderId: order.id,
      amountPaise,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      bookingId,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone || ''
    });
  }).catch((err) => {
    console.error('Razorpay order creation failed:', err);
    res.status(502).json({ error: 'Could not create payment. Please try again or contact us.' });
  });
});

// ── POST /api/payments/verify ─────────────────────────────────────────────
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
router.post('/verify', requireAuth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields.' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(503).json({ error: 'Payment not configured.' });

  // Verify HMAC-SHA256 signature
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature is invalid.' });
  }

  // Find the payment row (must belong to caller's booking)
  const payment = db.prepare(
    `SELECT p.*, b.user_id FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     WHERE p.razorpay_order_id = ?`
  ).get(razorpay_order_id);

  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
  if (payment.user_id !== req.user.id) return res.status(403).json({ error: 'Not your payment.' });

  // Mark payment + booking
  db.prepare(`UPDATE payments SET status = 'paid', razorpay_payment_id = ? WHERE razorpay_order_id = ?`)
    .run(razorpay_payment_id, razorpay_order_id);
  db.prepare(`UPDATE bookings SET deposit_status = 'paid' WHERE id = ?`)
    .run(payment.booking_id);

  const row = db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(payment.booking_id);
  res.json(serializeBooking(row));
});

// ── POST /api/payments/:orderId/fail ─────────────────────────────────────
// Called when the customer dismisses the Razorpay modal or the payment fails.
router.post('/:orderId/fail', requireAuth, (req, res) => {
  const payment = db.prepare(
    `SELECT p.*, b.user_id FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     WHERE p.razorpay_order_id = ?`
  ).get(req.params.orderId);

  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (payment.user_id !== req.user.id) return res.status(403).json({ error: 'Not your payment.' });
  if (payment.status === 'paid') return res.status(400).json({ error: 'Payment already completed.' });

  db.prepare(`UPDATE payments SET status = 'failed' WHERE razorpay_order_id = ?`)
    .run(req.params.orderId);
  db.prepare(`UPDATE bookings SET deposit_status = 'failed' WHERE id = ? AND deposit_status != 'paid'`)
    .run(payment.booking_id);

  const row = db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(payment.booking_id);
  res.json(serializeBooking(row));
});

module.exports = router;
