import { isValidDate } from "@/lib/shared/time";
import { AppError } from "@/lib/server/errors";
import { authed, json } from "@/lib/server/http";
import { dayDetail } from "@/lib/server/services/campaign";

/** What was accomplished on one campaign day (for the timeline). */
export const GET = authed(async (ctx) => {
  const date = ctx.req.nextUrl.searchParams.get("date") ?? "";
  if (!isValidDate(date)) throw new AppError(400, "date must be YYYY-MM-DD", "VALIDATION");
  return json({ ok: true, day: await dayDetail(ctx.sql, ctx.playerId, date) });
});
