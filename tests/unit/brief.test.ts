import { describe, expect, it } from "vitest";
import { nextSteps } from "@/lib/shared/brief";
import type { DailyQuest, GameState } from "@/lib/shared/types";

const quest = (id: string, pillar: DailyQuest["pillar"], status: DailyQuest["status"] = "open", autoOnly = false): DailyQuest => ({
  id,
  questDefId: id,
  pillar,
  title: id,
  xp: 20,
  status,
  xpAwarded: 0,
  autoKey: autoOnly ? "workout" : null,
  autoOnly,
});

const at = (hour: number, quests: DailyQuest[], restPhysical = false) =>
  ({ now: { hour }, today: { quests, rest: { all: false, physical: restPhysical } } }) as unknown as GameState;

describe("nextSteps", () => {
  const board = [quest("budget", "financial"), quest("lift", "physical", "open", true), quest("walk", "physical"), quest("read", "mental"), quest("pray", "spiritual")];

  it("orders open pillars by time of day, tickable quests before auto ones", () => {
    expect(nextSteps(at(8, board)).map((q) => q.id)).toEqual(["read", "pray", "walk", "lift", "budget"]);
    expect(nextSteps(at(14, board)).map((q) => q.id)).toEqual(["walk", "lift", "read", "budget", "pray"]);
    expect(nextSteps(at(20, board))[0].id).toBe("budget");
  });

  it("puts pillars already won last, drops done quests and rested physical", () => {
    const b = [quest("read", "mental", "done"), quest("study", "mental"), quest("walk", "physical"), quest("pray", "spiritual", "skipped")];
    expect(nextSteps(at(8, b)).map((q) => q.id)).toEqual(["walk", "study"]);
    expect(nextSteps(at(8, b, true)).map((q) => q.id)).toEqual(["study"]);
    expect(nextSteps(at(8, [quest("read", "mental", "done")]))).toEqual([]);
  });
});
