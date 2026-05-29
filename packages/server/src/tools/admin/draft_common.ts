/**
 * Shared plumbing for the draft_* tools.
 *
 * Each draft tool gathers structured source data (intake + patient memory + KB
 * citations), asks the model to RENDER markdown for that document type with a
 * tight server-only prompt, then persists a `drafts` row (status 'draft') so it
 * surfaces in the admin's review/edit/send surface. The tools are category
 * 'read' (no approval gate) because they only PRODUCE TEXT — sending/finalizing
 * is a separate approval-gated action ("agent drafts; the dentist sends").
 *
 * Clinical safety: prompts forbid inventing facts or asserting diagnoses, and
 * every clinical document carries a draft/disclaimer line for Dr Kyana's review.
 */
import { generateText } from "ai";
import type { DraftCitation, DraftType, Locale } from "@drkyana/types";
import type { AgentContext } from "../../context";
import { modelFor } from "../../models";
import { kbSearchTool } from "./kb_search";

export const DRAFT_DISCLAIMER =
  "This is an AI-assisted DRAFT for Dr Kyana's review. It is not a diagnosis and " +
  "must be verified and approved by the licensed dentist before it is shared.";

const LANG_LABEL: Record<Locale, string> = {
  en: "English",
  bn: "Bengali (বাংলা)",
  fa: "Persian/Farsi (فارسی)",
};

export function langLabel(lang: Locale): string {
  return LANG_LABEL[lang] ?? "English";
}

/** Run a KB lookup (best-effort) and return citations for grounding a draft. */
export async function gatherCitations(
  ctx: AgentContext,
  query: string,
  topK = 4,
): Promise<DraftCitation[]> {
  try {
    const res = await kbSearchTool.execute({ query, topK }, ctx);
    const matches = (res as { matches?: { kbDocId: string; title: string; snippet?: string }[] }).matches ?? [];
    return matches.map((m) => ({
      kbDocId: m.kbDocId,
      title: m.title,
      snippet: m.snippet,
    }));
  } catch {
    return [];
  }
}

/** Compose a draft's markdown via the standard-tier model with a server prompt. */
export async function renderDraft(
  ctx: AgentContext,
  opts: { system: string; prompt: string },
): Promise<string> {
  const { text } = await generateText({
    model: modelFor(ctx.env, "standard"),
    system: opts.system,
    prompt: opts.prompt,
    abortSignal: ctx.abortSignal,
  });
  return text.trim();
}

export interface PersistedDraft {
  ok: true;
  draftId: string;
  type: DraftType;
  title: string;
  markdown: string;
  citations: DraftCitation[];
}

/** Insert a draft row (status 'draft') and return a compact handle for the UI. */
export async function persistDraft(
  ctx: AgentContext,
  args: {
    type: DraftType;
    title: string;
    markdown: string;
    citations: DraftCitation[];
    patientId?: string | null;
    intakeId?: string | null;
  },
): Promise<PersistedDraft> {
  const draftId = `dr_${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  await ctx.env.DB.prepare(
    "INSERT INTO drafts (id, type, patient_id, intake_id, title, markdown, citations, status, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
  )
    .bind(
      draftId,
      args.type,
      args.patientId ?? null,
      args.intakeId ?? null,
      args.title,
      args.markdown,
      JSON.stringify(args.citations),
      now,
      now,
    )
    .run();

  return {
    ok: true,
    draftId,
    type: args.type,
    title: args.title,
    markdown: args.markdown,
    citations: args.citations,
  };
}

/** Compact, model-safe view of an intake for prompt grounding (no audit noise). */
export function intakeForPrompt(intake: {
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  affected_area?: string | null;
  symptoms?: string | null;
  duration?: string | null;
  severity?: number | null;
  triggers?: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  last_dental_visit?: string | null;
  anxiety?: string | null;
  triage_level?: string | null;
}): string {
  const lines = [
    `Name: ${intake.name ?? "(unknown)"}`,
    `Age/Gender: ${intake.age ?? "?"} / ${intake.gender ?? "?"}`,
    `Affected area: ${intake.affected_area ?? "(none recorded)"}`,
    `Symptoms: ${intake.symptoms ?? "(none recorded)"}`,
    `Duration: ${intake.duration ?? "?"}`,
    `Severity (0-10): ${intake.severity ?? "?"}`,
    `Triggers: ${intake.triggers ?? "(none)"}`,
    `Conditions: ${intake.conditions.join(", ") || "(none reported)"}`,
    `Allergies: ${intake.allergies.join(", ") || "(none reported)"}`,
    `Medications: ${intake.medications.join(", ") || "(none reported)"}`,
    `Last dental visit: ${intake.last_dental_visit ?? "?"}`,
    `Anxiety: ${intake.anxiety ?? "?"}`,
    `Triage level: ${intake.triage_level ?? "?"}`,
  ];
  return lines.join("\n");
}
