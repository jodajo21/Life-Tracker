-- One generic document store: the app keeps collections of JSON documents (entries, decks, cardsets, notes...).
-- seq rises with every change, so a device can ask "what changed since I last looked?". Deleted documents stay as empty rows for a while so other devices learn about the delete.
CREATE TABLE docs (
  path    TEXT PRIMARY KEY,
  coll    TEXT NOT NULL,
  id      TEXT NOT NULL,
  data    TEXT,
  seq     INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX docs_seq ON docs (seq);
CREATE INDEX docs_coll ON docs (coll);
CREATE TABLE usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
