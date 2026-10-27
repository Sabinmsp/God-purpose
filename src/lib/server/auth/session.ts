import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Q } from "../db";
import { isProduction } from "../env";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // absolute lifetime
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // expires if unused this long
export const PIN_LOCK_IDLE_MS = 12 * 60 * 60 * 1000; // with a PIN set, lock after this idle time
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_PIN_FAILURES = 5;

/** `__Host-` prefix pins the cookie to this exact host over HTTPS. */
export const sessionCookieName = () => (isProduction() ? "__Host-fw_session" : "fw_session");
export const SESSION_COOKIE_NAMES = ["__Host-fw_session", "fw_session"];

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(sql: Q, playerId: string, userAgent: string | null, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await sql`
    insert into sessions (player_id, token_hash, created_at, last_seen_at, expires_at, user_agent)
    values (${playerId}, ${hashToken(token)}, ${now}, ${now}, ${expiresAt}, ${userAgent?.slice(0, 200) ?? null})
  `;
  return { token, expiresAt };
}

export type SessionCheck =
  | { status: "ok"; sessionId: string; playerId: string }
  | { status: "locked"; sessionId: string; playerId: string }
  | { status: "invalid" };

export async function validateSession(sql: Q, token: string | undefined, now = new Date()): Promise<SessionCheck> {
  if (!token || token.length < 32 || token.length > 128) return { status: "invalid" };
  const [row] = await sql<
    { id: string; player_id: string; last_seen_at: Date; expires_at: Date; locked: boolean; revoked_at: Date | null; pin_hash: string | null }[]
  >`
    select s.id, s.player_id, s.last_seen_at, s.expires_at, s.locked, s.revoked_at, c.pin_hash
    from sessions s
    left join auth_credentials c on c.player_id = s.player_id
    where s.token_hash = ${hashToken(token)}
  `;
  if (!row || row.revoked_at) return { status: "invalid" };
  const idle = now.getTime() - row.last_seen_at.getTime();
  if (row.expires_at.getTime() <= now.getTime() || idle > SESSION_IDLE_MS) {
    await sql`update sessions set revoked_at = ${now} where id = ${row.id} and revoked_at is null`;
    return { status: "invalid" };
  }

  if (row.locked) return { status: "locked", sessionId: row.id, playerId: row.player_id };
  if (row.pin_hash && idle > PIN_LOCK_IDLE_MS) {
    await sql`update sessions set locked = true where id = ${row.id}`;
    return { status: "locked", sessionId: row.id, playerId: row.player_id };
  }

  if (idle > TOUCH_INTERVAL_MS) {
    await sql`update sessions set last_seen_at = ${now} where id = ${row.id}`;
  }
  return { status: "ok", sessionId: row.id, playerId: row.player_id };
}

export async function revokeSession(sql: Q, token: string | undefined, now = new Date()) {
  if (!token) return;
  await sql`update sessions set revoked_at = ${now} where token_hash = ${hashToken(token)} and revoked_at is null`;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict" as const,
    path: "/",
    expires,
  };
}
