-- Founding-members waitlist. One row per email; a repeat sign-up updates the row.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  speaks TEXT NOT NULL,
  learning TEXT NOT NULL,
  suburb TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS waitlist_pair ON waitlist (speaks, learning);
