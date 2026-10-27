import { savingsSetBalanceSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { setSavingsBalance } from "@/lib/server/services/money";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, savingsSetBalanceSchema);
  return stateResponse(ctx, await setSavingsBalance(ctx, input));
});
