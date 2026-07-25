import type { TriageLevel, IntakeStatus, DraftStatus } from "@drkyana/types";

export function fmtDate(epochSeconds?: number | null): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function fmtDateShort(epochSeconds?: number | null): string {
  if (!epochSeconds) return "—";
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export const TRIAGE_CLASS: Record<TriageLevel, string> = {
  RED: "bg-red/10 text-red",
  ORANGE: "bg-orange/10 text-orange",
  YELLOW: "bg-yellow/10 text-yellow",
  GREEN: "bg-green/10 text-green",
};

/**
 * Display labels only — the underlying TriageLevel values (RED/ORANGE/
 * YELLOW/GREEN) are unchanged in the DB, the deterministic rule engine
 * (run_triage.ts), and agent logic; only what's shown to Dr Kyana changed.
 * Renamed from color words to Emergency Severity Index terminology after
 * the DLS tone mapping (#75) made YELLOW render as blue — a badge whose
 * text names a color it isn't rendered in is confusing regardless of the
 * underlying reason (user-flagged, 2026-07-25). RED/ORANGE/YELLOW/GREEN
 * map to ESI Level 2-5 (Level 1 - "Immediate: life threatening" - isn't
 * reachable through a booking chatbot for a private practice; RED already
 * means "advise to nearest hospital", i.e. Level 2's "could become
 * life-threatening", not a true Level-1 case).
 */
export const TRIAGE_LABEL: Record<TriageLevel, string> = {
  RED: "Level 2 · Emergency",
  ORANGE: "Level 3 · Urgent",
  YELLOW: "Level 4 · Semi-urgent",
  GREEN: "Level 5 · Non-urgent",
};

/** Compact form for filter pills — no room there for the full description. */
export const TRIAGE_LABEL_SHORT: Record<TriageLevel, string> = {
  RED: "Level 2",
  ORANGE: "Level 3",
  YELLOW: "Level 4",
  GREEN: "Level 5",
};

export const STATUS_LABEL: Record<IntakeStatus, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  completed: "Completed",
  closed: "Closed",
};

export const STATUS_ORDER: IntakeStatus[] = [
  "new",
  "contacted",
  "scheduled",
  "completed",
  "closed",
];

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sent: "Sent",
};
