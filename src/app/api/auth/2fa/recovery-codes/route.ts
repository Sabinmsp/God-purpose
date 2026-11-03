import { twoFactorGuardedSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { regenerateRecoveryCodes } from "@/lib/server/services/twofactor";

export const POST = authed(async (ctx) => {
  const { currentPassword, code } = await readJson(ctx.req, twoFactorGuardedSchema);
  return json({ ok: true, recoveryCodes: await regenerateRecoveryCodes(ctx, currentPassword, code) });
});
