import { savingsGoalUpdateSchema } from "@/lib/shared/schemas";
import { authed, idParam, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { updateSavingsGoal } from "@/lib/server/services/money";

export const PATCH = authed(async (ctx) => {
  const patch = await readJson(ctx.req, savingsGoalUpdateSchema);
  return stateResponse(ctx, await updateSavingsGoal(ctx, idParam(ctx.params), patch));
});
