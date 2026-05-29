/**
 * Email helper (server-only).
 *
 * One place that builds an RFC 5322 text/plain message and hands it to the
 * Cloudflare Email Service `send_email` binding. Used by:
 *   - the `send_receptionist_email` admin tool (agent drafts; dentist approves),
 *   - the urgent-intake notification (submit_intake, best-effort),
 *   - the scheduled reminders cron.
 *
 * The From is ALWAYS the verified RECEPTIONIST_FROM — never a model- or
 * caller-supplied sender. The Subject is RFC 2047 encoded so Bengali/Farsi text
 * survives. No external deps (Workers runtime has btoa/crypto).
 */
import type { Env } from "./bindings";

function encodeSubject(subject: string): string {
  // RFC 2047 base64 "encoded-word" — keeps non-ASCII (Bengali/Farsi) intact.
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
}

/** Build a minimal RFC 5322 text/plain message from a verified sender. */
export function buildRawEmail(
  from: string,
  to: string,
  subject: string,
  body: string,
): string {
  const date = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@drkyana.com>`;
  return [
    `From: Dr Kyana's Clinic <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeSubject(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n");
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
}

/**
 * Send a text/plain email via the `EMAIL` binding, From = RECEPTIONIST_FROM.
 * Returns a discriminated result instead of throwing, so callers can decide
 * whether a failure is fatal (the admin tool surfaces it) or best-effort (the
 * urgent notification swallows it). Never throws on a configured-but-failed send.
 */
export async function sendEmail(
  env: Env,
  { to, subject, body }: SendEmailArgs,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const from = env.RECEPTIONIST_FROM;
  if (!env.EMAIL || !from) {
    return { ok: false, error: "email binding not configured" };
  }
  const raw = buildRawEmail(from, to, subject, body);
  try {
    // The send_email binding expects an EmailMessage(from, to, raw); the
    // runtime resolves the ctor at the binding layer from this structured object.
    await env.EMAIL.send({ from, to, raw });
    return { ok: true, to };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
