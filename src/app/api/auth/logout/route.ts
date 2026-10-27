import type { NextRequest } from "next/server";
import { revokeSession } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import { checkMutationRequest, clearSessionCookie, handleError, json, readSessionToken } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const blocked = checkMutationRequest(req);
  if (blocked) return blocked;
  try {
    await revokeSession(db(), readSessionToken(req));
    return clearSessionCookie(json({ ok: true }));
  } catch (err) {
    return handleError(err);
  }
}
