/**
 * draft_followup — a short follow-up message for a patient over a chosen channel
 * (SMS/WhatsApp/email), drafted from an intake. Returns the text inline for the
 * agent to surface; it is NOT persisted as a clinical `drafts` row (it's a brief
 * message, not a document type) and it does NOT send — sending is the separate
 * approval-gated send_receptionist_email tool.
 *
 * category 'read': produces TEXT only, no side effect, no approval gate.
 */
import { z } from "zod";
import type { Locale } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchIntake } from "./shared";
import { renderDraft, langLabel } from "./draft_common";

const inputSchema = z.object({
  intakeId: z.string().min(1).describe("The intake to follow up on."),
  channel: z
    .enum(["sms", "whatsapp", "email"])
    .describe("Channel the message is for — sets length and tone."),
  lang: z
    .enum(["en", "bn", "fa"])
    .optional()
    .describe("Language for the message (defaults to the session locale)."),
});

const SYSTEM =
  "You draft brief, warm patient FOLLOW-UP messages for Dr Kyana's dental " +
  "practice in Dhaka (brand: 'Modern dentistry. Considered care.'). Match the " +
  "channel: SMS/WhatsApp = 1-3 short sentences, no markdown; email = a short " +
  "greeting + body + sign-off. Do NOT quote prices or give clinical advice; " +
  "invite the patient to reply or book. Use only facts supplied.";

export interface FollowupResult {
  channel: "sms" | "whatsapp" | "email";
  subject?: string;
  body: string;
}

export const draftFollowupTool = defineTool({
  name: "draft_followup",
  description:
    "Draft a short follow-up message for a patient over SMS, WhatsApp, or email, " +
    "from an intake. Returns the message text for Dr Kyana to review — sends " +
    "nothing (use send_receptionist_email to actually send, which needs approval).",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<FollowupResult | { error: string }> {
    assertAdmin(ctx);
    const intake = await fetchIntake(ctx.env, args.intakeId);
    if (!intake) return { error: `intake not found: ${args.intakeId}` };

    const lang: Locale = args.lang ?? ctx.locale ?? "en";
    const text = await renderDraft(ctx, {
      system: SYSTEM,
      prompt:
        `Channel: ${args.channel}. Language: ${langLabel(lang)}.\n` +
        `Patient name: ${intake.name ?? "(unknown)"}\n` +
        `Their complaint: ${intake.affected_area ?? ""} — ${intake.symptoms ?? ""}\n` +
        `Triage: ${intake.triage_level ?? "?"}; status: ${intake.status}.\n\n` +
        `Write the follow-up message.${args.channel === "email" ? " Begin with a 'Subject:' line." : ""}`,
    });

    if (args.channel === "email") {
      const match = /^subject:\s*(.+)$/im.exec(text);
      const subject = match ? match[1].trim() : "Following up from Dr Kyana's clinic";
      const body = text.replace(/^subject:\s*.+$/im, "").trim();
      return { channel: "email", subject, body };
    }
    return { channel: args.channel, body: text };
  },
});
