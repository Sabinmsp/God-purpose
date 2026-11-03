import { twoFactorStartSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { startSetup } from "@/lib/server/services/twofactor";

export const POST = authed(async (ctx) => {
  const { currentPassword } = await readJson(ctx.req, twoFactorStartSchema);
  return json({ ok: true, ...(await startSetup(ctx, currentPassword)) });
});
