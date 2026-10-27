import { authed, idParam } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { deleteWorkout } from "@/lib/server/services/body";

export const DELETE = authed(async (ctx) => stateResponse(ctx, await deleteWorkout(ctx, idParam(ctx.params))));
