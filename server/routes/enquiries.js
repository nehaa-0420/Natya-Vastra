const express = require('express');
const db = require('../db');

const router = express.Router();

const insertEnquiry = db.prepare(`
  INSERT INTO enquiries (name, phone, email, costume_type, message)
  VALUES (@name, @phone, @email, @costume_type, @message)
`);

// POST /api/enquiries — record an order enquiry from the contact form
router.post('/', (req, res) => {
  const { name, phone, email, costume_type, message } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required.' });

  const result = insertEnquiry.run({
    name: name.trim(),
    phone: phone.trim(),
    email: (email || '').trim(),
    costume_type: costume_type || '',
    message: (message || '').trim()
  });

  res.status(201).json({ id: result.lastInsertRowid, saved: true });
});

// GET /api/enquiries — list saved enquiries (for the shop owner to review)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all();
  res.json(rows);
});

module.exports = router;
