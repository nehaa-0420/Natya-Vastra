const { eachDay, validateRange } = require('./dates');

const ACTIVE = "('pending','confirmed')"; // statuses that hold stock

function getStock(db, costumeId) {
  return db.prepare('SELECT size, qty FROM costume_stock WHERE costume_id = ? ORDER BY size').all(costumeId);
}

const isPooled = (stock) => stock.length === 1 && stock[0].size === 0;

/**
 * How many pieces of this costume/size are still free for the whole date range?
 * We look at the busiest single day in the range: bookings that overlap the range
 * but not each other must not block a new booking.
 * Correctly accounts for multi-piece line items in booking_items and legacy single-size bookings.
 */
function remainingFor(db, costumeId, size, start, end, stock = getStock(db, costumeId)) {
  const pooled = isPooled(stock);
  const capacity = pooled ? stock[0].qty : (stock.find((s) => s.size === size)?.qty ?? 0);
  if (capacity === 0) return { capacity: 0, remaining: 0 };

  const bookings = db.prepare(
    `SELECT b.id, b.size, b.start_date, b.end_date, b.total_quantity
     FROM bookings b
     WHERE b.costume_id = ? AND b.status IN ${ACTIVE}
       AND b.start_date <= ? AND b.end_date >= ?`
  ).all(costumeId, end, start);

  const bookedWithQty = bookings.map((b) => {
    let qty = 0;
    if (pooled) {
      const itemRow = db.prepare('SELECT SUM(quantity) AS sum FROM booking_items WHERE booking_id = ?').get(b.id);
      qty = itemRow?.sum != null ? itemRow.sum : (b.total_quantity || 1);
    } else {
      const itemRow = db.prepare('SELECT SUM(quantity) AS sum FROM booking_items WHERE booking_id = ? AND size = ?').get(b.id, size);
      if (itemRow?.sum != null) {
        qty = itemRow.sum;
      } else {
        qty = b.size === size ? (b.total_quantity || 1) : 0;
      }
    }
    return { start_date: b.start_date, end_date: b.end_date, qty };
  }).filter((b) => b.qty > 0);

  let busiest = 0;
  for (const day of eachDay(start, end)) {
    const used = bookedWithQty
      .filter((b) => b.start_date <= day && b.end_date >= day)
      .reduce((sum, b) => sum + b.qty, 0);
    if (used > busiest) busiest = used;
  }
  return { capacity, remaining: Math.max(capacity - busiest, 0) };
}

// One entry per size (or a single pooled entry) for the date range.
function availabilityBySize(db, costumeId, start, end) {
  const stock = getStock(db, costumeId);
  if (isPooled(stock)) {
    const r = remainingFor(db, costumeId, 0, start, end, stock);
    return [{ size: 0, pooled: true, ...r }];
  }
  return stock.map((s) => ({ size: s.size, pooled: false, ...remainingFor(db, costumeId, s.size, start, end, stock) }));
}

/**
 * Normalizes input items or single size into a verified array of { size, quantity }.
 */
function normalizeBookingItems(size, items) {
  if (Array.isArray(items) && items.length > 0) {
    const map = new Map();
    for (const item of items) {
      const sz = Number(item.size);
      const qty = Number(item.quantity);
      if (!Number.isInteger(sz) || sz <= 0) continue;
      if (!Number.isInteger(qty) || qty <= 0) continue;
      map.set(sz, (map.get(sz) || 0) + qty);
    }
    return Array.from(map.entries()).map(([sz, qty]) => ({ size: sz, quantity: qty }));
  }

  if (size != null) {
    const wanted = Number(size);
    if (Number.isInteger(wanted) && wanted > 0) {
      return [{ size: wanted, quantity: 1 }];
    }
  }

  return [];
}

/**
 * Creates a booking supporting multiple pieces across multiple sizes.
 * Concurrency-safe: executes inside BEGIN IMMEDIATE.
 */
function createBooking(db, { userId, costumeId, size, items, startDate, endDate, notes }) {
  const rangeError = validateRange(startDate, endDate);
  if (rangeError) return { error: rangeError, status: 400 };

  const costume = db.prepare('SELECT * FROM costumes WHERE id = ? AND active = 1').get(costumeId);
  if (!costume) return { error: 'Costume not found.', status: 404 };

  const stock = getStock(db, costumeId);
  const totalStock = stock.reduce((sum, s) => sum + s.qty, 0);
  if (totalStock === 0) {
    return { error: 'This costume is not open for online booking. Please contact us on WhatsApp.', status: 400 };
  }

  const normalizedItems = normalizeBookingItems(size, items);
  if (normalizedItems.length === 0) {
    return { error: 'Please choose at least one size and quantity.', status: 400 };
  }

  const pooled = isPooled(stock);
  const totalRequestedQty = normalizedItems.reduce((sum, i) => sum + i.quantity, 0);

  // Validate sizes against costume stock specifications
  if (pooled) {
    for (const item of normalizedItems) {
      if (item.size < costume.size_min || item.size > costume.size_max) {
        return { error: `Sizes for this costume run from ${costume.size_min} to ${costume.size_max} inches. Size ${item.size} is outside this range.`, status: 400 };
      }
    }
  } else {
    for (const item of normalizedItems) {
      const stockRow = stock.find((s) => s.size === item.size && s.qty > 0);
      if (!stockRow) {
        return { error: `Size ${item.size} is not available for this costume.`, status: 400 };
      }
    }
  }

  db.exec('BEGIN IMMEDIATE'); // Exclusive lock for atomic reservation
  try {
    if (pooled) {
      const { remaining } = remainingFor(db, costumeId, 0, startDate, endDate, stock);
      if (totalRequestedQty > remaining) {
        db.exec('ROLLBACK');
        return {
          error: `Sorry, this costume only has ${remaining} piece(s) available for the selected dates (requested ${totalRequestedQty}).`,
          status: 409
        };
      }
    } else {
      // Check availability separately for every requested size
      for (const item of normalizedItems) {
        const { remaining } = remainingFor(db, costumeId, item.size, startDate, endDate, stock);
        if (item.quantity > remaining) {
          db.exec('ROLLBACK');
          return {
            error: `Size ${item.size} only has ${remaining} piece(s) available for the selected dates (requested ${item.quantity}).`,
            status: 409
          };
        }
      }
    }

    const days = eachDay(startDate, endDate).length;
    const baseUnitRental = costume.rent_price ? costume.rent_price * days : 650 * days;
    const baseRental = baseUnitRental * totalRequestedQty;
    const returnDeadline = `${endDate}T20:00:00`;
    const acceptedTermsAt = new Date().toISOString();
    const primarySize = normalizedItems[0].size;

    const result = db.prepare(
      `INSERT INTO bookings (
        user_id, costume_id, size, start_date, end_date, notes,
        rental_price, return_deadline, total_amount, total_quantity,
        accepted_terms, accepted_terms_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      costumeId,
      primarySize,
      startDate,
      endDate,
      (notes || '').trim().slice(0, 500) || null,
      baseRental,
      returnDeadline,
      baseRental,
      totalRequestedQty,
      1,
      acceptedTermsAt
    );

    const bookingId = Number(result.lastInsertRowid);

    // Insert line items
    const insertItem = db.prepare('INSERT INTO booking_items (booking_id, size, quantity) VALUES (?, ?, ?)');
    for (const item of normalizedItems) {
      insertItem.run(bookingId, item.size, item.quantity);
    }

    db.exec('COMMIT');
    return { id: bookingId };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  getStock,
  isPooled,
  remainingFor,
  availabilityBySize,
  normalizeBookingItems,
  createBooking
};
