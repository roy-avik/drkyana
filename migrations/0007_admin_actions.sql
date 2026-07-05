-- Cross-session activity log: every WRITE action on the practice, from every
-- surface (in-app assistant, in-app view clicks, MCP hosts like the Claude /
-- ChatGPT apps), lands here — so any later agent session can read what
-- happened elsewhere ("she confirmed that appointment from her phone").
-- Detail is PHI-lean by construction: id-ish/short args only, never document
-- bodies (see packages/server/src/audit.ts).
CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,            -- verified email of who acted
  surface TEXT NOT NULL,          -- 'agent' | 'mcp' | 'app-view'
  tool TEXT NOT NULL,             -- tool name that executed
  detail TEXT NOT NULL DEFAULT '{}', -- filtered JSON args (short primitives only)
  at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_at ON admin_actions (at DESC);
