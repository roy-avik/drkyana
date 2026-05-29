/**
 * send_receptionist_email — send an email as receptionist@drkyana.com via the
 * Cloudflare Email Service `send_email` binding (From = RECEPTIONIST_FROM).
 *
 * EXTERNAL action: needsApproval (default) — Dr Kyana approves the recipient,
 * subject, and body before anything is sent ("agent drafts; the dentist sends").
 *
 * The `send_email` binding accepts an EmailMessage built from a raw RFC 5322
 * message. We construct a minimal text/plain message inline (no extra deps) and
 * set From to the verified RECEPTIONIST_FROM — never a model-supplied sender.
 *
 * category 'external'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const inputSchema = z.object({
  to: z.string().email().describe("Recipient email address."),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).describe("Plain-text email body."),
});

function buildRawMessage(from: string, to: string, subject: string, body: string): string {
  // Encode the Subject as RFC 2047 to keep non-ASCII (Bengali/Farsi) intact.
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const date = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@drkyana.com>`;
  return [
    `From: Dr Kyana's Clinic <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodedSubject}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n");
}

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
    const from = ctx.env.RECEPTIONIST_FROM;
    if (!ctx.env.EMAIL || !from) {
      return { error: "email binding not configured" };
    }

    const raw = buildRawMessage(from, args.to, args.subject, args.body);
    // The send_email binding expects an EmailMessage(from, to, raw). We pass a
    // structured object the runtime accepts; the Worker's EmailMessage ctor is
    // resolved at the binding layer.
    try {
      await ctx.env.EMAIL.send({ from, to: args.to, raw });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "send failed" };
    }
    return { ok: true, to: args.to };
  },
});
