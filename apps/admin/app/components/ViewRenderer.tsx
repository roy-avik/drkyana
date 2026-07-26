"use client";

import { useCallback, useState } from "react";
import type {
  Action,
  ActionCall,
  BadgeSpec,
  ColumnFormat,
  FormNode,
  TableNode,
  Tone,
  ViewDocument,
  ViewNode,
  VIEW_DSL_VERSION,
} from "@drkyana/types";
import { renderMarkdown } from "@drkyana/types";
import { Button, Input, Select, Textarea } from "@drkyana/ui";

/**
 * In-app renderer for View-DSL documents (docs/view-dsl.md) — the agent-loop
 * counterpart of the MCP App template. When the admin assistant calls a view
 * tool, the tool part carries `{ summary, view }`; this component renders the
 * document with the same DLS semantics (tones, formats, actions) using the
 * admin app's Tailwind theme, and executes ActionCalls via POST
 * /api/views/action (the click is Dr Kyana's approval).
 */

const SUPPORTED_VERSION: typeof VIEW_DSL_VERSION = 1;

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  brand: "text-brand",
  info: "text-accent",
  success: "text-green",
  warning: "text-orange",
  danger: "text-red",
};

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-ink/5 text-muted",
  brand: "bg-brand text-white",
  info: "border border-accent/50 text-accent",
  success: "border border-green/50 text-green",
  warning: "border border-orange/50 text-orange",
  danger: "border border-red/50 text-red",
};

function Chip({ spec }: { spec: unknown }) {
  if (spec === null || spec === undefined || spec === "")
    return <span className="text-muted">—</span>;
  const b: BadgeSpec =
    typeof spec === "object"
      ? (spec as BadgeSpec)
      : { text: String(spec), tone: "neutral" };
  return <span className={`chip ${TONE_CHIP[b.tone ?? "neutral"]}`}>{b.text}</span>;
}

function fmtCell(value: unknown, format?: ColumnFormat): React.ReactNode {
  if (format === "date" || format === "datetime") {
    const n = Number(value);
    if (!n) return <span className="text-muted">—</span>;
    const d = new Date(n * 1000);
    return format === "date" ? d.toLocaleDateString() : d.toLocaleString();
  }
  if (format === "badge") return <Chip spec={value} />;
  if (format === "chips") {
    const list = Array.isArray(value) ? value : [];
    return (
      <span className="flex flex-wrap gap-1">
        {list.map((v, i) => (
          <Chip key={i} spec={v} />
        ))}
      </span>
    );
  }
  if (value === null || value === undefined || value === "")
    return <span className="text-muted">—</span>;
  return String(value);
}

type RunCall = (call: ActionCall, opts?: { refresh?: boolean; confirm?: string }) => void;

function ActionButton({ action, run }: { action: Action; run: RunCall }) {
  const primary = action.tone === "brand" || action.tone === "success";
  return (
    <Button
      size="sm"
      tone={primary ? "brand" : "neutral"}
      onClick={() =>
        run(action.call, { refresh: action.refresh, confirm: action.confirm })
      }
    >
      {action.label}
    </Button>
  );
}

function Table({ node, run }: { node: TableNode; run: RunCall }) {
  if (!node.rows.length)
    return <p className="text-sm text-muted">{node.empty ?? "Nothing here."}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {node.columns.map((c) => (
              <th
                key={c.key}
                className={`border-b border-ink/10 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted ${
                  c.align === "end" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {node.rows.map((row, i) => {
            const open = node.onRowOpen;
            const openable = open && row[open.rowKey];
            const tone = node.rowTones?.[i];
            return (
              <tr
                key={i}
                className={`${openable ? "cursor-pointer hover:bg-surface-alt" : ""} ${
                  tone ? "border-l-2 border-l-red" : ""
                }`}
                onClick={
                  openable
                    ? () =>
                        run(
                          {
                            tool: open.call.tool,
                            args: { ...open.call.args, [open.argKey]: row[open.rowKey] },
                          },
                          { refresh: false },
                        )
                    : undefined
                }
              >
                {node.columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border-b border-ink/5 px-2 py-1.5 align-top ${
                      c.align === "end" ? "text-right" : ""
                    }`}
                  >
                    {fmtCell(row[c.key], c.format)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Form({ node, run }: { node: FormNode; run: RunCall }) {
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const args: Record<string, unknown> = {};
    for (const f of node.fields) {
      let v: unknown;
      if (f.type === "checkbox") v = fd.get(f.name) !== null;
      else if (f.type === "hidden") v = f.value;
      else v = fd.get(f.name);
      if (v === "" || v === null || v === undefined) continue;
      if (f.type === "number") v = Number(v);
      if (f.json && typeof v === "string") {
        try {
          v = JSON.parse(v);
        } catch {
          setError(`"${f.label ?? f.name}" must be valid JSON.`);
          return;
        }
      }
      args[f.name] = v;
    }
    // Fixed args win — a document pins record ids against redirection.
    run(
      { tool: node.submit.call.tool, args: { ...args, ...node.submit.call.args } },
      { refresh: node.submit.refresh, confirm: node.submit.confirm },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {node.title && <h3 className="text-sm font-semibold">{node.title}</h3>}
      {error && <p role="alert" className="text-xs text-red">{error}</p>}
      {node.fields.map((f) => {
        if (f.type === "hidden") return null;
        const value = f.value == null ? "" : String(f.value);
        return (
          <div key={f.name}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={f.name} defaultChecked={!!f.value} />
                {f.label ?? f.name}
              </label>
            ) : (
              <>
                {f.label && <span className="field-label">{f.label}</span>}
                {f.type === "textarea" ? (
                  <Textarea
                    className="min-h-[120px] font-mono text-xs"
                    name={f.name}
                    defaultValue={value}
                    required={f.required}
                  />
                ) : f.type === "select" ? (
                  <Select
                    name={f.name}
                    defaultValue={value}
                    required={f.required}
                    options={f.options ?? []}
                  />
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    name={f.name}
                    defaultValue={value}
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      <Button type="submit" tone="brand" size="sm">
        {node.submit.label}
      </Button>
    </form>
  );
}

function Node({ node, run }: { node: ViewNode; run: RunCall }) {
  switch (node.type) {
    case "section":
      return (
        <div className="rounded-lg border border-ink/10 p-3">
          {node.title && <h3 className="mb-2 text-sm font-semibold">{node.title}</h3>}
          <div className="space-y-2">
            {node.children.map((c, i) => (
              <Node key={i} node={c} run={run} />
            ))}
          </div>
        </div>
      );
    case "text":
      return (
        <p className={`text-sm ${node.muted ? "text-muted" : "text-ink"}`}>{node.text}</p>
      );
    case "markdown":
      return (
        <div
          className="prose-draft text-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(node.markdown) }}
        />
      );
    case "badges":
      return (
        <div className="flex flex-wrap gap-1.5">
          {node.badges.map((b, i) => (
            <Chip key={i} spec={b} />
          ))}
        </div>
      );
    case "callout":
      return (
        <p
          className={`rounded border border-current/30 px-3 py-2 text-xs ${TONE_TEXT[node.tone]}`}
        >
          {node.text}
        </p>
      );
    case "keyvalue":
      return (
        <dl
          className={`grid gap-x-4 gap-y-2 ${
            node.columns === 1
              ? "grid-cols-1"
              : node.columns === 3
                ? "grid-cols-3"
                : "grid-cols-2"
          }`}
        >
          {node.items.map((item, i) => (
            <div key={i}>
              <dt className="field-label">{item.label}</dt>
              <dd
                className={`text-sm ${item.tone ? TONE_TEXT[item.tone] : "text-ink"}`}
              >
                {fmtCell(item.value, item.format)}
              </dd>
            </div>
          ))}
        </dl>
      );
    case "actions":
      return (
        <div className="flex flex-wrap gap-2">
          {node.actions.map((a, i) => (
            <ActionButton key={i} action={a} run={run} />
          ))}
        </div>
      );
    case "table":
      return <Table node={node} run={run} />;
    case "form":
      return <Form node={node} run={run} />;
    default:
      return (
        <p className="text-xs italic text-muted">
          [unsupported block: {(node as { type?: string }).type}]
        </p>
      );
  }
}

export default function ViewRenderer({ initial }: { initial: ViewDocument }) {
  const [doc, setDoc] = useState<ViewDocument>(initial);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ text: string; tone: Tone } | null>(null);

  const run = useCallback<RunCall>(
    (call, opts) => {
      if (opts?.confirm && !window.confirm(opts.confirm)) return;
      setBusy(true);
      setFlash(null);
      void (async () => {
        try {
          const res = await fetch("/api/views/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tool: call.tool, args: call.args ?? {} }),
          });
          const data = (await res.json()) as {
            result?: { summary?: string; view?: ViewDocument; error?: string } & Record<
              string,
              unknown
            >;
            error?: string;
          };
          if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
          const out = data.result ?? {};
          if (out.error) throw new Error(out.error);
          if (out.view) {
            setDoc(out.view);
            return;
          }
          setFlash({ text: out.summary ?? `${call.tool} done`, tone: "success" });
          if (opts?.refresh !== false && doc.refresh) {
            const r = await fetch("/api/views/action", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                tool: doc.refresh.tool,
                args: doc.refresh.args ?? {},
              }),
            });
            const rd = (await r.json()) as { result?: { view?: ViewDocument } };
            if (rd.result?.view) setDoc(rd.result.view);
          }
        } catch (e) {
          setFlash({ text: (e as Error).message, tone: "danger" });
        } finally {
          setBusy(false);
        }
      })();
    },
    [doc],
  );

  if (doc.v !== SUPPORTED_VERSION) {
    return (
      <p className="text-xs text-red">
        This view uses an unsupported view-DSL version — refresh the app.
      </p>
    );
  }

  return (
    <div
      className={`my-1 w-full space-y-3 rounded-lg border border-ink/10 bg-white p-3 text-left ${
        busy ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{doc.title}</h2>
        {(doc.badges ?? []).map((b, i) => (
          <Chip key={i} spec={b} />
        ))}
      </div>
      {doc.subtitle && <p className="text-xs text-muted">{doc.subtitle}</p>}
      {flash && <p className={`text-xs ${TONE_TEXT[flash.tone]}`}>{flash.text}</p>}
      {doc.children.map((node, i) => (
        <Node key={i} node={node} run={run} />
      ))}
    </div>
  );
}
