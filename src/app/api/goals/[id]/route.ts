import { goalUpdateSchema } from "@/lib/shared/schemas";
import { authed, idParam, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { updateGoal } from "@/lib/server/services/goals";

export const PATCH = authed(async (ctx) => {
  const patch = await readJson(ctx.req, goalUpdateSchema);
  return stateResponse(ctx, await updateGoal(ctx, idParam(ctx.params), patch));
});
