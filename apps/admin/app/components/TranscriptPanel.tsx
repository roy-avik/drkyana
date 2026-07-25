"use client";

import { useCallback, useEffect, useState } from "react";
import { cardClassName } from "@drkyana/ui";

interface Turn {
  role: string;
  text: string;
}
interface TranscriptSummary {
  sessionId: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  summary: string | null;
}

function fmt(ts: number): string {
  return ts ? new Date(ts * 1000).toLocaleString() : "—";
}

function Turns({ turns }: { turns: Turn[] }) {
  if (!turns.length) return <p className="text-sm text-muted">No messages.</p>;
  return (
    <div className="space-y-2">
      {turns.map((t, i) => (
        <div
          key={i}
          className={`rounded-lg p-2 text-sm ${
            t.role === "user"
              ? "bg-ink/5 text-ink"
              : "bg-accent/10 text-ink"
          }`}
        >
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
            {t.role === "user" ? "Patient" : "Receptionist"}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function TranscriptPanel({
  patientId,
  originatingSessionId,
}: {
  patientId: string | null;
  originatingSessionId: string | null;
}) {
  const [list, setList] = useState<TranscriptSummary[]>([]);
  const [open, setOpen] = useState<string | null>(originatingSessionId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loadingTurns, setLoadingTurns] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      const res = await fetch(`/api/transcripts?patientId=${encodeURIComponent(patientId)}`);
      const data = (await res.json().catch(() => ({}))) as { transcripts?: TranscriptSummary[] };
      setList(data.transcripts ?? []);
    })();
  }, [patientId]);

  const openSession = useCallback(async (sessionId: string) => {
    setOpen(sessionId);
    setLoadingTurns(true);
    const res = await fetch(`/api/transcripts?sessionId=${encodeURIComponent(sessionId)}`);
    const data = (await res.json().catch(() => ({}))) as { transcript?: { turns: Turn[] } };
    setTurns(data.transcript?.turns ?? []);
    setLoadingTurns(false);
  }, []);

  useEffect(() => {
    if (originatingSessionId) void openSession(originatingSessionId);
  }, [originatingSessionId, openSession]);

  if (!patientId && !originatingSessionId) return null;

  return (
    <section className={`${cardClassName} p-4`}>
      <h2 className="mb-3 text-sm font-semibold">Conversation history</h2>

      {list.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {list.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => openSession(s.sessionId)}
              className={`chip ${
                open === s.sessionId ? "bg-accent/20 text-ink" : "bg-ink/5 text-muted"
              }`}
              title={`${s.message_count} messages`}
            >
              {fmt(s.updated_at)}
              {s.sessionId === originatingSessionId ? " · this intake" : ""}
            </button>
          ))}
        </div>
      )}

      {loadingTurns ? (
        <p className="text-sm text-muted">Loading transcript…</p>
      ) : open ? (
        <Turns turns={turns} />
      ) : (
        <p className="text-sm text-muted">
          {list.length ? "Select a conversation above." : "No linked conversation."}
        </p>
      )}
    </section>
  );
}
