import { isFourWinsDay } from "@/lib/shared/campaign";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import type { GameState } from "@/lib/shared/types";

/**
 * The daily chest in the plaza. It opens only on a day when all four pillars
 * have been won, so it rewards real wins and nothing else: opening it is a
 * celebration, never a source of XP.
 */
export const CHEST_SPOT = { x: 472, y: 392 };

export interface ChestStatus {
  /** All four pillars are won today. */
  unlocked: boolean;
  won: Pillar[];
  date: string;
  dayNumber: number;
  fourWinsDays: number;
}

type ChestState = Pick<GameState, "now" | "today" | "campaign">;

export function chestStatus(s: ChestState): ChestStatus {
  const day = s.campaign.days.find((d) => d.date === s.now.date);
  const won = PILLARS.filter((p) => day?.pillars.includes(p));
  return {
    unlocked: s.today.fourWins || (day ? isFourWinsDay(day) : false),
    won,
    date: s.now.date,
    dayNumber: s.campaign.dayNumber,
    fourWinsDays: s.campaign.progress.fourWinsDays,
  };
}

/** What the chest says when the player checks it. Built only from recorded progress. */
export function chestLines(c: ChestStatus, opened: boolean): string[] {
  if (!c.unlocked) {
    const tally = PILLARS.map((p) => `${PILLAR_META[p].name} ${c.won.includes(p) ? "✓" : "–"}`).join("  ");
    return ["Locked. It opens on a day you win all four pillars.", `Today: ${tally}`, `${c.won.length} of 4 so far.`];
  }
  if (opened) return ["Already opened today.", "Win all four pillars again tomorrow and it will be waiting."];
  const total = `${c.fourWinsDays} Four Wins day${c.fourWinsDays === 1 ? "" : "s"} so far.`;
  return ["All four pillars won today. The chest swings open!", c.dayNumber > 0 ? `Day ${c.dayNumber}: ${total}` : total];
}

const KEY = "fw_chest_opened";

/** Remembers, per player on this device, the day the chest was last opened. */
export function chestOpened(player: string, date: string): boolean {
  try {
    return localStorage.getItem(KEY) === `${player}:${date}`;
  } catch {
    return false;
  }
}

export function markChestOpened(player: string, date: string) {
  try {
    localStorage.setItem(KEY, `${player}:${date}`);
  } catch {
    /* storage blocked: the chest simply opens again next visit */
  }
}
