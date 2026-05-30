/**
 * differential_diagnosis — clinician-initiated DDx for an intake.
 *
 * The agent calls this when Dr Kyana explicitly asks for a differential
 * ("give me a differential for X", "what could this be"). The tool fetches
 * the intake + patient memory, grounds against the curated KB via Workers AI
 * embeddings, calls Sonnet with a focused DDx system prompt, and persists the
 * output to `clinical_assists` with full provenance:
 *
 *   model_id     — exact Claude model id used
 *   prompt_hash  — SHA-256(system + user) — pins the prompt version
 *   initiated_by — verified admin email from the Access JWT
 *   citations    — KB sources used (empty if KB is empty or unavailable)
 *   disclaimer_persisted = 1 — the "AI-assisted, not a diagnosis" banner
 *                              renders in the admin UI above every assist
 *
 * category 'write' → AI SDK approval gate fires before the model is invoked.
 * The gate IS the clinician's explicit initiation moment — it's the audit
 * trail for "Dr Kyana asked for this DDx".
 *
 * The output never reaches a patient surface. Patients have given consent at
 * the OTP step (plan item 1) for internal AI-assisted workflow — that's the
 * disclosure that covers this feature.
 */
import { z } from "zod";
import { generateText } from "ai";
import type { DraftCitation } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { modelFor, MODEL_IDS } from "../../models";
import { embedQuery } from "../../embeddings";
import { fetchIntake, fetchPatientMemory } from "./shared";

const SYSTEM = `You are a dental clinical reasoning assistant for Dr Kyana, a dental surgeon in Dhaka. Given an intake, produce a differential — a list of CANDIDATE conditions Dr Kyana should consider when she sees the patient. This is NOT a diagnosis. It is a thinking aid for a licensed clinician.

CRITICAL RULES — never break these:
- Never assert "this is X". Always "consider X", "possible X", "X is likely given Y".
- 3–5 candidates max, ranked by likelihood given the presenting features.
- Per candidate: short rationale, supporting features from THIS intake, and the clinical exam findings or tests that would confirm or rule out.
- Surface RED FLAGS — referral-worthy or hospital-now signs.
- Note HISTORY FACTORS — medications, conditions, allergies, anxiety that change assessment or treatment planning.
- Cite KB sources inline as [N] using the indices provided. Do not fabricate sources.
- End with NEXT STEPS — specific exam cues, imaging, or tests for the appointment.

OUTPUT FORMAT (GitHub-flavored markdown, no preamble, no banner — the admin UI adds the "AI-assisted, not a diagnosis" banner):

## Differential
1. **Condition** — rationale. Supporting features: ... Confirm/rule-out: ...
2. ...

## Red flags
- ...

## History factors
- ...

## Next steps in appointment
- ...

Keep it concise. Dr Kyana reads this in ~30 seconds before she sees the patient.`;

const inputSchema = z.object({
  intake_id: z.string().min(1).describe("The intake to reason about."),
  focus: z
    .string()
    .optional()
    .describe(
      "Optional narrowing — e.g. 'focus on the recurring lower-right sensitivity' " +
        "if Dr Kyana wants a targeted DDx rather than a full one.",
    ),
});

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DifferentialDiagnosisResult {
  assistId: string;
  modelId: string;
  promptHash: string;
  output: string;
  citations: DraftCitation[];
}

export const differentialDiagnosisTool = defineTool({
  name: "differential_diagnosis",
  description:
    "Produce a differential diagnosis (DDx) for an intake — a list of CANDIDATE " +
    "conditions Dr Kyana should consider, with rationale, supporting features, and " +
    "confirm/rule-out cues. CLINICIAN-INITIATED ONLY: call this only when Dr Kyana " +
    'explicitly asks ("give me a differential for X", "what could this be"). The ' +
    "output is persisted to clinical_assists with provenance (model id, prompt " +
    "hash, initiator) and an \"AI-assisted, not a diagnosis\" disclaimer banner Dr " +
    "Kyana sees in the admin UI. She can supersede with her own clinical note. " +
    "Output is never shown to the patient. The approval gate fires before the " +
    "model is invoked — that gate IS the audit trail for the explicit clinician " +
    "initiation.",
  category: "write",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<DifferentialDiagnosisResult> {
    assertAdmin(ctx);
    const env = ctx.env;
    const now = Math.floor(Date.now() / 1000);

    const intake = await fetchIntake(env, args.intake_id);
    if (!intake) throw new Error(`intake not found: ${args.intake_id}`);
    if (!intake.patient_id) {
      throw new Error(
        "intake has no patient — submit_intake must have completed first",
      );
    }
    const patient = await fetchPatientMemory(env, intake.patient_id);

    // KB grounding — embed the complaint and pull the top matches as cite-able
    // context. Failure is non-fatal: an empty KB or unavailable AI binding
    // means the DDx proceeds without citations rather than aborting.
    let citations: DraftCitation[] = [];
    let kbContext = "";
    const queryText = [
      intake.affected_area ?? "",
      intake.symptoms ?? "",
      intake.duration ?? "",
      args.focus ?? "",
    ]
      .filter((s) => s.length > 0)
      .join(" — ");
    if (queryText.trim().length > 0) {
      try {
        const vec = await embedQuery(env, queryText);
        const { matches } = await env.VECTORIZE.query(vec, {
          topK: 5,
          returnMetadata: "all",
        });
        citations = (matches ?? []).map((m, idx) => {
          const md = (m.metadata ?? {}) as Record<string, unknown>;
          return {
            kbDocId: typeof md.docId === "string" ? md.docId : m.id,
            title: typeof md.title === "string" ? md.title : `Source ${idx + 1}`,
            snippet:
              typeof md.text === "string" ? md.text.slice(0, 320) : undefined,
          };
        });
        kbContext = citations
          .map(
            (c, i) =>
              `[${i + 1}] ${c.title}${c.snippet ? `: ${c.snippet}` : ""}`,
          )
          .join("\n");
      } catch {
        citations = [];
        kbContext = "";
      }
    }

    const userPrompt = [
      `Intake id: ${intake.id}`,
      `Patient: ${intake.name ?? "(unnamed)"} · age ${
        intake.age ?? "n/a"
      } · ${intake.gender ?? "unspecified"}`,
      ``,
      `## Presenting complaint`,
      `Area: ${intake.affected_area ?? "n/a"}`,
      `Symptoms: ${intake.symptoms ?? "n/a"}`,
      `Duration: ${intake.duration ?? "n/a"}`,
      `Severity: ${intake.severity ?? "n/a"}/10`,
      `Triggers: ${intake.triggers ?? "n/a"}`,
      intake.raw_message ? `Patient's own words: "${intake.raw_message}"` : "",
      ``,
      `## History (from intake)`,
      `Conditions: ${intake.conditions.join(", ") || "none reported"}`,
      `Allergies: ${intake.allergies.join(", ") || "none reported"}`,
      `Medications: ${intake.medications.join(", ") || "none reported"}`,
      `Anxiety: ${intake.anxiety ?? "n/a"}`,
      `Last dental visit: ${intake.last_dental_visit ?? "n/a"}`,
      ``,
      patient
        ? [
            `## Patient longitudinal record`,
            patient.summary || "(no summary)",
            ``,
            `Recurring complaints: ${
              patient.memory.recurring_complaints.join(", ") || "none"
            }`,
            `Flags: ${patient.memory.flags.join(", ") || "none"}`,
          ].join("\n")
        : "",
      ``,
      `## Triage`,
      `Level: ${intake.triage_level ?? "n/a"} · Action: ${
        intake.triage_action ?? "n/a"
      }`,
      ``,
      args.focus ? `## Focus (from Dr Kyana)\n${args.focus}\n` : "",
      kbContext
        ? `## Curated KB matches (cite as [N])\n${kbContext}\n`
        : "## Curated KB matches\n(none returned)\n",
    ]
      .filter((p) => p.length > 0)
      .join("\n");

    const modelId = MODEL_IDS.standard;
    const promptHash = await sha256Hex(`${SYSTEM}\n\n${userPrompt}`);

    // --- Idempotency guard ---
    // If a row for this (intake, prompt_hash) already exists, return it instead
    // of regenerating. The hash pins the exact prompt — same intake + same focus
    // + same KB context = same DDx, so re-running just burns Sonnet tokens and
    // creates a duplicate row. The guard also covers the auto-resume re-fire
    // pattern that produced duplicates prior to the persistence fix in
    // streamAgent.
    const existing = await env.DB.prepare(
      "SELECT id, output_markdown, citations FROM clinical_assists " +
        "WHERE intake_id = ? AND prompt_hash = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(intake.id, promptHash)
      .first<{ id: string; output_markdown: string; citations: string }>();
    if (existing) {
      let parsedCitations: DraftCitation[] = [];
      try {
        const v = JSON.parse(existing.citations) as DraftCitation[];
        if (Array.isArray(v)) parsedCitations = v;
      } catch {
        /* keep empty */
      }
      return {
        assistId: existing.id,
        modelId,
        promptHash,
        output: existing.output_markdown,
        citations: parsedCitations,
      };
    }

    const { text: output } = await generateText({
      model: modelFor(env, "standard"),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      abortSignal: ctx.abortSignal,
    });

    const assistId = crypto.randomUUID();
    const initiatedBy =
      ctx.caller.kind === "admin" ? ctx.caller.email : "system";

    await env.DB.prepare(
      "INSERT INTO clinical_assists (id, patient_id, intake_id, kind, model_id, " +
        "prompt_hash, output_markdown, citations, disclaimer_persisted, " +
        "initiated_by, created_at, updated_at) " +
        "VALUES (?, ?, ?, 'differential_diagnosis', ?, ?, ?, ?, 1, ?, ?, ?)",
    )
      .bind(
        assistId,
        intake.patient_id,
        intake.id,
        modelId,
        promptHash,
        output,
        JSON.stringify(citations),
        initiatedBy,
        now,
        now,
      )
      .run();

    return { assistId, modelId, promptHash, output, citations };
  },
});
