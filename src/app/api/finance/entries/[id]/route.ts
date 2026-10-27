import { authed, idParam } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { deleteFinanceEntry } from "@/lib/server/services/money";

export const DELETE = authed(async (ctx) => stateResponse(ctx, await deleteFinanceEntry(ctx, idParam(ctx.params))));
