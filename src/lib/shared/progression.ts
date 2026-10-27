import { PILLARS, type Pillar } from "./pillars";

/**
 * XP needed to advance from `level` to `level + 1`.
 * Grows polynomially (n^1.25) so each level is harder than the last without
 * turning into an exponential grind. With a typical day (~150 XP per pillar)
 * level 5 takes ~9 days, level 10 ~7 weeks, level 30 well over a year.
 */
export function xpToNext(level: number): number {
  return Math.round((100 * Math.pow(Math.max(1, level), 1.25)) / 5) * 5;
}

export const MAX_LEVEL = 99;

const cumulative: number[] = [0, 0]; // cumulative[L] = total XP required to reach level L
for (let level = 2; level <= MAX_LEVEL; level++) {
  cumulative[level] = cumulative[level - 1] + xpToNext(level - 1);
}

export function totalXpForLevel(level: number): number {
  return cumulative[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level requires in total. */
  needed: number;
  /** 0..1 */
  pct: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && cumulative[level + 1] <= safeXp) level++;
  if (level >= MAX_LEVEL) return { level, xp: safeXp, into: 0, needed: 0, pct: 1 };
  const into = safeXp - cumulative[level];
  const needed = xpToNext(level);
  return { level, xp: safeXp, into, needed, pct: needed ? into / needed : 0 };
}

export function levelFromXp(xp: number): number {
  return levelProgress(xp).level;
}

/**
 * Overall level uses the same curve applied to the average pillar XP, so a
 * balanced life levels the character at the same pace as each pillar.
 */
export function overallProgress(pillarXp: Record<Pillar, number>): LevelProgress & { totalXp: number } {
  const totalXp = PILLARS.reduce((sum, p) => sum + Math.max(0, pillarXp[p] ?? 0), 0);
  return { ...levelProgress(Math.floor(totalXp / PILLARS.length)), totalXp };
}

/** Quest XP values a player may choose. The server rejects anything else. */
export const ALLOWED_QUEST_XP = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;

/** Max quest XP per pillar per local day. Stops farming via many custom quests. */
export const DAILY_PILLAR_XP_CAP = 300;

/** Max active quest definitions per pillar. */
export const MAX_QUESTS_PER_PILLAR = 15;

/** XP actually granted for a completion given what was already earned today. */
export function cappedAward(questXp: number, earnedToday: number, cap = DAILY_PILLAR_XP_CAP): number {
  return Math.max(0, Math.min(questXp, cap - Math.max(0, earnedToday)));
}
