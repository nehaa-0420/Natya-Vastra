// Fills the catalog (categories, costumes, stock, gallery) and makes sure an admin exists.
//   npm run seed             -> reset the catalog (refuses if customer bookings exist)
//   npm run seed -- --force  -> reset everything, including bookings
const fs = require('fs');
const nodePath = require('path');
const db = require('./index');
const { hashPassword } = require('../lib/password');

// Size/stock data from the Chiguru Costumes PDF menu. Keys are costume photo numbers.
const SIZES = JSON.parse(fs.readFileSync(nodePath.join(__dirname, 'sizes.json'), 'utf8'));

const CATEGORIES = [
  { id: 'frock', name: 'Frock Costumes', accent_color: '#4B0F1A', sort_order: 1,
    description: 'Traditional frock-style costumes for young and senior dancers.', images: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'saree', name: 'Saree Sets', accent_color: '#1A2B4A', sort_order: 2,
    description: 'Elegant Bharatanatyam saree draping with zari borders.',
    note: 'Practice sarees are available on a pre-order basis — get yours perfectly stitched and ready before class, or book ahead to avoid a last-minute rush.',
    images: [8, 9] },
  { id: 'sidefrill', name: 'Side Frill Costumes', accent_color: '#1A3020', sort_order: 3,
    description: 'Graceful side-frill designs for expressive stage performances.', images: [10, 11, 12, 13, 14, 15] },
  { id: 'kache', name: 'Kache Costumes', accent_color: '#3B1A00', sort_order: 4,
    description: 'Classic kache-style for authentic classical performances.', images: [16, 17, 18] },
  { id: 'fivepiece', name: 'Five Piece Costumes', accent_color: '#2A1040', sort_order: 5,
    description: 'Complete five-piece sets with matching accessories.', images: [19, 20, 21, 22] },
  { id: 'sixpiece', name: 'Six Piece Costumes', accent_color: '#0A2A1A', sort_order: 6,
    description: 'Elaborate six-piece ensembles for grand productions.',
    images: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35] },
  { id: 'devi', name: 'Devi Costume', accent_color: '#2A0A30', sort_order: 7,
    description: 'Majestic deity-inspired costumes for special performances.', images: [36] }
];
const GALLERY_NUMS = Array.from({ length: 19 }, (_, i) => 37 + i);
const imgPath = (n) => `/assets/images/costume-${String(n).padStart(3, '0')}.jpg`;

function seedCatalog({ force = false } = {}) {
  const bookings = db.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  if (bookings > 0 && !force) {
    throw new Error(`There are ${bookings} bookings. Re-seeding would delete them. Run "npm run seed -- --force" if you are sure.`);
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM bookings').run();
    db.prepare('DELETE FROM costumes').run(); // stock + wishlist rows go with them
    db.prepare('DELETE FROM gallery_images').run();
    db.prepare('DELETE FROM categories').run();

    const addCat = db.prepare('INSERT INTO categories (id, name, description, accent_color, sort_order, note) VALUES (?, ?, ?, ?, ?, ?)');
    const addCostume = db.prepare('INSERT INTO costumes (category_id, image_path, size_min, size_max, sort_order) VALUES (?, ?, ?, ?, ?)');
    const addStock = db.prepare('INSERT INTO costume_stock (costume_id, size, qty) VALUES (?, ?, ?)');
    const addGallery = db.prepare('INSERT INTO gallery_images (image_path, sort_order) VALUES (?, ?)');

    for (const cat of CATEGORIES) {
      addCat.run(cat.id, cat.name, cat.description, cat.accent_color, cat.sort_order, cat.note || null);
      cat.images.forEach((num, i) => {
        const sz = SIZES[String(num)];
        const r = addCostume.run(cat.id, imgPath(num), sz ? sz.sizeRange[0] : null, sz ? sz.sizeRange[1] : null, i);
        if (!sz) return; // saree sets / devi: no stock data, enquiry only
        if (sz.sizes.length) sz.sizes.forEach((s) => addStock.run(r.lastInsertRowid, s.size, s.count));
        else addStock.run(r.lastInsertRowid, 0, sz.total); // only a total is known: pooled stock
      });
    }
    GALLERY_NUMS.forEach((num, i) => addGallery.run(imgPath(num), i));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function ensureAdmin() {
  if (db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@natyavastra.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', ?, ?, 'admin')")
    .run(email, hashPassword(password));
  return { email, usingDefaultPassword: !process.env.ADMIN_PASSWORD };
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM costumes').get().n === 0) seedCatalog();
}

module.exports = { seedCatalog, ensureAdmin, seedIfEmpty };

if (require.main === module) {
  try {
    seedCatalog({ force: process.argv.includes('--force') });
    const count = db.prepare('SELECT COUNT(*) n FROM costumes').get().n;
    console.log(`Seeded ${CATEGORIES.length} categories, ${count} costumes and ${GALLERY_NUMS.length} gallery images.`);
    const admin = ensureAdmin();
    if (admin) console.log(`Created admin account: ${admin.email}${admin.usingDefaultPassword ? ' (default password — change it in .env before going live)' : ''}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
