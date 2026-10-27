import { financeEntrySchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { addFinanceEntry } from "@/lib/server/services/money";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, financeEntrySchema);
  return stateResponse(ctx, await addFinanceEntry(ctx, input));
});
