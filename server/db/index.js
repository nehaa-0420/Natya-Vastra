const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// DB_PATH lets tests use ':memory:' without touching the real database.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'natya_vastra.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = db;
