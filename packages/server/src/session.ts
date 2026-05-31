/**
 * Patient session cookie (server-only helpers).
 *
 * The patient session is COOKIE-AUTHORITATIVE: an httpOnly, signed cookie holds
 * the session id, so a page refresh keeps the verified session without the
 * client ever handling (or being trusted with) the id. The OTP request mints +
 * sets it, verify stamps the session row, and every patient endpoint reads the
 * id from the cookie — never from request input or model args.
 *
 * Value format: `${sessionId}.${hmacHex}` where the HMAC (SHA-256, keyed by
 * IP_HASH_SALT) authenticates the id so a tampered/forged cookie is rejected
 * before any D1 lookup. The id itself is a random UUID; the signature is
 * defense-in-depth.
 *
 * These are pure Web-Crypto functions (no sockets/bindings) — safe to export
 * from the server barrel and import into Pages Functions.
 */

export const SESSION_COOKIE_NAME = "dk_psid";

/** 30 days — long enough that a returning patient stays recognised. */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function newPatientSessionId(): string {
  return crypto.randomUUID();
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish string compare (length-checked) for the signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Build the signed `Set-Cookie` header value for a session id. */
export async function serializeSessionCookie(
  sessionId: string,
  secret: string,
): Promise<string> {
  const sig = await hmacHex(sessionId, secret);
  const value = `${sessionId}.${sig}`;
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ].join("; ");
}

/**
 * Extract + verify the session id from a request's Cookie header. Returns null
 * if the cookie is absent, malformed, or its signature doesn't match.
 */
export async function readSessionCookie(
  cookieHeader: string | null,
  secret: string,
): Promise<string | null> {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(/;\s*/);
  let raw: string | null = null;
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    if (p.slice(0, eq) === SESSION_COOKIE_NAME) {
      raw = p.slice(eq + 1);
      break;
    }
  }
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!sessionId || !sig) return null;
  const expected = await hmacHex(sessionId, secret);
  return safeEqual(sig, expected) ? sessionId : null;
}
