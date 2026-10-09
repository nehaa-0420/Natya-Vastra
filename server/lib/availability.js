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
 */
function remainingFor(db, costumeId, size, start, end, stock = getStock(db, costumeId)) {
  const pooled = isPooled(stock);
  const capacity = pooled ? stock[0].qty : (stock.find((s) => s.size === size)?.qty ?? 0);
  if (capacity === 0) return { capacity: 0, remaining: 0 };

  const sql = `SELECT start_date, end_date FROM bookings
               WHERE costume_id = ? AND status IN ${ACTIVE}
                 AND start_date <= ? AND end_date >= ?` + (pooled ? '' : ' AND size = ?');
  const params = pooled ? [costumeId, end, start] : [costumeId, end, start, size];
  const booked = db.prepare(sql).all(...params);

  let busiest = 0;
  for (const day of eachDay(start, end)) {
    const used = booked.filter((b) => b.start_date <= day && b.end_date >= day).length;
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

function createBooking(db, { userId, costumeId, size, startDate, endDate, notes }) {
  const rangeError = validateRange(startDate, endDate);
  if (rangeError) return { error: rangeError, status: 400 };

  const costume = db.prepare('SELECT * FROM costumes WHERE id = ? AND active = 1').get(costumeId);
  if (!costume) return { error: 'Costume not found.', status: 404 };

  const stock = getStock(db, costumeId);
  const total = stock.reduce((sum, s) => sum + s.qty, 0);
  if (total === 0) {
    return { error: 'This costume is not open for online booking. Please contact us on WhatsApp.', status: 400 };
  }

  const wanted = Number(size);
  if (!Number.isInteger(wanted) || wanted <= 0) return { error: 'Please choose a size.', status: 400 };
  if (isPooled(stock)) {
    if (wanted < costume.size_min || wanted > costume.size_max) {
      return { error: `Sizes for this costume run from ${costume.size_min} to ${costume.size_max} inches.`, status: 400 };
    }
  } else if (!stock.some((s) => s.size === wanted && s.qty > 0)) {
    return { error: 'That size is not available for this costume.', status: 400 };
  }

  db.exec('BEGIN IMMEDIATE'); // lock so two people can't grab the last piece at once
  try {
    const { remaining } = remainingFor(db, costumeId, wanted, startDate, endDate, stock);
    if (remaining < 1) {
      db.exec('ROLLBACK');
      return { error: 'Sorry, that costume is already booked for some of those dates.', status: 409 };
    }
    const result = db.prepare(
      `INSERT INTO bookings (user_id, costume_id, size, start_date, end_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, costumeId, wanted, startDate, endDate, (notes || '').trim().slice(0, 500) || null);
    db.exec('COMMIT');
    return { id: Number(result.lastInsertRowid) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getStock, isPooled, remainingFor, availabilityBySize, createBooking };
