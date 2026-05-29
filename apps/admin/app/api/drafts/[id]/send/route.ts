import { withAccess } from "@/server/access";
import { getDraft, updateDraftStatus } from "@/server/db";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  // .../drafts/:id/send → id is second-to-last segment.
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] ?? "");
}

/**
 * POST /api/drafts/:id/send  body: { action: "approve" | "send" }
 *
 * STUB for Phase 1D. "approve" flips the draft to `approved` (real). "send" is
 * not wired to the email/PDF path yet — it marks the draft `sent` and returns
 * { stubbed: true } so the UI can confirm the action while the actual delivery
 * (compile_pdf → R2, send_receptionist_email) is implemented by a later agent.
 */
export const POST = withAccess(async (req, identity) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "send" ? "send" : "approve";

  const existing = await getDraft(id);
  if (!existing) return Response.json({ error: "not_found" }, { status: 404 });

  if (action === "approve") {
    const draft = await updateDraftStatus(id, "approved");
    return Response.json({ draft, approvedBy: identity.email });
  }

  // action === "send" — delivery pipeline not yet wired (Phase 1D).
  const draft = await updateDraftStatus(id, "sent");
  return Response.json({
    draft,
    stubbed: true,
    note: "Send pipeline (PDF compile + email) lands in Phase 1D; status marked sent.",
  });
});
