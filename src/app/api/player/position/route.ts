import { positionSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { savePosition } from "@/lib/server/services/player";

export const POST = authed(async (ctx) => {
  await savePosition(ctx, await readJson(ctx.req, positionSchema));
  return json({ ok: true });
});
