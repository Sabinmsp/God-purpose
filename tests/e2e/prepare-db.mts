// Recreates the e2e database from scratch and runs the real setup command.
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
if (!url?.includes("fourwins_e2e")) throw new Error("Refusing to reset a database that is not fourwins_e2e");

const admin = postgres(url.replace(/\/fourwins_e2e.*/, "/postgres"), { max: 1, onnotice: () => {} });
const [{ exists }] = await admin`select exists(select 1 from pg_database where datname = 'fourwins_e2e') as exists`;
if (!exists) await admin.unsafe("create database fourwins_e2e");
await admin.end();

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe("drop schema public cascade; create schema public;");
await sql.end();

execFileSync("npx", ["tsx", "scripts/setup.ts"], { stdio: "inherit", env: { ...process.env } });
