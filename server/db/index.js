const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// DB_PATH lets tests use ':memory:' without touching the real database.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'natya_vastra.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Backward compatibility: add new columns to existing bookings tables if not already present
try {
  const cols = db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
  const addCol = (name, type) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`);
  };
  addCol('rental_price', 'INTEGER');
  addCol('return_deadline', 'TEXT');
  addCol('actual_return_time', 'TEXT');
  addCol('late_penalty', 'INTEGER NOT NULL DEFAULT 0');
  addCol('damage_charge', 'INTEGER NOT NULL DEFAULT 0');
  addCol('total_amount', 'INTEGER');
  addCol('total_quantity', 'INTEGER NOT NULL DEFAULT 1');
  addCol('is_late', 'INTEGER NOT NULL DEFAULT 0');
  addCol('accepted_terms', 'INTEGER NOT NULL DEFAULT 0');
  addCol('accepted_terms_at', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      size       INTEGER NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id ON booking_items(booking_id);
  `);
} catch (err) {
  console.warn('[db] Note on schema columns:', err.message);
}

module.exports = db;

