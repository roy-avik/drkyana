-- Dr Kyana clinical agent platform — scheduling + transcript linkage.
-- Apply: npx wrangler d1 execute drkyana --file=migrations/0002_scheduling.sql
-- Local validation: npx wrangler d1 execute drkyana --local --file=migrations/0002_scheduling.sql
--
-- Conventions (carried from 0001_init.sql):
--   * IDs are TEXT (UUID/prefixed, generated server-side).
--   * Timestamps are INTEGER unix epoch seconds (DEFAULT unixepoch()).
--   * JSON-shaped columns store TEXT; parse server-side against packages/types.
--
-- Idempotent-friendly: CREATE TABLE/INDEX use IF NOT EXISTS. The intakes
-- ALTER is guarded by a re-runnable pattern (see note below).

-- ---------------------------------------------------------------------------
-- appointments — a concrete scheduled (or proposed) visit. Distinct from the
-- intake's REQUESTED logistics (preferred_area/days/time): an intake is what
-- the patient SOUGHT; an appointment is what was GRANTED. Many appointments
-- can hang off one patient; an appointment may (but need not) link to the
-- originating intake and a chamber.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  intake_id     TEXT REFERENCES intakes(id),
  chamber_id    TEXT REFERENCES chambers(id),
  scheduled_at  INTEGER NOT NULL,                 -- unix epoch seconds of the slot
  duration_min  INTEGER NOT NULL DEFAULT 30,
  status        TEXT NOT NULL DEFAULT 'proposed', -- proposed | confirmed | completed | cancelled | no_show
  note          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_appointments_patient   ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status    ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);

-- ---------------------------------------------------------------------------
-- appointment_events — append-only history of every state change on an
-- appointment (created / rescheduled / confirmed / cancelled / completed /
-- no_show). `detail` is JSON ({ prev, next, reason }); `actor` is the admin
-- email that performed the action. This is the reschedule/cancel audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointment_events (
  id              TEXT PRIMARY KEY,
  appointment_id  TEXT NOT NULL REFERENCES appointments(id),
  type            TEXT NOT NULL,                  -- created | rescheduled | confirmed | cancelled | completed | no_show
  detail          TEXT,                           -- JSON: { prevSlot?, nextSlot?, reason?, prevStatus?, nextStatus? }
  actor           TEXT,                           -- admin email (from verified Access JWT)
  at              INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_appointment_events_appt ON appointment_events(appointment_id);

-- ---------------------------------------------------------------------------
-- intakes.session_id — link an intake back to the conversation that produced
-- it, so the admin can read the originating transcript from the intake detail.
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; this statement is a no-op-on-rerun
-- only insofar as D1 will error "duplicate column name" on a second apply.
-- That error is harmless (the column already exists) — re-running the rest of
-- this file is still safe thanks to IF NOT EXISTS above.
-- ---------------------------------------------------------------------------
ALTER TABLE intakes ADD COLUMN session_id TEXT;
