"use client";

import { useState } from "react";
import Link from "next/link";
import type { DraftRow } from "@drkyana/types";
import { renderMarkdown } from "../lib/markdown";
import { DRAFT_STATUS_LABEL, fmtDate } from "../lib/format";

export default function DraftReview({ initial }: { initial: DraftRow }) {
  const [draft, setDraft] = useState<DraftRow>(initial);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = markdown !== draft.markdown;

  async function saveEdit() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { draft: DraftRow };
      setDraft(data.draft);
      setMarkdown(data.draft.markdown);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(action: "approve" | "send") {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        // The route returns the transport errors on a failed delivery — show
        // them, because "why didn't this send" must be answerable from here.
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        draft: DraftRow;
        transport?: string;
      };
      setDraft(data.draft);
      if (action === "send") {
        setNotice(`Sent to the patient with the PDF attached (via ${data.transport ?? "email"}).`);
      } else {
        setNotice("Draft approved.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/drafts" className="text-sm text-accent hover:underline">
        ← Back to drafts
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{draft.title || `${draft.type} draft`}</h1>
        <span className="chip bg-ink/5 text-muted capitalize">{draft.type}</span>
        <span className="chip bg-ink/5 text-muted">
          {DRAFT_STATUS_LABEL[draft.status]}
        </span>
      </div>

      {error && (
        <div role="alert" className="card border-red/30 bg-red/5 text-sm text-red">{error}</div>
      )}
      {notice && (
        <div className="card border-green/30 bg-green/5 text-sm text-green">{notice}</div>
      )}

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Document</h2>
          <button
            className="btn-ghost py-1 text-xs"
            onClick={() => {
              setEditing((e) => !e);
              if (editing) setMarkdown(draft.markdown);
            }}
          >
            {editing ? "Preview" : "Edit"}
          </button>
        </div>

        {editing ? (
          <textarea
            className="input min-h-[300px] font-mono text-sm"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        ) : (
          <article
            className="prose-draft text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
          />
        )}

        {editing && (
          <div className="mt-3 flex gap-2">
            <button
              className="btn-primary"
              onClick={() => void saveEdit()}
              disabled={!dirty || busy !== null}
            >
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setMarkdown(draft.markdown);
                setEditing(false);
              }}
              disabled={busy !== null}
            >
              Discard
            </button>
          </div>
        )}
      </div>

      {draft.citations.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Sources cited</h2>
          <ul className="space-y-1 text-sm">
            {draft.citations.map((c, i) => (
              <li key={i} className="text-muted">
                <span className="font-medium text-ink">{c.title}</span>
                {c.snippet ? ` — ${c.snippet}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Review actions</h2>
        <p className="text-xs text-muted">
          Drafts are agent-generated. Nothing is sent until you approve.
          &ldquo;Send&rdquo; compiles the PDF and emails it to the patient&rsquo;s
          verified address; the draft is only marked sent if delivery succeeds.
        </p>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={() => void act("approve")}
            disabled={busy !== null || dirty}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            className="btn-primary"
            onClick={() => void act("send")}
            disabled={busy !== null || dirty}
          >
            {busy === "send" ? "Sending…" : "Send"}
          </button>
        </div>
        {dirty && (
          <p className="text-xs text-orange">Save your edits before approving or sending.</p>
        )}
        <p className="text-xs text-muted">Updated {fmtDate(draft.updated_at)}</p>
      </div>
    </div>
  );
}
