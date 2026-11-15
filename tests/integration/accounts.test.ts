import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteAccountRoute } from "@/app/api/auth/account/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as signupPolicyRoute, POST as signup } from "@/app/api/auth/signup/route";
import { POST as questAction } from "@/app/api/quests/[action]/route";
import { GET as getState } from "@/app/api/state/route";
import { runMigrations } from "../../db/migrate";
import { SIGNUP_LIMITS } from "@/lib/server/auth/rate-limit";
import { localDate } from "@/lib/shared/time";
import { TEST_PASSWORD, apiRequest, closeDb, params, resetDb } from "../helpers/db";

let base: Awaited<ReturnType<typeof resetDb>>;
beforeEach(async () => {
  base = await resetDb();
});
afterEach(() => {
  delete process.env.SIGNUPS;
  delete process.env.SIGNUP_CODE;
});
afterAll(closeDb);

const join = (body: Record<string, unknown>, ip = "203.0.113.1") => signup(apiRequest("/api/auth/signup", { body, ip }));
const newUser = { displayName: "Ana", username: "ana_k", password: "ana's long password" };
const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0];
const stateOf = async (cookie: string) => (await (await getState(apiRequest("/api/state", { cookie }))).json()).state;

describe("sign-up", () => {
  it("creates a separate player with a fresh world, signed in straight away", async () => {
    const res = await join({ ...newUser, username: "Ana_K" });
    expect(res.status).toBe(201);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^fw_session=/);
    const s = await stateOf(cookie);
    expect(s.player.name).toBe("Ana");
    expect(s.security.username).toBe("ana_k");
    expect(s.stats.overall.totalXp).toBe(0);
    expect(s.today.quests.length).toBeGreaterThan(0);
    // Their 75-day campaign starts the day they join.
    expect(s.campaign.startDate).toBe(localDate());
    expect(s.campaign.dayNumber).toBe(1);
    // And they can log in again later with the username and password.
    expect((await login(apiRequest("/api/auth/login", { body: { username: "ana_k", password: newUser.password }, ip: "203.0.113.9" }))).status).toBe(200);
  });

  it("refuses taken usernames, bad usernames and short passwords", async () => {
    expect((await join({ ...newUser, username: "sabin" })).status).toBe(409);
    expect((await join({ ...newUser, username: "a b" })).status).toBe(400);
    expect((await join({ ...newUser, username: "ab" })).status).toBe(400);
    expect((await join({ ...newUser, password: "short" })).status).toBe(400);
    expect((await join({ ...newUser, displayName: " " })).status).toBe(400);
    expect((await join({ ...newUser, username: "ana_k" }, "203.0.113.2")).status).toBe(201);
    expect((await join({ ...newUser, username: "ANA_K" }, "203.0.113.3")).status).toBe(409);
  });

  it("blocks cross-site sign-ups", async () => {
    expect((await signup(apiRequest("/api/auth/signup", { body: newUser, origin: "https://evil.example" }))).status).toBe(403);
  });

  it("limits how many accounts one client can create", async () => {
    for (let i = 0; i < SIGNUP_LIMITS.ip.max; i++) expect((await join({ ...newUser, username: `user_${i}` })).status).toBe(201);
    const blocked = await join({ ...newUser, username: "one_more" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await join({ ...newUser, username: "one_more" }, "203.0.113.50")).status).toBe(201);
  });

  it("can be closed, or require an invite code", async () => {
    expect(await (await signupPolicyRoute()).json()).toEqual({ open: true, needsCode: false });

    process.env.SIGNUPS = "closed";
    expect(await (await signupPolicyRoute()).json()).toEqual({ open: false, needsCode: false });
    expect((await join(newUser)).status).toBe(403);

    process.env.SIGNUPS = "open";
    process.env.SIGNUP_CODE = "friends-2026";
    expect(await (await signupPolicyRoute()).json()).toEqual({ open: true, needsCode: true });
    expect((await join(newUser)).status).toBe(403);
    expect((await join({ ...newUser, code: "wrong" })).status).toBe(403);
    expect((await join({ ...newUser, code: " friends-2026 " })).status).toBe(201);
  });
});

describe("each player's data is their own", () => {
  it("keeps progress separate and refuses to act on another player's quests", async () => {
    const ana = cookieOf(await join(newUser));
    const sabinCookie = cookieOf(await login(apiRequest("/api/auth/login", { body: { username: "sabin", password: TEST_PASSWORD }, ip: "203.0.113.7" })));

    const anaQuest = (await stateOf(ana)).today.quests.find((q: { autoOnly: boolean }) => !q.autoOnly);
    const done = await questAction(apiRequest("/api/quests/complete", { cookie: ana, body: { dailyQuestId: anaQuest.id } }), params({ action: "complete" }));
    expect(done.status).toBe(200);
    expect((await stateOf(ana)).stats.overall.totalXp).toBeGreaterThan(0);
    expect((await stateOf(sabinCookie)).stats.overall.totalXp).toBe(0);

    // Sabin can't complete or undo Ana's quest, even with its id.
    const sabinTry = await questAction(apiRequest("/api/quests/undo", { cookie: sabinCookie, body: { dailyQuestId: anaQuest.id } }), params({ action: "undo" }));
    expect(sabinTry.status).toBe(404);
    expect((await stateOf(ana)).today.quests.find((q: { id: string }) => q.id === anaQuest.id).status).toBe("done");
  });
});

describe("deleting an account", () => {
  it("needs the password, then removes the player and everything they own", async () => {
    const res = await join(newUser);
    const cookie = cookieOf(res);
    const [{ id }] = await base.sql<{ id: string }[]>`select player_id as id from auth_credentials where username = 'ana_k'`;
    const del = (password: string) => deleteAccountRoute(apiRequest("/api/auth/account", { method: "DELETE", cookie, body: { password } }));

    expect((await del("wrong password")).status).toBe(403);
    const ok = await del(newUser.password);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/fw_session=;/);
    for (const table of ["players", "auth_credentials", "sessions", "daily_quests", "quest_definitions", "campaigns", "savings_goals"]) {
      const [{ n }] = await base.sql<{ n: number }[]>`select count(*)::int as n from ${base.sql(table)} where ${base.sql(table === "players" ? "id" : "player_id")} = ${id}`;
      expect(n, table).toBe(0);
    }
    // The old session no longer works, and the username is free again.
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(401);
    expect((await join(newUser, "203.0.113.30")).status).toBe(201);
    // Nobody else was touched.
    expect((await login(apiRequest("/api/auth/login", { body: { username: "sabin", password: TEST_PASSWORD }, ip: "203.0.113.31" }))).status).toBe(200);
  });
});

describe("upgrading a single-player database", () => {
  it("gives existing players a username from their name, without clashes", async () => {
    const sql = base.sql;
    await sql.unsafe("drop schema public cascade; create schema public;");
    await sql`create table schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    // Apply everything before accounts, add players the old way, then upgrade.
    const { readdir, readFile } = await import("node:fs/promises");
    const dir = `${process.cwd()}/db/migrations`;
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql") && x < "0007").sort()) {
      await sql.unsafe(await readFile(`${dir}/${f}`, "utf8"));
      await sql`insert into schema_migrations (name) values (${f})`;
    }
    for (const name of ["Sabin", "sabin!", "Jo", "Émile"]) {
      const [p] = await sql<{ id: string }[]>`insert into players (display_name) values (${name}) returning id`;
      await sql`insert into auth_credentials (player_id, password_hash) values (${p.id}, 'x')`;
    }
    await runMigrations(sql, () => {});
    const rows = await sql<{ display_name: string; username: string }[]>`
      select p.display_name, c.username from auth_credentials c join players p on p.id = c.player_id order by p.created_at
    `;
    expect(rows.map((r) => r.username)).toEqual(["sabin", "sabin2", "player", "mile"]);
  });
});
