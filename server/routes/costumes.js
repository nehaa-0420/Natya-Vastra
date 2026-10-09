const express = require('express');
const db = require('../db');
const { validateRange } = require('../lib/dates');
const { availabilityBySize, remainingFor } = require('../lib/availability');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');

const router = express.Router();

// GET /api/costumes?q=&category=&size=&from=&to=
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '');
  const size = req.query.size ? Number(req.query.size) : null;
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  const filterDates = Boolean(from || to);

  if (filterDates) {
    const err = validateRange(from, to);
    if (err) return res.status(400).json({ error: err });
  }
  if (size !== null && (!Number.isInteger(size) || size <= 0)) {
    return res.status(400).json({ error: 'Size must be a whole number of inches.' });
  }

  const stocks = stockMap(db);
  let rows = db.prepare(`${COSTUME_SELECT} WHERE c.active = 1
                         ORDER BY cat.sort_order, c.sort_order, c.id`).all();

  if (category) rows = rows.filter((r) => r.category_id === category);
  if (q) {
    rows = rows.filter((r) => [r.name, r.label, r.category_name].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  const results = [];
  for (const row of rows) {
    const stock = stocks.get(row.id) || [];
    const item = serializeCostume(row, stock);

    if (size !== null) {
      const fits = item.pooled
        ? size >= item.sizeMin && size <= item.sizeMax
        : item.sizes.some((s) => s.size === size && s.count > 0);
      if (!fits) continue;
    }
    if (filterDates) {
      if (!item.bookable) continue;
      const free = availabilityBySize(db, row.id, from, to)
        .some((a) => (size === null || a.pooled || a.size === size) && a.remaining > 0);
      if (!free) continue;
      item.availableForDates = true;
    }
    results.push(item);
  }
  res.json(results);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`${COSTUME_SELECT} WHERE c.id = ? AND c.active = 1`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Costume not found.' });
  res.json(serializeCostume(row, stockMap(db).get(row.id) || []));
});

// GET /api/costumes/:id/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/:id/availability', (req, res) => {
  const { start, end } = req.query;
  const err = validateRange(String(start || ''), String(end || ''));
  if (err) return res.status(400).json({ error: err });
  const exists = db.prepare('SELECT id FROM costumes WHERE id = ? AND active = 1').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Costume not found.' });
  res.json(availabilityBySize(db, Number(req.params.id), start, end));
});

module.exports = router;
