import { measurementSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { recordMeasurement } from "@/lib/server/services/body";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, measurementSchema);
  return stateResponse(ctx, await recordMeasurement(ctx, input));
});
