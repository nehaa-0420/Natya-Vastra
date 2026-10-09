const express = require('express');
const db = require('../db');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');

const router = express.Router();

// Each category comes with its active costumes (as `images`, which the home page already uses).
function withCostumes(categories) {
  const stocks = stockMap(db);
  const stmt = db.prepare(`${COSTUME_SELECT} WHERE c.category_id = ? AND c.active = 1 ORDER BY c.sort_order, c.id`);
  return categories.map((cat) => ({
    ...cat,
    images: stmt.all(cat.id).map((row) => serializeCostume(row, stocks.get(row.id) || []))
  }));
}

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.json(withCostumes(categories));
});

router.get('/:id', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  res.json(withCostumes([category])[0]);
});

module.exports = router;
