import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateRequestDetails } from "web-push";
import { GET as cron } from "@/app/api/cron/nudge/[slot]/route";
import { POST as act } from "@/app/api/push/act/route";
import { DELETE as unsubscribe, POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as testPush } from "@/app/api/push/test/route";
import { PATCH as patchSettings } from "@/app/api/player/settings/route";
import { isPushServiceUrl, setPushSender, type PushResult } from "@/lib/server/push/send";
import { mintActionToken } from "@/lib/server/push/token";
import { vapidKeys } from "@/lib/server/push/vapid";
import { pillarXp } from "@/lib/server/services/progress";
import { completeQuest, setRestDay } from "@/lib/server/services/quests";
import { runNudges } from "@/lib/server/services/reminders";
import { buildState } from "@/lib/server/services/state";
import type { PushPayload } from "@/lib/shared/nudge";
import { apiRequest, closeDb, ctxAt, params, resetDb, sessionCookie } from "../helpers/db";

// Darwin is UTC+9:30. The campaign's seeded quests exist on every weekday.
const MORNING = new Date("2026-10-27T22:15:00Z"); // 7:45am, 28 Oct
const MIDDAY = new Date("2026-10-28T03:20:00Z"); // 12:50pm
const EVENING = new Date("2026-10-28T10:05:00Z"); // 7:35pm
const NIGHT = new Date("2026-10-28T14:30:00Z"); // midnight

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device-one",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
};

let base: Awaited<ReturnType<typeof resetDb>>;
let cookie: string;
let sent: { endpoint: string; payload: PushPayload }[];
let outcome: PushResult;

beforeEach(async () => {
  base = await resetDb(MORNING);
  cookie = await sessionCookie(base);
  sent = [];
  outcome = "ok";
  setPushSender(async (target, payload) => {
    sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
    return outcome;
  });
});
afterEach(() => setPushSender(undefined));
afterAll(closeDb);

const sub = (body: unknown = SUB, c: string | null = cookie) => subscribe(apiRequest("/api/push/subscribe", { cookie: c ?? undefined, body }));
const press = (token: string, action: "complete" | "undo" = "complete", origin?: string | null) =>
  act(apiRequest("/api/push/act", { body: { token, action }, origin }));
const subs = async () => (await base.sql<{ n: number }[]>`select count(*)::int as n from push_subscriptions`)[0].n;
const quests = async (now: Date) => (await buildState(ctxAt(base, now))).today.quests;

describe("server push identity", () => {
  it("derives a stable P-256 key pair from AUTH_SECRET", () => {
    const keys = vapidKeys();
    const pub = Buffer.from(keys.publicKey, "base64url");
    expect(pub).toHaveLength(65);
    expect(pub[0]).toBe(4); // uncompressed point
    expect(Buffer.from(keys.privateKey, "base64url")).toHaveLength(32);
    expect(vapidKeys()).toEqual(keys);
  });

  it("signs and encrypts a real Web Push request with the derived keys", () => {
    const keys = vapidKeys();
    // A browser-style subscription: its own P-256 key and a 16-byte auth secret.
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const target = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    const details = generateRequestDetails(target, JSON.stringify({ title: "hello" }), {
      vapidDetails: { subject: "https://four-wins.example", publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 60,
    });
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect((details.body as Buffer).length).toBeGreaterThan(50);
    expect(details.body!.toString()).not.toContain("hello");
    // The VAPID token must verify against the public key browsers subscribed with.
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(details.headers.Authorization as string)!;
    expect(k).toBe(keys.publicKey);
    const [head, body, sig] = jwt.split(".");
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://four-wins.example" });
  });

  it("only talks to real push services", () => {
    expect(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushServiceUrl("https://web.push.apple.com/abc")).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://localhost/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com:8443/x", "nope"]) {
      expect(isPushServiceUrl(bad), bad).toBe(false);
    }
  });
});

describe("turning reminders on and off", () => {
  it("needs a session and a same-origin request", async () => {
    expect((await sub(SUB, null)).status).toBe(401);
    expect((await subscribe(apiRequest("/api/push/subscribe", { cookie, body: SUB, origin: "https://evil.example" }))).status).toBe(403);
    expect(await subs()).toBe(0);
  });

  it("stores a device once, however often the game re-sends it", async () => {
    const first = await (await sub()).json();
    expect(first.state.reminders).toEqual({ publicKey: vapidKeys().publicKey, devices: 1 });
    await sub();
    await sub({ ...SUB, keys: { ...SUB.keys, auth: "b".repeat(22) } });
    expect(await subs()).toBe(1);
    const [row] = await base.sql<{ auth: string }[]>`select auth from push_subscriptions`;
    expect(row.auth).toBe("b".repeat(22));
  });

  it("refuses endpoints that are not push services, and malformed keys", async () => {
    expect((await sub({ ...SUB, endpoint: "https://internal.example/hook" })).status).toBe(400);
    expect((await sub({ ...SUB, endpoint: "http://fcm.googleapis.com/fcm/send/x" })).status).toBe(400);
    expect((await sub({ ...SUB, keys: { p256dh: "short", auth: SUB.keys.auth } })).status).toBe(400);
    expect(await subs()).toBe(0);
  });

  it("removes a device", async () => {
    await sub();
    const res = await (await unsubscribe(apiRequest("/api/push/subscribe", { method: "DELETE", cookie, body: { endpoint: SUB.endpoint } }))).json();
    expect(res.state.reminders.devices).toBe(0);
  });

  it("sends a sample on request, with a working Done button", async () => {
    await sub();
    const res = await (await testPush(apiRequest("/api/push/test", { cookie, body: {} }))).json();
    expect(res.delivered).toBe(1);
    expect(sent[0].payload.title).toBe("Reminders are on ✓");
    expect(sent[0].payload.items[0].token).toBeTruthy();
    expect((await testPush(apiRequest("/api/push/test", { body: {} }))).status).toBe(401);
  });
});

describe("scheduled nudges", () => {
  it("sends nothing to a player with no devices, and creates no log", async () => {
    expect(await runNudges(base.sql, MORNING)).toEqual({ slot: "morning", players: 0, sent: 0, delivered: 0 });
    expect(sent).toEqual([]);
  });

  it("sends one nudge per slot per day, even when the scheduler fires again", async () => {
    await sub();
    expect(await runNudges(base.sql, MORNING)).toEqual({ slot: "morning", players: 1, sent: 1, delivered: 1 });
    await runNudges(base.sql, new Date(MORNING.getTime() + 20 * 60_000));
    await Promise.all([runNudges(base.sql, MIDDAY), runNudges(base.sql, MIDDAY), runNudges(base.sql, MIDDAY)]);
    await runNudges(base.sql, EVENING);
    expect(sent).toHaveLength(3);
    const rows = await base.sql<{ slot: string; kind: string; delivered: number }[]>`select slot, kind, delivered from nudges order by sent_at`;
    expect(rows.map((r) => r.slot)).toEqual(["morning", "midday", "evening"]);
    expect(rows.every((r) => r.delivered === 1)).toBe(true);
  });

  it("is silent outside the three windows", async () => {
    await sub();
    expect((await runNudges(base.sql, NIGHT)).slot).toBeNull();
    expect(sent).toEqual([]);
  });

  it("creates today's board without the game being opened, and names a real quest", async () => {
    await sub();
    // Subscribing built a board for the real "today"; the scheduled day has none yet.
    const [{ n: before }] = await base.sql<{ n: number }[]>`select count(*)::int as n from daily_quests where local_date = '2026-10-28'`;
    expect(before).toBe(0);
    await runNudges(base.sql, MORNING);
    const board = await quests(MORNING);
    const { payload } = sent[0];
    expect(payload.title).toBe("Your first win, Sabin"); // a brand-new player has never won anything
    expect(payload.url).toBe("/?view=today");
    expect(payload.undo).toBeNull();
    expect(payload.items.length).toBeGreaterThan(1);
    const first = board.find((q) => payload.items[0].body.startsWith(`${q.title} · +${q.xp} XP`));
    expect(first?.autoOnly).toBe(false);
    expect(payload.items.every((i) => i.token)).toBe(true);
  });

  it("respects the chosen frequency", async () => {
    await sub();
    await patchSettings(apiRequest("/api/player/settings", { method: "PATCH", cookie, body: { reminders: "gentle" } }));
    await runNudges(base.sql, MORNING);
    await runNudges(base.sql, MIDDAY);
    expect(sent).toEqual([]);
    await runNudges(base.sql, EVENING);
    expect(sent).toHaveLength(1);
    await patchSettings(apiRequest("/api/player/settings", { method: "PATCH", cookie, body: { reminders: "off" } }));
    await runNudges(base.sql, new Date(EVENING.getTime() + 86_400_000));
    expect(sent).toHaveLength(1);
    expect((await patchSettings(apiRequest("/api/player/settings", { method: "PATCH", cookie, body: { reminders: "hourly" } }))).status).toBe(400);
  });

  it("stays quiet on a rest day and once all four wins are in", async () => {
    await sub();
    await setRestDay(ctxAt(base, MORNING), "all", true, "");
    await runNudges(base.sql, MORNING);
    expect(sent).toEqual([]);
    await setRestDay(ctxAt(base, MORNING), "all", false, "");
    const board = await quests(MIDDAY);
    for (const pillar of ["mental", "physical", "spiritual", "financial"]) {
      await completeQuest(ctxAt(base, MIDDAY), board.find((q) => q.pillar === pillar && !q.autoOnly)!.id);
    }
    await runNudges(base.sql, MIDDAY);
    await runNudges(base.sql, EVENING);
    expect(sent).toEqual([]);
    const kinds = await base.sql<{ kind: string }[]>`select kind from nudges`;
    expect(kinds.map((k) => k.kind)).toEqual(["quiet", "quiet", "quiet"]);
  });

  it("switches to a fresh-start tone after days away, easiest quest first", async () => {
    await sub();
    const board = await quests(MORNING);
    await completeQuest(ctxAt(base, MORNING), board.find((q) => !q.autoOnly)!.id);
    const later = new Date(MORNING.getTime() + 14 * 86_400_000);
    await runNudges(base.sql, later);
    const { payload } = sent[0];
    expect(payload.title).toBe("Fresh start, Sabin");
    expect(payload.items[0].body).toContain("14 days away");
    const xps = payload.items.map((i) => Number(/\+(\d+) XP/.exec(i.body)![1]));
    expect(xps).toEqual([...xps].sort((a, b) => a - b));
  });

  it("forgets devices the push service says are gone, keeps ones that merely failed", async () => {
    await sub();
    outcome = "failed";
    await runNudges(base.sql, MORNING);
    expect(await subs()).toBe(1);
    outcome = "gone";
    await runNudges(base.sql, MIDDAY);
    expect(await subs()).toBe(0);
  });
});

describe("the scheduler endpoint", () => {
  const call = (slot: string, auth?: string) => {
    const req = apiRequest(`/api/cron/nudge/${slot}`);
    if (auth) req.headers.set("authorization", auth);
    return cron(req, params({ slot }) as never);
  };

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("requires the bearer secret once CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret-for-cron-0123456789";
    expect((await call("morning")).status).toBe(401);
    expect((await call("morning", "Bearer wrong")).status).toBe(401);
    expect((await call("morning", "Bearer s3cret-for-cron-0123456789")).status).toBe(200);
  });

  it("runs without configuration, returns only counts, and rejects unknown paths", async () => {
    const res = await call("evening");
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(["delivered", "ok", "players", "sent", "slot"]);
    expect((await call("whenever")).status).toBe(404);
  });
});

describe("the Done button on a notification", () => {
  async function nudged() {
    await sub();
    await runNudges(base.sql, new Date());
    if (!sent.length) await testPush(apiRequest("/api/push/test", { cookie, body: {} }));
    return sent[0].payload;
  }

  it("completes the quest with no session, exactly once", async () => {
    const payload = await nudged();
    const before = await pillarXp(base.sql, base.playerId);
    const res = await press(payload.items[0].token!);
    expect(res.status).toBe(200);
    const { payload: after } = (await res.json()) as { payload: PushPayload };
    expect(after.title.startsWith("✓ ")).toBe(true);
    expect(after.undo).toBe(payload.items[0].token);
    expect(after.items[0].body).toMatch(/^\+\d+ XP · 1\/4 wins today · 🔥 1\nNext: /);
    const board = await quests(new Date());
    const done = board.filter((q) => q.status === "done");
    expect(done).toHaveLength(1);
    expect(after.title).toBe(`✓ ${done[0].title}`);

    // Double tap: same answer, no second award.
    const again = await press(payload.items[0].token!);
    expect(again.status).toBe(200);
    const xp = await pillarXp(base.sql, base.playerId);
    expect(Object.values(xp).reduce((a, b) => a + b, 0) - Object.values(before).reduce((a, b) => a + b, 0)).toBe(done[0].xpAwarded);
  });

  it("chains: each answer carries the next quest, until the day is won", async () => {
    let payload = await nudged();
    for (let i = 0; i < 12 && payload.items.length; i++) {
      payload = ((await (await press(payload.items[0].token!)).json()) as { payload: PushPayload }).payload;
      if ((await buildState(ctxAt(base, new Date()))).today.fourWins) break;
    }
    const state = await buildState(ctxAt(base, new Date()));
    expect(state.today.fourWins).toBe(true);
    expect(payload.items).toEqual([]);
    expect(payload.fallback).toContain("All four wins");
  });

  it("undoes a mistaken tap and offers the quest again", async () => {
    const payload = await nudged();
    const token = payload.items[0].token!;
    await press(token);
    const res = await press(token, "undo");
    const { payload: after } = (await res.json()) as { payload: PushPayload };
    expect(after.title.startsWith("Undone: ")).toBe(true);
    expect(after.items[0].token).toBe(token);
    expect(after.undo).toBeNull();
    expect((await quests(new Date())).filter((q) => q.status === "done")).toEqual([]);
    expect(Object.values(await pillarXp(base.sql, base.playerId)).reduce((a, b) => a + b, 0)).toBe(0);
    // Undo twice is harmless.
    expect((await press(token, "undo")).status).toBe(200);
  });

  it("rejects forged, tampered and cross-origin requests", async () => {
    const payload = await nudged();
    const token = payload.items[0].token!;
    const [id, exp, sig] = token.split(".");
    const other = (await quests(new Date())).find((q) => q.id !== id)!.id;
    for (const bad of [`${other}.${exp}.${sig}`, `${id}.${Number(exp) + 60}.${sig}`, `${id}.${exp}.${"A".repeat(sig.length)}`, `${id}.${exp}`, "x".repeat(60)]) {
      expect((await press(bad)).status, bad).toBe(403);
    }
    expect((await press(token, "complete", "https://evil.example")).status).toBe(403);
    expect((await press(token, "complete", null)).status).toBe(403);
    expect((await act(apiRequest("/api/push/act", { body: { token, action: "delete" } }))).status).toBe(400);
    expect((await quests(new Date())).filter((q) => q.status === "done")).toEqual([]);
  });

  it("a token for a quest that does not exist is refused the same way", async () => {
    await nudged();
    const token = mintActionToken(base.playerId, "00000000-0000-4000-8000-000000000000", new Date());
    expect((await press(token)).status).toBe(403);
  });

  it("yesterday's notification cannot complete anything today", async () => {
    await sub();
    await runNudges(base.sql, MORNING);
    const token = sent[0].payload.items[0].token!;
    expect((await press(token)).status).toBe(410); // expired
    // Even a freshly signed token cannot complete a quest from another day.
    const [old] = await base.sql<{ id: string }[]>`select id from daily_quests where local_date = '2026-10-28' limit 1`;
    expect((await press(mintActionToken(base.playerId, old.id, new Date()))).status).toBe(409);
    expect(Object.values(await pillarXp(base.sql, base.playerId)).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
