import { describe, expect, it } from "vitest";
import { SLOTS_FOR, composeNudge, nudgeBody, slotAt } from "@/lib/shared/nudge";
import type { DailyQuest, GameState } from "@/lib/shared/types";

const quest = (id: string, pillar: DailyQuest["pillar"], xp = 20, status: DailyQuest["status"] = "open", autoOnly = false): DailyQuest => ({
  id,
  questDefId: id,
  pillar,
  title: id,
  xp,
  status,
  xpAwarded: 0,
  autoKey: autoOnly ? "workout" : null,
  autoOnly,
});

const BOARD = [quest("code", "mental", 50), quest("gym", "physical", 100), quest("meditate", "spiritual", 30), quest("expenses", "financial", 15)];

interface Opts {
  hour?: number;
  quests?: DailyQuest[];
  lastWinDate?: string | null;
  streak?: number;
  activeToday?: boolean;
  restAll?: boolean;
  dayNumber?: number;
}

function state(o: Opts = {}): GameState {
  const quests = o.quests ?? BOARD;
  return {
    now: { date: "2026-11-14", hour: o.hour ?? 8 },
    player: { name: "Sabin" },
    stats: { lastWinDate: o.lastWinDate === undefined ? "2026-11-13" : o.lastWinDate, streak: { current: o.streak ?? 0, best: 5, activeToday: o.activeToday ?? false } },
    today: { quests, rest: { all: o.restAll ?? false, physical: false }, fourWins: new Set(quests.filter((q) => q.status === "done").map((q) => q.pillar)).size === 4 },
    campaign: { dayNumber: o.dayNumber ?? 18, totalDays: 75 },
  } as unknown as GameState;
}

describe("slotAt", () => {
  it("maps Darwin hours to slots with room for a late scheduler", () => {
    expect([7, 8, 10].map(slotAt)).toEqual(["morning", "morning", "morning"]);
    expect([12, 13, 15].map(slotAt)).toEqual(["midday", "midday", "midday"]);
    expect([19, 20, 21].map(slotAt)).toEqual(["evening", "evening", "evening"]);
  });

  it("is silent at night and between windows", () => {
    expect([0, 3, 5, 11, 16, 17, 22, 23].map(slotAt)).toEqual(Array(8).fill(null));
  });

  it("gentle is one evening nudge; off is none", () => {
    expect(SLOTS_FOR.gentle).toEqual(["evening"]);
    expect(SLOTS_FOR.off).toEqual([]);
    expect(SLOTS_FOR.standard).toHaveLength(3);
  });
});

describe("composeNudge", () => {
  it("says nothing on a rest day, after four wins, or with an empty board", () => {
    expect(composeNudge(state({ restAll: true }), "morning")).toBeNull();
    expect(composeNudge(state({ quests: BOARD.map((q) => ({ ...q, status: "done" as const })) }), "evening")).toBeNull();
    expect(composeNudge(state({ quests: [] }), "midday")).toBeNull();
  });

  it("opens the morning with the campaign day and one first step", () => {
    const n = composeNudge(state(), "morning")!;
    expect(n.kind).toBe("start");
    expect(n.title).toBe("Day 18/75 · good morning, Sabin");
    expect(n.quests[0].id).toBe("code"); // mental first in the morning
    expect(nudgeBody(n)).toBe("code · +50 XP\nYour first win today. Just start with 5 minutes.");
  });

  it("leaves the day number out before the journey starts or after it ends", () => {
    expect(composeNudge(state({ dayNumber: 0 }), "morning")!.title).toBe("Today · good morning, Sabin");
    expect(composeNudge(state({ dayNumber: 80, hour: 20 }), "evening")!.title).toBe("Today isn't over yet");
  });

  it("reports progress at midday", () => {
    expect(composeNudge(state({ hour: 13 }), "midday")!.title).toBe("0/4 so far, and still time");
    const one = BOARD.map((q) => (q.id === "code" ? { ...q, status: "done" as const } : q));
    const n = composeNudge(state({ hour: 13, quests: one, lastWinDate: "2026-11-14", activeToday: true, streak: 2 }), "midday")!;
    expect(n.title).toBe("1/4 wins today");
    expect(n.quests.map((q) => q.id)).not.toContain("code");
  });

  it("warns in the evening when a streak is about to end, not once today counts", () => {
    const risk = composeNudge(state({ hour: 20, streak: 3 }), "evening")!;
    expect(risk.kind).toBe("streak");
    expect(risk.title).toBe("🔥 3-day streak ends tonight");
    const one = BOARD.map((q) => (q.id === "code" ? { ...q, status: "done" as const } : q));
    const safe = composeNudge(state({ hour: 20, quests: one, streak: 4, activeToday: true, lastWinDate: "2026-11-14" }), "evening")!;
    expect(safe.kind).toBe("progress");
    expect(safe.title).toBe("1/4 today, finish strong");
    expect(safe.note).toBe("3 to go. Close out the day.");
  });

  it("after days away: no guilt, and the easiest quest first", () => {
    const n = composeNudge(state({ lastWinDate: "2026-10-31" }), "morning")!;
    expect(n.kind).toBe("comeback");
    expect(n.title).toBe("Fresh start, Sabin");
    expect(n.note).toContain("14 days away");
    expect(n.quests.map((q) => q.xp)).toEqual([15, 30, 50, 100]);
    expect(composeNudge(state({ lastWinDate: "2026-10-31", hour: 13 }), "midday")!.title).toBe("Two minutes counts");
    expect(composeNudge(state({ lastWinDate: "2026-10-31", hour: 20 }), "evening")!.note).toBe("One tiny win and Day 18/75 counts.");
  });

  it("two days away is still an ordinary day", () => {
    expect(composeNudge(state({ lastWinDate: "2026-11-12" }), "morning")!.kind).toBe("start");
  });

  it("greets a player who has never won anything", () => {
    const n = composeNudge(state({ lastWinDate: null }), "evening")!;
    expect(n.kind).toBe("first");
    expect(n.quests[0].id).toBe("expenses");
  });

  it("offers tappable quests before log-only ones, and log-only ones when nothing else is open", () => {
    const mixed = [quest("pr", "physical", 100, "open", true), quest("walk", "physical", 30), quest("read", "mental", 20)];
    expect(composeNudge(state({ quests: mixed }), "morning")!.quests.map((q) => q.id)).toEqual(["read", "walk"]);
    const only = composeNudge(state({ quests: [quest("pr", "physical", 100, "open", true)] }), "morning")!;
    expect(only.quests).toEqual([{ id: "pr", title: "pr", pillar: "physical", xp: 100, tickable: false }]);
  });

  it("never carries more than four quests", () => {
    const many = Array.from({ length: 9 }, (_, i) => quest(`q${i}`, "mental"));
    expect(composeNudge(state({ quests: many }), "morning")!.quests).toHaveLength(4);
  });
});
