"use client";

import { useState } from "react";
import type { IntakeStatus } from "@drkyana/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/format";

export default function StatusControl({
  intakeId,
  initial,
}: {
  intakeId: string;
  initial: IntakeStatus;
}) {
  const [status, setStatus] = useState<IntakeStatus>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: IntakeStatus) {
    if (next === status) return;
    setSaving(true);
    setError(null);
    const prev = status;
    setStatus(next);
    try {
      const res = await fetch(`/api/intakes/${intakeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setStatus(prev);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="field-label">Status workflow</span>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            disabled={saving}
            onClick={() => void change(s)}
            className={`chip border transition-colors disabled:opacity-50 ${
              status === s
                ? "border-brand bg-brand text-white"
                : "border-ink/15 bg-white text-muted hover:border-accent/40"
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red">Update failed: {error}</p>}
    </div>
  );
}
