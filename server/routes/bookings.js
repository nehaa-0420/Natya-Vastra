const express = require('express');
const db = require('../db');
const { today, eachDay } = require('../lib/dates');
const { createBooking } = require('../lib/availability');
const { requireAuth } = require('../middleware/auth');
const { notify, bookingCreatedEmail, bookingCancelledEmail } = require('../lib/email');

const router = express.Router();

const BOOKING_SELECT = `SELECT b.*, c.image_path, c.name AS costume_name, c.sort_order, c.rent_price, cat.name AS category_name
                        FROM bookings b
                        JOIN costumes c ON c.id = b.costume_id
                        JOIN categories cat ON cat.id = c.category_id`;

function serializeBooking(r) {
  const days = eachDay(r.start_date, r.end_date).length;
  return {
    id: r.id,
    costumeId: r.costume_id,
    costumeName: r.costume_name || `${r.category_name} · Design ${r.sort_order + 1}`,
    categoryName: r.category_name,
    src: r.image_path,
    size: r.size,
    startDate: r.start_date,
    endDate: r.end_date,
    days,
    status: r.status,
    // A priced costume always owes a deposit, even if the payment window was never opened.
    depositStatus: r.deposit_status === 'not_required' && r.rent_price ? 'awaiting' : r.deposit_status,
    rentPrice: r.rent_price,
    notes: r.notes,
    estimatedTotal: r.rent_price ? r.rent_price * days : null,
    depositAmount: r.rent_price ? Math.ceil((r.rent_price * days) / 2) : null,
    createdAt: r.created_at,
    ...(r.user_name !== undefined && { user: { name: r.user_name, email: r.user_email, phone: r.user_phone } })
  };
}

router.post('/', requireAuth, (req, res) => {
  const { costumeId, size, startDate, endDate, notes } = req.body;
  const result = createBooking(db, {
    userId: req.user.id,
    costumeId: Number(costumeId),
    size,
    startDate: String(startDate || ''),
    endDate: String(endDate || ''),
    notes
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  const row = db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(result.id);
  const booking = serializeBooking(row);
  notify(bookingCreatedEmail(booking, req.user));
  res.status(201).json(booking);
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.start_date DESC, b.id DESC`).all(req.user.id);
  res.json(rows.map(serializeBooking));
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Booking not found.' });
  if (!['pending', 'confirmed'].includes(row.status)) {
    return res.status(400).json({ error: 'This booking can no longer be cancelled.' });
  }
  if (row.start_date < today()) {
    return res.status(400).json({ error: 'This rental has already started. Please contact us to make changes.' });
  }
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(row.id);
  const booking = serializeBooking(db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(row.id));
  notify(bookingCancelledEmail(booking, req.user));
  res.json(booking);
});

module.exports = router;
module.exports.serializeBooking = serializeBooking;
module.exports.BOOKING_SELECT = BOOKING_SELECT;
