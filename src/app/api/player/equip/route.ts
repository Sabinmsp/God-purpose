import { equipSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { equip } from "@/lib/server/services/player";

export const POST = authed(async (ctx) => {
  const { slot, key } = await readJson(ctx.req, equipSchema);
  return stateResponse(ctx, await equip(ctx, slot, key));
});
