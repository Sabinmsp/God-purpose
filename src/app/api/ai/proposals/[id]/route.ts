import { proposalDecisionSchema } from "@/lib/shared/ai";
import { authed, idParam, json, readJson } from "@/lib/server/http";
import { decideProposal, listMemories, listProposals } from "@/lib/server/services/ai";
import { buildState } from "@/lib/server/services/state";

/**
 * Approve or dismiss one AI suggestion. This is the only way an AI suggestion
 * can affect the game, and it always requires this explicit request.
 */
export const POST = authed(async (ctx) => {
  const { decision, repeat } = await readJson(ctx.req, proposalDecisionSchema);
  const { events } = await decideProposal(ctx, idParam(ctx.params), decision, repeat);
  return json({
    ok: true,
    events,
    state: await buildState(ctx),
    proposals: await listProposals(ctx.sql, ctx.playerId),
    memories: await listMemories(ctx.sql, ctx.playerId),
  });
});
