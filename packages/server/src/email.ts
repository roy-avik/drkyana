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

/** A single file attachment. Content is base64 (PDFs come from R2 as bytes). */
export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content. */
  contentBase64: string;
  /** MIME type, e.g. "application/pdf". */
  mimeType: string;
}

/** Fold a base64 string into RFC-compliant 76-char lines. */
function foldBase64(b64: string): string {
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? b64;
}

/**
 * Build an RFC 5322 message from a verified sender. Plain text/plain when
 * there is no attachment; multipart/mixed with a base64 part when there is
 * (the draft-send path attaches the compiled PDF).
 */
export function buildRawEmail(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachment?: EmailAttachment,
): string {
  const date = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@drkyana.com>`;
  const head = [
    `From: Dr Kyana's Clinic <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeSubject(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
  ];

  if (!attachment) {
    return [
      ...head,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      body,
    ].join("\r\n");
  }

  // Short unique boundary: keeps the Content-Type header under RFC 5322's
  // 78-char SHOULD-limit. 16 random hex chars cannot collide with a PDF's
  // base64 or the plain-text body in practice.
  const boundary = `----dk-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return [
    ...head,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    foldBase64(attachment.contentBase64),
    `--${boundary}--`,
    ``,
  ].join("\r\n");
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  attachment?: EmailAttachment;
}

/**
 * Send a text/plain email via the `EMAIL` binding, From = RECEPTIONIST_FROM.
 * Returns a discriminated result instead of throwing, so callers can decide
 * whether a failure is fatal (the admin tool surfaces it) or best-effort (the
 * urgent notification swallows it). Never throws on a configured-but-failed send.
 */
export async function sendEmail(
  env: Env,
  { to, subject, body, attachment }: SendEmailArgs,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const from = env.RECEPTIONIST_FROM;
  if (!env.EMAIL || !from) {
    return { ok: false, error: "email binding not configured" };
  }
  const raw = buildRawEmail(from, to, subject, body, attachment);
  try {
    // The send_email binding requires a real EmailMessage(from, to, raw)
    // instance from `cloudflare:email` — a plain object is rejected at runtime.
    // `cloudflare:email` is a Workers built-in: unresolvable by tsc/webpack/
    // turbopack at build time, provided by the runtime wherever EMAIL exists.
    // The ignore comments stop the bundlers; @ts-ignore stops tsc.
    // @ts-ignore cloudflare:email is a Workers runtime built-in module
    const { EmailMessage } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "cloudflare:email")) as { EmailMessage: new (from: string, to: string, raw: string) => unknown };
    await env.EMAIL.send(new EmailMessage(from, to, raw));
    return { ok: true, to };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
