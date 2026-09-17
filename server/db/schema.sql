-- Costume categories (Frock, Saree Sets, Kache, etc.)
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  note         TEXT  -- optional callout specific to this category (e.g. pre-order info)
);

-- Photos belonging to a category (one row per photo, ordered)
CREATE TABLE IF NOT EXISTS category_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  image_path  TEXT NOT NULL,
  label       TEXT, -- optional caption shown on the photo (size, colour, etc.)
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Standalone "our work" gallery, not tied to a specific category
CREATE TABLE IF NOT EXISTS gallery_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Customer enquiries submitted through the contact form
CREATE TABLE IF NOT EXISTS enquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  costume_type TEXT,
  message      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_category_images_category ON category_images(category_id);
