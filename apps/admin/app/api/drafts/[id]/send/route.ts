import "server-only";
import { withAccess } from "@/server/access";
import { getDraft, updateDraftStatus } from "@/server/db";
import {
  deliverPatientEmail,
  recordAdminAction,
  renderMarkdownToPdf,
  type Env,
} from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  // .../drafts/:id/send → id is second-to-last segment.
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] ?? "");
}

/** Base64 without blowing the stack on multi-MB PDFs (no spread of huge arrays). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * POST /api/drafts/:id/send  body: { action: "approve" | "send" }
 *
 * "approve" flips the draft to `approved`. "send" actually delivers it:
 * compile the PDF if the draft doesn't have one yet (same `pdf/<id>.pdf` key
 * the compile_pdf job uses) → email it to the patient's verified address with
 * the PDF attached → ONLY then mark the draft `sent` and record the action.
 * A failed delivery leaves the status untouched and returns the transport
 * errors — the UI must never claim a document went out when it didn't (the
 * previous version of this route did exactly that, returning {stubbed:true}).
 *
 * Delivery transport: Cloudflare EMAIL binding first (works for any recipient
 * once the sending domain is onboarded), SMTP via the drkyana-ops service
 * binding as fallback (works today — it's the same path OTP codes take).
 */
export const POST = withAccess(async (req, identity) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "send" ? "send" : "approve";
  const env = getCloudflareContext().env as unknown as Env;

  const draft = await getDraft(id);
  if (!draft) return Response.json({ error: "not_found" }, { status: 404 });

  if (action === "approve") {
    const updated = await updateDraftStatus(id, "approved");
    return Response.json({ draft: updated, approvedBy: identity.email });
  }

  // --- action === "send" ---------------------------------------------------
  // 1. Resolve the recipient: the linked patient's email-verified address.
  if (!draft.patient_id) {
    return Response.json(
      { error: "draft has no linked patient — cannot send" },
      { status: 422 },
    );
  }
  const patient = await env.DB.prepare(
    "SELECT name, email FROM patients WHERE id = ? AND email_verified_at IS NOT NULL",
  )
    .bind(draft.patient_id)
    .first<{ name: string | null; email: string | null }>();
  if (!patient?.email) {
    return Response.json(
      { error: "patient has no verified email on file — cannot send" },
      { status: 422 },
    );
  }

  // 2. Ensure the PDF exists (compile inline if the job never ran), then load it.
  let pdfKey = draft.pdf_r2_key ?? null;
  if (!pdfKey) {
    const { bytes } = await renderMarkdownToPdf(draft.markdown, draft.type);
    pdfKey = `pdf/${draft.id}.pdf`;
    await env.R2.put(pdfKey, bytes.buffer as ArrayBuffer, {
      httpMetadata: { contentType: "application/pdf" },
    });
    await env.DB.prepare(
      "UPDATE drafts SET pdf_r2_key = ?, updated_at = unixepoch() WHERE id = ?",
    )
      .bind(pdfKey, draft.id)
      .run();
  }
  const stored = await env.R2.get(pdfKey);
  if (!stored) {
    return Response.json({ error: `pdf missing from storage: ${pdfKey}` }, { status: 500 });
  }
  const pdfBytes = new Uint8Array(await stored.arrayBuffer());

  // 3. Deliver, PDF attached. Subject/body stay minimal — the document IS the
  //    content, and the patient can always see it on /account too.
  const title = draft.title?.trim() || draft.type;
  const result = await deliverPatientEmail(env, {
    to: patient.email,
    subject: `Your document from Dr Kyana — ${title}`,
    body:
      `Dear ${patient.name ?? "patient"},\n\n` +
      `Please find attached: ${title}.\n` +
      `You can also view your documents any time at https://drkyana.com/account\n\n` +
      `— Dr Kyana's Clinic`,
    attachment: {
      filename: `${draft.type}-${draft.id.slice(0, 8)}.pdf`,
      contentBase64: toBase64(pdfBytes),
      mimeType: "application/pdf",
    },
  });

  if (!result.ok) {
    // Status untouched: the document did NOT go out.
    return Response.json({ error: `delivery failed — ${result.error}` }, { status: 502 });
  }

  // 4. Only now is "sent" true. Log WHO sent WHAT via WHICH transport
  //    (ids + transport only — the audit stays PHI-lean).
  const updated = await updateDraftStatus(id, "sent");
  await recordAdminAction(env, {
    actor: identity.email,
    surface: "app-view",
    tool: "send_draft",
    args: { draftId: id, transport: result.transport },
  });
  return Response.json({ draft: updated, sentBy: identity.email, transport: result.transport });
});
