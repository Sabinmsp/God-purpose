import { PILLARS, type Pillar } from "./pillars";
import { addDays } from "./time";
import type { GameState } from "./types";

/** Opening card of the AI chat, built only from stored records (no model call). */
export interface DailyBrief {
  greeting: string;
  journey: string | null;
  /** Pillars won yesterday; null when yesterday is not in the loaded history. */
  yesterday: Pillar[] | null;
  wonToday: Pillar[];
  openToday: Pillar[];
  focus: { pillar: Pillar; title: string; xp: number }[];
}

export function dailyBrief(s: GameState): DailyBrief {
  const part = s.now.hour < 12 ? "morning" : s.now.hour < 17 ? "afternoon" : "evening";
  const c = s.campaign;
  const journey =
    c.dayNumber < 1
      ? `Your ${c.totalDays}-day journey starts in ${1 - c.dayNumber} day${c.dayNumber === 0 ? "" : "s"}.`
      : c.dayNumber > c.totalDays
        ? `You finished your ${c.totalDays}-day journey with ${c.progress.fourWinsDays} Four Wins days.`
        : `You're on Day ${c.dayNumber} of your ${c.totalDays}-day journey.`;
  const y = s.week.find((d) => d.date === addDays(s.now.date, -1));
  const won = new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));
  const wonToday = PILLARS.filter((p) => won.has(p));
  const openToday = PILLARS.filter((p) => !won.has(p) && s.today.quests.some((q) => q.pillar === p && q.status === "open"));
  const focus = openToday.flatMap((p) => {
    const q = s.today.quests.find((x) => x.pillar === p && x.status === "open" && !x.autoOnly) ?? s.today.quests.find((x) => x.pillar === p && x.status === "open");
    return q ? [{ pillar: p, title: q.title, xp: q.xp }] : [];
  });
  return {
    greeting: `Good ${part}, ${s.player.name}!`,
    journey,
    yesterday: y ? PILLARS.filter((p) => y.pillars.includes(p)) : null,
    wonToday,
    openToday,
    focus,
  };
}
