import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { removeSubscription, saveSubscription } from "@/lib/server/services/reminders";

/** Turns reminders on for this browser (or refreshes its subscription). */
export const POST = authed(async (ctx) => {
  await saveSubscription(ctx, await readJson(ctx.req, pushSubscribeSchema), ctx.req.headers.get("user-agent"));
  return stateResponse(ctx);
});

/** Turns reminders off for this browser. */
export const DELETE = authed(async (ctx) => {
  const { endpoint } = await readJson(ctx.req, pushUnsubscribeSchema);
  await removeSubscription(ctx, endpoint);
  return stateResponse(ctx);
});
