import { describe, expect, it } from "vitest";
import { chestLines, chestStatus } from "@/game/world/chest";
import type { Pillar } from "@/lib/shared/pillars";

const state = (pillars: Pillar[], fourWins = false) =>
  ({
    now: { date: "2026-11-17", hour: 9, minute: 0, weekday: 2, timezone: "Australia/Darwin" },
    today: { fourWins },
    campaign: {
      dayNumber: 3,
      days: [
        { date: "2026-11-16", pillars: ["mental", "physical", "spiritual", "financial"], quests: 4, xp: 100 },
        { date: "2026-11-17", pillars, quests: pillars.length, xp: 20 * pillars.length },
      ],
      progress: { fourWinsDays: fourWins ? 2 : 1 },
    },
  }) as unknown as Parameters<typeof chestStatus>[0];

describe("daily chest", () => {
  it("stays locked until all four pillars are won today, and says which are done", () => {
    const c = chestStatus(state(["mental", "financial"]));
    expect(c.unlocked).toBe(false);
    expect(c.won).toEqual(["mental", "financial"]);
    const lines = chestLines(c, false);
    expect(lines[0]).toContain("Locked");
    expect(lines[1]).toBe("Today: Mental ✓  Physical –  Spiritual –  Financial ✓");
    expect(lines[2]).toBe("2 of 4 so far.");
  });

  it("yesterday's four wins don't open today's chest", () => {
    expect(chestStatus(state([])).unlocked).toBe(false);
  });

  it("unlocks on a Four Wins day and reports the recorded totals", () => {
    const c = chestStatus(state(["mental", "physical", "spiritual", "financial"], true));
    expect(c.unlocked).toBe(true);
    expect(chestLines(c, false)).toEqual(["All four pillars won today. The chest swings open!", "Day 3: 2 Four Wins days so far."]);
    expect(chestLines(c, true)[0]).toBe("Already opened today.");
  });
});
