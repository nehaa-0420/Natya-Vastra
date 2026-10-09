-- Costume categories (Frock, Saree Sets, Kache, etc.)
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  note         TEXT
);

-- One row per costume design (one photo = one design in the PDF menu)
CREATE TABLE IF NOT EXISTS costumes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  name        TEXT,
  label       TEXT,
  rent_price  INTEGER,           -- rupees per day; NULL = price on request
  size_min    INTEGER,
  size_max    INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Stock per size. size 0 means "pooled": any size inside [size_min, size_max]
CREATE TABLE IF NOT EXISTS costume_stock (
  costume_id INTEGER NOT NULL REFERENCES costumes(id) ON DELETE CASCADE,
  size       INTEGER NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (costume_id, size)
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS enquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  costume_type TEXT,
  message      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  costume_id INTEGER NOT NULL REFERENCES costumes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, costume_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  costume_id  INTEGER NOT NULL REFERENCES costumes(id),
  size        INTEGER NOT NULL,
  start_date  TEXT NOT NULL,      -- YYYY-MM-DD, inclusive
  end_date    TEXT NOT NULL,      -- YYYY-MM-DD, inclusive
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','confirmed','cancelled','returned')),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_costumes_category ON costumes(category_id);
CREATE INDEX IF NOT EXISTS idx_bookings_costume ON bookings(costume_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
