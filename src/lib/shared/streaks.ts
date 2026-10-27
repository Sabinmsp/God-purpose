import { addDays } from "./time";

export interface StreakResult {
  current: number;
  best: number;
  /** True when today already counts toward the streak. */
  activeToday: boolean;
}

/**
 * A streak counts days with at least one completed quest. Declared rest days
 * never break a streak (and do not add to it), so recovery is not punished.
 * Today only counts once something is done; until then the streak runs to
 * yesterday and is still alive.
 */
export function computeStreak(active: Iterable<string>, rest: Iterable<string>, today: string): StreakResult {
  const activeSet = new Set(active);
  const restSet = new Set(rest);

  let current = 0;
  let day = activeSet.has(today) || restSet.has(today) ? today : addDays(today, -1);
  while (activeSet.has(day) || restSet.has(day)) {
    if (activeSet.has(day)) current++;
    day = addDays(day, -1);
  }

  let best = current;
  const sorted = [...activeSet].filter((d) => d <= today).sort();
  if (sorted.length) {
    let run = 0;
    let cursor = sorted[0];
    const last = sorted[sorted.length - 1];
    while (cursor <= last) {
      if (activeSet.has(cursor)) run++;
      else if (!restSet.has(cursor)) run = 0;
      best = Math.max(best, run);
      cursor = addDays(cursor, 1);
    }
  }

  return { current, best, activeToday: activeSet.has(today) };
}
