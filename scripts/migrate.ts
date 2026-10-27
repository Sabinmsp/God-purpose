import postgres from "postgres";
import { runMigrations } from "../db/migrate";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local or export it first.");
  process.exit(1);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, max: 1, ssl: local ? false : "require", onnotice: () => {} });

console.log("Four Wins — running migrations");
runMigrations(sql)
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
