/**
 * send_receptionist_email — send an email as the clinic (From =
 * RECEPTIONIST_FROM) to ANY recipient, patients included.
 *
 * EXTERNAL action: needsApproval (default) — Dr Kyana approves the recipient,
 * subject, and body before anything is sent ("agent drafts; the dentist sends").
 *
 * Delivery goes through `deliverPatientEmail` (src/patient_email.ts): the
 * Cloudflare EMAIL binding first, SMTP via the drkyana-ops service binding as
 * fallback — so patient addresses work even before the sending domain is
 * onboarded. From is always the verified clinic identity, never model-supplied.
 *
 * category 'external'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { deliverPatientEmail } from "../../patient_email";

const inputSchema = z.object({
  to: z.string().email().describe("Recipient email address."),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).describe("Plain-text email body."),
});

export const sendReceptionistEmailTool = defineTool({
  name: "send_receptionist_email",
  description:
    "Send an email from Dr Kyana's clinic (receptionist@drkyana.com) to a " +
    "recipient. Use for confirmations, follow-ups, or referrals once Dr Kyana " +
    "has reviewed the content. Requires her approval before sending.",
  category: "external",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; to: string; transport: string } | { error: string }> {
    assertAdmin(ctx);
    const res = await deliverPatientEmail(ctx.env, args);
    if (!res.ok) return { error: res.error };
    return { ok: true, to: res.to, transport: res.transport };
  },
});
