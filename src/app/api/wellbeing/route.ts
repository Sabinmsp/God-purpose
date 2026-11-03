import { wellbeingSchema } from "@/lib/shared/wellbeing";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { saveCheckin } from "@/lib/server/services/wellbeing";

export const POST = authed(async (ctx) => {
  await saveCheckin(ctx, await readJson(ctx.req, wellbeingSchema));
  return stateResponse(ctx);
});
