import { authed, json } from "@/lib/server/http";
import { buildState } from "@/lib/server/services/state";

export const GET = authed(async (ctx) => {
  const welcome = ctx.req.nextUrl.searchParams.get("welcome") === "1";
  const state = await buildState(ctx, { welcome });
  return json({ ok: true, state });
});
