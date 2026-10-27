import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { logWorkout, recordMeasurement } from "@/lib/server/services/body";
import { addJournalEntry } from "@/lib/server/services/journal";
import { equip } from "@/lib/server/services/player";
import { awardXp, mutate, pillarXp } from "@/lib/server/services/progress";
import { completeQuest } from "@/lib/server/services/quests";
import { acknowledgeWelcome, buildState } from "@/lib/server/services/state";
import { closeDb, ctxAt, resetDb, rid } from "../helpers/db";

const NOW = new Date("2026-10-28T01:00:00Z");
let base: Awaited<ReturnType<typeof resetDb>>;
const ctx = (now = NOW) => ctxAt(base, now);

beforeEach(async () => {
  base = await resetDb(NOW);
});
afterAll(closeDb);

describe("levelling and unlocks", () => {
  it("emits level-up and unlock events when real XP crosses a threshold", async () => {
    // Simulate many past days of mental work.
    await mutate(ctx(), async (tx) => {
      await awardXp(tx, ctx(), "mental", 1_290, "import", "history");
    });
    const q = (await buildState(ctx())).today.quests.find((x) => x.title === "Code for 60 minutes")!;
    const events = await completeQuest(ctx(), q.id);
    expect(events).toContainEqual({ type: "levelup", pillar: "mental", level: 5 });
    expect(events).toContainEqual({ type: "unlock", key: "scholar_outfit" });
    const state = await buildState(ctx());
    expect(state.unlocks.map((u) => u.key)).toEqual(expect.arrayContaining(["desk_lamp", "bookshelf", "scholar_outfit"]));
  });

  it("refuses to equip items that are not unlocked", async () => {
    await expect(equip(ctx(), "outfit", "scholar_outfit")).rejects.toMatchObject({ status: 403 });
    await expect(equip(ctx(), "hat", "scholar_outfit")).rejects.toMatchObject({ status: 400 });
    await mutate(ctx(), (tx) => awardXp(tx, ctx(), "mental", 1_500, "import", "history"));
    await equip(ctx(), "outfit", "scholar_outfit");
    expect((await buildState(ctx())).player.equipped).toEqual({ outfit: "scholar_outfit" });
  });
});

describe("body tracking", () => {
  it("treats the first log of an exercise as a baseline and detects later PRs", async () => {
    const first = await logWorkout(ctx(), {
      requestId: rid(),
      title: "Push",
      kind: "strength",
      durationMin: 60,
      notes: "",
      sets: [{ exercise: "Bench Press", weightKg: 60, reps: 5, sets: 3 }],
    });
    expect(first.some((e) => e.type === "pr")).toBe(false);
    expect(first).toContainEqual({ type: "xp", pillar: "physical", amount: 100 });

    const next = new Date(NOW.getTime() + 2 * 86_400_000);
    const second = await logWorkout(ctx(next), {
      requestId: rid(),
      title: "Push",
      kind: "strength",
      durationMin: 55,
      notes: "",
      sets: [{ exercise: "bench press", weightKg: 62.5, reps: 5, sets: 3 }],
    });
    expect(second).toContainEqual({ type: "pr", exercise: "bench press", weightKg: 62.5 });
    expect(second).toContainEqual({ type: "achievement", key: "first_pr" });
    // Day 1 workout (100) + day 3 workout (100) + PR quest (100).
    expect((await pillarXp(base.sql, base.playerId)).physical).toBe(300);
  });

  it("only changes physique tier from recorded measurements", async () => {
    // Many workouts alone never change the physique tier.
    for (let i = 0; i < 3; i++) {
      await logWorkout(ctx(new Date(NOW.getTime() + i * 86_400_000)), {
        requestId: rid(),
        title: "Gym",
        kind: "strength",
        durationMin: 45,
        notes: "",
        sets: [],
      });
    }
    expect((await buildState(ctx())).body.physiqueTier).toBe(0);

    await recordMeasurement(ctx(), { weightKg: 68, notes: "" });
    await recordMeasurement(ctx(new Date(NOW.getTime() + 30 * 86_400_000)), { weightKg: 76, notes: "" });
    const state = await buildState(ctx(new Date(NOW.getTime() + 30 * 86_400_000)));
    expect(state.body.startWeightKg).toBe(68);
    expect(state.body.physiqueProgress).toBeCloseTo(8 / 12);
    expect(state.body.physiqueTier).toBe(2);
    const weightGoal = state.goals.find((g) => g.linkedSource === "body:weight")!;
    expect(weightGoal.currentValue).toBe(76);
  });
});

describe("journal-verified quests", () => {
  it("completes the gratitude quest only after three notes", async () => {
    const xp = async () => (await pillarXp(base.sql, base.playerId)).spiritual;
    await addJournalEntry(ctx(), { kind: "gratitude", body: "Family" });
    await addJournalEntry(ctx(), { kind: "gratitude", body: "Health" });
    expect(await xp()).toBe(0);
    await addJournalEntry(ctx(), { kind: "gratitude", body: "Learning" });
    expect(await xp()).toBe(20);
  });
});

describe("welcome back", () => {
  it("shows a first-visit intro, then only real changes since the last visit", async () => {
    const first = await buildState(ctx(), { welcome: true });
    expect(first.welcome?.firstVisit).toBe(true);
    await acknowledgeWelcome(ctx());

    // Reloading soon after is the same visit: no welcome screen.
    expect((await buildState(ctx(new Date(NOW.getTime() + 60_000)), { welcome: true })).welcome).toBeNull();

    // Next day, nothing logged: welcome shows, but no gains are invented.
    const nextDay = new Date(NOW.getTime() + 86_400_000);
    const quiet = await buildState(ctx(nextDay), { welcome: true });
    expect(quiet.welcome?.firstVisit).toBe(false);
    expect(Object.values(quiet.welcome!.xpGained).every((v) => v === 0)).toBe(true);
    expect(quiet.welcome!.levelUps).toEqual([]);

    const q = quiet.today.quests.find((x) => x.title === "Complete a gym workout")!;
    await logWorkout(ctx(nextDay), { requestId: rid(), title: "Legs", kind: "strength", durationMin: 50, notes: "", sets: [] });
    expect(q).toBeDefined();
    const later = await buildState(ctx(new Date(nextDay.getTime() + 3_600_000)), { welcome: true });
    expect(later.welcome?.xpGained.physical).toBe(100);
    expect(later.welcome?.levelUps).toContainEqual({ pillar: "physical", from: 1, to: 2 });
  });
});
