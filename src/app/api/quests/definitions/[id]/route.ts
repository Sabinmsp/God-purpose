import { updateQuestSchema } from "@/lib/shared/schemas";
import { authed, idParam, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { archiveQuest, updateQuest } from "@/lib/server/services/quests";

export const PATCH = authed(async (ctx) => {
  const patch = await readJson(ctx.req, updateQuestSchema);
  return stateResponse(ctx, await updateQuest(ctx, idParam(ctx.params), patch));
});

export const DELETE = authed(async (ctx) => stateResponse(ctx, await archiveQuest(ctx, idParam(ctx.params))));
