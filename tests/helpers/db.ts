import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { runMigrations } from "../../db/migrate";
import { hashSecret } from "@/lib/server/auth/password";
import { createSession } from "@/lib/server/auth/session";
import { createSql, setDb, type Sql } from "@/lib/server/db";
import type { Ctx } from "@/lib/server/services/progress";
import { seedPlayer } from "@/lib/server/services/seed";
import { localDate } from "@/lib/shared/time";

export const TEST_PASSWORD = "correct horse battery staple";
export const ORIGIN = "http://localhost:3000";

let sql: Sql | undefined;

/** Fresh schema + one seeded player for each test. */
export async function resetDb(now = new Date()) {
  if (!sql) {
    sql = createSql(process.env.DATABASE_URL);
    setDb(sql);
  }
  await sql.unsafe("drop schema public cascade; create schema public;");
  await runMigrations(sql, () => {});
  const [player] = await sql<{ id: string }[]>`insert into players (display_name) values ('Sabin') returning id`;
  await sql.begin((tx) => seedPlayer(tx, player.id, localDate(now)));
  await sql`insert into auth_credentials (player_id, password_hash) values (${player.id}, ${await hashSecret(TEST_PASSWORD)})`;
  return { sql, playerId: player.id };
}

export async function closeDb() {
  await sql?.end();
  sql = undefined;
  setDb(undefined);
}

export const ctxAt = (base: { sql: Sql; playerId: string }, now: Date): Ctx => ({ ...base, now });

export async function sessionCookie(base: { sql: Sql; playerId: string }, now = new Date()) {
  const { token } = await createSession(base.sql, base.playerId, "vitest", now);
  return `fw_session=${token}`;
}

export function apiRequest(
  path: string,
  opts: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string; contentType?: string } = {},
) {
  const headers: Record<string, string> = { host: "localhost:3000", "x-real-ip": opts.ip ?? "203.0.113.7" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.body !== undefined) headers["content-type"] = opts.contentType ?? "application/json";
  return new NextRequest(`${ORIGIN}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
}

export const params = (p: Record<string, string>) => ({ params: Promise.resolve(p) });
export const rid = () => randomUUID();
