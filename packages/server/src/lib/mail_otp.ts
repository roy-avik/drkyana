/**
 * mail_otp — short-lived email verification codes for the patient surface.
 *
 * Two operations:
 *   - `requestOtp` — generate a 6-digit code, hash it, store in `email_otps`,
 *     send the patient an email with the raw code via the existing
 *     `cloudflare:email` send path (`packages/server/src/email.ts`).
 *   - `verifyOtp` — look up the most recent unconsumed code for an email,
 *     check expiry + attempts, hash-compare the submitted code, mark consumed,
 *     and stamp `sessions.verified_email` + `sessions.email_verified_at`.
 *
 * Rate limits (per-email + per-IP) live INSIDE `requestOtp` so the HTTP layer
 * stays thin. Limits are deliberately tight — abuse of the public OTP endpoint
 * could otherwise burn email reputation and budget.
 *
 * Security posture:
 *   - The raw code never lives in D1 — only `SHA-256(code + IP_HASH_SALT)`.
 *   - Codes are 6 digits, 10-minute TTL, max 5 verify attempts per code.
 *   - `session_id` is part of the issuance, so a code issued for session A
 *     cannot be replayed against session B.
 *   - Email body never includes anything identifying beyond the code; subject
 *     reveals the clinic only.
 */
import type { Locale } from "@drkyana/types";
import type { Env } from "../bindings";
import { sendSmtpEmail } from "../smtp";

const CODE_TTL_SECONDS = 600;          // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const PER_EMAIL_LIMIT = 3;             // codes per email per window
const PER_EMAIL_WINDOW_SECONDS = 600;  // 10 min
const PER_IP_LIMIT = 10;               // codes per IP per window
const PER_IP_WINDOW_SECONDS = 3_600;   // 1 hour

export interface RequestOtpInput {
  sessionId: string;
  email: string;
  ipHash: string;
  locale: Locale;
}

export type RequestOtpResult =
  | { ok: true }
  | { ok: false; error: "rate_limit_email" | "rate_limit_ip" | "send_failed" | "bad_email" };

export interface VerifyOtpInput {
  sessionId: string;
  email: string;
  code: string;
}

export type VerifyOtpResult =
  | { ok: true; verifiedEmail: string }
  | {
      ok: false;
      error:
        | "no_pending_code"
        | "expired"
        | "too_many_attempts"
        | "invalid_code";
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 6-digit decimal code, zero-padded. Uses Web Crypto for entropy. */
function generateCode(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const n =
    ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface EmailTemplate {
  subject: string;
  body: (code: string) => string;
}

/**
 * Per-locale email copy. Brief, plain text — the receptionist's voice carries
 * through, but the operative content is the code. The expiry phrasing is
 * deliberate ("expires in 10 minutes", not "expires at 14:38") because the
 * patient's clock may not match the server's.
 */
const TEMPLATES: Record<Locale, EmailTemplate> = {
  en: {
    subject: "Your Dr Kyana verification code",
    body: (code) =>
      [
        "Your verification code:",
        "",
        `    ${code}`,
        "",
        "Enter it on the receptionist page to finish your intake.",
        "The code expires in 10 minutes. If you didn't request it, you can ignore this email.",
        "",
        "— Dr Kyana's clinic",
      ].join("\n"),
  },
  bn: {
    subject: "ডাঃ কেয়ানার ভেরিফিকেশন কোড",
    body: (code) =>
      [
        "আপনার ভেরিফিকেশন কোড:",
        "",
        `    ${code}`,
        "",
        "রিসেপশনিস্ট পেজে এটি লিখুন আপনার ইনটেক সম্পূর্ণ করতে।",
        "কোডটি ১০ মিনিটের মধ্যে শেষ হবে। আপনি যদি এটি না চেয়ে থাকেন, তবে এই ইমেলটি উপেক্ষা করতে পারেন।",
        "",
        "— ডাঃ কেয়ানার ক্লিনিক",
      ].join("\n"),
  },
  fa: {
    subject: "کد تأیید دکتر کیانا",
    body: (code) =>
      [
        "کد تأیید شما:",
        "",
        `    ${code}`,
        "",
        "آن را در صفحه پذیرش وارد کنید تا فرم پذیرش شما تکمیل شود.",
        "این کد ۱۰ دقیقه اعتبار دارد. اگر این درخواست از طرف شما نبوده، می‌توانید این ایمیل را نادیده بگیرید.",
        "",
        "— کلینیک دکتر کیانا",
      ].join("\n"),
  },
};

/** Count unconsumed OTPs issued for an email within the window. */
async function countRecentByEmail(
  env: Env,
  email: string,
  windowSeconds: number,
): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM email_otps WHERE email = ? AND issued_at >= ?",
  )
    .bind(email, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Count OTPs issued from an IP hash within the window. */
async function countRecentByIp(
  env: Env,
  ipHash: string,
  windowSeconds: number,
): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM email_otps WHERE ip_hash = ? AND issued_at >= ?",
  )
    .bind(ipHash, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Issue a fresh code, persist its hash, and email it. Fails closed on missing
 * EMAIL binding or invalid email. Rate limits per-email and per-IP first so
 * neither D1 nor the email service is touched on abuse.
 */
export async function requestOtp(
  env: Env,
  { sessionId, email, ipHash, locale }: RequestOtpInput,
): Promise<RequestOtpResult> {
  const normalised = normaliseEmail(email);
  if (!EMAIL_RE.test(normalised)) return { ok: false, error: "bad_email" };

  if ((await countRecentByEmail(env, normalised, PER_EMAIL_WINDOW_SECONDS)) >= PER_EMAIL_LIMIT) {
    return { ok: false, error: "rate_limit_email" };
  }
  if ((await countRecentByIp(env, ipHash, PER_IP_WINDOW_SECONDS)) >= PER_IP_LIMIT) {
    return { ok: false, error: "rate_limit_ip" };
  }

  const code = generateCode();
  const salt = env.IP_HASH_SALT ?? "";
  const codeHash = await sha256Hex(`${code}:${salt}`);
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    "INSERT INTO email_otps (id, session_id, email, code_hash, ip_hash, issued_at, expires_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      sessionId,
      normalised,
      codeHash,
      ipHash,
      now,
      now + CODE_TTL_SECONDS,
    )
    .run();

  const tpl = TEMPLATES[locale] ?? TEMPLATES.en;
  // OTP goes to an ARBITRARY patient address, so it must use SMTP (GoDaddy),
  // not the cloudflare:email binding (verified-destinations only).
  const result = await sendSmtpEmail(env, {
    to: normalised,
    subject: tpl.subject,
    text: tpl.body(code),
  });
  if (!result.ok) return { ok: false, error: "send_failed" };
  return { ok: true };
}

/**
 * Verify a submitted code against the most recent unconsumed OTP for an email.
 * On success, marks the OTP consumed AND stamps the session as verified — the
 * session row is the source of truth the Pages Function reads when building
 * the patient AgentContext for subsequent turns.
 */
export async function verifyOtp(
  env: Env,
  { sessionId, email, code }: VerifyOtpInput,
): Promise<VerifyOtpResult> {
  const normalised = normaliseEmail(email);
  const now = Math.floor(Date.now() / 1000);

  const row = await env.DB.prepare(
    "SELECT id, code_hash, expires_at, attempts FROM email_otps " +
      "WHERE email = ? AND session_id = ? AND consumed_at IS NULL " +
      "ORDER BY issued_at DESC LIMIT 1",
  )
    .bind(normalised, sessionId)
    .first<{
      id: string;
      code_hash: string;
      expires_at: number;
      attempts: number;
    }>();

  if (!row) return { ok: false, error: "no_pending_code" };
  if (row.expires_at <= now) return { ok: false, error: "expired" };
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "too_many_attempts" };
  }

  const salt = env.IP_HASH_SALT ?? "";
  const expected = await sha256Hex(`${code.trim()}:${salt}`);

  // Increment attempts FIRST so a burst of guesses doesn't get free retries
  // if the equality check is the slow path.
  await env.DB.prepare(
    "UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?",
  )
    .bind(row.id)
    .run();

  if (expected !== row.code_hash) return { ok: false, error: "invalid_code" };

  // Mark consumed + stamp the session. Verification now happens BEFORE the
  // patient sends any chat message, so the session row may not exist yet — use
  // an UPSERT (not a bare UPDATE) so the verified state is recorded either way.
  // The later message-save in the agent endpoint does ON CONFLICT DO UPDATE on
  // `messages`/`locale` only, so it never clobbers `verified_email`.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE email_otps SET consumed_at = ? WHERE id = ?",
    ).bind(now, row.id),
    env.DB.prepare(
      "INSERT INTO sessions (id, kind, verified_email, email_verified_at, created_at, updated_at) " +
        "VALUES (?, 'patient', ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET verified_email = excluded.verified_email, " +
        "email_verified_at = excluded.email_verified_at, updated_at = excluded.updated_at",
    ).bind(sessionId, normalised, now, now, now),
  ]);

  return { ok: true, verifiedEmail: normalised };
}
