const db = require('../db');
const { today } = require('../lib/dates');

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const inDays = (n) => addDays(today(), n);

function makeCategory(id = 'test') {
  db.prepare("INSERT OR IGNORE INTO categories (id, name, description, accent_color, sort_order) VALUES (?, 'Test', 'd', '#000', 1)").run(id);
  return id;
}
function makeCostume({ stock = [{ size: 36, qty: 1 }], sizeMin = null, sizeMax = null, category = 'test' } = {}) {
  makeCategory(category);
  const r = db.prepare('INSERT INTO costumes (category_id, image_path, size_min, size_max) VALUES (?, ?, ?, ?)')
    .run(category, '/assets/images/x.jpg', sizeMin, sizeMax);
  for (const s of stock) db.prepare('INSERT INTO costume_stock (costume_id, size, qty) VALUES (?, ?, ?)').run(r.lastInsertRowid, s.size, s.qty);
  return Number(r.lastInsertRowid);
}
let n = 0;
function makeUser() {
  n += 1;
  const r = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, 'x')").run(`User ${n}`, `u${n}@example.com`);
  return Number(r.lastInsertRowid);
}
module.exports = { db, addDays, inDays, makeCostume, makeUser, makeCategory };
