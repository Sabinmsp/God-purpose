import "server-only";
import { createHmac } from "node:crypto";
import type { Q } from "../db";
import { authSecret } from "../env";

/**
 * Login throttling backed by Postgres, so limits hold across every serverless
 * instance. A short PIN-style password has only 10,000 combinations, so the
 * limits are deliberately strict:
 *  - per client IP: 5 failures per 15 minutes
 *  - across all clients: 20 failures per hour (stops distributed guessing)
 */
export const LIMITS = {
  ip: { max: 5, windowMs: 15 * 60 * 1000 },
  global: { max: 20, windowMs: 60 * 60 * 1000 },
};

export function clientIp(headers: Headers): string {
  // Vercel sets x-real-ip / x-forwarded-for itself; clients cannot spoof them there.
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export function ipBucket(ip: string): string {
  return "ip:" + createHmac("sha256", authSecret()).update(ip).digest("hex").slice(0, 32);
}

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterSec: number; scope: "ip" | "global" };

async function failuresSince(sql: Q, bucket: string, kind: string, since: Date) {
  const [row] = await sql<{ n: number; oldest: Date | null }[]>`
    select count(*)::int as n, min(created_at) as oldest
    from login_attempts
    where bucket = ${bucket} and kind = ${kind} and success = false and created_at > ${since}
  `;
  return row;
}

export async function checkLoginLimit(sql: Q, bucket: string, kind: "password" | "pin", now = new Date()): Promise<LimitCheck> {
  const checks = [
    { scope: "ip" as const, bucket, ...LIMITS.ip },
    { scope: "global" as const, bucket: "global", ...LIMITS.global },
  ];
  for (const c of checks) {
    const since = new Date(now.getTime() - c.windowMs);
    const { n, oldest } = await failuresSince(sql, c.bucket, kind, since);
    if (n >= c.max && oldest) {
      const retryAfterSec = Math.max(1, Math.ceil((oldest.getTime() + c.windowMs - now.getTime()) / 1000));
      return { allowed: false, retryAfterSec, scope: c.scope };
    }
  }
  return { allowed: true };
}

export async function recordLoginAttempt(sql: Q, bucket: string, kind: "password" | "pin", success: boolean, now = new Date()) {
  await sql`
    insert into login_attempts (bucket, kind, success, created_at)
    values (${bucket}, ${kind}, ${success}, ${now})
  `;
  if (!success) {
    await sql`
      insert into login_attempts (bucket, kind, success, created_at)
      values ('global', ${kind}, false, ${now})
    `;
  }
  // Keep the table small.
  await sql`delete from login_attempts where created_at < ${new Date(now.getTime() - 7 * 86_400_000)}`;
}
