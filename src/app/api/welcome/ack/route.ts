import { authed, json } from "@/lib/server/http";
import { acknowledgeWelcome } from "@/lib/server/services/state";

export const POST = authed(async (ctx) => {
  await acknowledgeWelcome(ctx);
  return json({ ok: true });
});
