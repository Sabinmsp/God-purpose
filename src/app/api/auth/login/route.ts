import type { NextRequest } from "next/server";
import { loginSchema } from "@/lib/shared/schemas";
import { hashSecret, verifySecret } from "@/lib/server/auth/password";
import { checkLoginLimit, clientIp, ipBucket, recordLoginAttempt } from "@/lib/server/auth/rate-limit";
import { createSession, sessionCookieName, sessionCookieOptions } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import { checkMutationRequest, errorResponse, handleError, json, readJson } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  const blocked = checkMutationRequest(req);
  if (blocked) return blocked;
  try {
    const { password } = await readJson(req, loginSchema);
    const sql = db();
    const now = new Date();
    const bucket = ipBucket(clientIp(req.headers));

    const limit = await checkLoginLimit(sql, bucket, "password", now);
    if (!limit.allowed) {
      const minutes = Math.ceil(limit.retryAfterSec / 60);
      return errorResponse(
        429,
        `Too many attempts. Login is locked for ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        "RATE_LIMITED",
        { "Retry-After": String(limit.retryAfterSec) },
      );
    }

    const [cred] = await sql<{ player_id: string; password_hash: string }[]>`
      select player_id, password_hash from auth_credentials order by updated_at limit 1
    `;
    let ok = false;
    if (cred) ok = await verifySecret(password, cred.password_hash);
    else await hashSecret(password); // same work either way, so timing reveals nothing

    await recordLoginAttempt(sql, bucket, "password", ok, now);
    if (!ok || !cred) return errorResponse(401, "That password isn't right.", "BAD_PASSWORD");

    const { token, expiresAt } = await createSession(sql, cred.player_id, req.headers.get("user-agent"), now);
    const res = json({ ok: true });
    res.cookies.set(sessionCookieName(), token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
