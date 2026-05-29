import { withAccess } from "@/server/access";
import { listAdminSessions, getAdminSessionMessages } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent-sessions        → list recent admin assistant conversations
 * GET /api/agent-sessions?id=…   → the stored UIMessage[] for one (to restore chat)
 */
export const GET = withAccess(async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const messages = await getAdminSessionMessages(id);
    return Response.json({ messages });
  }
  const sessions = await listAdminSessions();
  return Response.json({ sessions });
});
