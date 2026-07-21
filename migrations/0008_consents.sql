-- Patient consent records (Bangladesh PDPA 2026).
--
-- WHY a table and not a boolean on `sessions`: the law treats different
-- purposes differently, so a single blanket "I agree" will not hold. Each
-- purpose is its own row with its own withdrawal, and the record must survive
-- the session that created it.
--
-- WHY policy_version + text_sha256: proving someone consented is worthless
-- without proving WHAT they consented to. The version is a server-side
-- constant bumped whenever the wording changes; the hash pins the canonical
-- (English) text of that version so a later edit cannot silently rewrite
-- history. `locale` records which translation the patient actually read.
--
-- Written in the SAME D1 batch as OTP consumption + the session upsert (see
-- packages/server/src/lib/mail_otp.ts), so a verified session can never exist
-- without its consent rows.
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id),  -- NULL until the intake links one
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,                      -- the verified identity that consented
  scope TEXT NOT NULL,                      -- 'care' | 'ai_inference' | 'email' | 'mcp_third_party'
  policy_version TEXT NOT NULL,
  text_sha256 TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  ip_hash TEXT,
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  withdrawn_at INTEGER                      -- NULL = currently in force
);

-- The hot read: "is this scope currently in force for this identity?" — run on
-- every patient agent turn, so it must not table-scan.
CREATE INDEX IF NOT EXISTS idx_consents_email_scope ON consents (email, scope, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consents_session ON consents (session_id);
CREATE INDEX IF NOT EXISTS idx_consents_patient ON consents (patient_id);
