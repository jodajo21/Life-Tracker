-- XP is an append-only ledger: totals only go up, and every award (incl. lucky drops) is recorded and shown.
CREATE TABLE xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,                -- fitness | home
  date TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- base | lucky | discovery | comeback | card_clear
  xp INTEGER NOT NULL,
  label TEXT NOT NULL,
  entry_id INTEGER,
  card_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_xp_date ON xp_events(domain, date);
CREATE INDEX idx_xp_entry ON xp_events(entry_id);

-- Days the user chose to protect (soft/travel days) so momentum doesn't dip.
CREATE TABLE shields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  date TEXT NOT NULL,
  UNIQUE (domain, date)
);

-- One shard per room on a perfectly cleared card; shards add up to room trophies.
CREATE TABLE shards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  card_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  UNIQUE (room, card_id)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES ('fitness_weekly_target', '3');

-- Lets the offline queue retry a request safely (no double logging if the first reply was lost).
CREATE TABLE seen_requests (
  client_id TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIEW v_xp AS SELECT date, domain, kind, xp, label FROM xp_events;
