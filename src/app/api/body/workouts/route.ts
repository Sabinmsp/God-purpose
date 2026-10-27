import { workoutSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { logWorkout } from "@/lib/server/services/body";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, workoutSchema);
  return stateResponse(ctx, await logWorkout(ctx, input));
});
