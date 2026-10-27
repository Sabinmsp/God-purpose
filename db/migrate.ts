import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** Applies pending SQL migrations in filename order, each in its own transaction. */
export async function runMigrations(sql: postgres.Sql, log: (msg: string) => void = console.log) {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  await sql`alter table schema_migrations enable row level security`;
  const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    log(`  ✓ applied ${file}`);
    count++;
  }
  if (!count) log("  ✓ database schema is up to date");
  return count;
}
