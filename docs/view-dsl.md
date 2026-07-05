# View DSL — admin views as data, rendered by MCP Apps and the agent loop

**Status:** v1 · **Types:** `packages/types/src/view-dsl.ts` · **Builders:** `packages/server/src/mcp/views.ts` · **Renderers:** `packages/server/src/mcp/template.ts` (MCP App), `apps/admin/app/components/ViewRenderer.tsx` (in-app chat) · **Look & feel:** the DLS (`docs/dls.md`)

The View DSL is a small, versioned, declarative language describing the admin
console's views as **pure JSON data**, so agents can render them
**interactively** instead of paraphrasing them as text. One generic renderer
understands the whole language; the server builds documents from D1 rows per
request. The same document renders in two places:

1. **Agent hosts (MCP Apps).** Any MCP-Apps-capable host (Claude, ChatGPT, …)
   connects to the admin MCP endpoint and gets the views as interactive apps
   in sandboxed iframes ([MCP Apps extension](https://github.com/modelcontextprotocol/ext-apps),
   extension id `io.modelcontextprotocol/ui`).
2. **The in-app agent loop.** The admin assistant (AI SDK 6 `useChat`) calls
   the same view tools; `ViewRenderer` draws the document inline in the chat
   and executes its actions via `POST /api/views/action`.

```
agent host (Claude, …)                     admin assistant chat (apps/admin)
  │ tools/call open_intake_queue             │ agent loop calls open_intake_queue
  ▼   (MCP Streamable HTTP, CF Access)       ▼   (tool part carries { summary, view })
drkyana admin MCP server                   ViewRenderer.tsx
  /api/mcp → packages/server/src/mcp         │ actions → POST /api/views/action
  │ CallToolResult.structuredContent         │   (closed viewActionTools registry)
  │   = { view: ViewDocument }               ▼
  ▼                                        same ViewDocument, same DLS
ui://drkyana/admin-view.html (iframe)
  │ ui/notifications/tool-result → render
  │ clicks/forms → tools/call via host bridge
  ▼
Dr Kyana clicks; the click IS the human approval for that mutation
```

## Design goals

1. **Data, not code.** A document contains only display data and declared
   actions. No scripts, no HTML, no prompts, no credentials. Renderers
   sanitize everything (text via `textContent`, markdown through a restricted
   grammar with no raw-HTML pass-through).
2. **Interaction = named tool calls.** Every button, form and row-click is an
   `ActionCall { tool, args }`. A view can do nothing that wasn't exposed as
   a tool. Guardrail intact: the agent *drafts*, the dentist *clicks*.
3. **One renderer, many views.** New admin views are new document builders on
   the server — no template changes, no client deploys.
4. **Model-context hygiene.** View tools return the document as
   `structuredContent` for the renderer, but the MODEL only sees a one-line
   summary (`modelSummary` → AI SDK `toModelOutput`; the MCP text content
   block). Documents are still kept compact — they carry PHI.
5. **Versioned.** `v: 1` on every document. Renderers reject unknown major
   versions with a visible callout rather than mis-rendering.

## Document grammar (v1)

```
ViewDocument := {
  v: 1,
  key: string,              // stable view identity, e.g. "intake_queue"
  title: string,
  subtitle?: string,
  badges?: BadgeSpec[],
  refresh?: ActionCall,     // rebuilds this document (run after writes)
  children: ViewNode[]
}

ViewNode := SectionNode | TableNode | KeyValueNode | TextNode | MarkdownNode
          | BadgesNode | CalloutNode | ActionsNode | FormNode

SectionNode  := { type:"section", title?, children: ViewNode[] }
TableNode    := { type:"table", columns: TableColumn[], rows: object[],
                  onRowOpen?: { call: ActionCall, argKey, rowKey },
                  rowTones?: { [rowIndex]: Tone }, empty?: string }
TableColumn  := { key, label, format?: ColumnFormat, align?: "start"|"end" }
ColumnFormat := "text" | "date" | "datetime" | "badge" | "chips" | "number"
KeyValueNode := { type:"keyvalue", items: {label, value, format?, tone?}[], columns?: 1|2|3 }
TextNode     := { type:"text", text, muted? }
MarkdownNode := { type:"markdown", markdown }        // sanitized subset
BadgesNode   := { type:"badges", badges: BadgeSpec[] }
CalloutNode  := { type:"callout", tone: Tone, text }
ActionsNode  := { type:"actions", actions: Action[] }
FormNode     := { type:"form", title?, fields: FormField[], submit: Action }

Action     := { label, call: ActionCall, tone?, confirm?, refresh? }
ActionCall := { tool: string, args?: object }
Tone       := DLS tone — "neutral"|"brand"|"info"|"success"|"warning"|"danger"
FormField  := { name, label?, type: "text"|"textarea"|"number"|"select"|
                "checkbox"|"hidden", value?, options?, placeholder?,
                required?, json? }
```

### Action semantics

- **Over MCP:** the template executes `ActionCall`s with `tools/call` through
  the MCP Apps bridge; the host proxies them over the authenticated server
  connection and may apply its own approval UX for non-read-only tools.
- **In-app:** `ViewRenderer` POSTs `{ tool, args }` to `/api/views/action`,
  which executes only the closed `viewActionTools` registry (view tools +
  `ui_*` draft actions + `update_status` + `upsert_chamber`).
- **Result handling:** if the result carries a new `view`, it **replaces**
  the current one (navigation — queue row → intake detail). Otherwise, when
  the action has `refresh !== false`, the renderer re-runs the document's
  `refresh` call (mutation → re-render). Errors surface as a `danger` flash
  without destroying view state.
- `confirm` is a renderer-side `confirm()` gate, *additional to* any host
  approval prompt.
- **Form args:** submitted args = field values merged under fixed
  `submit.call.args`, fixed args winning — a document pins the record id, so
  a form can never redirect a mutation at another record.
- After a successful MCP-side action the template calls
  `ui/update-model-context` with a one-line summary (e.g.
  `ran update_status: intake → contacted`), so the agent's next turn knows
  what the human did in the view.

### Versioning rules

- Additive changes (new node types, new optional fields) do **not** bump `v`;
  renderers must ignore unknown fields and render unknown node types as a
  muted "unsupported block" placeholder.
- Breaking changes bump `v`; renderers show a `danger` callout for documents
  newer than they support.

## MCP surface

The admin worker mounts a **stateless Streamable-HTTP MCP endpoint** at
`POST /api/mcp` (single JSON response per call; no SSE, no sessions; GET →
405), fronted by Cloudflare Access like every other admin route — connect a
host with an Access **service token** (`CF-Access-Client-Id`/`-Secret`
headers).

| Group | Tools | Model-visible | Notes |
|---|---|---|---|
| **View tools** (read) | `open_intake_queue`, `open_intake`, `open_chambers`, `open_drafts`, `open_draft`, `open_appointments` | yes | `_meta.ui.resourceUri = "ui://drkyana/admin-view.html"` (+ legacy `_meta["ui/resourceUri"]`) so hosts render the app; text content = the model summary, `structuredContent = { view }`. |
| **Admin agent tools** | the whole `adminTools` registry (`list_intakes`, `update_status`, `draft_*`, …) | yes | Zod schemas → JSON Schema (zod v4 `z.toJSONSchema`); `category` maps to annotations — `read → readOnlyHint`, `external → openWorldHint`. Hosts gate non-read tools behind user approval, mirroring `needsApproval`. |
| **App-only tools** | `ui_update_draft`, `ui_set_draft_status` | **no** (`_meta.ui.visibility = ["app"]`) | Callable only from the rendered view — Dr Kyana's click is the approval (`needsApproval: false` by design). |

The single UI resource `ui://drkyana/admin-view.html`
(`text/html;profile=mcp-app`) is fully self-contained and declares an **empty
CSP** (no network origins at all): it talks nothing but
JSON-RPC-over-postMessage to the host (`ui/initialize` handshake →
`ui/notifications/tool-result` in, `tools/call` out, DLS host-theme adoption
via `hostContext.styles`).

## Adding a view

1. Write a builder in `packages/server/src/mcp/views.ts` returning a
   `ViewDocument` (set `refresh` to the call that rebuilds it).
2. Register a view tool in `packages/server/src/mcp/tools.ts` (`category:
   "read"`, `modelSummary`, result `{ summary, view }`) and add it to
   `viewTools`.
3. Nothing else — both renderers draw it, the admin agent can call it, and
   `tools/list` advertises it with the MCP-Apps metadata.

Keep documents **compact** and PHI-lean: include only what the view shows
(same hygiene rule as agent tools).
