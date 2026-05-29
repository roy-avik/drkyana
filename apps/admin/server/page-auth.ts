import "server-only";
import { headers } from "next/headers";
import { verifyAccess, AccessDeniedError, type AdminIdentity } from "./access";

/**
 * Server-component / server-action variant of the Access gate. Reconstructs a
 * Request-like object from the incoming headers (Cloudflare Access injects
 * `Cf-Access-Jwt-Assertion`) and verifies it. Returns the identity, or null if
 * unverified (the page renders a sign-in notice rather than throwing).
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const h = await headers();
  // jose/verifyAccess only reads headers off the Request, so a minimal stand-in
  // with the same header bag is sufficient.
  const req = new Request("https://admin.local/", { headers: h });
  try {
    return await verifyAccess(req);
  } catch (err) {
    if (err instanceof AccessDeniedError) return null;
    throw err;
  }
}
