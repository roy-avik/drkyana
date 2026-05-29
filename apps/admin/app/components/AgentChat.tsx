"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";

/**
 * Admin agent chat. Streams from /api/agent/admin via useChat.
 *
 * Generative UI: write/external tools are approval-gated server-side, so the
 * agent's proposed actions arrive as `approval-requested` tool parts. We render
 * those as interactive confirmation FORMS (not text) and respond with
 * addToolApprovalResponse — "the assistant spews a form; Dr Kyana confirms."
 */

const TOOL_LABEL: Record<string, string> = {
  create_appointment: "Create appointment",
  reschedule_appointment: "Reschedule appointment",
  set_appointment_status: "Update appointment status",
  update_status: "Change intake status",
  upsert_chamber: "Save chamber",
  update_patient_memory: "Update patient record",
  send_receptionist_email: "Send email (from the clinic address)",
  compile_pdf: "Build PDF",
  start_radiology_analysis: "Analyze radiograph",
};

function labelFor(toolName: string): string {
  return TOOL_LABEL[toolName] ?? toolName.replace(/_/g, " ");
}

const TS_KEYS = new Set(["scheduledAt", "scheduled_at", "at", "since", "until"]);

function fmtValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (TS_KEYS.has(key) && typeof v === "number") {
    return new Date(v * 1000).toLocaleString();
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Minimal structural view of a tool UI part (the SDK's full types are heavy). */
interface ToolPartLike {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
}

function toolNameOf(p: ToolPartLike): string {
  if (p.type === "dynamic-tool") return p.toolName ?? "tool";
  return p.type.replace(/^tool-/, "");
}

function ArgList({ input }: { input: unknown }) {
  if (!input || typeof input !== "object") return null;
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (!entries.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium text-muted">{k}</dt>
          <dd className="break-words text-ink">{fmtValue(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ApprovalCard({
  part,
  onRespond,
}: {
  part: ToolPartLike;
  onRespond: (id: string, approved: boolean, reason?: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const id = part.approval?.id;
  const name = toolNameOf(part);
  if (!id) return null;

  return (
    <div className="my-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left">
      <p className="text-xs font-semibold text-amber-900">
        Proposed: {labelFor(name)}
      </p>
      <ArgList input={part.input} />
      <input
        className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
        placeholder="Note / reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={done}
      />
      <div className="mt-2 flex gap-2">
        <button
          className="btn-primary text-xs"
          disabled={done}
          onClick={() => {
            setDone(true);
            onRespond(id, true, reason || undefined);
          }}
        >
          Approve
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={done}
          onClick={() => {
            setDone(true);
            onRespond(id, false, reason || undefined);
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}

function ToolPart({
  part,
  onRespond,
}: {
  part: ToolPartLike;
  onRespond: (id: string, approved: boolean, reason?: string) => void;
}) {
  const name = toolNameOf(part);
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <p className="my-1 text-xs italic text-muted">Preparing {labelFor(name)}…</p>
      );
    case "approval-requested":
      return <ApprovalCard part={part} onRespond={onRespond} />;
    case "approval-responded":
      return (
        <p className="my-1 text-xs text-muted">
          {part.approval?.approved ? "✓ Approved" : "✗ Denied"} · {labelFor(name)}
        </p>
      );
    case "output-error":
      return (
        <p className="my-1 text-xs text-red">
          {labelFor(name)} failed: {part.errorText ?? "error"}
        </p>
      );
    case "output-available": {
      const out = part.output as Record<string, unknown> | string | undefined;
      const md =
        out && typeof out === "object" && typeof out.markdown === "string"
          ? (out.markdown as string)
          : null;
      return (
        <div className="my-1 text-xs text-muted">
          ✓ {labelFor(name)}
          {md && (
            <pre className="mt-1 whitespace-pre-wrap rounded bg-surface-alt p-2 text-ink">
              {md}
            </pre>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

export default function AgentChat() {
  const [input, setInput] = useState("");
  const [offline, setOffline] = useState(false);

  const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent/admin" }),
    // After an Approve/Deny is recorded, auto-send the updated history back so
    // the server resumes the agent and actually executes the approved tool
    // (the DB write). Without this the approval is recorded client-side only.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (err) => {
      if (/501|not_implemented|not implemented/i.test(err.message)) setOffline(true);
    },
  });

  const busy = status === "submitted" || status === "streaming";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  function respond(id: string, approved: boolean, reason?: string) {
    void addToolApprovalResponse({ id, approved, reason });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Assistant</h1>
        <p className="text-sm text-muted">
          Proposes actions as forms you approve, and drafts documents. It never
          acts without your confirmation. (English &amp; Persian.)
        </p>
      </div>

      {offline && (
        <div className="card border-accent/30 bg-accent/5 text-sm text-ink">
          <strong>Assistant coming online.</strong> The agent runtime is being
          wired up.
        </div>
      )}

      {error && !offline && (
        <div className="card border-red/30 bg-red/5 text-sm text-red">
          {error.message}
        </div>
      )}

      <div className="card min-h-[280px] space-y-3">
        {messages.length === 0 && !offline && (
          <p className="text-sm text-muted">
            Ask the assistant to book or reschedule an appointment, change an
            intake&rsquo;s status, draft aftercare, or summarize today&rsquo;s urgent
            intakes.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-brand text-white" : "bg-surface-alt text-ink"
              }`}
            >
              {m.parts.map((part, i) => {
                const p = part as unknown as ToolPartLike;
                if (p.type === "text") {
                  return (
                    <span key={i} className="whitespace-pre-wrap">
                      {(part as unknown as { text: string }).text}
                    </span>
                  );
                }
                if (p.type.startsWith("tool-") || p.type === "dynamic-tool") {
                  return <ToolPart key={i} part={p} onRespond={respond} />;
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-muted">Thinking…</p>}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={offline ? "Assistant offline" : "Message the assistant…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={offline || busy}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={offline || busy || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
