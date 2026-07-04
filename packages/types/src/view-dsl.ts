/**
 * View DSL — declarative admin views for MCP Apps.
 *
 * A versioned, declarative, JSON-serializable description of an admin view.
 * The server (packages/server/src/mcp/views.ts) BUILDS documents from D1 rows;
 * the MCP App template (ui://drkyana/admin-view.html) RENDERS them inside the
 * agent host's sandboxed iframe. Because a document is pure data, the same
 * view definition can be re-rendered anywhere a renderer exists — the agent
 * host today, the admin PWA later — without shipping server code to a client.
 *
 * Full specification (grammar, action model, design tokens): docs/view-dsl.md.
 *
 * Hard rules:
 *  - Types only in this file (isolation: @drkyana/types is client-safe).
 *  - Documents carry DISPLAY data only — no prompts, no credentials, and only
 *    the PHI the view itself shows.
 *  - All interaction is expressed as ActionCalls (named MCP tool + args); the
 *    renderer never fabricates a mutation the document didn't declare.
 */

import type { DlsTone } from "./dls";

/** Current view-DSL document version. Bump on breaking grammar changes. */
export const VIEW_DSL_VERSION = 1;

// ---------------------------------------------------------------------------
// Actions — the ONLY way a rendered view causes anything to happen.
// ---------------------------------------------------------------------------

/**
 * A call to an MCP tool on the drkyana admin server, made by the view through
 * the host bridge (`tools/call`). Which tools exist — and which of them the
 * model may also call — is declared by the MCP server, not the document.
 */
export interface ActionCall {
  tool: string;
  args?: Record<string, unknown>;
}

/** Visual weight/intent of an action button or badge — a DLS tone. */
export type Tone = DlsTone;

export interface Action {
  label: string;
  call: ActionCall;
  tone?: Tone;
  /**
   * Optional confirmation prompt shown by the RENDERER before the call.
   * Independent of any approval the host itself applies to non-read tools.
   */
  confirm?: string;
  /**
   * When true (default), after the call resolves the renderer re-renders:
   * if the result carries a new view document it replaces the current one,
   * otherwise the document's `refresh` call is re-run.
   */
  refresh?: boolean;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface BadgeSpec {
  text: string;
  tone?: Tone;
}

/** Column value formatting applied by the renderer. */
export type ColumnFormat =
  | "text" // default — String(value)
  | "date" // unix seconds → local date
  | "datetime" // unix seconds → local date + time
  | "badge" // value or BadgeSpec rendered as a chip
  | "chips" // string[] rendered as a row of chips
  | "number";

export interface TableColumn {
  /** Key into each row object. */
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: "start" | "end";
}

/** A row is plain display data; `badge` cells may hold a BadgeSpec. */
export type TableRow = Record<string, unknown>;

export interface TableNode {
  type: "table";
  columns: TableColumn[];
  rows: TableRow[];
  /**
   * Makes rows clickable: the renderer calls `call.tool` with `call.args`
   * merged with `{ [argKey]: row[rowKey] }` — typically opening a detail view.
   */
  onRowOpen?: { call: ActionCall; argKey: string; rowKey: string };
  /** Per-row accent, keyed by row index (e.g. RED triage rows). */
  rowTones?: Record<number, Tone>;
  empty?: string;
}

/** Label/value pairs — the record-detail workhorse. */
export interface KeyValueNode {
  type: "keyvalue";
  items: {
    label: string;
    value: string | number | null;
    format?: ColumnFormat;
    tone?: Tone;
  }[];
  /** Columns hint for wide containers (renderer may ignore). Default 2. */
  columns?: 1 | 2 | 3;
}

export interface TextNode {
  type: "text";
  text: string;
  muted?: boolean;
}

/** Markdown body (drafts, summaries). Renderer sanitizes; no raw HTML. */
export interface MarkdownNode {
  type: "markdown";
  markdown: string;
}

export interface BadgesNode {
  type: "badges";
  badges: BadgeSpec[];
}

/** Inline notice (errors, guardrail reminders, empty states). */
export interface CalloutNode {
  type: "callout";
  tone: Tone;
  text: string;
}

export interface ActionsNode {
  type: "actions";
  actions: Action[];
}

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "checkbox"
  | "hidden";

export interface FormField {
  /** Becomes a key in the submit call's args. */
  name: string;
  label?: string;
  type: FormFieldType;
  value?: string | number | boolean | null;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Parse the submitted string as JSON before adding to args (arrays etc.). */
  json?: boolean;
}

/**
 * A form whose submission is `submit.call` with args = fixed `submit.call.args`
 * merged with the field values (field names win nothing — fixed args take
 * precedence so a document can pin e.g. the record id).
 */
export interface FormNode {
  type: "form";
  title?: string;
  fields: FormField[];
  submit: Action;
}

export interface SectionNode {
  type: "section";
  title?: string;
  children: ViewNode[];
}

export type ViewNode =
  | SectionNode
  | TableNode
  | KeyValueNode
  | TextNode
  | MarkdownNode
  | BadgesNode
  | CalloutNode
  | ActionsNode
  | FormNode;

// ---------------------------------------------------------------------------
// Document root
// ---------------------------------------------------------------------------

export interface ViewDocument {
  /** View-DSL version — renderers must reject documents newer than they know. */
  v: typeof VIEW_DSL_VERSION;
  /** Stable view identity, e.g. "intake_queue", "draft_review". */
  key: string;
  title: string;
  subtitle?: string;
  badges?: BadgeSpec[];
  /** Re-run to rebuild this exact document (used after write actions). */
  refresh?: ActionCall;
  children: ViewNode[];
}

/**
 * Envelope every view tool returns as its `structuredContent`. The renderer
 * looks for `view`; the model reads the compact `summary` text content that
 * accompanies it.
 */
export interface ViewToolResult {
  view: ViewDocument;
}
