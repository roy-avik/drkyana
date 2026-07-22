/**
 * get_intake — full detail of a single intake (one visit), for drafting and
 * review. Reads the complete row so the agent has complaint + medical/dental
 * history + logistics in one place.
 *
 * category 'read'.
 */
import { z } from "zod";
import type { IntakeRow } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchIntake } from "./shared";

const inputSchema = z.object({
  id: z.string().min(1).describe("The intake id."),
});

export const getIntakeTool = defineTool({
  name: "get_intake",
  description:
    "Fetch the full detail of one intake by id — complaint, medical and dental " +
    "history, logistics, triage, and status. Use before drafting a note, " +
    "referral, certificate, or follow-up for that visit.",
  category: "read",
  phiRead: true,
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ intake: IntakeRow } | { intake: null }> {
    assertAdmin(ctx);
    const intake = await fetchIntake(ctx.env, args.id);
    return { intake };
  },
});
