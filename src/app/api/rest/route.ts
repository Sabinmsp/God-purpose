import { restDaySchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { setRestDay } from "@/lib/server/services/quests";

export const POST = authed(async (ctx) => {
  const { scope, on, note } = await readJson(ctx.req, restDaySchema);
  return stateResponse(ctx, await setRestDay(ctx, scope, on, note));
});
