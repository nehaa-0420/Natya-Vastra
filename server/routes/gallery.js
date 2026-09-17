const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/gallery — the general "our work" gallery images
router.get('/', (req, res) => {
  const images = db.prepare('SELECT image_path FROM gallery_images ORDER BY sort_order').all();
  res.json(images.map((r) => r.image_path));
});

module.exports = router;
