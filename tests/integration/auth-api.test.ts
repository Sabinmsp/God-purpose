import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as unlock } from "@/app/api/auth/unlock/route";
import { POST as questAction } from "@/app/api/quests/[action]/route";
import { POST as savingsMove } from "@/app/api/savings/move/route";
import { POST as financeEntry } from "@/app/api/finance/entries/route";
import { GET as getState } from "@/app/api/state/route";
import { GET as exportData } from "@/app/api/export/route";
import { hashSecret } from "@/lib/server/auth/password";
import { LIMITS } from "@/lib/server/auth/rate-limit";
import { PIN_LOCK_IDLE_MS, SESSION_IDLE_MS, SESSION_TTL_MS, createSession, validateSession } from "@/lib/server/auth/session";
import { pillarXp } from "@/lib/server/services/progress";
import { TEST_PASSWORD, apiRequest, closeDb, params, resetDb, rid, sessionCookie } from "../helpers/db";

let base: Awaited<ReturnType<typeof resetDb>>;
beforeEach(async () => {
  base = await resetDb();
});
afterAll(closeDb);

const tryLogin = (password: string, ip = "198.51.100.1", origin?: string | null) =>
  login(apiRequest("/api/auth/login", { body: { password }, ip, origin }));

describe("login", () => {
  it("rejects a wrong password and accepts the right one with a hardened cookie", async () => {
    expect((await tryLogin("nope")).status).toBe(401);
    const res = await tryLogin(TEST_PASSWORD);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^fw_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\//);
    // The response never echoes the password or its hash.
    expect(await res.text()).not.toMatch(/scrypt|correct horse/);
  });

  it("rejects malformed bodies and cross-site login attempts", async () => {
    expect((await login(apiRequest("/api/auth/login", { body: "{bad json" }))).status).toBe(400);
    expect((await login(apiRequest("/api/auth/login", { body: { password: TEST_PASSWORD }, contentType: "text/plain" }))).status).toBe(415);
    expect((await tryLogin(TEST_PASSWORD, undefined, "https://evil.example")).status).toBe(403);
    expect((await tryLogin(TEST_PASSWORD, undefined, null)).status).toBe(403);
  });

  it("locks an IP out after repeated failures, even for the right password", async () => {
    for (let i = 0; i < LIMITS.ip.max; i++) expect((await tryLogin(`wrong-${i}`)).status).toBe(401);
    const blocked = await tryLogin(TEST_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // A different client is not affected by someone else's failures.
    expect((await tryLogin(TEST_PASSWORD, "198.51.100.99")).status).toBe(200);
  });

  it("locks all logins after distributed guessing across many IPs", async () => {
    for (let i = 0; i < LIMITS.global.max; i++) await tryLogin(`wrong-${i}`, `192.0.2.${i + 1}`);
    expect((await tryLogin(TEST_PASSWORD, "192.0.2.200")).status).toBe(429);
  });
});

describe("protected API", () => {
  it("refuses every game endpoint without a valid session", async () => {
    expect((await getState(apiRequest("/api/state"))).status).toBe(401);
    expect((await getState(apiRequest("/api/state", { cookie: "fw_session=forged-token-forged-token-forged-token" }))).status).toBe(401);
    expect((await exportData(apiRequest("/api/export"))).status).toBe(401);
    const res = await questAction(apiRequest("/api/quests/complete", { body: { dailyQuestId: rid() } }), params({ action: "complete" }));
    expect(res.status).toBe(401);
  });

  it("serves state with a valid session and blocks cross-origin writes", async () => {
    const cookie = await sessionCookie(base);
    const res = await getState(apiRequest("/api/state", { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const state = (await res.json()).state;
    const quest = state.today.quests[0];
    const cross = await questAction(
      apiRequest("/api/quests/complete", { cookie, body: { dailyQuestId: quest.id }, origin: "https://evil.example" }),
      params({ action: "complete" }),
    );
    expect(cross.status).toBe(403);
  });

  it("ignores client-sent XP, balances and other fields it should not trust", async () => {
    const cookie = await sessionCookie(base);
    const state = (await (await getState(apiRequest("/api/state", { cookie }))).json()).state;
    const quest = state.today.quests.find((q: { title: string }) => q.title === "Read for 20 minutes");
    const res = await questAction(
      apiRequest("/api/quests/complete", { cookie, body: { dailyQuestId: quest.id, xp: 100000, xpAwarded: 100000 } }),
      params({ action: "complete" }),
    );
    expect(res.status).toBe(200);
    expect((await pillarXp(base.sql, base.playerId)).mental).toBe(20);

    const tuition = state.savings.goals.find((g: { key: string }) => g.key === "tuition");
    const tamper = [
      { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: -500000 },
      { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: 10.5 },
      { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: "1000" },
      { requestId: "not-a-uuid", goalId: tuition.id, direction: "deposit", amountCents: 1000 },
      { requestId: rid(), goalId: tuition.id, direction: "gift", amountCents: 1000 },
    ];
    for (const body of tamper) {
      expect((await savingsMove(apiRequest("/api/savings/move", { cookie, body }))).status).toBe(400);
    }
    const ok = await savingsMove(
      apiRequest("/api/savings/move", {
        cookie,
        body: { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: 1000, balanceCents: 1300000 },
      }),
    );
    const after = (await ok.json()).state;
    expect(after.savings.goals.find((g: { key: string }) => g.key === "tuition").balanceCents).toBe(1000);

    const badEntry = await financeEntry(apiRequest("/api/finance/entries", { cookie, body: { requestId: rid(), kind: "savings", amountCents: 100 } }));
    expect(badEntry.status).toBe(400);
  });

  it("cannot act on another player's records", async () => {
    const [other] = await base.sql<{ id: string }[]>`insert into players (display_name) values ('Mallory') returning id`;
    const otherCookie = await sessionCookie({ sql: base.sql, playerId: other.id });
    const mine = (await (await getState(apiRequest("/api/state", { cookie: await sessionCookie(base) }))).json()).state;
    const res = await questAction(
      apiRequest("/api/quests/complete", { cookie: otherCookie, body: { dailyQuestId: mine.today.quests[0].id } }),
      params({ action: "complete" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("sessions", () => {
  it("expire after their absolute lifetime and after long inactivity", async () => {
    const t0 = new Date("2026-10-01T00:00:00Z");
    const { token } = await createSession(base.sql, base.playerId, null, t0);
    expect((await validateSession(base.sql, token, new Date(t0.getTime() + 60_000))).status).toBe("ok");
    expect((await validateSession(base.sql, token, new Date(t0.getTime() + SESSION_IDLE_MS + 120_000))).status).toBe("invalid");

    const t1 = new Date("2026-10-01T00:00:00Z");
    const s2 = await createSession(base.sql, base.playerId, null, t1);
    for (const day of [6, 12, 18, 24, 29]) {
      // Used regularly, so it never idles out — but it still ends at the absolute limit.
      expect((await validateSession(base.sql, s2.token, new Date(t1.getTime() + day * 86_400_000))).status).toBe("ok");
    }
    expect((await validateSession(base.sql, s2.token, new Date(t1.getTime() + SESSION_TTL_MS + 1))).status).toBe("invalid");
  });

  it("logout revokes the session on the server", async () => {
    const cookie = await sessionCookie(base);
    const res = await logout(apiRequest("/api/auth/logout", { cookie, body: {} }));
    expect(res.status).toBe(200);
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(401);
  });

  it("locks idle sessions behind the PIN and revokes after too many wrong PINs", async () => {
    await base.sql`update auth_credentials set pin_hash = ${await hashSecret("4821")}`;
    const t0 = new Date(Date.now() - PIN_LOCK_IDLE_MS - 60_000);
    const { token } = await createSession(base.sql, base.playerId, null, t0);
    const cookie = `fw_session=${token}`;
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(423);

    expect((await unlock(apiRequest("/api/auth/unlock", { cookie, body: { pin: "0000" } }))).status).toBe(401);
    expect((await unlock(apiRequest("/api/auth/unlock", { cookie, body: { pin: "4821" } }))).status).toBe(200);
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(200);

    await base.sql`update sessions set locked = true`;
    for (let i = 0; i < 4; i++) await unlock(apiRequest("/api/auth/unlock", { cookie, body: { pin: "9999" }, ip: `203.0.113.${i + 20}` }));
    const last = await unlock(apiRequest("/api/auth/unlock", { cookie, body: { pin: "9999" }, ip: "203.0.113.99" }));
    expect(last.status).toBe(401);
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(401);
  });
});
