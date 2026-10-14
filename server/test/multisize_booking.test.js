process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, inDays, makeCostume, makeUser } = require('./helpers');
const { createBooking, remainingFor, availabilityBySize } = require('../lib/availability');

test('multi-size booking creates booking with multiple line items and checks stock per size', () => {
  const c = makeCostume({
    stock: [
      { size: 26, qty: 3 },
      { size: 28, qty: 4 },
      { size: 30, qty: 2 }
    ],
    rentPrice: 500
  });
  const u = makeUser();

  // Book 2 pieces of size 26 and 3 pieces of size 28
  const res = createBooking(db, {
    userId: u,
    costumeId: c,
    items: [
      { size: 26, quantity: 2 },
      { size: 28, quantity: 3 }
    ],
    startDate: inDays(2),
    endDate: inDays(4)
  });

  assert.ok(res.id, 'Booking created successfully');

  // Verify remaining stock:
  // Size 26 had 3, booked 2 -> remaining should be 1
  assert.equal(remainingFor(db, c, 26, inDays(2), inDays(4)).remaining, 1);
  // Size 28 had 4, booked 3 -> remaining should be 1
  assert.equal(remainingFor(db, c, 28, inDays(2), inDays(4)).remaining, 1);
  // Size 30 had 2, booked 0 -> remaining should still be 2
  assert.equal(remainingFor(db, c, 30, inDays(2), inDays(4)).remaining, 2);

  // Booking items saved in database
  const items = db.prepare('SELECT size, quantity FROM booking_items WHERE booking_id = ? ORDER BY size').all(res.id);
  assert.deepEqual(items.map((i) => ({ size: i.size, quantity: i.quantity })), [
    { size: 26, quantity: 2 },
    { size: 28, quantity: 3 }
  ]);

  // Booking row has total_quantity = 5
  const bk = db.prepare('SELECT total_quantity, rental_price FROM bookings WHERE id = ?').get(res.id);
  assert.equal(bk.total_quantity, 5);
  // 5 pieces * 3 days * ₹500 = ₹7,500
  assert.equal(bk.rental_price, 7500);
});

test('multi-size booking fails if any requested size exceeds available remaining stock', () => {
  const c = makeCostume({
    stock: [
      { size: 26, qty: 2 },
      { size: 28, qty: 2 }
    ]
  });
  const u = makeUser();

  // Request 2 of size 26 (available) and 3 of size 28 (only 2 available!)
  const res = createBooking(db, {
    userId: u,
    costumeId: c,
    items: [
      { size: 26, quantity: 2 },
      { size: 28, quantity: 3 }
    ],
    startDate: inDays(5),
    endDate: inDays(6)
  });

  assert.equal(res.status, 409);
  assert.match(res.error, /Size 28 only has 2 piece\(s\) available/);

  // Neither size 26 nor 28 was booked because transaction rolled back atomically
  assert.equal(remainingFor(db, c, 26, inDays(5), inDays(6)).remaining, 2);
  assert.equal(remainingFor(db, c, 28, inDays(5), inDays(6)).remaining, 2);
});

test('cancelling a multi-size booking returns all pieces across all sizes to available inventory', () => {
  const c = makeCostume({
    stock: [
      { size: 26, qty: 2 },
      { size: 28, qty: 2 }
    ]
  });
  const u = makeUser();

  const res = createBooking(db, {
    userId: u,
    costumeId: c,
    items: [
      { size: 26, quantity: 2 },
      { size: 28, quantity: 2 }
    ],
    startDate: inDays(10),
    endDate: inDays(12)
  });
  assert.ok(res.id);
  assert.equal(remainingFor(db, c, 26, inDays(10), inDays(12)).remaining, 0);
  assert.equal(remainingFor(db, c, 28, inDays(10), inDays(12)).remaining, 0);

  // Cancel booking
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(res.id);

  // Both sizes fully available again
  assert.equal(remainingFor(db, c, 26, inDays(10), inDays(12)).remaining, 2);
  assert.equal(remainingFor(db, c, 28, inDays(10), inDays(12)).remaining, 2);
});

test('pooled multi-size booking validates total quantity across range', () => {
  const c = makeCostume({
    stock: [{ size: 0, qty: 5 }],
    sizeMin: 24,
    sizeMax: 36
  });
  const u = makeUser();

  // Book 2 pieces of size 28 and 2 pieces of size 32 = 4 total pieces (5 capacity)
  const res = createBooking(db, {
    userId: u,
    costumeId: c,
    items: [
      { size: 28, quantity: 2 },
      { size: 32, quantity: 2 }
    ],
    startDate: inDays(1),
    endDate: inDays(2)
  });
  assert.ok(res.id);

  // Remaining pooled capacity is now 1
  const [row] = availabilityBySize(db, c, inDays(1), inDays(2));
  assert.equal(row.remaining, 1);

  // Another booking for 2 pieces fails
  const second = createBooking(db, {
    userId: makeUser(),
    costumeId: c,
    items: [{ size: 30, quantity: 2 }],
    startDate: inDays(1),
    endDate: inDays(2)
  });
  assert.equal(second.status, 409);
});
