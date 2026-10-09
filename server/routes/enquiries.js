const express = require('express');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

// Public: anyone can send an enquiry. Reading them is admin-only (see routes/admin.js).
router.post('/', limiter, (req, res) => {
  const { name, phone, email, costume_type, message } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Phone number is required.' });

  const result = db.prepare(
    'INSERT INTO enquiries (name, phone, email, costume_type, message) VALUES (?, ?, ?, ?, ?)'
  ).run(
    String(name).trim().slice(0, 80),
    String(phone).trim().slice(0, 20),
    String(email || '').trim().slice(0, 120),
    String(costume_type || '').slice(0, 80),
    String(message || '').trim().slice(0, 1000)
  );
  res.status(201).json({ id: Number(result.lastInsertRowid), saved: true });
});

module.exports = router;
