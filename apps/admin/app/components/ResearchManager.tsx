"use client";

import { useState } from "react";
import type { AgentRunRow } from "@drkyana/types";
import { fmtDate } from "../lib/format";
import { renderMarkdown } from "@drkyana/types";
import { Button, Card, cardClassName } from "@drkyana/ui";

/**
 * Research log — deep-research inference runs (plan item 5). Lists recent runs
 * with their cost + token accounting, lets Dr Kyana expand a run's output, and
 * kicks off a new run on demand ("Run now"). The same runs are produced by the
 * scheduled cron (POST /api/cron/research).
 */

function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

const KIND_LABEL: Record<string, string> = {
  intake_patterns: "Intake patterns",
};

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "bg-green/10 text-green"
      : status === "error"
        ? "bg-red/10 text-red"
        : "bg-ink/10 text-ink";
  return <span className={`chip ${cls}`}>{status}</span>;
}

function RunCard({ run }: { run: AgentRunRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`${cardClassName} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">
          {KIND_LABEL[run.kind] ?? run.kind}
        </span>
        <StatusChip status={run.status} />
        <span className="text-xs text-muted">{fmtDate(run.started_at)}</span>
        <span className="ml-auto text-xs text-muted">
          {fmtCost(run.cost_usd)} · {run.input_tokens + run.output_tokens} tok ·{" "}
          {run.initiated_by}
        </span>
      </div>
      {run.error ? (
        <p role="alert" className="mt-2 text-sm text-red">{run.error}</p>
      ) : (
        <>
          <button
            type="button"
            className="mt-2 text-xs text-accent hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Show"} result
          </button>
          {open && (
            <div
              className="prose-draft mt-2 rounded bg-surface-alt p-3 text-sm text-ink"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(run.output_md) }}
            />
          )}
        </>
      )}
    </li>
  );
}

export default function ResearchManager({
  initialRuns,
}: {
  initialRuns: AgentRunRow[];
}) {
  const [runs, setRuns] = useState<AgentRunRow[]>(initialRuns);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "intake_patterns", limit: 50 }),
      });
      if (!res.ok) {
        setError(`failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { run?: AgentRunRow };
      if (data.run) setRuns((prev) => [data.run!, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Research</h1>
          <p className="text-sm text-muted">
            Deep-research analyses over your practice data, with token + cost
            accounting. Runs on a schedule, or on demand here.
          </p>
        </div>
        <Button
          tone="brand"
          onClick={() => void runNow()}
          disabled={busy}
        >
          {busy ? "Running…" : "Run intake patterns now"}
        </Button>
      </div>

      {error && (
        <Card role="alert" className="border-red/30 bg-red/5 text-sm text-red">{error}</Card>
      )}

      {runs.length === 0 ? (
        <p className="text-sm text-muted">
          No runs yet. Click &ldquo;Run intake patterns now&rdquo; to generate the
          first analysis.
        </p>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
