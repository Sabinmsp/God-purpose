import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/server/db";
import { errorResponse, handleError, json } from "@/lib/server/http";
import { runNudges } from "@/lib/server/services/reminders";

/**
 * Called by the scheduler (vercel.json) around 7:30am, 12:30pm and 7:30pm
 * Darwin time, one path per slot. The path only names the job: which nudge
 * goes out is decided from the clock, so it takes no input and is idempotent
 * (one nudge per player per slot per day, nothing outside the three windows).
 *
 * With CRON_SECRET set, Vercel sends it as a bearer token and anything else
 * is refused. Without it the route still works, so reminders need no setup;
 * the most a stranger can do by calling it is make that slot's nudge arrive
 * at the start of its window instead of at the scheduled minute.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slot: string }> }) {
  if (!["morning", "midday", "evening"].includes((await params).slot)) return errorResponse(404, "Not found", "NOT_FOUND");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = Buffer.from(req.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return errorResponse(401, "Unauthorized", "UNAUTHENTICATED");
  }
  try {
    const run = await runNudges(db(), new Date(), req.nextUrl.origin);
    return json({ ok: true, ...run });
  } catch (err) {
    return handleError(err);
  }
}
