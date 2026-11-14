import type { NextRequest } from "next/server";
import { pushActSchema } from "@/lib/shared/schemas";
import { db } from "@/lib/server/db";
import { checkMutationRequest, handleError, json, readJson } from "@/lib/server/http";
import { actOnNudge } from "@/lib/server/services/reminders";

/**
 * The Done / Undo buttons on a notification, called by the service worker.
 * There is deliberately no session check: the signed, single-quest token in
 * the body is the authorisation (see lib/server/push/token.ts), because a
 * reminder has to work after the login has expired. The same-origin and JSON
 * checks still apply.
 */
export async function POST(req: NextRequest) {
  const blocked = checkMutationRequest(req);
  if (blocked) return blocked;
  try {
    const { token, action } = await readJson(req, pushActSchema);
    const payload = await actOnNudge(db(), token, action, new Date());
    return json({ ok: true, payload });
  } catch (err) {
    return handleError(err);
  }
}
