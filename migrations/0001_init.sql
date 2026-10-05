CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,                 -- 'fitness' | 'home'
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]', -- JSON array of other names merged into this one
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (goal, name)
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  date TEXT NOT NULL,                 -- local YYYY-MM-DD
  category_id INTEGER NOT NULL REFERENCES categories(id),
  details TEXT NOT NULL DEFAULT '{}', -- sets/reps/weight/duration/distance/notes...
  raw_text TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- voice | text | card | manual
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_date ON entries(date);

CREATE TABLE merge_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL,              -- newer category
  b_id INTEGER NOT NULL,              -- existing category it may duplicate
  confidence REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | merged | dismissed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  room TEXT NOT NULL DEFAULT 'General',
  per_quarter INTEGER NOT NULL,       -- times per 13 weeks (39 = every 2-day card)
  category_id INTEGER REFERENCES categories(id),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE card_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL REFERENCES card_sets(id),
  idx INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,          -- printed on the card, e.g. S1-07
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  label TEXT NOT NULL                 -- 'Mon–Tue'
);
CREATE TABLE card_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  chore_id INTEGER REFERENCES chores(id),
  name TEXT NOT NULL,
  pos INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  entry_id INTEGER
);
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL,
  card_id INTEGER,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Friendly views for the chat assistant
CREATE VIEW v_entries AS
  SELECT e.id, e.date, CAST(strftime('%w', e.date) AS INTEGER) AS weekday, -- 0=Sunday
         e.goal, c.name AS activity, e.details, e.source, e.raw_text
  FROM entries e JOIN categories c ON c.id = e.category_id;
CREATE VIEW v_card_items AS
  SELECT ci.id, cd.code AS card_code, cd.start_date, cd.end_date, ci.name AS chore,
         ch.room, ci.done, ci.done_at
  FROM card_items ci JOIN cards cd ON cd.id = ci.card_id LEFT JOIN chores ch ON ch.id = ci.chore_id;

-- Starter chores (edit in the app). Totals ~200 slots across 39 cards.
INSERT INTO categories (goal, name) VALUES
 ('home','Kitchen reset'),('home','Quick tidy'),
 ('home','Vacuum main floors'),('home','Mop kitchen & entry'),('home','Clean bathrooms'),('home','Laundry & bedding'),
 ('home','Dust surfaces'),('home','Wipe appliances'),('home','Clean mirrors & glass'),('home','Water plants'),
 ('home','Clean toilets'),('home','Wash kitchen towels & rugs'),('home','Tidy entryway'),
 ('home','Clean microwave'),('home','Declutter one drawer/shelf'),('home','Wipe baseboards'),('home','Clean fridge shelves'),
 ('home','Clean oven'),('home','Wash windows'),('home','Vacuum under furniture'),('home','Clean light fixtures & fans'),('home','Wipe cabinet fronts'),
 ('home','Organize pantry'),('home','Clean washer & dryer'),('home','Descale kettle & coffee maker'),('home','Flip/rotate mattress'),
 ('home','Clean garage / storage'),('home','Wash trash cans'),('home','Clean dishwasher filter'),('home','Declutter closet');
INSERT INTO chores (name, room, per_quarter, category_id)
 WITH v(n, r, p) AS (
  VALUES
   ('Kitchen reset','Kitchen',39),
   ('Quick tidy','Living areas',39),
   ('Vacuum main floors','Living areas',13),
   ('Mop kitchen & entry','Kitchen',13),
   ('Clean bathrooms','Bathrooms',13),
   ('Laundry & bedding','Bedrooms',13),
   ('Dust surfaces','Living areas',7),
   ('Wipe appliances','Kitchen',7),
   ('Clean mirrors & glass','Bathrooms',7),
   ('Water plants','Living areas',7),
   ('Clean toilets','Bathrooms',6),
   ('Wash kitchen towels & rugs','Kitchen',6),
   ('Tidy entryway','Entry',6),
   ('Clean microwave','Kitchen',3),
   ('Declutter one drawer/shelf','General',3),
   ('Wipe baseboards','General',3),
   ('Clean fridge shelves','Kitchen',3),
   ('Clean oven','Kitchen',1),
   ('Wash windows','General',1),
   ('Vacuum under furniture','Living areas',1),
   ('Clean light fixtures & fans','General',1),
   ('Wipe cabinet fronts','Kitchen',1),
   ('Organize pantry','Kitchen',1),
   ('Clean washer & dryer','Laundry',1),
   ('Descale kettle & coffee maker','Kitchen',1),
   ('Flip/rotate mattress','Bedrooms',1),
   ('Clean garage / storage','Garage',1),
   ('Wash trash cans','Garage',1),
   ('Clean dishwasher filter','Kitchen',1),
   ('Declutter closet','Bedrooms',1)
 )
 SELECT n, r, p, (SELECT id FROM categories WHERE goal='home' AND name=n) FROM v;
