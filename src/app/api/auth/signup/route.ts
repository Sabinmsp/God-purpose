import type { NextRequest } from "next/server";
import { checkSignupLimit, clientIp, ipBucket, recordSignup } from "@/lib/server/auth/rate-limit";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import { checkMutationRequest, errorResponse, handleError, json, readJson } from "@/lib/server/http";
import { createAccount, signupPolicy } from "@/lib/server/services/accounts";
import { signupSchema } from "@/lib/shared/schemas";

/** Whether the login page should offer "Create an account", and whether it needs an invite code. */
export function GET() {
  return json(signupPolicy(), 200, { "cache-control": "no-store" });
}

export async function POST(req: NextRequest) {
  const blocked = checkMutationRequest(req);
  if (blocked) return blocked;
  try {
    const input = await readJson(req, signupSchema);
    const sql = db();
    const now = new Date();
    const bucket = ipBucket(clientIp(req.headers));
    const limit = await checkSignupLimit(sql, bucket, now);
    if (!limit.allowed) {
      return errorResponse(429, "Too many new accounts from here. Try again later.", "RATE_LIMITED", { "Retry-After": String(limit.retryAfterSec) });
    }
    const playerId = await createAccount(sql, input, now);
    await recordSignup(sql, bucket, now);
    const { token, expiresAt } = await createSession(sql, playerId, req.headers.get("user-agent"), now);
    const res = json({ ok: true }, 201);
    res.cookies.set(sessionCookieName(), token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
