import { settingsSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { updateSettings } from "@/lib/server/services/player";

export const PATCH = authed(async (ctx) => {
  await updateSettings(ctx, await readJson(ctx.req, settingsSchema));
  return stateResponse(ctx);
});
