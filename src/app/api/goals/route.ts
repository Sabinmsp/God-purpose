import { goalCreateSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { createGoal } from "@/lib/server/services/goals";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, goalCreateSchema);
  return stateResponse(ctx, await createGoal(ctx, input));
});
