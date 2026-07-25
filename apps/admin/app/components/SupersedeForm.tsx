"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@drkyana/ui";

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
        <Textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Your clinical assessment overrides the AI draft. The original stays in the record for audit."
          disabled={busy}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            tone="brand"
            size="sm"
            onClick={() => void submit()}
            disabled={!note.trim() || busy}
          >
            {busy ? "Saving…" : "Save supersede note"}
          </Button>
          {error && (
            <span role="alert" className="text-xs text-red-600">{error}</span>
          )}
        </div>
      </div>
    </details>
  );
}
