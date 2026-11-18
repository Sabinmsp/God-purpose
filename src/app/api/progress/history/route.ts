import { badRequest } from "@/lib/server/errors";
import { authed, json } from "@/lib/server/http";
import { rangeProgress } from "@/lib/server/services/state";
import { addDays, localDate } from "@/lib/shared/time";

export const GET = authed(async ({ req, sql, playerId, now }) => {
  const month = req.nextUrl.searchParams.get("month");
  const today = localDate(now);
  if (!month || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7)) {
    throw badRequest("Choose a valid month up to the current month.");
  }

  const first = `${month}-01`;
  // Moving forward 31 days from the first always reaches the next month.
  const last = addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1);
  const days = await rangeProgress(sql, playerId, first, last < today ? last : today);
  return json({ ok: true, days });
});
