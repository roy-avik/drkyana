-- Dr Kyana clinical agent platform — initial D1 schema.
-- D1 is the sole system of record (replaces Google Sheets + AppSheet).
-- Apply: npx wrangler d1 execute drkyana --file=migrations/0001_init.sql
--
-- Conventions:
--   * IDs are TEXT (UUID/ULID generated server-side).
--   * Timestamps are INTEGER unix epoch seconds (DEFAULT unixepoch()).
--   * JSON-shaped columns store TEXT; parse server-side against packages/types.

-- ---------------------------------------------------------------------------
-- patients — longitudinal record. The most sensitive store (PHI). One patient
-- has many intakes. `summary` is an LLM-maintained narrative; `memory` holds
-- STRUCTURED facts merged from intake fields (never invented by the model).
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id            TEXT PRIMARY KEY,
  phone         TEXT NOT NULL UNIQUE,          -- match key for returning patients
  name          TEXT,
  age           INTEGER,
  gender        TEXT,                          -- 'female' | 'male' | 'other' | 'unspecified'
  email         TEXT,
  summary       TEXT NOT NULL DEFAULT '',      -- maintained narrative (LLM-composed, human-approved)
  memory        TEXT NOT NULL DEFAULT '{}',    -- JSON: conditions[], allergies[], medications[], dental_history, anxiety, recurring_complaints[], flags[]
  last_visit    INTEGER,
  visit_count   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------------------
-- intakes — one row per visit. Identity is a snapshot at intake time; the
-- canonical patient identity lives in `patients`.
-- ---------------------------------------------------------------------------
CREATE TABLE intakes (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT REFERENCES patients(id),
  -- identity snapshot
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  age             INTEGER,
  gender          TEXT,
  -- complaint
  affected_area   TEXT,
  symptoms        TEXT,
  duration        TEXT,
  severity        INTEGER,                     -- 0..10
  triggers        TEXT,
  -- medical history (JSON arrays for multi-value)
  conditions      TEXT NOT NULL DEFAULT '[]',
  allergies       TEXT NOT NULL DEFAULT '[]',
  medications     TEXT NOT NULL DEFAULT '[]',
  -- dental history
  last_dental_visit TEXT,
  anxiety         TEXT,
  -- logistics
  preferred_area  TEXT,
  preferred_days  TEXT,
  time_of_day     TEXT,
  urgency         TEXT,
  payment         TEXT,
  -- triage + workflow
  triage_level    TEXT,                        -- 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN'
  triage_action   TEXT,                        -- 'fast_track' | 'priority' | 'normal'
  status          TEXT NOT NULL DEFAULT 'new', -- new | contacted | scheduled | completed | closed
  raw_message     TEXT,                        -- verbatim free text (for 'other' intent / audit)
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_intakes_status      ON intakes(status);
CREATE INDEX idx_intakes_triage      ON intakes(triage_level);
CREATE INDEX idx_intakes_created     ON intakes(created_at);
CREATE INDEX idx_intakes_patient     ON intakes(patient_id);

-- ---------------------------------------------------------------------------
-- chambers — Dr Kyana's mobile chambers across Dhaka. Edited in the admin app
-- (was the AppSheet "Chambers" tab).
-- ---------------------------------------------------------------------------
CREATE TABLE chambers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  area        TEXT NOT NULL,
  address     TEXT,
  services    TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
  schedule    TEXT NOT NULL DEFAULT '[]',      -- JSON: [{day,from,to}]
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_chambers_active ON chambers(active);

-- ---------------------------------------------------------------------------
-- drafts — agent-generated documents. ALWAYS reviewed by Dr Kyana before send
-- (status flow). markdown is the editable source; pdf_r2_key is set once
-- rendered.
-- ---------------------------------------------------------------------------
CREATE TABLE drafts (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,                   -- aftercare | clinical_note | referral | certificate | prescription | radiology
  patient_id  TEXT REFERENCES patients(id),
  intake_id   TEXT REFERENCES intakes(id),
  title       TEXT,
  markdown    TEXT NOT NULL DEFAULT '',
  citations   TEXT NOT NULL DEFAULT '[]',      -- JSON: KB sources used
  pdf_r2_key  TEXT,
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | approved | sent
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_drafts_patient ON drafts(patient_id);
CREATE INDEX idx_drafts_status  ON drafts(status);

-- ---------------------------------------------------------------------------
-- kb_docs — registry mirroring Vectorize entries (the embeddings live in
-- Vectorize; this tracks provenance + curation status).
-- ---------------------------------------------------------------------------
CREATE TABLE kb_docs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  source       TEXT,
  namespace    TEXT NOT NULL DEFAULT 'default',
  chunk_count  INTEGER NOT NULL DEFAULT 0,
  curated      INTEGER NOT NULL DEFAULT 0,     -- human-approved into the KB
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------------------------------------------------------------------------
-- sessions — chat conversation state for patient + admin agents.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                   -- 'patient' | 'admin'
  patient_id  TEXT REFERENCES patients(id),
  messages    TEXT NOT NULL DEFAULT '[]',      -- JSON: UIMessage[] (trimmed/compacted server-side)
  summary     TEXT,                            -- rolling compaction summary for long sessions
  locale      TEXT,
  ip_hash     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_sessions_patient ON sessions(patient_id);
