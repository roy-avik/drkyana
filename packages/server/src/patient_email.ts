/**
 * Patient-bound email (server-only) — reaches ARBITRARY recipients.
 *
 * Two transports, tried in order:
 *
 *  1. The Cloudflare `EMAIL` binding (sendEmail). Free and first-party — but
 *     until the drkyana.com sending domain is onboarded to Email Service it can
 *     only deliver to VERIFIED destinations (Dr Kyana's own address). Once
 *     onboarding completes, this starts succeeding for patients and the
 *     fallback naturally stops being used. No code change on that day.
 *
 *  2. SMTP via the drkyana-ops Worker, over a SERVICE-BINDING RPC
 *     (`env.OPS.sendPatientEmail`). The admin app is built with webpack, which
 *     cannot bundle worker-mailer (it imports the `cloudflare:sockets`
 *     built-in) — that is exactly why the OTP path lives behind the
 *     `@drkyana/server/otp` subpath on the Pages (esbuild) side. The ops
 *     Worker IS esbuild-bundled, so it hosts the SMTP send behind a named
 *     WorkerEntrypoint: reachable only via the service binding, never by
 *     public HTTP. Same GoDaddy mailbox that already delivers OTP codes.
 *
 * Callers see one function and a discriminated result naming the transport
 * that actually delivered — which also makes "why did this send fail" a
 * one-glance answer in the audit trail.
 */
import type { Env } from "./bindings";
import { sendEmail, type EmailAttachment } from "./email";

export interface PatientEmailArgs {
  to: string;
  subject: string;
  body: string;
  attachment?: EmailAttachment;
}

export type PatientEmailResult =
  | { ok: true; to: string; transport: "binding" | "smtp" }
  | { ok: false; error: string };

export async function deliverPatientEmail(
  env: Env,
  args: PatientEmailArgs,
): Promise<PatientEmailResult> {
  // 1. First-party binding — succeeds today only for verified destinations,
  //    for everyone once the sending domain is onboarded.
  const viaBinding = await sendEmail(env, args);
  if (viaBinding.ok) return { ok: true, to: args.to, transport: "binding" };

  // 2. SMTP via the ops Worker's EmailSender entrypoint.
  if (env.OPS) {
    try {
      const viaSmtp = await env.OPS.sendPatientEmail({
        to: args.to,
        subject: args.subject,
        text: args.body,
        attachment: args.attachment
          ? {
              filename: args.attachment.filename,
              contentBase64: args.attachment.contentBase64,
              mimeType: args.attachment.mimeType,
            }
          : undefined,
      });
      if (viaSmtp.ok) return { ok: true, to: args.to, transport: "smtp" };
      return {
        ok: false,
        error: `binding: ${viaBinding.error}; smtp: ${viaSmtp.error}`,
      };
    } catch (e) {
      return {
        ok: false,
        error: `binding: ${viaBinding.error}; ops rpc: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  return {
    ok: false,
    error: `binding: ${viaBinding.error}; no OPS service binding for smtp fallback`,
  };
}
