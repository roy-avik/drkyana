import "server-only";
import { registerClient, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { corsJson, corsPreflight } from "@/server/oauth-http";

/**
 * Dynamic client registration (RFC 7591). Claude and ChatGPT register
 * themselves here before the authorize hop. Open endpoint by spec — a
 * registration grants nothing by itself: tokens only ever exist after
 * Dr Kyana signs in through Cloudflare Access and clicks Authorize.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return corsJson({ error: "invalid_client_metadata" }, 400);
  }
  const env = getCloudflareContext().env as unknown as Env;
  const { status, payload } = await registerClient(env, body);
  return corsJson(payload, status);
}
export function OPTIONS(): Response {
  return corsPreflight();
}
