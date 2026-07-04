/**
 * Admin MCP server — exposes the admin toolset AND the interactive admin
 * views (as MCP Apps) to agent hosts over Streamable HTTP.
 *
 * Deliberately hand-rolled and STATELESS (single JSON response per POST — no
 * SSE, no sessions, no @modelcontextprotocol/sdk dependency): every request
 * is independently authenticated by Cloudflare Access at the route layer, and
 * nothing here needs server-initiated messages. Spec-wise that is a legal
 * Streamable HTTP server (JSON responses; GET → 405).
 *
 * MCP Apps wiring (extension io.modelcontextprotocol/ui):
 *  - View tools carry `_meta.ui.resourceUri` (+ legacy `_meta["ui/resourceUri"]`)
 *    pointing at ui://drkyana/admin-view.html.
 *  - That resource is served by resources/read with mimeType
 *    "text/html;profile=mcp-app" and an EMPTY CSP (the template is fully
 *    self-contained — the iframe gets no network access at all).
 *  - App-only tools list `_meta.ui.visibility = ["app"]`: hosts hide them from
 *    the model; only the rendered view may call them.
 *
 * Approval mapping: ToolSpec.category → MCP annotations. Hosts use
 * readOnlyHint to decide which calls need the user's confirmation — the same
 * "agent drafts, dentist decides" gate needsApproval enforces in the in-app
 * agent loop.
 */
import { z } from "zod";
import { adminTools } from "../tools/admin";
import { appActionTools, viewTools, type ViewToolOutput } from "./tools";
import type { ToolSpec } from "../tools";
import type { AgentContext } from "../context";
import {
  ADMIN_VIEW_RESOURCE_URI,
  MCP_APP_MIME_TYPE,
  renderAdminViewTemplate,
} from "./template";

const SERVER_INFO = {
  name: "drkyana-admin",
  title: "Dr Kyana — practice console",
  version: "1.0.0",
};

const INSTRUCTIONS =
  "Dr Kyana's dental practice console. open_* tools render interactive admin views " +
  "(MCP Apps) — prefer them when the user wants to see or work records. The other " +
  "tools mirror the in-app admin agent's toolset. The agent drafts; the licensed " +
  "dentist reviews and decides — never bypass a confirmation the host asks for.";

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

interface RpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

type RpcResponse =
  | { jsonrpc: "2.0"; id: number | string | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: number | string | null;
      error: { code: number; message: string };
    };

const ok = (id: number | string | null, result: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});
const err = (
  id: number | string | null,
  code: number,
  message: string,
): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

// ---------------------------------------------------------------------------
// Tool listing
// ---------------------------------------------------------------------------

/** Everything callable over MCP (adminTools already includes the view tools). */
function callableTools(): Record<string, ToolSpec> {
  return { ...adminTools, ...appActionTools } as Record<string, ToolSpec>;
}

function toJsonSchema(spec: ToolSpec): Record<string, unknown> {
  try {
    return z.toJSONSchema(spec.inputSchema as z.ZodType, {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  } catch {
    return { type: "object", properties: {} };
  }
}

function toolMeta(name: string): Record<string, unknown> | undefined {
  if (name in viewTools) {
    return {
      ui: {
        resourceUri: ADMIN_VIEW_RESOURCE_URI,
        visibility: ["model", "app"],
      },
      "ui/resourceUri": ADMIN_VIEW_RESOURCE_URI,
    };
  }
  if (name in appActionTools) {
    return { ui: { visibility: ["app"] } };
  }
  return undefined;
}

function listTools(): unknown {
  const tools = Object.entries(callableTools())
    // Client-rendered specs (no execute) can't run over MCP.
    .filter(([, spec]) => typeof spec.execute === "function")
    .map(([name, spec]) => ({
      name,
      description: spec.description,
      inputSchema: toJsonSchema(spec),
      annotations: {
        readOnlyHint: spec.category === "read",
        openWorldHint: spec.category === "external",
      },
      ...(toolMeta(name) ? { _meta: toolMeta(name) } : {}),
    }));
  return { tools };
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function callTool(
  params: Record<string, unknown> | undefined,
  ctx: AgentContext,
): Promise<{ rpcError?: { code: number; message: string }; result?: unknown }> {
  const name = typeof params?.name === "string" ? params.name : "";
  const spec = callableTools()[name];
  if (!spec || typeof spec.execute !== "function") {
    return { rpcError: { code: -32602, message: `unknown tool: ${name}` } };
  }
  const raw = (params?.arguments as Record<string, unknown>) ?? {};
  const parsed = (spec.inputSchema as z.ZodType).safeParse(raw);
  if (!parsed.success) {
    return {
      rpcError: {
        code: -32602,
        message: `invalid arguments for ${name}: ${parsed.error.message}`,
      },
    };
  }
  let output: unknown;
  try {
    output = await spec.execute(parsed.data, ctx);
  } catch (e) {
    return {
      result: {
        content: [{ type: "text", text: `${name} failed: ${(e as Error).message}` }],
        isError: true,
      },
    };
  }

  // Tool-level soft errors ({ error }) → isError result.
  if (output && typeof output === "object" && "error" in output) {
    return {
      result: {
        content: [{ type: "text", text: String((output as { error: unknown }).error) }],
        isError: true,
      },
    };
  }

  // View tools: text = the model-facing summary, structuredContent = the doc.
  if (output && typeof output === "object" && "view" in output) {
    const vt = output as ViewToolOutput;
    return {
      result: {
        content: [{ type: "text", text: vt.summary }],
        structuredContent: { view: vt.view },
      },
    };
  }

  return {
    result: {
      content: [{ type: "text", text: JSON.stringify(output ?? null) }],
      ...(output && typeof output === "object"
        ? { structuredContent: output as Record<string, unknown> }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Resources (the single MCP App template)
// ---------------------------------------------------------------------------

/** Self-contained template ⇒ empty CSP: the iframe needs no network at all. */
const RESOURCE_UI_META = {
  ui: {
    csp: { connectDomains: [], resourceDomains: [] },
    prefersBorder: true,
  },
};

function listResources(): unknown {
  return {
    resources: [
      {
        uri: ADMIN_VIEW_RESOURCE_URI,
        name: "admin-view",
        title: "Dr Kyana admin view",
        description:
          "Renders any drkyana admin View-DSL document (intake queue, intake detail, " +
          "chambers, drafts, draft review, appointments).",
        mimeType: MCP_APP_MIME_TYPE,
        _meta: RESOURCE_UI_META,
      },
    ],
  };
}

function readResource(
  params: Record<string, unknown> | undefined,
): { rpcError?: { code: number; message: string }; result?: unknown } {
  const uri = typeof params?.uri === "string" ? params.uri : "";
  if (uri !== ADMIN_VIEW_RESOURCE_URI) {
    return { rpcError: { code: -32002, message: `resource not found: ${uri}` } };
  }
  return {
    result: {
      contents: [
        {
          uri: ADMIN_VIEW_RESOURCE_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: renderAdminViewTemplate(),
          _meta: RESOURCE_UI_META,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function dispatch(
  msg: RpcRequest,
  ctx: AgentContext,
): Promise<RpcResponse | undefined> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? undefined : err(id, -32600, "invalid request");
  }
  if (isNotification) return undefined; // notifications/initialized etc. — nothing to do

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : DEFAULT_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, listTools());
    case "tools/call": {
      const { rpcError, result } = await callTool(msg.params, ctx);
      return rpcError ? err(id, rpcError.code, rpcError.message) : ok(id, result);
    }
    case "resources/list":
      return ok(id, listResources());
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "resources/read": {
      const { rpcError, result } = readResource(msg.params);
      return rpcError ? err(id, rpcError.code, rpcError.message) : ok(id, result);
    }
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return err(id, -32601, `method not found: ${msg.method}`);
  }
}

/**
 * Handle one Streamable-HTTP POST. The caller has ALREADY authenticated the
 * request (Cloudflare Access) and built an admin AgentContext from the
 * verified identity — authorization inside tools still runs assertAdmin(ctx).
 */
export async function handleMcpPost(
  req: Request,
  ctx: AgentContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(err(null, -32700, "parse error"), 400);
  }

  // Batch support (pre-2025-06-18 clients); single-message is the common path.
  if (Array.isArray(body)) {
    const responses: RpcResponse[] = [];
    for (const m of body) {
      const r = await dispatch(m as RpcRequest, ctx);
      if (r) responses.push(r);
    }
    if (!responses.length) return new Response(null, { status: 202 });
    return jsonResponse(responses, 200);
  }

  const response = await dispatch(body as RpcRequest, ctx);
  if (!response) return new Response(null, { status: 202 });
  return jsonResponse(response, 200);
}

/** GET/DELETE are not offered (no SSE streams, no sessions). */
export function handleMcpMethodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
