import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMPAIGN,
  STAGE_THRESHOLDS,
  campaignDates,
  dayNumber,
  progressOn,
  stageFor,
  tierFor,
  totalDays,
  unlocksOnDay,
  type CampaignDay,
} from "@/lib/shared/campaign";
import type { Pillar } from "@/lib/shared/pillars";
import { addDays } from "@/lib/shared/time";

const C = DEFAULT_CAMPAIGN;
const ALL: Pillar[] = ["mental", "physical", "spiritual", "financial"];
const day = (n: number, pillars: Pillar[]): CampaignDay => ({ date: addDays(C.startDate, n - 1), pillars, quests: pillars.length, xp: 0 });

describe("75-day campaign calendar", () => {
  it("runs 28 Oct 2026 to 10 Jan 2027 — exactly 75 days", () => {
    expect(totalDays(C)).toBe(75);
    expect(dayNumber(C, "2026-10-28")).toBe(1);
    expect(dayNumber(C, "2026-12-31")).toBe(65);
    expect(dayNumber(C, "2027-01-10")).toBe(75);
    expect(dayNumber(C, "2026-10-27")).toBe(0);
  });

  it("lists calendar days up to today, stopping at the end", () => {
    expect(campaignDates(C, "2026-10-30")).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(campaignDates(C, "2027-03-01")).toHaveLength(75);
    expect(campaignDates(C, "2026-10-01")).toEqual([]);
  });
});

describe("world progression", () => {
  it("evolves each building independently by days won in its pillar", () => {
    expect(STAGE_THRESHOLDS).toEqual([0, 3, 7, 14, 30, 50]);
    expect([0, 2, 3, 6, 7, 13, 14, 29, 30, 49, 50, 75].map(stageFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const days = [day(1, ["mental"]), day(2, ["mental", "physical"]), day(3, ["mental"])];
    const p = progressOn(C, days, days[2].date);
    expect(p.pillarDays).toEqual({ mental: 3, physical: 1, spiritual: 0, financial: 0 });
    expect(p.stages).toEqual({ mental: 1, physical: 0, spiritual: 0, financial: 0 });
  });

  it("only counts a Four Wins day when all four pillars were won", () => {
    const days = [day(1, ALL), day(2, ["mental", "physical", "spiritual"]), day(3, ALL)];
    expect(progressOn(C, days, days[2].date).fourWinsDays).toBe(2);
    expect(tierFor(0)).toBe(0);
    expect(tierFor(1)).toBe(1);
    expect(tierFor(7)).toBe(2);
    expect(tierFor(50)).toBe(5);
  });

  it("ignores wins outside the campaign window", () => {
    const days: CampaignDay[] = [{ date: "2026-10-20", pillars: ALL, quests: 4, xp: 0 }, day(1, ["mental"])];
    expect(progressOn(C, days, "2026-10-28").pillarDays.mental).toBe(1);
    expect(progressOn(C, days, "2026-10-28").fourWinsDays).toBe(0);
  });

  it("reports exactly which upgrades a given day produced", () => {
    const days = [day(1, ALL), day(2, ["mental"]), day(3, ["mental", "spiritual"])];
    expect(unlocksOnDay(C, days, days[0].date)).toMatchObject({
      decorations: ALL,
      fourWins: true,
      lantern: 1,
      evolved: { tier: 1, title: "Initiate" },
      stageUps: [],
    });
    const d3 = unlocksOnDay(C, days, days[2].date);
    expect(d3.decorations).toEqual(["mental", "spiritual"]);
    expect(d3.stageUps).toEqual([{ pillar: "mental", stage: 1, name: "Reading Hall" }]);
    expect(d3.fourWins).toBe(false);
  });
});
