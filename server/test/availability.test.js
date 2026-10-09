process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, inDays, makeCostume, makeUser } = require('./helpers');
const { createBooking, availabilityBySize } = require('../lib/availability');

const book = (costumeId, userId, start, end, size = 36) =>
  createBooking(db, { userId, costumeId, size, startDate: inDays(start), endDate: inDays(end) });

test('a second booking for the same dates is refused when only one piece exists', () => {
  const c = makeCostume({ stock: [{ size: 36, qty: 1 }] });
  const u = makeUser();
  assert.ok(book(c, u, 5, 8).id);
  const second = book(c, makeUser(), 7, 10);
  assert.equal(second.status, 409);
});

test('back-to-back bookings (no shared day) are both allowed', () => {
  const c = makeCostume({ stock: [{ size: 36, qty: 1 }] });
  assert.ok(book(c, makeUser(), 5, 8).id);
  assert.ok(book(c, makeUser(), 9, 12).id);
});

test('bookings that overlap the request but not each other do not block it', () => {
  const c = makeCostume({ stock: [{ size: 36, qty: 2 }] });
  assert.ok(book(c, makeUser(), 1, 3).id); // days 1-3
  assert.ok(book(c, makeUser(), 4, 6).id); // days 4-6
  assert.ok(book(c, makeUser(), 2, 5).id); // overlaps both, but never 3 at once
  // days 2-3 and 4-5 are now full (two pieces out), so this one must fail
  assert.equal(book(c, makeUser(), 3, 4).status, 409);
});

test('different sizes are tracked separately', () => {
  const c = makeCostume({ stock: [{ size: 34, qty: 1 }, { size: 36, qty: 1 }] });
  assert.ok(book(c, makeUser(), 5, 6, 34).id);
  assert.ok(book(c, makeUser(), 5, 6, 36).id);
  assert.equal(book(c, makeUser(), 5, 6, 34).status, 409);
});

test('cancelling a booking frees the piece again', () => {
  const c = makeCostume({ stock: [{ size: 36, qty: 1 }] });
  const first = book(c, makeUser(), 5, 8);
  assert.equal(book(c, makeUser(), 5, 8).status, 409);
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(first.id);
  assert.ok(book(c, makeUser(), 5, 8).id);
});

test('pooled stock accepts any size inside the range and counts all bookings together', () => {
  const c = makeCostume({ stock: [{ size: 0, qty: 2 }], sizeMin: 24, sizeMax: 36 });
  assert.ok(book(c, makeUser(), 5, 6, 24).id);
  assert.ok(book(c, makeUser(), 5, 6, 36).id);
  assert.equal(book(c, makeUser(), 5, 6, 30).status, 409); // both pieces are out
  assert.equal(book(c, makeUser(), 20, 21, 40).status, 400); // size outside the range
  const [row] = availabilityBySize(db, c, inDays(5), inDays(6));
  assert.deepEqual([row.pooled, row.capacity, row.remaining], [true, 2, 0]);
});

test('bad dates and sizes are rejected', () => {
  const c = makeCostume();
  const u = makeUser();
  assert.equal(book(c, u, -2, 3).status, 400);   // starts in the past
  assert.equal(book(c, u, 8, 5).status, 400);    // ends before it starts
  assert.equal(book(c, u, 5, 60).status, 400);   // longer than 30 days
  assert.equal(book(c, u, 5, 6, 99).status, 400); // size not stocked
  assert.equal(createBooking(db, { userId: u, costumeId: c, size: 36, startDate: 'soon', endDate: 'later' }).status, 400);
});

test('costumes with no stock cannot be booked online', () => {
  const c = makeCostume({ stock: [] });
  assert.equal(book(c, makeUser(), 5, 6).status, 400);
});
