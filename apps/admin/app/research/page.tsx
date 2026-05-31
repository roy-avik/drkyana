import { getAdminIdentity } from "@/server/page-auth";
import { listAgentRuns } from "@/server/db";
import NotAuthorized from "../components/NotAuthorized";
import ResearchManager from "../components/ResearchManager";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const identity = await getAdminIdentity();
  if (!identity) return <NotAuthorized />;
  const runs = await listAgentRuns(30);
  return <ResearchManager initialRuns={runs} />;
}
