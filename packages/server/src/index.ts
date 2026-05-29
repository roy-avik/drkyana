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

// Embeddings (Workers AI) for KB retrieval. Server-only.
export { embedQuery, EMBEDDING_MODEL, EMBEDDING_DIM } from "./embeddings";

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
