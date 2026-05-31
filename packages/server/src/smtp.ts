/**
 * SMTP send (server-only) — for transactional mail to ARBITRARY recipients
 * (patient OTP codes). The `cloudflare:email` `send_email` binding can only
 * deliver to VERIFIED Email Routing destination addresses, so it works for the
 * Dr-Kyana urgent-notify path (always her verified address) but NOT for patient
 * emails. This path sends through the clinic's GoDaddy Professional Email
 * mailbox over SMTP using `worker-mailer` (SMTP over Cloudflare's `connect()`
 * socket API — works in Pages Functions / Workers).
 *
 * Config (Env):
 *   SMTP_USER     — the From address AND SMTP username (the sendable GoDaddy
 *                   mailbox, e.g. "care@drkyana.com"). Falls back to
 *                   RECEPTIONIST_FROM if unset.
 *   SMTP_PASSWORD — the mailbox password (Cloudflare secret; never committed).
 *   SMTP_HOST     — default "smtpout.secureserver.net" (GoDaddy Pro Email).
 *   SMTP_PORT     — default 465 (implicit TLS). Set 587 for STARTTLS.
 *
 * Returns a discriminated result rather than throwing, so callers decide
 * whether a failure is fatal (OTP request surfaces it) or best-effort.
 */
import { WorkerMailer } from "worker-mailer";
import type { Env } from "./bindings";

const DEFAULT_SMTP_HOST = "smtpout.secureserver.net";
const DEFAULT_SMTP_PORT = 465;

export interface SmtpEmailArgs {
  to: string;
  subject: string;
  text: string;
}

export async function sendSmtpEmail(
  env: Env,
  { to, subject, text }: SmtpEmailArgs,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const from = env.SMTP_USER || env.RECEPTIONIST_FROM;
  const password = env.SMTP_PASSWORD;
  if (!from || !password) {
    return { ok: false, error: "smtp not configured" };
  }
  const host = env.SMTP_HOST || DEFAULT_SMTP_HOST;
  const port = Number(env.SMTP_PORT ?? DEFAULT_SMTP_PORT) || DEFAULT_SMTP_PORT;
  // Port 465 → implicit TLS (secure). 587 → plaintext upgraded via STARTTLS.
  const secure = port === 465;
  const startTls = port === 587;

  try {
    await WorkerMailer.send(
      {
        host,
        port,
        secure,
        startTls,
        credentials: { username: from, password },
        // GoDaddy advertises LOGIN; PLAIN is the common fallback. Offer both.
        authType: ["login", "plain"],
      },
      {
        from: { name: "Dr Kyana's Clinic", email: from },
        to,
        subject,
        text,
      },
    );
    return { ok: true, to };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "smtp send failed" };
  }
}
