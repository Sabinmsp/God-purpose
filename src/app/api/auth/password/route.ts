import { changePasswordSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { changePassword } from "@/lib/server/services/player";

export const POST = authed(async (ctx) => {
  const { currentPassword, newPassword } = await readJson(ctx.req, changePasswordSchema);
  await changePassword(ctx, ctx.sessionId, currentPassword, newPassword);
  return json({ ok: true });
});
