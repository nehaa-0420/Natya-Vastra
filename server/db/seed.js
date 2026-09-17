// Populates categories, their images, and the general gallery.
// Safe to re-run — it clears and re-inserts each time.
const db = require('./index');

const CATEGORIES = [
  {
    id: 'frock', name: 'Frock Costumes', accent_color: '#4B0F1A', sort_order: 1,
    description: 'Traditional frock-style costumes for young and senior dancers.',
    images: [1, 2, 3, 4, 5, 6, 7]
  },
  {
    id: 'saree', name: 'Saree Sets', accent_color: '#1A2B4A', sort_order: 2,
    description: 'Elegant Bharatanatyam saree draping with zari borders.',
    images: [8, 9]
  },
  {
    id: 'sidefrill', name: 'Side Frill Costumes', accent_color: '#1A3020', sort_order: 3,
    description: 'Graceful side-frill designs for expressive stage performances.',
    images: [10, 11, 12, 13, 14, 15]
  },
  {
    id: 'kache', name: 'Kache Costumes', accent_color: '#3B1A00', sort_order: 4,
    description: 'Classic kache-style for authentic classical performances.',
    images: [16, 17, 18]
  },
  {
    id: 'fivepiece', name: 'Five Piece Costumes', accent_color: '#2A1040', sort_order: 5,
    description: 'Complete five-piece sets with matching accessories.',
    images: [19, 20, 21, 22]
  },
  {
    id: 'sixpiece', name: 'Six Piece Costumes', accent_color: '#0A2A1A', sort_order: 6,
    description: 'Elaborate six-piece ensembles for grand productions.',
    images: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]
  },
  {
    id: 'devi', name: 'Devi Costume', accent_color: '#2A0A30', sort_order: 7,
    description: 'Majestic deity-inspired costumes for special performances.',
    images: [36]
  }
];

const GALLERY_IMAGE_NUMS = Array.from({ length: 19 }, (_, i) => 37 + i); // 37..55

const path = (n) => `/assets/images/costume-${String(n).padStart(3, '0')}.jpg`;

const run = db.transaction(() => {
  db.prepare('DELETE FROM category_images').run();
  db.prepare('DELETE FROM gallery_images').run();
  db.prepare('DELETE FROM categories').run();

  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, description, accent_color, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const insertCategoryImage = db.prepare(
    'INSERT INTO category_images (category_id, image_path, sort_order) VALUES (?, ?, ?)'
  );
  const insertGalleryImage = db.prepare(
    'INSERT INTO gallery_images (image_path, sort_order) VALUES (?, ?)'
  );

  for (const cat of CATEGORIES) {
    insertCategory.run(cat.id, cat.name, cat.description, cat.accent_color, cat.sort_order);
    cat.images.forEach((num, i) => insertCategoryImage.run(cat.id, path(num), i));
  }

  GALLERY_IMAGE_NUMS.forEach((num, i) => insertGalleryImage.run(path(num), i));
});

run();

console.log(`Seeded ${CATEGORIES.length} categories and ${GALLERY_IMAGE_NUMS.length} gallery images.`);
