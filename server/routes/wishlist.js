const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { stockMap, serializeCostume, COSTUME_SELECT } = require('../lib/serialize');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const stocks = stockMap(db);
  const rows = db.prepare(`${COSTUME_SELECT}
    JOIN wishlist w ON w.costume_id = c.id
    WHERE w.user_id = ? AND c.active = 1 ORDER BY w.created_at DESC`).all(req.user.id);
  res.json(rows.map((r) => serializeCostume(r, stocks.get(r.id) || [])));
});

router.post('/:costumeId', (req, res) => {
  const costume = db.prepare('SELECT id FROM costumes WHERE id = ? AND active = 1').get(req.params.costumeId);
  if (!costume) return res.status(404).json({ error: 'Costume not found.' });
  db.prepare('INSERT OR IGNORE INTO wishlist (user_id, costume_id) VALUES (?, ?)').run(req.user.id, costume.id);
  res.status(201).json({ saved: true });
});

router.delete('/:costumeId', (req, res) => {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND costume_id = ?').run(req.user.id, req.params.costumeId);
  res.json({ saved: false });
});

module.exports = router;
