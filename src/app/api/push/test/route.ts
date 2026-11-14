import { authed, json } from "@/lib/server/http";
import { sendTestNudge } from "@/lib/server/services/reminders";

/** Sends a real nudge right now to every device with reminders on. */
export const POST = authed(async (ctx) => {
  const delivered = await sendTestNudge(ctx, ctx.req.nextUrl.origin);
  return json({ ok: true, delivered });
});
