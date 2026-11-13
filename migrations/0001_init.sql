-- Lucky wheel schema for Cloudflare D1 (SQLite).

CREATE TABLE IF NOT EXISTS config (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  json       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spins (
  id          TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  segment_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,
  value       REAL NOT NULL DEFAULT 0,
  code        TEXT UNIQUE,
  expires_at  TEXT,
  created_at  TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  redeemed_at TEXT,
  -- Which of this number's allowed spins this row uses (e.g. "all#0", or "<day start>#1" with daily reset).
  -- The UNIQUE rule below means two simultaneous requests can't both take the same spin.
  slot        TEXT NOT NULL,
  UNIQUE (phone, slot)
);
CREATE INDEX IF NOT EXISTS spins_created ON spins (created_at);
CREATE INDEX IF NOT EXISTS spins_ip      ON spins (ip, created_at);

CREATE TABLE IF NOT EXISTS contacts (
  phone      TEXT PRIMARY KEY,
  contacted  INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

-- Request counters for rate limiting (one row per IP per time window).
CREATE TABLE IF NOT EXISTS rate_hits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
