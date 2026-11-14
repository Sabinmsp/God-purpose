import { nextSteps } from "./brief";
import type { Pillar } from "./pillars";
import { daysBetween } from "./time";
import type { GameState } from "./types";

/**
 * Reminder rules: what the game says when it comes to the player instead of
 * waiting to be opened. Pure and built only from stored records, so every
 * line in a notification is true.
 */
export type NudgeSlot = "morning" | "midday" | "evening";
export type ReminderLevel = "off" | "gentle" | "standard";

/** Which slots each level uses. Gentle is one nudge, in the evening when the day can still be saved. */
export const SLOTS_FOR: Record<ReminderLevel, NudgeSlot[]> = {
  off: [],
  gentle: ["evening"],
  standard: ["morning", "midday", "evening"],
};

/** When each slot is aimed to arrive (Darwin time), for display. */
export const SLOT_TIMES: Record<NudgeSlot, string> = { morning: "7:30am", midday: "12:30pm", evening: "7:30pm" };

/**
 * The slot a Darwin hour belongs to. Windows are wide on purpose: schedulers
 * drift (Vercel's free plan fires any time within the hour), and one nudge
 * per slot per day is enforced in the database, not by timing.
 */
export function slotAt(hour: number): NudgeSlot | null {
  if (hour >= 6 && hour <= 10) return "morning";
  if (hour >= 12 && hour <= 15) return "midday";
  if (hour >= 18 && hour <= 21) return "evening";
  return null;
}

/** After this many days without a win the tone switches to "fresh start" and the easiest quest goes first. */
export const COMEBACK_DAYS = 3;
/** How many quests ride along in one notification (the "Another" button cycles through them). */
export const MAX_NUDGE_QUESTS = 4;

export interface NudgeQuest {
  id: string;
  title: string;
  pillar: Pillar;
  xp: number;
  /** False for quests that only complete from a real log (a workout, three gratitude notes…). */
  tickable: boolean;
}

export interface Nudge {
  kind: "start" | "progress" | "streak" | "comeback" | "first";
  title: string;
  /** One encouraging line shown under the quest. */
  note: string;
  /** Suggested quest first. Empty never happens: no open quest means no nudge. */
  quests: NudgeQuest[];
}

const wonPillars = (s: GameState) => new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));

/** Open quests for a notification: ones a single tap can honestly complete come first. */
export function nudgeQuests(s: GameState, easiestFirst: boolean): NudgeQuest[] {
  const steps = nextSteps(s).map((q, i) => ({ q, i }));
  if (easiestFirst) steps.sort((a, b) => a.q.xp - b.q.xp || a.i - b.i);
  const all = steps.map(({ q }) => ({ id: q.id, title: q.title, pillar: q.pillar, xp: q.xp, tickable: !q.autoOnly }));
  const tickable = all.filter((q) => q.tickable);
  return (tickable.length ? tickable : all).slice(0, MAX_NUDGE_QUESTS);
}

/**
 * The nudge for one slot, or null when silence is the right call: a declared
 * rest day, all four wins already in, or nothing left on the board.
 */
export function composeNudge(s: GameState, slot: NudgeSlot): Nudge | null {
  if (s.today.rest.all || s.today.fourWins) return null;
  const wins = wonPillars(s).size;
  const last = s.stats.lastWinDate;
  const away = last ? daysBetween(last, s.now.date) : null;
  const stuck = wins === 0 && (away === null || away >= COMEBACK_DAYS);
  const quests = nudgeQuests(s, stuck);
  if (!quests.length) return null;

  const name = s.player.name;
  const c = s.campaign;
  const inJourney = c.dayNumber >= 1 && c.dayNumber <= c.totalDays;
  const day = inJourney ? `Day ${c.dayNumber}/${c.totalDays}` : "Today";

  if (stuck && away === null) {
    return { kind: "first", title: `Your first win, ${name}`, note: "Start with the smallest one. One tap when it's done.", quests };
  }
  if (stuck) {
    const byslot: Record<NudgeSlot, [string, string]> = {
      morning: [`Fresh start, ${name}`, `${away} days away. Nothing to catch up on: one small win restarts it.`],
      midday: ["Two minutes counts", "The smallest win on your board. Tap Done when it's finished."],
      evening: ["The easiest restart is tonight", `One tiny win and ${day === "Today" ? "today" : day} counts.`],
    };
    return { kind: "comeback", title: byslot[slot][0], note: byslot[slot][1], quests };
  }
  if (slot === "morning") {
    return { kind: "start", title: `${day} · good morning, ${name}`, note: wins ? `${wins}/4 already. Keep it rolling.` : "Your first win today. Just start with 5 minutes.", quests };
  }
  if (slot === "midday") {
    return wins
      ? { kind: "progress", title: `${wins}/4 wins today`, note: "Next one up. Keep the roll going.", quests }
      : { kind: "start", title: "0/4 so far, and still time", note: "Five minutes is enough to start.", quests };
  }
  const streak = s.stats.streak;
  if (streak.current > 0 && !streak.activeToday) {
    return { kind: "streak", title: `🔥 ${streak.current}-day streak ends tonight`, note: "One win keeps it alive.", quests };
  }
  return wins
    ? { kind: "progress", title: `${wins}/4 today, finish strong`, note: `${4 - wins} to go. Close out the day.`, quests }
    : { kind: "start", title: `${day} isn't over yet`, note: "One small win before bed.", quests };
}

/** The notification text for the i-th quest of a nudge (the service worker builds the same string). */
export function nudgeBody(n: Pick<Nudge, "note" | "quests">, i = 0): string {
  const q = n.quests[i % Math.max(1, n.quests.length)];
  return q ? `${q.title} · +${q.xp} XP\n${n.note}` : n.note;
}

/**
 * What a push message carries to the service worker. One item per suggested
 * quest; `token` lets the notification's Done button complete it with no
 * session (null when the quest only completes from a real log).
 */
export interface PushPayload {
  title: string;
  items: { body: string; token: string | null }[];
  /** Body used when there is no quest to suggest. */
  fallback: string;
  /** Token of the quest just completed, for the Undo button. */
  undo: string | null;
  url: string;
}

/** Where a tapped notification lands: the calm today view. */
export const NUDGE_URL = "/?view=today";
