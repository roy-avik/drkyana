"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { IntakeRow, IntakeStatus, TriageLevel } from "@drkyana/types";
import {
  fmtDateShort,
  TRIAGE_CLASS,
  TRIAGE_LABEL,
  TRIAGE_LABEL_SHORT,
  STATUS_LABEL,
  STATUS_ORDER,
} from "../lib/format";
import { Button, Card, Chip, cardClassName } from "@drkyana/ui";

const TRIAGE_LEVELS: TriageLevel[] = ["RED", "ORANGE", "YELLOW", "GREEN"];
const DATE_RANGES = [
  { label: "All", days: 0 },
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export default function IntakeQueue() {
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<IntakeStatus | "">("");
  const [triage, setTriage] = useState<Set<TriageLevel>>(new Set());
  const [days, setDays] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (triage.size) params.set("triage", [...triage].join(","));
    if (days > 0) {
      const since = Math.floor(Date.now() / 1000) - days * 86400;
      params.set("since", String(since));
    }
    try {
      const res = await fetch(`/api/intakes?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Not authorized. Sign in via Cloudflare Access.");
        setIntakes([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { intakes: IntakeRow[] };
      setIntakes(data.intakes ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, triage, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTriage = (t: TriageLevel) => {
    setTriage((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Intake queue</h1>
        <Button onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* Filters */}
      <Card className="space-y-3">
        <div>
          <span className="field-label">Status</span>
          <div className="flex flex-wrap gap-1.5">
            <Chip pressed={status === ""} onPressedChange={() => setStatus("")}>
              All
            </Chip>
            {STATUS_ORDER.map((s) => (
              <Chip key={s} pressed={status === s} onPressedChange={() => setStatus(s)}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">Triage</span>
          <div className="flex flex-wrap gap-1.5">
            {TRIAGE_LEVELS.map((t) => (
              <Chip key={t} pressed={triage.has(t)} onPressedChange={() => toggleTriage(t)}>
                {TRIAGE_LABEL_SHORT[t]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">Date range</span>
          <div className="flex flex-wrap gap-1.5">
            {DATE_RANGES.map((r) => (
              <Chip key={r.label} pressed={days === r.days} onPressedChange={() => setDays(r.days)}>
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {error && (
        <Card role="alert" className="border-red/30 bg-red/5 text-sm text-red">{error}</Card>
      )}

      {!error && !loading && intakes.length === 0 && (
        <Card className="text-center text-sm text-muted">No intakes match.</Card>
      )}

      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {intakes.map((i) => (
          <li key={i.id}>
            <Link
              href={`/intakes/${i.id}`}
              className={`${cardClassName} block p-4 transition-colors ease-spring hover:border-accent/40 ${
                i.triage_level === "RED" || i.triage_level === "ORANGE"
                  ? "border-l-4 border-l-red"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{i.name || "Unknown"}</span>
                    {i.triage_level && (
                      <span className={`chip ${TRIAGE_CLASS[i.triage_level]}`}>
                        {TRIAGE_LABEL[i.triage_level]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {i.affected_area ? `${i.affected_area} — ` : ""}
                    {i.symptoms || i.raw_message || "No complaint recorded"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="chip bg-ink/5 text-muted">{STATUS_LABEL[i.status]}</span>
                  <p className="mt-1 text-xs text-muted">{fmtDateShort(i.created_at)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
