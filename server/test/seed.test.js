process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { seedCatalog, ensureAdmin, seedIfEmpty } = require('../db/seed');
const { getStock, isPooled } = require('../lib/availability');

test('the PDF catalog seeds 36 costumes in 7 categories with stock', () => {
  seedIfEmpty();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM categories').get().n, 7);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM costumes').get().n, 36);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gallery_images').get().n, 19);

  // costume-007.jpg is PDF page 4: sizes 32-42, 18 pieces
  const c = db.prepare("SELECT id FROM costumes WHERE image_path LIKE '%costume-007.jpg'").get();
  const stock = getStock(db, c.id);
  assert.deepEqual(stock.map((s) => [s.size, s.qty]), [[32, 2], [34, 2], [36, 5], [38, 4], [40, 3], [42, 2]]);
  assert.equal(stock.reduce((a, s) => a + s.qty, 0), 18);

  // costume-001.jpg is PDF page 37: only a total (17) is known, so stock is pooled
  const kids = db.prepare("SELECT * FROM costumes WHERE image_path LIKE '%costume-001.jpg'").get();
  assert.ok(isPooled(getStock(db, kids.id)));
  assert.equal(getStock(db, kids.id)[0].qty, 17);
  assert.deepEqual([kids.size_min, kids.size_max], [24, 36]);

  // saree sets and the devi costume have no stock data in the PDF
  const unstocked = db.prepare('SELECT COUNT(*) n FROM costumes c WHERE NOT EXISTS (SELECT 1 FROM costume_stock s WHERE s.costume_id = c.id)').get().n;
  assert.equal(unstocked, 3);
});

test('re-seeding refuses to wipe bookings unless forced', () => {
  const user = db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@x.com', 'x')").run();
  const costume = db.prepare('SELECT id FROM costumes LIMIT 1').get();
  db.prepare("INSERT INTO bookings (user_id, costume_id, size, start_date, end_date) VALUES (?, ?, 36, '2099-01-01', '2099-01-02')")
    .run(user.lastInsertRowid, costume.id);
  assert.throws(() => seedCatalog(), /bookings/);
  seedCatalog({ force: true });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 0);
});

test('an admin account is created once', () => {
  assert.ok(ensureAdmin());
  assert.equal(ensureAdmin(), null);
});
