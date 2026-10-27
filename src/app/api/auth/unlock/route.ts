import { pinSchema } from "@/lib/shared/schemas";
import { verifySecret } from "@/lib/server/auth/password";
import { checkLoginLimit, clientIp, ipBucket, recordLoginAttempt } from "@/lib/server/auth/rate-limit";
import { MAX_PIN_FAILURES } from "@/lib/server/auth/session";
import { authed, clearSessionCookie, errorResponse, json, readJson } from "@/lib/server/http";

/** Unlocks an existing, still-valid session with the short PIN. */
export const POST = authed(
  async ({ req, sql, playerId, sessionId, locked, now }) => {
    if (!locked) return json({ ok: true });
    const { pin } = await readJson(req, pinSchema);
    const bucket = ipBucket(clientIp(req.headers));
    const limit = await checkLoginLimit(sql, bucket, "pin", now);
    if (!limit.allowed) return errorResponse(429, "Too many PIN attempts. Try again later.", "RATE_LIMITED");

    const [cred] = await sql<{ pin_hash: string | null }[]>`select pin_hash from auth_credentials where player_id = ${playerId}`;
    const ok = Boolean(cred?.pin_hash) && (await verifySecret(pin, cred.pin_hash!));
    await recordLoginAttempt(sql, bucket, "pin", ok, now);

    if (!ok) {
      const [row] = await sql<{ pin_failures: number }[]>`
        update sessions set pin_failures = pin_failures + 1 where id = ${sessionId} returning pin_failures
      `;
      if (row.pin_failures >= MAX_PIN_FAILURES) {
        await sql`update sessions set revoked_at = ${now} where id = ${sessionId}`;
        return clearSessionCookie(errorResponse(401, "Too many wrong PINs — please log in with your password.", "UNAUTHENTICATED"));
      }
      return errorResponse(401, "Wrong PIN.", "BAD_PIN");
    }
    await sql`update sessions set locked = false, pin_failures = 0, last_seen_at = ${now} where id = ${sessionId}`;
    return json({ ok: true });
  },
  { allowLocked: true },
);
