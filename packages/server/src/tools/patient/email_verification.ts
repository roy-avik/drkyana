/**
 * email_verification — client-rendered. The patient agent calls this AFTER
 * the intake form returns (collect_intake) and BEFORE submit_intake. The
 * receptionist UI handles the two-step flow (email entry → code entry) by
 * calling /api/auth/patient/email/request and /verify directly; the tool
 * itself does no server work.
 *
 * On completion the UI returns `{ verified: true, email }` via addToolResult.
 * The server-side stamp lives on `sessions.verified_email`, which the Pages
 * Function reads into `ctx.caller.verifiedEmail` on the NEXT turn — submit_intake
 * then sees the verified state from context, not from this tool's args.
 */
import { z } from "zod";
import { defineTool } from "../../tools";

const inputSchema = z.object({
  email: z
    .string()
    .email()
    .optional()
    .describe(
      "The patient's email, taken from the intake form when available. If absent, " +
        "the UI prompts for it before sending the code.",
    ),
});

export const emailVerificationTool = defineTool({
  name: "email_verification",
  description:
    "Open the email verification step. The UI handles the OTP round-trip " +
    "(sends a 6-digit code to the patient's email, accepts the code, marks the " +
    "session as verified server-side). Call this AFTER collect_intake returns " +
    "and BEFORE submit_intake — submit will refuse with " +
    "'email_verification_required' if the session has not been verified. If " +
    "you already have the patient's email from the form, pass it; otherwise " +
    "leave it empty and the UI will prompt.",
  category: "read",
  inputSchema,
  // No execute → client-rendered. The UI calls /api/auth/patient/email/{request,verify}
  // and returns the verification result via addToolResult.
});
