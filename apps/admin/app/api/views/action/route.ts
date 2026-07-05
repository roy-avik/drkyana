import "server-only";
import {
  viewActionTools,
  recordAdminAction,
  type AgentContext,
  type Env,
} from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withAccess } from "@/server/access";

/**
 * Action executor for View-DSL documents rendered INSIDE the admin app
 * (ViewRenderer in the assistant chat). Rendered views express interaction as
 * tool calls; over MCP the host proxies them, and in-app this route runs them.
 *
 * Restricted to `viewActionTools` — the closed set of tools view documents
 * reference (navigation/refresh, draft actions, the two view-form writes).
 * The caller is the Access-verified dentist and the click is her approval;
 * tools still authorize via assertAdmin(ctx).
 */

interface ActionBody {
  tool?: string;
  args?: Record<string, unknown>;
}

export const POST = withAccess(async (req, identity) => {
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const spec = body.tool ? viewActionTools[body.tool] : undefined;
  if (!spec || typeof spec.execute !== "function") {
    return json({ error: `unknown view action: ${body.tool ?? ""}` }, 400);
  }
  const parsed = spec.inputSchema.safeParse(body.args ?? {});
  if (!parsed.success) {
    return json({ error: `invalid arguments: ${parsed.error.message}` }, 400);
  }

  const { env: cfEnv, ctx } = getCloudflareContext();
  const agentCtx: AgentContext = {
    env: cfEnv as unknown as Env,
    caller: { kind: "admin", email: identity.email, accessSub: identity.sub },
    locale: "en",
    abortSignal: req.signal,
    waitUntil: (p) => ctx.waitUntil(p),
  };

  try {
    const result = await spec.execute(parsed.data, agentCtx);
    // Cross-session activity log: in-app view clicks that WRITE are recorded
    // so other sessions (incl. MCP hosts) can see them.
    if (
      spec.category !== "read" &&
      !(result && typeof result === "object" && "error" in result)
    ) {
      ctx.waitUntil(
        recordAdminAction(agentCtx.env, {
          actor: identity.email,
          surface: "app-view",
          tool: body.tool!,
          args: parsed.data,
        }),
      );
    }
    return json({ result }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
