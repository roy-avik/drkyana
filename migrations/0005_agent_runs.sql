-- Dr Kyana clinical agent platform — agent_runs (plan item 5).
-- Apply: npx wrangler d1 execute drkyana --remote --file=migrations/0005_agent_runs.sql
-- Local validation: npx wrangler d1 execute drkyana --local --file=migrations/0005_agent_runs.sql
--
-- Conventions (carried from 0001-0004):
--   * IDs are TEXT (UUID, server-generated).
--   * Timestamps are INTEGER unix epoch seconds (DEFAULT unixepoch()).
--   * JSON-shaped columns store TEXT; parse server-side against @drkyana/types.
--
-- Idempotent-friendly: CREATE TABLE/INDEX use IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- agent_runs — record of a scheduled or clinician-initiated INFERENCE run
-- (deep research over practice data). Distinct from `jobs` (KV-backed, for
-- radiology/PDF which return artifacts the UI polls) — agent_runs persist the
-- run + its TOKEN/COST accounting in D1 so Dr Kyana has spend visibility on
-- the expensive Sonnet analyses.
--
-- First kind: 'intake_patterns' (review recent intakes for patterns). The
-- table is shaped around provenance + cost, not content, so new kinds plug in
-- without schema changes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                    -- 'intake_patterns' (extensible)
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | error
  input_json    TEXT NOT NULL DEFAULT '{}',       -- the run's parameters
  output_md     TEXT NOT NULL DEFAULT '',         -- the synthesized result (markdown)
  model_id      TEXT,                             -- model used, e.g. claude-sonnet-4-6
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,          -- estimated, from per-model pricing
  error         TEXT,
  initiated_by  TEXT NOT NULL,                    -- admin email, or 'cron' for scheduled
  started_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_kind    ON agent_runs(kind);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status  ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at);
