const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('../lib/config');

// Ensure database directory exists before mounting
if (DB_PATH !== ':memory:') {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  } catch {
    // Handled in config.js
  }
}

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA wal_autocheckpoint = 1000');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Truncate checkpoint WAL on clean shutdown so changes merge cleanly into primary .db file
function closeDb() {
  try {
    if (DB_PATH !== ':memory:') {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
  } catch {
    // Ignore error during exit
  }
}
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

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
