import { withAccess } from "@/server/access";
import { listPatientTranscripts, getTranscript } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/transcripts?patientId=  → list a patient's conversations
 * GET /api/transcripts?sessionId=  → one conversation as role/text turns
 */
export const GET = withAccess(async (req) => {
  const q = new URL(req.url).searchParams;
  const sessionId = q.get("sessionId");
  if (sessionId) {
    const transcript = await getTranscript(sessionId);
    if (!transcript) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ transcript });
  }
  const patientId = q.get("patientId");
  if (!patientId) {
    return Response.json(
      { error: "bad_request", detail: "patientId or sessionId required" },
      { status: 400 },
    );
  }
  const transcripts = await listPatientTranscripts(patientId);
  return Response.json({ transcripts });
});
