/**
 * Consent recording and enforcement (server-only).
 *
 * Design notes worth keeping:
 *
 * 1. The canonical consent TEXT lives here, server-side, not in the locale
 *    YAML. The hash we store must be of text we control — if the client sent
 *    us a hash, a patient (or a bug) could claim they agreed to anything. The
 *    locale files hold translations of this canonical English text; `locale`
 *    on the row records which translation was displayed.
 *
 * 2. Consent is written in the SAME D1 batch as OTP consumption and the
 *    session upsert, so a verified session cannot exist without consent rows.
 *    That is why this module exports statement BUILDERS rather than doing its
 *    own writes — the caller composes one atomic batch.
 *
 * 3. `ai_inference` is enforced, not just logged: hasConsent() gates the
 *    patient agent endpoint. Withdrawal has to actually stop inference.
 */
import {
  CONSENT_POLICY_VERSION,
  CONSENT_SCOPES_AT_VERIFY,
  type ConsentScope,
  type ConsentStatus,
} from "@drkyana/types";
import type { Env } from "./bindings";

/**
 * Canonical English consent text, per scope, for CONSENT_POLICY_VERSION.
 *
 * Editing any string here WITHOUT bumping CONSENT_POLICY_VERSION would leave
 * old rows pointing at a hash that no longer matches anything — bump the
 * version in @drkyana/types whenever this changes.
 */
export const CONSENT_TEXTS: Record<ConsentScope, string> = {
  care:
    "I agree that Dr Kyana's practice may store the health information I " +
    "provide (my contact details, symptoms, medical history and appointment " +
    "records) in order to provide dental care to me.",
  ai_inference:
    "I understand that the messages I send to the AI receptionist are " +
    "processed by Anthropic (Claude), a service provider outside Bangladesh, " +
    "in order to understand my request and prepare my intake. I can withdraw " +
    "this at any time, after which the AI receptionist will stop working for " +
    "me and I can contact the practice directly instead.",
  email:
    "I agree to receive email from Dr Kyana's practice about my appointments, " +
    "my intake and my treatment documents.",
  mcp_third_party:
    "I agree that I may access my own records through a third-party AI " +
    "assistant that I connect myself (for example Claude or ChatGPT), and I " +
    "understand that doing so sends the information shown to that assistant's " +
    "provider, outside Bangladesh.",
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of the canonical text for a scope at the current policy version. */
export function consentTextHash(scope: ConsentScope): Promise<string> {
  return sha256Hex(`${CONSENT_POLICY_VERSION}:${scope}:${CONSENT_TEXTS[scope]}`);
}

export interface ConsentGrantInput {
  sessionId: string;
  email: string;
  locale: string;
  ipHash?: string | null;
  /** Defaults to the scopes captured at verification. */
  scopes?: readonly ConsentScope[];
}

/**
 * Build the INSERT statements recording consent. Returned unbound-to-nothing
 * (already bound, ready to batch) so the caller can execute them atomically
 * alongside whatever else must succeed or fail with them.
 */
export async function buildConsentInserts(
  env: Env,
  { sessionId, email, locale, ipHash, scopes = CONSENT_SCOPES_AT_VERIFY }: ConsentGrantInput,
  now: number = Math.floor(Date.now() / 1000),
) {
  const stmts = [];
  for (const scope of scopes) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO consents (id, session_id, email, scope, policy_version, text_sha256, locale, ip_hash, granted_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        sessionId,
        email,
        scope,
        CONSENT_POLICY_VERSION,
        await consentTextHash(scope),
        locale,
        ipHash ?? null,
        now,
      ),
    );
  }
  return stmts;
}

/**
 * Is `scope` currently in force for this verified email?
 *
 * "Currently" means: the most recent grant for that scope has no withdrawal.
 * Re-granting after a withdrawal therefore works without deleting history —
 * the withdrawal stays on the record, which is the point.
 *
 * Fails CLOSED: a query error returns false rather than letting inference
 * proceed on an unknown consent state.
 */
export async function hasConsent(
  env: Env,
  email: string,
  scope: ConsentScope,
): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      "SELECT withdrawn_at FROM consents WHERE email = ? AND scope = ? " +
        "ORDER BY granted_at DESC LIMIT 1",
    )
      .bind(email, scope)
      .first<{ withdrawn_at: number | null }>();
    return !!row && row.withdrawn_at == null;
  } catch {
    return false;
  }
}

/** Current state of every scope for one identity, for the /account UI. */
export async function listConsents(env: Env, email: string): Promise<ConsentStatus[]> {
  const { results } = await env.DB.prepare(
    "SELECT scope, policy_version, granted_at, withdrawn_at FROM consents " +
      "WHERE email = ? ORDER BY granted_at DESC",
  )
    .bind(email)
    .all<{
      scope: ConsentScope;
      policy_version: string;
      granted_at: number;
      withdrawn_at: number | null;
    }>();

  // Most recent row per scope wins — the query is already newest-first.
  const seen = new Map<ConsentScope, ConsentStatus>();
  for (const r of results ?? []) {
    if (seen.has(r.scope)) continue;
    seen.set(r.scope, {
      scope: r.scope,
      granted: r.withdrawn_at == null,
      policyVersion: r.policy_version,
      grantedAt: r.granted_at,
      withdrawnAt: r.withdrawn_at ?? undefined,
    });
  }
  return [...seen.values()];
}

/**
 * Withdraw a scope. Stamps the current in-force grant rather than inserting a
 * tombstone, so `hasConsent` sees it immediately. No-op if nothing is in force.
 */
export async function withdrawConsent(
  env: Env,
  email: string,
  scope: ConsentScope,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ withdrawn: boolean }> {
  const { meta } = await env.DB.prepare(
    "UPDATE consents SET withdrawn_at = ? WHERE email = ? AND scope = ? AND withdrawn_at IS NULL",
  )
    .bind(now, email, scope)
    .run();
  return { withdrawn: (meta?.changes ?? 0) > 0 };
}
