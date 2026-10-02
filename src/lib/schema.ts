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

-- ───────────────────────── admin-editable catalogue ─────────────────────────
-- The workshop catalogue used to live in code (src/content/workshops.ts). It
-- now lives here so the team can add/edit/price workshops from /admin/classes
-- without a deploy. Categories stay fixed in code (they're tied to icons).

CREATE TABLE IF NOT EXISTS workshops (
  slug            TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  category_slug   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'planned', -- live | planned | future
  level           TEXT NOT NULL DEFAULT 'Beginner', -- Beginner | Intermediate | Advanced
  duration_min    INTEGER NOT NULL DEFAULT 90,
  price_paise     INTEGER NOT NULL,
  promise         TEXT NOT NULL,
  summary         TEXT NOT NULL,
  learn_json      TEXT NOT NULL DEFAULT '[]',
  outcome         TEXT NOT NULL,
  outcome_detail  TEXT NOT NULL,
  for_who_json    TEXT NOT NULL DEFAULT '[]',
  bring_json      TEXT NOT NULL DEFAULT '[]',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workshops_status ON workshops (status);
CREATE INDEX IF NOT EXISTS idx_workshops_category ON workshops (category_slug);

-- Personal-training pricing tiers and the topic picklist — formerly hardcoded
-- in src/lib/site.ts, now editable from /admin/training.

CREATE TABLE IF NOT EXISTS training_durations (
  id          TEXT PRIMARY KEY,
  minutes     INTEGER NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  blurb       TEXT NOT NULL,
  price_paise INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS training_topics (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Top-level pricing knobs and social links — formerly hardcoded in
-- src/lib/site.ts, now editable from /admin/pricing and /admin/socials.
-- site_settings is a singleton (always id = 'singleton').

CREATE TABLE IF NOT EXISTS site_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  workshop_price_paise        INTEGER NOT NULL,
  returning_discount_percent  INTEGER NOT NULL,
  monthly_pass_price_paise    INTEGER NOT NULL,
  updated_at                  TEXT NOT NULL
);

-- Records that a content table has been seeded from its code defaults, so
-- emptying a table in the admin (e.g. deleting every social link) doesn't
-- make the defaults reappear on the next read.
CREATE TABLE IF NOT EXISTS content_seed (
  key TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS socials (
  id         TEXT PRIMARY KEY,
  platform   TEXT NOT NULL UNIQUE,
  handle     TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ───────────────────────── student accounts (auth) ─────────────────────────
-- Separate from the single shared admin password. A student account is
-- created the first time someone verifies a Google sign-in or an email OTP —
-- there's no separate "sign up" step.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  google_id      TEXT UNIQUE,
  avatar_url     TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

-- One-time codes emailed for passwordless sign-in. A code is single-use,
-- short-lived, and rate-limited (see src/lib/otp.ts).
CREATE TABLE IF NOT EXISTS email_otp_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email_created ON email_otp_codes (email, created_at);

-- ───────────────────────── monthly all-access pass ─────────────────────────
-- A pass covers every workshop session scheduled in month_key (IST calendar
-- month, "YYYY-MM") for the email that bought it. Matched by email — no
-- account/login needed, same pattern as the returning-student discount.

CREATE TABLE IF NOT EXISTS monthly_passes (
  id                  TEXT PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  email               TEXT NOT NULL,
  name                TEXT NOT NULL,
  phone               TEXT,
  month_key           TEXT NOT NULL,
  amount_paise        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid | refunded | cancelled | failed
  payment_provider    TEXT,
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  created_at          TEXT NOT NULL,
  paid_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_pass_email_month ON monthly_passes (email, month_key);
CREATE INDEX IF NOT EXISTS idx_pass_order ON monthly_passes (provider_order_id);
`;
