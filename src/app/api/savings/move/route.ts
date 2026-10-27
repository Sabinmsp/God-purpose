import { savingsMoveSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { moveSavings } from "@/lib/server/services/money";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, savingsMoveSchema);
  return stateResponse(ctx, await moveSavings(ctx, input));
});
