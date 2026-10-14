const path = require('path');

// Configurable storage paths for local development and Render production.
// In production on Render with a persistent disk mounted at /var/data:
// DATABASE_PATH (or DB_PATH) should point to /var/data/natya_vastra.db
// UPLOAD_DIR should point to /var/data/uploads
// MONGO_DATA_FILE defaults to the same persistent directory if MongoDB Atlas is offline.

const DB_PATH = process.env.DATABASE_PATH || process.env.DB_PATH || path.join(__dirname, '..', 'db', 'natya_vastra.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const MONGO_DATA_FILE = process.env.MONGO_DATA_FILE || (
  DB_PATH !== ':memory:' && path.isAbsolute(DB_PATH)
    ? path.join(path.dirname(DB_PATH), 'mongo_data.json')
    : path.join(__dirname, '..', 'db', 'mongo_data.json')
);

module.exports = {
  DB_PATH,
  UPLOAD_DIR,
  MONGO_DATA_FILE
};
