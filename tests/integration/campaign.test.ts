import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GET as dayRoute } from "@/app/api/campaign/day/route";
import { dayDetail } from "@/lib/server/services/campaign";
import { completeQuest, undoQuest } from "@/lib/server/services/quests";
import { acknowledgeWelcome, buildState } from "@/lib/server/services/state";
import type { GameEvent } from "@/lib/shared/types";
import { apiRequest, closeDb, ctxAt, resetDb, sessionCookie } from "../helpers/db";

const DAY1 = new Date("2026-10-28T01:00:00Z"); // 10:30am Darwin, campaign day 1
const at = (n: number) => new Date(DAY1.getTime() + (n - 1) * 86_400_000);
let base: Awaited<ReturnType<typeof resetDb>>;
const ctx = (now = DAY1) => ctxAt(base, now);

beforeEach(async () => {
  base = await resetDb(DAY1);
});
afterAll(closeDb);

const questIn = async (pillar: string, now: Date) => {
  const q = (await buildState(ctx(now))).today.quests.find((x) => x.pillar === pillar && !x.autoOnly && x.status === "open");
  if (!q) throw new Error(`no open ${pillar} quest`);
  return q;
};

/** Completes the first open quest in each listed pillar on campaign day n. */
async function winPillars(n: number, pillars: string[]) {
  const events: GameEvent[] = [];
  for (const p of pillars) events.push(...(await completeQuest(ctx(at(n)), (await questIn(p, at(n))).id)));
  return events;
}

describe("75-day campaign", () => {
  it("starts on Day 1 with an untouched village", async () => {
    const s = await buildState(ctx());
    expect(s.campaign).toMatchObject({ title: "75-Day Transformation", startDate: "2026-10-28", endDate: "2027-01-10", totalDays: 75, dayNumber: 1 });
    expect(s.campaign.progress).toMatchObject({ fourWinsDays: 0, tier: 0, stages: { mental: 0, physical: 0, spiritual: 0, financial: 0 } });
    expect(s.campaign.days).toEqual([{ date: "2026-10-28", pillars: [], quests: 0, xp: 0 }]);
  });

  it("adds one district decoration per pillar per day, never by repeating quests", async () => {
    const first = await winPillars(1, ["mental"]);
    expect(first).toContainEqual({ type: "decoration", pillar: "mental", count: 1 });
    // A second mental quest the same day earns XP but no extra decoration.
    const second = await winPillars(1, ["mental"]);
    expect(second.filter((e) => e.type === "decoration")).toEqual([]);
    expect((await buildState(ctx())).campaign.progress.pillarDays.mental).toBe(1);
  });

  it("celebrates a Four Wins day only once all four pillars are won", async () => {
    const partial = await winPillars(1, ["mental", "physical", "spiritual"]);
    expect(partial.some((e) => e.type === "fourwins")).toBe(false);
    const final = await winPillars(1, ["financial"]);
    expect(final).toContainEqual({ type: "fourwins", day: 1, total: 1 });
    expect(final).toContainEqual({ type: "evolve", tier: 1, title: "Initiate" });
    const s = await buildState(ctx());
    expect(s.campaign.days[0].pillars.sort()).toEqual(["financial", "mental", "physical", "spiritual"]);
    expect(s.campaign.progress).toMatchObject({ fourWinsDays: 1, tier: 1 });
  });

  it("undoing a quest removes the growth it created", async () => {
    await winPillars(1, ["mental", "physical", "spiritual"]);
    const q = await questIn("financial", at(1));
    await completeQuest(ctx(), q.id);
    expect((await buildState(ctx())).campaign.progress.fourWinsDays).toBe(1);
    await undoQuest(ctx(), q.id);
    const s = await buildState(ctx());
    expect(s.campaign.progress.fourWinsDays).toBe(0);
    expect(s.campaign.progress.pillarDays.financial).toBe(0);
  });

  it("upgrades a building after 3 days of wins in its pillar and keeps calendar days moving", async () => {
    await winPillars(1, ["physical"]);
    await winPillars(2, ["physical"]);
    // Day 3 skipped entirely — the calendar still advances.
    const day4 = await winPillars(4, ["physical"]);
    expect(day4).toContainEqual({ type: "stage", pillar: "physical", stage: 1, name: "Training Hall" });
    const s = await buildState(ctx(at(4)));
    expect(s.campaign.dayNumber).toBe(4);
    expect(s.campaign.days.map((d) => d.pillars.length)).toEqual([1, 1, 0, 1]);
    expect(s.campaign.progress.stages).toEqual({ mental: 0, physical: 1, spiritual: 0, financial: 0 });
  });

  it("opening the game never grows the world", async () => {
    for (let n = 1; n <= 3; n++) await buildState(ctx(at(n)), { welcome: true });
    const s = await buildState(ctx(at(3)));
    expect(s.campaign.progress.pillarDays).toEqual({ mental: 0, physical: 0, spiritual: 0, financial: 0 });
  });

  it("the welcome-back screen reports building upgrades since the last visit", async () => {
    await buildState(ctx(), { welcome: true });
    await acknowledgeWelcome(ctx());
    for (const n of [1, 2, 3]) await winPillars(n, ["spiritual"]);
    const s = await buildState(ctx(at(3)), { welcome: true });
    expect(s.welcome?.stageUps).toEqual([{ pillar: "spiritual", from: 0, to: 1 }]);
  });

  it("the timeline shows exactly what was done on a past day", async () => {
    await winPillars(1, ["mental", "physical", "spiritual", "financial"]);
    await winPillars(2, ["mental"]);
    const d1 = await dayDetail(base.sql, base.playerId, "2026-10-28");
    expect(d1.dayNumber).toBe(1);
    expect(d1.quests.map((q) => q.pillar).sort()).toEqual(["financial", "mental", "physical", "spiritual"]);
    expect(d1.achievements).toEqual(expect.arrayContaining(["first_quest", "four_wins_day"]));
    const d2 = await dayDetail(base.sql, base.playerId, "2026-10-29");
    expect(d2.quests).toHaveLength(1);

    const cookie = await sessionCookie(base);
    const res = await dayRoute(apiRequest("/api/campaign/day?date=2026-10-28", { cookie }));
    expect(res.status).toBe(200);
    expect((await res.json()).day.quests).toHaveLength(4);
    expect((await dayRoute(apiRequest("/api/campaign/day?date=nope", { cookie }))).status).toBe(400);
    expect((await dayRoute(apiRequest("/api/campaign/day?date=2026-10-28"))).status).toBe(401);
  });
});
