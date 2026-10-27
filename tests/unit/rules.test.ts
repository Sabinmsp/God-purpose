import { describe, expect, it } from "vitest";
import { CAR_STAGES, carStage, formatAud, parseAudToCents, pct } from "@/lib/shared/money";
import {
  DAILY_PILLAR_XP_CAP,
  cappedAward,
  levelFromXp,
  levelProgress,
  overallProgress,
  totalXpForLevel,
  xpToNext,
} from "@/lib/shared/progression";
import { computeStreak } from "@/lib/shared/streaks";
import { addDays, daysBetween, isValidDate, localClock, localDate, startOfMonth, startOfWeek, weekdayOf } from "@/lib/shared/time";
import { UNLOCKS, physiqueProgress, physiqueTier, sanitizeEquipped, unlockedKeys } from "@/lib/shared/unlocks";

describe("XP curve and levels", () => {
  it("starts at level 1 and needs 100 XP for level 2", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
  });

  it("gets progressively harder every level", () => {
    for (let l = 1; l < 50; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(totalXpForLevel(10)).toBeGreaterThan(5 * totalXpForLevel(5));
  });

  it("reports progress inside a level", () => {
    const p = levelProgress(150);
    expect(p).toMatchObject({ level: 2, into: 50, needed: xpToNext(2) });
    expect(p.pct).toBeCloseTo(50 / xpToNext(2));
  });

  it("never goes below level 1 for negative input", () => {
    expect(levelProgress(-500).level).toBe(1);
  });

  it("derives overall level from average pillar XP", () => {
    const xp = { mental: 400, physical: 400, spiritual: 400, financial: 400 };
    expect(overallProgress(xp).level).toBe(levelFromXp(400));
    expect(overallProgress(xp).totalXp).toBe(1600);
    // A lopsided week levels the overall character more slowly than a balanced one.
    expect(overallProgress({ mental: 1600, physical: 0, spiritual: 0, financial: 0 }).level).toBe(levelFromXp(400));
  });

  it("caps quest XP per pillar per day", () => {
    expect(cappedAward(100, 0)).toBe(100);
    expect(cappedAward(100, DAILY_PILLAR_XP_CAP - 30)).toBe(30);
    expect(cappedAward(100, DAILY_PILLAR_XP_CAP)).toBe(0);
    expect(cappedAward(100, DAILY_PILLAR_XP_CAP + 50)).toBe(0);
  });
});

describe("Australia/Darwin calendar", () => {
  it("uses Darwin's date (UTC+9:30) regardless of host timezone", () => {
    expect(localDate(new Date("2026-10-27T14:29:59Z"))).toBe("2026-10-27");
    expect(localDate(new Date("2026-10-27T14:30:00Z"))).toBe("2026-10-28");
    const clock = localClock(new Date("2026-10-27T14:30:00Z"));
    expect(clock).toMatchObject({ date: "2026-10-28", hour: 0, minute: 0, weekday: 3 });
  });

  it("has no daylight saving shift", () => {
    expect(localClock(new Date("2026-01-15T03:00:00Z")).hour).toBe(12);
    expect(localClock(new Date("2026-07-15T03:00:00Z")).hour).toBe(12);
  });

  it("does date arithmetic on calendar strings", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-10-01", "2026-10-28")).toBe(27);
    expect(weekdayOf("2026-10-28")).toBe(3);
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26");
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26");
    expect(startOfMonth("2026-10-28")).toBe("2026-10-01");
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
  });
});

describe("Money", () => {
  it("parses user input to integer cents", () => {
    expect(parseAudToCents("1,250.5")).toBe(125050);
    expect(parseAudToCents("$40")).toBe(4000);
    expect(parseAudToCents("A$13,000")).toBe(1300000);
    expect(parseAudToCents("0.1")).toBe(10);
    expect(parseAudToCents("-5")).toBeNull();
    expect(parseAudToCents("1.234")).toBeNull();
    expect(parseAudToCents("1e5")).toBeNull();
    expect(parseAudToCents("")).toBeNull();
  });

  it("formats AUD", () => {
    expect(formatAud(123456)).toBe("A$1,234.56");
    expect(formatAud(1300000, { whole: true })).toBe("A$13,000");
  });

  it("builds the car in stages at 10/25/50/75/100%", () => {
    expect(CAR_STAGES.map((s) => s.at)).toEqual([0, 0.1, 0.25, 0.5, 0.75, 1]);
    expect(carStage(0)).toBe(0);
    expect(carStage(0.0999)).toBe(0);
    expect(carStage(0.1)).toBe(1);
    expect(carStage(0.49)).toBe(2);
    expect(carStage(0.75)).toBe(4);
    expect(carStage(1)).toBe(5);
    expect(pct(150, 100)).toBe(1);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("Streaks", () => {
  it("counts consecutive active days and keeps yesterday's streak alive today", () => {
    const r = computeStreak(["2026-10-25", "2026-10-26", "2026-10-27"], [], "2026-10-28");
    expect(r).toEqual({ current: 3, best: 3, activeToday: false });
    expect(computeStreak(["2026-10-27", "2026-10-28"], [], "2026-10-28").current).toBe(2);
  });

  it("does not let rest days break a streak", () => {
    const r = computeStreak(["2026-10-24", "2026-10-25", "2026-10-27"], ["2026-10-26"], "2026-10-28");
    expect(r.current).toBe(3);
  });

  it("resets after a missed day and tracks the best run", () => {
    const r = computeStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-27"], [], "2026-10-28");
    expect(r.current).toBe(1);
    expect(r.best).toBe(4);
  });
});

describe("Unlocks and physique", () => {
  it("unlocks by pillar level", () => {
    const keys = unlockedKeys({ mental: 5, physical: 1, spiritual: 1, financial: 1 });
    expect(keys).toEqual(expect.arrayContaining(["desk_lamp", "bookshelf", "scholar_outfit"]));
    expect(keys).not.toContain("knowledge_aura");
    expect(UNLOCKS.find((u) => u.key === "focus_crown")?.level).toBe(30);
  });

  it("only keeps equipped items that are unlocked and in the right slot", () => {
    expect(sanitizeEquipped({ outfit: "scholar_outfit", aura: "knowledge_aura", hat: "scholar_outfit" }, ["scholar_outfit"])).toEqual({
      outfit: "scholar_outfit",
    });
  });

  it("measures physique progress in either direction", () => {
    expect(physiqueProgress(70, 75, 80)).toBe(0.5); // gaining toward 80 kg
    expect(physiqueProgress(90, 85, 80)).toBe(0.5); // losing toward 80 kg
    expect(physiqueProgress(70, 65, 80)).toBe(0); // moving away never goes negative
    expect(physiqueProgress(null, 75, 80)).toBe(0);
    expect(physiqueTier(0.34)).toBe(1);
    expect(physiqueTier(0.7)).toBe(2);
    expect(physiqueTier(1)).toBe(3);
  });
});
