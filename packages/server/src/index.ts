/**
 * @drkyana/server — SERVER-ONLY. Contains prompts, tool implementations, agent
 * loops, and Cloudflare bindings. NEVER import this package (or anything under
 * it) from a client bundle. The isolation lint guard enforces this.
 *
 * Phase 0 exports the frozen contracts. Phase 1 fills in the AI SDK 6 wiring,
 * concrete tools (patient + admin), agents, and job handlers.
 */
// Enforcement of "do not import from a client bundle" is twofold:
//   1. The eslint import-boundary rule (eslint.config.js) fails the build if a
//      client app imports @drkyana/server.
//   2. Phase 1 adds `import "server-only"` at the top of the Next.js server
//      entrypoints for a runtime guard (the package is installed there).

export * from "./bindings";
export * from "./context";
export * from "./tools";
export * from "./models";
export * from "./agents";
export * from "./jobs";

// Concrete patient agent + toolset (Phase 1A). Server-only.
export { patientAgentSpec } from "./agents/patient";
export { patientTools } from "./tools/patient";

// PII hygiene for the patient loop — strips the real name out of the model path.
export { stripPatientName, type StripPatientNameResult } from "./pii";

// Cross-session activity log (admin_actions) — record + read. Server-only.
export {
  recordAdminAction,
  listAdminActions,
  type AdminActionRow,
  type ActionSurface,
} from "./audit";

// Embeddings (Workers AI) for KB retrieval + ingestion. Server-only.
export { embedQuery, embedTexts, EMBEDDING_MODEL, EMBEDDING_DIM } from "./embeddings";

// Email helper (Cloudflare Email Service `send_email` binding). Server-only.
export { sendEmail, buildRawEmail, type SendEmailArgs } from "./email";

// Patient session cookie (httpOnly, signed) — read/mint/serialize. Pure crypto,
// safe in the barrel (no sockets). Used by the patient Pages Functions.
export {
  SESSION_COOKIE_NAME,
  newPatientSessionId,
  serializeSessionCookie,
  readSessionCookie,
} from "./session";

// Patient email OTP (plan item 1) is intentionally NOT re-exported from this
// barrel. It pulls in `worker-mailer` → `cloudflare:sockets`, which the admin
// app's webpack build can't resolve. The patient Pages Functions import it
// from the dedicated subpath instead: `@drkyana/server/otp` (see package.json
// exports). Keeping it out of the barrel means the admin's `@drkyana/server`
// import never touches the SMTP socket dependency.

// KB ingestion (human-curated: chunk → embed → Vectorize upsert → kb_docs). Server-only.
export {
  ingestDoc,
  deleteDoc,
  chunkText,
  type IngestDocInput,
  type IngestResult,
} from "./kb/ingest";

// Scheduled reminder pass (cron-driven email digest). Server-only.
export {
  runReminders,
  selectReminders,
  type ReminderItem,
  type ReminderRunResult,
} from "./scheduled/reminders";

// Deep-research inference runs (plan item 5) — cron + clinician-initiated. Server-only.
export {
  runAgentRun,
  runScheduledResearch,
  type RunAgentRunOptions,
  type ScheduledResearchResult,
} from "./research";

// Concrete admin agent + toolset (Phase 1C). Server-only.
export { adminAgentSpec } from "./agents/admin";
export { adminTools } from "./tools/admin";

// Radiology subagent (vision; run inside a background job). Server-only.
export { radiologyAgentSpec } from "./agents/radiology";

// Background job runner (radiology + compile_pdf) and job IO shapes. Server-only.
export {
  jobRunner,
  type RadiologyJobInput,
  type CompilePdfJobInput,
} from "./jobs/handlers";

// Markdown → PDF (pure-JS, Workers-compatible). Server-only.
export { renderMarkdownToPdf, type RenderedPdf } from "./pdf/render";

// MCP Apps surface — admin views as interactive MCP tools + the /api/mcp
// protocol handler (docs/view-dsl.md, docs/dls.md), plus the OAuth 2.1 layer
// that lets Claude/ChatGPT native apps connect (docs/connect-agents.md).
// Server-only.
export {
  handleMcpPost,
  handleMcpMethodNotAllowed,
  viewTools,
  appActionTools,
  viewActionTools,
  buildAuthServerMetadata,
  buildProtectedResourceMetadata,
  bearerChallenge,
  registerClient,
  renderAuthorizePage,
  completeAuthorize,
  exchangeToken,
  verifyBearer,
  type AuthorizeParams,
  type BearerIdentity,
  type ViewToolOutput,
} from "./mcp";
