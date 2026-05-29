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
