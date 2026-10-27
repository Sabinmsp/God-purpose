import { createQuestSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { createQuest } from "@/lib/server/services/quests";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, createQuestSchema);
  return stateResponse(ctx, await createQuest(ctx, input));
});
