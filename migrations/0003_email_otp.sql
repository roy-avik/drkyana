-- Dr Kyana clinical agent platform — patient email OTP verification (plan item 1).
-- Apply: npx wrangler d1 execute drkyana --remote --file=migrations/0003_email_otp.sql
-- Local validation: npx wrangler d1 execute drkyana --local --file=migrations/0003_email_otp.sql
--
-- Conventions (carried from 0001_init.sql, 0002_scheduling.sql):
--   * IDs are TEXT (UUID, generated server-side).
--   * Timestamps are INTEGER unix epoch seconds (DEFAULT unixepoch()).
--   * IF NOT EXISTS where SQLite supports it; ALTER TABLE ADD COLUMN is naturally
--     one-shot — re-applying this file yields a "duplicate column name" error on
--     the ALTERs, which is harmless (the columns already exist).

-- ---------------------------------------------------------------------------
-- email_otps — short-lived (10 min) verification codes for the patient surface.
-- One row per code issuance. `code_hash` is SHA-256(code + IP_HASH_SALT) — the
-- raw code only ever exists in the email body and the verifier's input.
-- `session_id` ties the verification to the originating chat session so a code
-- issued for one session can't be replayed against another.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_otps (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,        -- SHA-256 hex of (code + IP_HASH_SALT)
  ip_hash      TEXT,                 -- requesting IP (hashed) for per-IP rate limiting
  attempts     INTEGER NOT NULL DEFAULT 0,
  issued_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL,     -- issued_at + 600s (10 min)
  consumed_at  INTEGER                -- set on successful verify (null until then)
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email   ON email_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_otps_session ON email_otps(session_id);
CREATE INDEX IF NOT EXISTS idx_email_otps_ip      ON email_otps(ip_hash);
CREATE INDEX IF NOT EXISTS idx_email_otps_issued  ON email_otps(issued_at);

-- ---------------------------------------------------------------------------
-- patients.email_verified_at — set when a patient row was last linked to a
-- verified email (via OTP). Older rows (pre-OTP) stay NULL — they were keyed
-- on phone alone. New submissions (post-OTP) MUST have this set.
-- ---------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN email_verified_at INTEGER;

-- ---------------------------------------------------------------------------
-- sessions.verified_email + sessions.email_verified_at — per-session
-- verification state. The Pages Function reads these when constructing the
-- patient AgentContext on each request; submit_intake gates on the presence of
-- verified_email in the context, so the gate survives across agent turns
-- without trusting model-supplied args.
-- ---------------------------------------------------------------------------
ALTER TABLE sessions ADD COLUMN verified_email TEXT;
ALTER TABLE sessions ADD COLUMN email_verified_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_sessions_verified_email ON sessions(verified_email);
