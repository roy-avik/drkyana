"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline form for superseding an AI-generated clinical assist with Dr Kyana's
 * authoritative note. Collapsed by default; opens to a textarea + save. On
 * success, refreshes the route so the parent server component re-fetches and
 * the supersede block replaces the form.
 */
export function SupersedeForm({ assistId }: { assistId: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinical-assists/${assistId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      if (!res.ok) {
        const data = (await res
          .json()
          .catch(() => ({}))) as { error?: string };
        setError(data.error ?? "failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-accent hover:underline">
        Supersede with my own note
      </summary>
      <div className="mt-2 space-y-2">
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Your clinical assessment overrides the AI draft. The original stays in the record for audit."
          disabled={busy}
          className="w-full rounded-md border border-ink/15 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!note.trim() || busy}
            className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save supersede note"}
          </button>
          {error && (
            <span role="alert" className="text-xs text-red-600">{error}</span>
          )}
        </div>
      </div>
    </details>
  );
}
