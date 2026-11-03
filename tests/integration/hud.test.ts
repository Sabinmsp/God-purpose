import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as postWellbeing } from "@/app/api/wellbeing/route";
import { buildAiContext } from "@/lib/server/ai/context";
import { pillarXp } from "@/lib/server/services/progress";
import { completeQuest } from "@/lib/server/services/quests";
import { seedPlayer } from "@/lib/server/services/seed";
import { buildState } from "@/lib/server/services/state";
import { dailyBrief } from "@/lib/shared/brief";
import { addDays, localDate } from "@/lib/shared/time";
import { apiRequest, closeDb, ctxAt, resetDb, sessionCookie } from "../helpers/db";

let base: Awaited<ReturnType<typeof resetDb>>;
let cookie: string;

beforeEach(async () => {
  base = await resetDb();
  cookie = await sessionCookie(base);
});
afterAll(closeDb);

const checkin = (body: unknown, c = cookie) => postWellbeing(apiRequest("/api/wellbeing", { cookie: c, body }));

describe("Brain & Wellbeing check-in", () => {
  it("requires a session and a same-origin JSON body", async () => {
    expect((await postWellbeing(apiRequest("/api/wellbeing", { body: { energy: 3 } }))).status).toBe(401);
    expect((await postWellbeing(apiRequest("/api/wellbeing", { cookie, body: { energy: 3 }, origin: "https://evil.example" }))).status).toBe(403);
  });

  it("rejects out-of-range values", async () => {
    for (const body of [{ energy: 6 }, { mood: 0 }, { focus: 101 }, { sleepMinutes: -5 }, { distractionMinutes: 2000 }, { energy: 2.5 }]) {
      expect((await checkin(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("saves today's check-in, merges later edits and returns it in state", async () => {
    const first = await (await checkin({ sleepMinutes: 450, energy: 4, mood: 3 })).json();
    expect(first.state.wellbeing.today).toMatchObject({ date: localDate(), sleepMinutes: 450, energy: 4, mood: 3, focus: null, distractionMinutes: null });

    const second = await (await checkin({ focus: 70, distractionMinutes: 65, mood: null })).json();
    expect(second.state.wellbeing.today).toMatchObject({ sleepMinutes: 450, energy: 4, mood: null, focus: 70, distractionMinutes: 65 });
    expect(second.state.wellbeing.recent).toHaveLength(1);
  });

  it("clearing every field removes the day", async () => {
    await checkin({ energy: 2 });
    const res = await (await checkin({ energy: null })).json();
    expect(res.state.wellbeing.today).toBeNull();
    const [{ n }] = await base.sql<{ n: number }[]>`select count(*)::int as n from wellbeing_checkins`;
    expect(n).toBe(0);
  });

  it("never awards XP or completes quests", async () => {
    const before = await pillarXp(base.sql, base.playerId);
    const res = await (await checkin({ sleepMinutes: 480, energy: 5, mood: 5, focus: 100, distractionMinutes: 0 })).json();
    expect(res.events).toEqual([]);
    expect(await pillarXp(base.sql, base.playerId)).toEqual(before);
    expect(res.state.today.quests.filter((q: { status: string }) => q.status === "done")).toEqual([]);
  });

  it("keeps each player's check-ins private", async () => {
    await checkin({ mood: 2 });
    const [other] = await base.sql<{ id: string }[]>`insert into players (display_name) values ('Mallory') returning id`;
    await base.sql.begin((tx) => seedPlayer(tx, other.id, localDate()));
    const otherCookie = await sessionCookie({ sql: base.sql, playerId: other.id });
    const theirs = await (await checkin({ energy: 5 }, otherCookie)).json();
    expect(theirs.state.wellbeing.today).toMatchObject({ energy: 5, mood: null });
    const mine = await buildState(ctxAt(base, new Date()));
    expect(mine.wellbeing.today).toMatchObject({ mood: 2, energy: null });
  });

  it("shares the check-in with the AI companion as self-reported data", async () => {
    let state = await buildState(ctxAt(base, new Date()));
    expect(buildAiContext(state, { memories: [] })).toContain("Wellbeing check-in today: not logged.");
    await checkin({ sleepMinutes: 330, energy: 2 });
    state = await buildState(ctxAt(base, new Date()));
    expect(buildAiContext(state, { memories: [] })).toContain("Wellbeing check-in today (self-reported): sleep 5.5h, energy 2/5.");
  });

  it("counts completed missions per pillar for the character attributes", async () => {
    const ctx = ctxAt(base, new Date());
    let state = await buildState(ctx);
    expect(state.stats.missionsDone).toEqual({ mental: 0, physical: 0, spiritual: 0, financial: 0 });
    for (const q of state.today.quests.filter((x) => x.pillar === "mental" && !x.autoOnly).slice(0, 2)) await completeQuest(ctx, q.id);
    state = await buildState(ctx);
    expect(state.stats.missionsDone).toEqual({ mental: 2, physical: 0, spiritual: 0, financial: 0 });
  });
});

describe("daily brief (AI chat opening card)", () => {
  it("summarises yesterday and today from stored records only", async () => {
    const ctx = ctxAt(base, new Date());
    const yesterday = addDays(localDate(), -1);
    await base.sql`update campaigns set start_date = ${localDate()}, end_date = ${addDays(localDate(), 74)}`;
    await base.sql`
      insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp, status, xp_awarded, completed_at)
      select player_id, ${yesterday}, id, pillar, title, xp, 'done', xp, now() from quest_definitions
      where player_id = ${base.playerId} and pillar in ('physical', 'financial') and not auto_only
    `;
    let state = await buildState(ctx);
    const mental = state.today.quests.find((q) => q.pillar === "mental" && !q.autoOnly)!;
    await completeQuest(ctx, mental.id);
    state = await buildState(ctx);

    const b = dailyBrief(state);
    expect(b.greeting).toMatch(/^Good (morning|afternoon|evening), Sabin!$/);
    expect(b.journey).toBe("You're on Day 1 of your 75-day journey.");
    expect(b.yesterday).toEqual(["physical", "financial"]);
    expect(b.wonToday).toEqual(["mental"]);
    expect(b.openToday).toEqual(["physical", "spiritual", "financial"]);
    for (const f of b.focus) {
      const q = state.today.quests.find((x) => x.title === f.title && x.pillar === f.pillar);
      expect(q?.status).toBe("open");
    }
  });
});
