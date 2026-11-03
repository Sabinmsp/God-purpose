import { twoFactorConfirmSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { confirmSetup } from "@/lib/server/services/twofactor";

export const POST = authed(async (ctx) => {
  const { code } = await readJson(ctx.req, twoFactorConfirmSchema);
  return json({ ok: true, recoveryCodes: await confirmSetup(ctx, code) });
});
