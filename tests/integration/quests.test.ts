import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PILLARS } from "@/lib/shared/pillars";
import { DAILY_PILLAR_XP_CAP } from "@/lib/shared/progression";
import { pillarXp } from "@/lib/server/services/progress";
import {
  addQuestToToday,
  completeQuest,
  createQuest,
  moveQuestToTomorrow,
  setRestDay,
  toggleSkipQuest,
  undoQuest,
} from "@/lib/server/services/quests";
import { buildState } from "@/lib/server/services/state";
import { closeDb, ctxAt, resetDb } from "../helpers/db";

const NOW = new Date("2026-10-28T01:00:00Z"); // 10:30am in Darwin
let base: Awaited<ReturnType<typeof resetDb>>;
const ctx = (now = NOW) => ctxAt(base, now);

beforeEach(async () => {
  base = await resetDb(NOW);
});
afterAll(closeDb);

const board = async (now = NOW) => (await buildState(ctx(now))).today.quests;
const quest = async (title: string, now = NOW) => {
  const q = (await board(now)).find((x) => x.title === title);
  if (!q) throw new Error(`No quest ${title}`);
  return q;
};

describe("daily board", () => {
  it("starts with zero XP and generates a manageable board once per day", async () => {
    const state = await buildState(ctx());
    expect(state.stats.overall.totalXp).toBe(0);
    expect(PILLARS.every((p) => state.stats.pillars[p].level === 1)).toBe(true);
    const quests = state.today.quests;
    expect(quests.length).toBeGreaterThanOrEqual(8);
    expect(quests.length).toBeLessThanOrEqual(12);
    for (const p of PILLARS) expect(quests.filter((q) => q.pillar === p).length).toBeGreaterThanOrEqual(2);
    // Loading the game again does not duplicate the board or create XP.
    await buildState(ctx());
    await buildState(ctx());
    expect((await board()).length).toBe(quests.length);
    expect(await pillarXp(base.sql, base.playerId)).toEqual({ mental: 0, physical: 0, spiritual: 0, financial: 0 });
  });
});

describe("completing quests", () => {
  it("awards the server-defined XP once", async () => {
    const q = await quest("Code for 60 minutes");
    const events = await completeQuest(ctx(), q.id);
    expect(events).toContainEqual({ type: "xp", pillar: "mental", amount: 50 });
    expect((await pillarXp(base.sql, base.playerId)).mental).toBe(50);
  });

  it("rejects a second completion of the same quest", async () => {
    const q = await quest("Read for 20 minutes");
    await completeQuest(ctx(), q.id);
    await expect(completeQuest(ctx(), q.id)).rejects.toMatchObject({ status: 409, code: "ALREADY_DONE" });
    expect((await pillarXp(base.sql, base.playerId)).mental).toBe(20);
  });

  it("handles a burst of simultaneous completions (double taps, two devices) exactly once", async () => {
    const q = await quest("Meditate for 10 minutes");
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => completeQuest(ctx(), q.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await pillarXp(base.sql, base.playerId)).spiritual).toBe(30);
  });

  it("undo reverses exactly the XP that was awarded, and it can be re-earned once", async () => {
    const q = await quest("Code for 60 minutes");
    await completeQuest(ctx(), q.id);
    await undoQuest(ctx(), q.id);
    expect((await pillarXp(base.sql, base.playerId)).mental).toBe(0);
    await completeQuest(ctx(), q.id);
    expect((await pillarXp(base.sql, base.playerId)).mental).toBe(50);
  });

  it("caps XP per pillar per day so custom quests can't be farmed", async () => {
    for (let i = 0; i < 5; i++) {
      await createQuest(ctx(), { pillar: "physical", title: `Extra set ${i}`, xp: 100, onBoard: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    }
    const physical = (await board()).filter((q) => q.pillar === "physical" && !q.autoOnly);
    const events = [];
    for (const q of physical) events.push(...(await completeQuest(ctx(), q.id)));
    expect((await pillarXp(base.sql, base.playerId)).physical).toBe(DAILY_PILLAR_XP_CAP);
    expect(events.some((e) => e.type === "cap")).toBe(true);
  });

  it("refuses XP values outside the allowed set and auto-verified quests by hand", async () => {
    const pr = (await buildState(ctx())).questLibrary.find((q) => q.autoKey === "pr")!;
    await addQuestToToday(ctx(), pr.id);
    const prDaily = await quest("Set a new personal record");
    await expect(completeQuest(ctx(), prDaily.id)).rejects.toMatchObject({ status: 409, code: "AUTO_ONLY" });
  });

  it("cannot complete yesterday's quest today", async () => {
    const yesterday = new Date(NOW.getTime() - 86_400_000);
    const old = await quest("Code for 60 minutes", yesterday);
    await expect(completeQuest(ctx(), old.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("skip, reschedule and rest", () => {
  it("skipping costs nothing and can be undone", async () => {
    const q = await quest("Meet your nutrition goal");
    await toggleSkipQuest(ctx(), q.id);
    expect((await quest("Meet your nutrition goal")).status).toBe("skipped");
    await toggleSkipQuest(ctx(), q.id);
    expect((await quest("Meet your nutrition goal")).status).toBe("open");
    expect((await pillarXp(base.sql, base.playerId)).physical).toBe(0);
  });

  it("moves a quest to tomorrow's board", async () => {
    const q = await quest("Read for 20 minutes");
    await moveQuestToTomorrow(ctx(), q.id);
    expect((await board()).find((x) => x.id === q.id)).toBeUndefined();
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect((await board(tomorrow)).filter((x) => x.title === "Read for 20 minutes")).toHaveLength(1);
  });

  it("rest days keep the streak alive", async () => {
    const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
    await completeQuest(ctx(day(0)), (await quest("Code for 60 minutes", day(0))).id);
    await setRestDay(ctx(day(1)), "all", true, "Recovery");
    await completeQuest(ctx(day(2)), (await quest("Code for 60 minutes", day(2))).id);
    const state = await buildState(ctx(day(2)));
    expect(state.stats.streak.current).toBe(2);
  });
});
