-- Dr Kyana clinical agent platform — clinical_assists (plan item 4).
-- Apply: npx wrangler d1 execute drkyana --remote --file=migrations/0004_clinical_assists.sql
-- Local validation: npx wrangler d1 execute drkyana --local --file=migrations/0004_clinical_assists.sql
--
-- Conventions (carried from 0001/0002/0003):
--   * IDs are TEXT (UUID, server-generated).
--   * Timestamps are INTEGER unix epoch seconds (DEFAULT unixepoch()).
--   * JSON-shaped columns store TEXT; parse server-side against @drkyana/types.
--
-- Idempotent-friendly: CREATE TABLE/INDEX use IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- clinical_assists — audit-grade record of AI-generated clinical reasoning
-- attached to an intake. The first `kind` is 'differential_diagnosis' (item 4);
-- the table is shaped to host future kinds (e.g. radiology re-reads, treatment-
-- plan drafts) without schema changes.
--
-- Provenance columns (model_id, prompt_hash, initiated_by, disclaimer_persisted)
-- are the liability shape the Plan agent's pushback called for. Every row is
-- discoverable; every row carries its model, the exact prompt (by hash), who
-- asked for it, and an "AI-assisted, not a diagnosis" banner Dr Kyana sees.
--
-- Supersede columns (superseded_by_clinician_note, superseded_by, superseded_at)
-- record Dr Kyana's authoritative override. The AI draft stays in the row for
-- audit; the supersede note is what Dr Kyana's clinical record reflects.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_assists (
  id                            TEXT PRIMARY KEY,
  patient_id                    TEXT NOT NULL REFERENCES patients(id),
  intake_id                     TEXT REFERENCES intakes(id),
  kind                          TEXT NOT NULL,           -- 'differential_diagnosis' (item 4); extensible
  model_id                      TEXT NOT NULL,           -- e.g. claude-sonnet-4-6
  prompt_hash                   TEXT NOT NULL,           -- SHA-256(system + user) — pins exact prompt version
  output_markdown               TEXT NOT NULL DEFAULT '',
  citations                     TEXT NOT NULL DEFAULT '[]',  -- JSON: KB sources used (DraftCitation[])
  disclaimer_persisted          INTEGER NOT NULL DEFAULT 1,  -- 1 = the AI-assisted banner is shown in admin UI
  initiated_by                  TEXT NOT NULL,           -- admin email (verified Access JWT)
  superseded_by_clinician_note  TEXT,                    -- nullable; Dr Kyana's authoritative note
  superseded_by                 TEXT,                    -- admin email of the clinician who superseded
  superseded_at                 INTEGER,                 -- unix epoch seconds
  created_at                    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at                    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_clinical_assists_patient ON clinical_assists(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_assists_intake  ON clinical_assists(intake_id);
CREATE INDEX IF NOT EXISTS idx_clinical_assists_kind    ON clinical_assists(kind);
CREATE INDEX IF NOT EXISTS idx_clinical_assists_created ON clinical_assists(created_at);
