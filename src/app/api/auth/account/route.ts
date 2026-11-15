import { authed, clearSessionCookie, json, readJson } from "@/lib/server/http";
import { deleteAccount } from "@/lib/server/services/accounts";
import { deleteAccountSchema } from "@/lib/shared/schemas";

/** Deletes the signed-in player's account and all their data. Needs the password again. */
export const DELETE = authed(async (ctx) => {
  const { password } = await readJson(ctx.req, deleteAccountSchema);
  await deleteAccount(ctx.sql, ctx.playerId, password);
  return clearSessionCookie(json({ ok: true }));
});
