/**
 * Scheduled reminders (server-only). A plain async function the admin Worker's
 * cron can call (wired separately — see runReminders' callers + the cron note in
 * the report). NOT streamed, no model in the loop: it queries D1 for actionable
 * intakes and emails Dr Kyana a compact digest via the shared `sendEmail` helper.
 *
 * The D1 schema (migrations/0001_init.sql) tracks workflow `status` but has no
 * explicit appointment-date column (scheduling lives downstream in Dr Kyana's
 * head / replies). So v1 reminders surface two follow-up signals:
 *   - `scheduled` intakes she should confirm for the day, and
 *   - urgent (RED/ORANGE) intakes still `new` (uncontacted) — a pending follow-up.
 * If an `appointment_at` column is added later, extend `selectReminders` to also
 * pull next-day appointments; the email path stays the same.
 *
 * Best-effort: a failed send is logged into the result, never thrown — the cron
 * should not hard-fail on a transient email error.
 */
import type { Env } from "../bindings";
import { sendEmail } from "../email";

const DAY = 24 * 60 * 60;

export interface ReminderItem {
  intakeId: string;
  name: string | null;
  phone: string | null;
  triageLevel: string | null;
  status: string;
  reason: "scheduled_followup" | "urgent_uncontacted";
  createdAt: number;
}

export interface ReminderRunResult {
  considered: number;
  emailed: boolean;
  error?: string;
}

interface RawReminderRow {
  id: string;
  name: string | null;
  phone: string | null;
  triage_level: string | null;
  status: string;
  created_at: number;
}

/**
 * Pull intakes that warrant a reminder. Parameterized, compact (capped), and
 * ordered urgent-first. `now` is injectable for testing/determinism.
 */
export async function selectReminders(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<ReminderItem[]> {
  // scheduled intakes (to confirm) OR urgent-but-uncontacted within the last 3 days.
  const urgentSince = now - 3 * DAY;
  const { results } = await env.DB.prepare(
    "SELECT id, name, phone, triage_level, status, created_at FROM intakes " +
      "WHERE status = 'scheduled' " +
      "OR (status = 'new' AND triage_level IN ('RED','ORANGE') AND created_at >= ?) " +
      "ORDER BY CASE triage_level WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END, created_at DESC " +
      "LIMIT 50",
  )
    .bind(urgentSince)
    .all<RawReminderRow>();

  return (results ?? []).map((r) => ({
    intakeId: r.id,
    name: r.name,
    phone: r.phone,
    triageLevel: r.triage_level,
    status: r.status,
    reason: r.status === "scheduled" ? "scheduled_followup" : "urgent_uncontacted",
    createdAt: r.created_at,
  }));
}

function buildDigestBody(items: ReminderItem[]): string {
  const scheduled = items.filter((i) => i.reason === "scheduled_followup");
  const urgent = items.filter((i) => i.reason === "urgent_uncontacted");
  const lines: string[] = ["Daily clinic reminders from your receptionist.", ""];

  if (urgent.length) {
    lines.push(`URGENT — still uncontacted (${urgent.length}):`);
    for (const i of urgent) {
      lines.push(
        `  • [${i.triageLevel}] ${i.name ?? "Unknown"}` +
          `${i.phone ? ` — ${i.phone}` : ""} (intake ${i.intakeId})`,
      );
    }
    lines.push("");
  }
  if (scheduled.length) {
    lines.push(`Scheduled to confirm (${scheduled.length}):`);
    for (const i of scheduled) {
      lines.push(
        `  • ${i.name ?? "Unknown"}${i.phone ? ` — ${i.phone}` : ""} (intake ${i.intakeId})`,
      );
    }
    lines.push("");
  }
  lines.push("Open the practice console to act on these.");
  return lines.join("\n");
}

/**
 * Run the reminder pass: select actionable intakes and email Dr Kyana a digest.
 * No-op (no email) when there's nothing to remind about. Never throws.
 */
export async function runReminders(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<ReminderRunResult> {
  let items: ReminderItem[];
  try {
    items = await selectReminders(env, now);
  } catch (e) {
    return { considered: 0, emailed: false, error: e instanceof Error ? e.message : "query failed" };
  }

  if (items.length === 0) return { considered: 0, emailed: false };

  const to = env.DR_KYANA_NOTIFY_EMAIL;
  if (!to) return { considered: items.length, emailed: false, error: "no notify address" };

  const res = await sendEmail(env, {
    to,
    subject: `Clinic reminders — ${items.length} item${items.length === 1 ? "" : "s"}`,
    body: buildDigestBody(items),
  });

  return res.ok
    ? { considered: items.length, emailed: true }
    : { considered: items.length, emailed: false, error: res.error };
}
