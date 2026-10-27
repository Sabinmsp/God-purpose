import { setPinSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { setPin } from "@/lib/server/services/player";

export const POST = authed(async (ctx) => {
  const { currentPassword, pin } = await readJson(ctx.req, setPinSchema);
  await setPin(ctx, currentPassword, pin);
  return stateResponse(ctx);
});
