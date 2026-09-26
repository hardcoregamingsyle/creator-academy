/**
 * Database schema. Every statement is idempotent (IF NOT EXISTS) and is run
 * automatically the first time the app talks to the database.
 *
 * Conventions: ids are UUID strings, timestamps are ISO-8601 UTC strings,
 * money is stored in paise (₹1 = 100 paise), booleans are 0/1 integers.
 */
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS class_sessions (
  id            TEXT PRIMARY KEY,
  workshop_slug TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 90,
  capacity      INTEGER NOT NULL DEFAULT 20,
  price_paise   INTEGER NOT NULL,
  meeting_link  TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled
  notes         TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON class_sessions (starts_at);

CREATE TABLE IF NOT EXISTS registrations (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  session_id          TEXT NOT NULL REFERENCES class_sessions (id),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  base_paise          INTEGER NOT NULL,
  discount_paise      INTEGER NOT NULL DEFAULT 0,
  amount_paise        INTEGER NOT NULL,
  discount_source_session_id TEXT,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded | cancelled
  payment_provider    TEXT,          -- razorpay | demo | manual
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  attended            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  paid_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_session ON registrations (session_id);
CREATE INDEX IF NOT EXISTS idx_reg_email ON registrations (email);
CREATE INDEX IF NOT EXISTS idx_reg_order ON registrations (provider_order_id);

CREATE TABLE IF NOT EXISTS training_slots (
  id         TEXT PRIMARY KEY,
  starts_at  TEXT NOT NULL,
  is_open    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slots_start ON training_slots (starts_at);

CREATE TABLE IF NOT EXISTS training_bookings (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  slot_id             TEXT NOT NULL REFERENCES training_slots (id),
  topic               TEXT NOT NULL,
  duration_min        INTEGER NOT NULL,
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  goals               TEXT,
  amount_paise        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid | completed | failed | refunded | cancelled
  payment_provider    TEXT,
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  meeting_link        TEXT,
  created_at          TEXT NOT NULL,
  paid_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_tb_slot ON training_bookings (slot_id);
CREATE INDEX IF NOT EXISTS idx_tb_order ON training_bookings (provider_order_id);

CREATE TABLE IF NOT EXISTS feedback (
  id                TEXT PRIMARY KEY,
  registration_code TEXT,
  workshop_slug     TEXT,
  rating            INTEGER NOT NULL,
  learned           TEXT,
  unclear           TEXT,
  improve           TEXT,
  teach_next        TEXT,
  attend_again      TEXT,            -- yes | maybe | no
  public_comment    TEXT,
  display_name      TEXT,
  consent_public    INTEGER NOT NULL DEFAULT 0,
  approved          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interest (
  id            TEXT PRIMARY KEY,
  workshop_slug TEXT NOT NULL,
  name          TEXT,
  email         TEXT NOT NULL,
  note          TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (workshop_slug, email)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT,
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_log (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  kind       TEXT,                -- booking | training | reminder | feedback | other
  status     TEXT NOT NULL,       -- sent | logged | failed
  error      TEXT,
  created_at TEXT NOT NULL
);
`;
