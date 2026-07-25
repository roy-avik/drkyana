"use client";

import { useCallback, useEffect, useState } from "react";
import type { KbDocRow } from "@drkyana/types";
import { fmtDate } from "../lib/format";
import { Button, Card, cardClassName } from "@drkyana/ui";

interface FormState {
  title: string;
  source: string;
  lang: string;
  tags: string; // comma-separated in the form
  text: string;
}

const EMPTY: FormState = { title: "", source: "", lang: "", tags: "", text: "" };

export default function KbManager() {
  const [docs, setDocs] = useState<KbDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kb", { cache: "no-store" });
      if (res.status === 401) {
        setError("Not authorized. Sign in via Cloudflare Access.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { docs: KbDocRow[] };
      setDocs(data.docs ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form) return;
    if (!form.title.trim() || !form.text.trim()) {
      setError("Title and reference text are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      source: form.source.trim() || null,
      lang: form.lang.trim() || undefined,
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      text: form.text,
    };
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `HTTP ${res.status}`);
      }
      setForm(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(d: KbDocRow) {
    if (!confirm(`Delete "${d.title}" from the knowledge base?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/kb/${encodeURIComponent(d.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Knowledge base</h1>
        {!form && (
          <Button tone="brand" onClick={() => setForm({ ...EMPTY })}>
            + Add reference
          </Button>
        )}
      </div>

      <p className="text-sm text-muted">
        Paste a curated dental reference. It is chunked, embedded, and stored so
        the assistant can cite it in drafts. Nothing is added automatically.
      </p>

      {error && (
        <Card role="alert" className="border-red/30 bg-red/5 text-sm text-red">{error}</Card>
      )}

      {form && (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New reference</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">Title *</span>
              <input
                className="input"
                value={form.title}
                placeholder="Post-extraction aftercare"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Source</span>
              <input
                className="input"
                value={form.source}
                placeholder="e.g. clinic protocol, textbook, URL"
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Language</span>
              <input
                className="input"
                value={form.lang}
                placeholder="en / bn / fa"
                onChange={(e) => setForm({ ...form, lang: e.target.value })}
              />
            </label>
            <label>
              <span className="field-label">Tags (comma-separated)</span>
              <input
                className="input"
                value={form.tags}
                placeholder="extraction, aftercare"
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </label>
          </div>
          <label>
            <span className="field-label">Reference text *</span>
            <textarea
              className="input min-h-40"
              value={form.text}
              placeholder="Paste the reference content here…"
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <Button
              tone="brand"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? "Ingesting…" : "Ingest"}
            </Button>
            <Button
              onClick={() => setForm(null)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {!loading && docs.length === 0 && !form && (
        <Card className="text-center text-sm text-muted">
          No references yet.
        </Card>
      )}

      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id} className={`${cardClassName} p-4`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-medium">{d.title}</span>
                <p className="text-xs text-muted">
                  {d.chunk_count} chunk{d.chunk_count === 1 ? "" : "s"}
                  {d.source ? ` · ${d.source}` : ""} · {fmtDate(d.updated_at)}
                </p>
              </div>
              <button
                className="btn-ghost py-1 text-xs text-red"
                onClick={() => void remove(d)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
