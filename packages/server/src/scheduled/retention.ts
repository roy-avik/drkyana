/**
 * Data retention (server-only). The ops Worker's RetentionWorkflow calls this
 * daily. PDPA 2026 expects personal data not to be kept longer than needed;
 * two stores accumulate PHI indefinitely today and are cleaned here:
 *
 *   1. `email_otps` — one-time codes with a 10-minute TTL. Every row older than
 *      a couple of days is spent (consumed or long expired) and is pure
 *      residue: it holds an email + a hashed code. Purge it.
 *
 *   2. `sessions.messages` — the full patient chat transcript. A session that
 *      has been idle for the retention window holds stale conversation PHI. We
 *      COMPACT it (clear the transcript to '[]') rather than delete the row, so
 *      the verified-email linkage that powers /account survives while the
 *      conversation content does not. `sessions.summary` is left for a future
 *      LLM-composed continuity summary; clearing is the retention win now.
 *
 * Deterministic, parameterized, and best-effort: it never throws (it runs
 * unattended), reporting any failure on the result instead. `now` is injectable
 * for tests.
 */
import type { Env } from "../bindings";

const DAY = 24 * 60 * 60;

export interface RetentionConfig {
  /** Delete email_otps whose issued_at is older than this. Default 2 days. */
  otpTtlDays: number;
  /** Compact session transcripts idle longer than this. Default 90 days. */
  sessionTtlDays: number;
}

export const DEFAULT_RETENTION: RetentionConfig = {
  otpTtlDays: 2,
  sessionTtlDays: 90,
};

export interface RetentionResult {
  otpsPurged: number;
  sessionsCompacted: number;
  errors: string[];
}

/**
 * Run the retention pass. Each operation is independent — a failure in one is
 * recorded and the other still runs. Returns affected-row counts.
 */
export async function runRetention(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
  cfg: RetentionConfig = DEFAULT_RETENTION,
): Promise<RetentionResult> {
  const errors: string[] = [];
  let otpsPurged = 0;
  let sessionsCompacted = 0;

  // 1. Purge spent OTPs. No OTP is useful past its 10-minute TTL, so anything
  //    older than otpTtlDays is safe to remove outright.
  try {
    const res = await env.DB.prepare("DELETE FROM email_otps WHERE issued_at < ?")
      .bind(now - cfg.otpTtlDays * DAY)
      .run();
    otpsPurged = res.meta?.changes ?? 0;
  } catch (e) {
    errors.push(`otp purge: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Compact idle session transcripts. Clear `messages` (drop the PHI) but
  //    keep the row so verified_email / patient linkage survives. Only touch
  //    rows that still carry a transcript, so re-running is a cheap no-op.
  try {
    const res = await env.DB.prepare(
      "UPDATE sessions SET messages = '[]', updated_at = updated_at " +
        "WHERE messages != '[]' AND updated_at < ?",
    )
      .bind(now - cfg.sessionTtlDays * DAY)
      .run();
    sessionsCompacted = res.meta?.changes ?? 0;
  } catch (e) {
    errors.push(`session compaction: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { otpsPurged, sessionsCompacted, errors };
}
