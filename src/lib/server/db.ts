import "server-only";
import postgres from "postgres";
import { databaseUrl } from "./env";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Anything that can run a query: the pool or an open transaction. */
export type Q = postgres.ISql;

const globalForDb = globalThis as unknown as { __fourWinsSql?: Sql };

function isLocal(url: string) {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || url.includes("host=/");
}

export function createSql(url = databaseUrl()): Sql {
  return postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: isLocal(url) ? false : "require",
    onnotice: () => {},
    types: {
      // Parsers merge by OID, so timestamps (1114/1184) keep the default Date parsing.
      // Keep calendar dates as 'YYYY-MM-DD' strings (no timezone drift).
      calendarDate: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v },
      // int8 / numeric → JS numbers. Values here (cents, kg) are far below 2^53.
      int8AsNumber: { to: 20, from: [20], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
      numericAsNumber: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) },
    },
  }) as unknown as Sql;
}

export function db(): Sql {
  if (!globalForDb.__fourWinsSql) globalForDb.__fourWinsSql = createSql();
  return globalForDb.__fourWinsSql;
}

/** For tests: swap in a client bound to a different database. */
export function setDb(sql: Sql | undefined) {
  globalForDb.__fourWinsSql = sql;
}
