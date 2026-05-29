"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

/**
 * Admin agent chat panel. Streams from /api/agent/admin via useChat.
 *
 * The agent loop itself is implemented by a later phase (1C); until then the
 * route returns 501. We surface that as a friendly "agent coming online" state
 * rather than an error, and disable the composer.
 */
export default function AgentChat() {
  const [input, setInput] = useState("");
  const [offline, setOffline] = useState(false);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent/admin" }),
    onError: (err) => {
      // The placeholder route returns 501; treat any non-OK as "coming online".
      if (/501|not_implemented|not implemented/i.test(err.message)) {
        setOffline(true);
      }
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Assistant</h1>
        <p className="text-sm text-muted">
          Drafts documents and answers questions about your practice. The
          assistant only drafts — you review and send.
        </p>
      </div>

      {offline && (
        <div className="card border-accent/30 bg-accent/5 text-sm text-ink">
          <strong>Assistant coming online.</strong> The agent runtime is being
          wired up. Chat will be available once it&rsquo;s deployed.
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
            Ask the assistant to draft aftercare instructions, a clinical note, or
            to summarize today&rsquo;s urgent intakes.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-brand text-white"
                  : "bg-surface-alt text-ink"
              }`}
            >
              {m.parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                ) : part.type.startsWith("tool-") ||
                  part.type === "dynamic-tool" ? (
                  <span key={i} className="block text-xs italic text-muted">
                    [tool: {("toolName" in part && part.toolName) || part.type}]
                  </span>
                ) : null,
              )}
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
