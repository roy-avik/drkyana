"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { DraftRow, DraftStatus } from "@drkyana/types";
import { fmtDateShort, DRAFT_STATUS_LABEL } from "../lib/format";

const STATUSES: (DraftStatus | "")[] = ["", "draft", "approved", "sent"];

export default function DraftList() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftStatus | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = status ? `/api/drafts?status=${status}` : "/api/drafts";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        setError("Not authorized. Sign in via Cloudflare Access.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { drafts: DraftRow[] };
      setDrafts(data.drafts ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Drafts</h1>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`chip border transition-colors ${
              status === s
                ? "border-brand bg-brand text-white"
                : "border-ink/15 bg-white text-muted hover:border-accent/40"
            }`}
          >
            {s ? DRAFT_STATUS_LABEL[s] : "All"}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="card border-red/30 bg-red/5 text-sm text-red">{error}</div>
      )}

      {!loading && drafts.length === 0 && !error && (
        <div className="card text-center text-sm text-muted">
          No drafts. The assistant produces drafts for your review here.
        </div>
      )}

      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id}>
            <Link
              href={`/drafts/${d.id}`}
              className="card block transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="truncate font-medium">
                    {d.title || `${d.type} draft`}
                  </span>
                  <p className="mt-0.5 text-xs text-muted capitalize">{d.type}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="chip bg-ink/5 text-muted">
                    {DRAFT_STATUS_LABEL[d.status]}
                  </span>
                  <p className="mt-1 text-xs text-muted">{fmtDateShort(d.created_at)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
