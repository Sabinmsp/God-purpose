import { PILLARS, type Pillar } from "./pillars";
import { addDays, daysBetween } from "./time";

/**
 * The 75-day transformation campaign. All world growth is derived from the
 * days on which real quests were completed, so the same records always
 * produce the same village — on any device, and for any past date.
 */
export const DEFAULT_CAMPAIGN = {
  title: "75-Day Transformation",
  startDate: "2026-10-28",
  endDate: "2027-01-10",
} as const;

export interface CampaignInfo {
  title: string;
  startDate: string;
  endDate: string;
}

/** One calendar day of the campaign and which pillars were won on it. */
export interface CampaignDay {
  date: string;
  pillars: Pillar[];
  quests: number;
  xp: number;
}

/** Days won in a pillar needed for each building stage (index = stage). */
export const STAGE_THRESHOLDS = [0, 3, 7, 14, 30, 50] as const;
export const MAX_STAGE = STAGE_THRESHOLDS.length - 1;

export const STAGE_NAMES: Record<Pillar, string[]> = {
  mental: ["Village Library", "Reading Hall", "Scholar's Library", "Grand Library", "Archive of Light", "Temple of Mastery"],
  physical: ["Village Gym", "Training Hall", "Iron Gym", "Strength Arena", "Champions' Arena", "Colosseum of Will"],
  spiritual: ["Quiet Temple", "Blossom Temple", "Lantern Temple", "Sacred Garden", "Temple of Stillness", "Sanctuary of Light"],
  financial: ["Village Bank", "Merchant Bank", "Trade District", "Royal Treasury", "Golden Exchange", "Kingdom Treasury"],
};

/** What each pillar's district gains for every day that pillar is won. */
export const DECORATION_NAMES: Record<Pillar, string> = {
  mental: "library garden",
  physical: "training yard",
  spiritual: "temple garden",
  financial: "market district",
};

/** Character evolution, driven by complete Four Wins days. */
export const EVOLUTION = [
  { at: 0, title: "Life Builder", description: "The journey begins." },
  { at: 1, title: "Initiate", description: "Your first complete Four Wins day." },
  { at: 7, title: "Committed", description: "Seven Four Wins days — a discipline ring forms." },
  { at: 15, title: "Disciplined", description: "Fifteen Four Wins days — light gathers around you." },
  { at: 30, title: "Transformed", description: "Thirty Four Wins days — you wear the crest of four." },
  { at: 50, title: "Legend of Four", description: "Fifty Four Wins days — a legend in your own world." },
] as const;

export function stageFor(winDays: number): number {
  let stage = 0;
  STAGE_THRESHOLDS.forEach((t, i) => {
    if (winDays >= t) stage = i;
  });
  return stage;
}

export function tierFor(fourWinsDays: number): number {
  let tier = 0;
  EVOLUTION.forEach((e, i) => {
    if (fourWinsDays >= e.at) tier = i;
  });
  return tier;
}

export function totalDays(c: CampaignInfo): number {
  return daysBetween(c.startDate, c.endDate) + 1;
}

/** 1-based campaign day for a date: 0 before the start, > total after the end. */
export function dayNumber(c: CampaignInfo, date: string): number {
  return daysBetween(c.startDate, date) + 1;
}

export function campaignDates(c: CampaignInfo, upTo: string): string[] {
  const last = upTo < c.endDate ? upTo : c.endDate;
  if (last < c.startDate) return [];
  return Array.from({ length: daysBetween(c.startDate, last) + 1 }, (_, i) => addDays(c.startDate, i));
}

export const isFourWinsDay = (d: Pick<CampaignDay, "pillars">) => PILLARS.every((p) => d.pillars.includes(p));

export interface CampaignProgress {
  /** Progress counted up to and including this date. */
  date: string;
  pillarDays: Record<Pillar, number>;
  stages: Record<Pillar, number>;
  fourWinsDays: number;
  tier: number;
}

/** World state after the given date's wins. Days outside the campaign never count. */
export function progressOn(c: CampaignInfo, days: CampaignDay[], date: string): CampaignProgress {
  const counted = days.filter((d) => d.date >= c.startDate && d.date <= c.endDate && d.date <= date);
  const pillarDays = Object.fromEntries(PILLARS.map((p) => [p, counted.filter((d) => d.pillars.includes(p)).length])) as Record<Pillar, number>;
  const fourWinsDays = counted.filter(isFourWinsDay).length;
  return {
    date,
    pillarDays,
    stages: Object.fromEntries(PILLARS.map((p) => [p, stageFor(pillarDays[p])])) as Record<Pillar, number>,
    fourWinsDays,
    tier: tierFor(fourWinsDays),
  };
}

export interface DayUnlocks {
  decorations: Pillar[];
  stageUps: { pillar: Pillar; stage: number; name: string }[];
  fourWins: boolean;
  lantern: number | null;
  evolved: { tier: number; title: string } | null;
}

/** Exactly which visual upgrades a single day produced. */
export function unlocksOnDay(c: CampaignInfo, days: CampaignDay[], date: string): DayUnlocks {
  const before = progressOn(c, days, addDays(date, -1));
  const after = progressOn(c, days, date);
  const decorations = PILLARS.filter((p) => after.pillarDays[p] > before.pillarDays[p]);
  const stageUps = PILLARS.filter((p) => after.stages[p] > before.stages[p]).map((p) => ({
    pillar: p,
    stage: after.stages[p],
    name: STAGE_NAMES[p][after.stages[p]],
  }));
  const fourWins = after.fourWinsDays > before.fourWinsDays;
  return {
    decorations,
    stageUps,
    fourWins,
    lantern: fourWins ? after.fourWinsDays : null,
    evolved: after.tier > before.tier ? { tier: after.tier, title: EVOLUTION[after.tier].title } : null,
  };
}

/** Next building stage for a pillar, or null once the final stage is reached. */
export function nextStage(pillar: Pillar, winDays: number) {
  const stage = stageFor(winDays);
  if (stage >= MAX_STAGE) return null;
  return { stage: stage + 1, name: STAGE_NAMES[pillar][stage + 1], at: STAGE_THRESHOLDS[stage + 1], remaining: STAGE_THRESHOLDS[stage + 1] - winDays };
}
