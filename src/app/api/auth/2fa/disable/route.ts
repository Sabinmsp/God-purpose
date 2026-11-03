import { twoFactorGuardedSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { disable } from "@/lib/server/services/twofactor";

export const POST = authed(async (ctx) => {
  const { currentPassword, code } = await readJson(ctx.req, twoFactorGuardedSchema);
  await disable(ctx, currentPassword, code);
  return stateResponse(ctx);
});
