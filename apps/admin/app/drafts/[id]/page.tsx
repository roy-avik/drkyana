import { notFound } from "next/navigation";
import { getAdminIdentity } from "@/server/page-auth";
import { getDraft } from "@/server/db";
import DraftReview from "../../components/DraftReview";
import NotAuthorized from "../../components/NotAuthorized";

export const dynamic = "force-dynamic";

export default async function DraftReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return <NotAuthorized />;

  const { id } = await params;
  const draft = await getDraft(id);
  if (!draft) notFound();

  return <DraftReview initial={draft} />;
}
