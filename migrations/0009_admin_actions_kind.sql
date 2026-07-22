-- PHI access logging (Phase 0.8).
--
-- admin_actions (0007) records WRITES on the practice for cross-session
-- continuity. Compliance also needs the READS: who looked at which patient's
-- data. Rather than a second table, add a `kind` discriminator — 'write' (the
-- existing rows, and the default) vs 'read' (a logged PHI access).
--
-- The get_recent_activity feed stays writes-only (kind = 'write') so it keeps
-- signalling state changes; the read rows accumulate for audit and are queried
-- separately.
--
-- ALTER ADD COLUMN is one-shot — re-applying errors "duplicate column name"
-- (harmless; the migration runner tracks it so it never re-runs).
ALTER TABLE admin_actions ADD COLUMN kind TEXT NOT NULL DEFAULT 'write';

-- Index the compliance read: "recent accesses" filters by kind, newest first.
CREATE INDEX IF NOT EXISTS idx_admin_actions_kind ON admin_actions (kind, at DESC);
