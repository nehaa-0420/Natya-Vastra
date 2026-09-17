const express = require('express');
const db = require('../db');

const router = express.Router();

function attachImages(categories) {
  const imageStmt = db.prepare(
    'SELECT image_path, label FROM category_images WHERE category_id = ? ORDER BY sort_order'
  );
  return categories.map((cat) => ({
    ...cat,
    images: imageStmt.all(cat.id).map((r) => ({ src: r.image_path, label: r.label }))
  }));
}

// GET /api/categories — all categories with their images
router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.json(attachImages(categories));
});

// GET /api/categories/:id — one category with its images
router.get('/:id', (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  res.json(attachImages([category])[0]);
});

module.exports = router;
