/**
 * send_receptionist_email — send an email as receptionist@drkyana.com via the
 * Cloudflare Email Service `send_email` binding (From = RECEPTIONIST_FROM).
 *
 * EXTERNAL action: needsApproval (default) — Dr Kyana approves the recipient,
 * subject, and body before anything is sent ("agent drafts; the dentist sends").
 *
 * Delegates message construction + sending to the shared `sendEmail` helper
 * (src/email.ts), which always sets From to the verified RECEPTIONIST_FROM —
 * never a model-supplied sender.
 *
 * category 'external'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { sendEmail } from "../../email";

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
  ): Promise<{ ok: true; to: string } | { error: string }> {
    assertAdmin(ctx);
    const res = await sendEmail(ctx.env, args);
    if (!res.ok) return { error: res.error };
    return { ok: true, to: res.to };
  },
});
