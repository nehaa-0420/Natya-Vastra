const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { remainingFor } = require('../lib/availability');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');
const { serializeBooking, BOOKING_SELECT } = require('./bookings');

const router = express.Router();
router.use(requireAdmin);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype])
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG or WebP images are allowed.'))
});

// ---------- overview ----------
router.get('/stats', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    costumes: count('SELECT COUNT(*) n FROM costumes WHERE active = 1'),
    customers: count("SELECT COUNT(*) n FROM users WHERE role = 'customer'"),
    pendingBookings: count("SELECT COUNT(*) n FROM bookings WHERE status = 'pending'"),
    confirmedBookings: count("SELECT COUNT(*) n FROM bookings WHERE status = 'confirmed'"),
    enquiries: count('SELECT COUNT(*) n FROM enquiries')
  });
});

// ---------- bookings ----------
router.get('/bookings', (req, res) => {
  const status = String(req.query.status || '');
  const rows = db.prepare(
    `SELECT b.*, c.image_path, c.name AS costume_name, c.sort_order, c.rent_price, cat.name AS category_name,
            u.name AS user_name, u.email AS user_email, u.phone AS user_phone
     FROM bookings b
     JOIN costumes c ON c.id = b.costume_id
     JOIN categories cat ON cat.id = c.category_id
     JOIN users u ON u.id = b.user_id
     ${status ? 'WHERE b.status = ?' : ''}
     ORDER BY b.start_date DESC, b.id DESC`
  ).all(...(status ? [status] : []));
  res.json(rows.map(serializeBooking));
});

router.patch('/bookings/:id', (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'confirmed', 'cancelled', 'returned'].includes(status)) {
    return res.status(400).json({ error: 'Unknown status.' });
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  // Re-opening a cancelled/returned booking takes stock again, so make sure it is still free.
  const reopening = ['cancelled', 'returned'].includes(booking.status) && ['pending', 'confirmed'].includes(status);
  if (reopening) {
    const { remaining } = remainingFor(db, booking.costume_id, booking.size, booking.start_date, booking.end_date);
    if (remaining < 1) return res.status(409).json({ error: 'That costume has since been booked for these dates.' });
  }
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, booking.id);
  res.json(serializeBooking(db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(booking.id)));
});

// ---------- costumes ----------
function parseStock(raw, sizeMinIn, sizeMaxIn) {
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { error: 'Sizes were not understood.' }; }
  if (!Array.isArray(list)) return { error: 'Sizes were not understood.' };

  const seen = new Set();
  const stock = [];
  for (const item of list) {
    const size = Number(item.size);
    const qty = Number(item.qty);
    if (!Number.isInteger(size) || size < 0 || size > 60 || !Number.isInteger(qty) || qty < 0 || qty > 999) {
      return { error: 'Each size needs a whole size in inches and a stock count.' };
    }
    if (seen.has(size)) return { error: `Size ${size} is listed twice.` };
    seen.add(size);
    stock.push({ size, qty });
  }
  const pooled = stock.length === 1 && stock[0].size === 0;
  if (stock.some((s) => s.size === 0) && !pooled) {
    return { error: 'A pooled count (size 0) cannot be mixed with individual sizes.' };
  }
  let sizeMin = null;
  let sizeMax = null;
  if (pooled) {
    sizeMin = Number(sizeMinIn);
    sizeMax = Number(sizeMaxIn);
    if (!Number.isInteger(sizeMin) || !Number.isInteger(sizeMax) || sizeMin <= 0 || sizeMax < sizeMin) {
      return { error: 'Enter the smallest and largest size for this costume.' };
    }
  } else {
    const sizes = stock.filter((s) => s.qty > 0).map((s) => s.size).sort((a, b) => a - b);
    sizeMin = sizes[0] ?? null;
    sizeMax = sizes[sizes.length - 1] ?? null;
  }
  return { stock, sizeMin, sizeMax };
}

function writeStock(costumeId, parsed) {
  db.prepare('DELETE FROM costume_stock WHERE costume_id = ?').run(costumeId);
  const insert = db.prepare('INSERT INTO costume_stock (costume_id, size, qty) VALUES (?, ?, ?)');
  for (const s of parsed.stock) insert.run(costumeId, s.size, s.qty);
  db.prepare('UPDATE costumes SET size_min = ?, size_max = ? WHERE id = ?').run(parsed.sizeMin, parsed.sizeMax, costumeId);
}

const parsePrice = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const validPrice = (p) => p === null || (Number.isInteger(p) && p >= 0 && p <= 1000000);

const detail = (id) => serializeCostume(
  db.prepare(`${COSTUME_SELECT} WHERE c.id = ?`).get(id),
  stockMap(db).get(Number(id)) || []
);

router.get('/costumes', (req, res) => {
  const stocks = stockMap(db);
  const rows = db.prepare(`${COSTUME_SELECT} ORDER BY cat.sort_order, c.sort_order, c.id`).all();
  res.json(rows.map((r) => serializeCostume(r, stocks.get(r.id) || [])));
});

router.post('/costumes', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Please choose a photo of the costume.' });
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(String(req.body.categoryId || ''));
  if (!category) return res.status(400).json({ error: 'Please choose a category.' });
  const price = parsePrice(req.body.rentPrice);
  if (!validPrice(price)) return res.status(400).json({ error: 'Rent per day must be a whole number of rupees.' });
  const parsed = parseStock(req.body.sizes || '[]', req.body.sizeMin, req.body.sizeMax);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const next = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM costumes WHERE category_id = ?').get(category.id).n;
  const result = db.prepare(
    `INSERT INTO costumes (category_id, image_path, name, label, rent_price, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(category.id, `/uploads/${req.file.filename}`, (req.body.name || '').trim() || null,
        (req.body.label || '').trim() || null, price, next);
  writeStock(result.lastInsertRowid, parsed);
  res.status(201).json(detail(result.lastInsertRowid));
});

router.put('/costumes/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM costumes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Costume not found.' });
  const b = req.body;

  const price = 'rentPrice' in b ? parsePrice(b.rentPrice) : existing.rent_price;
  if (!validPrice(price)) return res.status(400).json({ error: 'Rent per day must be a whole number of rupees.' });
  if ('categoryId' in b && !db.prepare('SELECT id FROM categories WHERE id = ?').get(String(b.categoryId))) {
    return res.status(400).json({ error: 'Unknown category.' });
  }
  let parsed = null;
  if ('sizes' in b) {
    parsed = parseStock(b.sizes, b.sizeMin, b.sizeMax);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
  }

  db.prepare('UPDATE costumes SET name = ?, label = ?, rent_price = ?, category_id = ?, active = ? WHERE id = ?').run(
    'name' in b ? (String(b.name || '').trim() || null) : existing.name,
    'label' in b ? (String(b.label || '').trim() || null) : existing.label,
    price,
    'categoryId' in b ? String(b.categoryId) : existing.category_id,
    'active' in b ? (b.active ? 1 : 0) : existing.active,
    existing.id
  );
  if (parsed) writeStock(existing.id, parsed);
  res.json(detail(existing.id));
});

// ---------- enquiries ----------
router.get('/enquiries', (req, res) => {
  res.json(db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC, id DESC').all());
});

module.exports = router;
