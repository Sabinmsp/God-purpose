import "server-only";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import type { AiMemoryView } from "@/lib/shared/ai";
import { EVOLUTION, STAGE_NAMES, isFourWinsDay } from "@/lib/shared/campaign";
import { formatAud } from "@/lib/shared/money";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { addDays, daysBetween, formatLongDate, formatShortDate } from "@/lib/shared/time";
import type { GameState } from "@/lib/shared/types";
import { WELLBEING_FIELDS, WELLBEING_META, formatWellbeing } from "@/lib/shared/wellbeing";

/**
 * Builds the per-turn <game_data> block from stored records only. Nothing here
 * is inferred: if a figure isn't in the database it isn't in the context.
 */
export function buildAiContext(
  s: GameState,
  opts: {
    memories: AiMemoryView[] | null;
    location?: { lat: number; lon: number } | null;
    /** Full rest days in the record window; without it only the days already in the state are known. */
    restDates?: string[];
  },
): string {
  const lines: string[] = [];
  const c = s.campaign;
  const time = `${String(s.now.hour).padStart(2, "0")}:${String(s.now.minute).padStart(2, "0")}`;

  lines.push(`Player: ${s.player.name} · overall level ${s.stats.overall.level} · title "${EVOLUTION[c.progress.tier].title}"`);
  lines.push(`Today: ${formatLongDate(s.now.date)}, ${time} (${s.now.timezone})`);
  if (c.dayNumber < 1) lines.push(`Campaign "${c.title}" starts ${c.startDate} (in ${1 - c.dayNumber} days).`);
  else if (c.dayNumber > c.totalDays) lines.push(`Campaign "${c.title}" finished on ${c.endDate}.`);
  else lines.push(`Campaign "${c.title}": day ${c.dayNumber} of ${c.totalDays} (${c.startDate} → ${c.endDate}).`);
  const yesterday = c.days[c.days.length - 2];
  lines.push(
    `Four Wins days so far: ${c.progress.fourWinsDays}${yesterday ? ` · yesterday: ${isFourWinsDay(yesterday) ? "Four Wins" : `${yesterday.pillars.length}/4 pillars won`}` : ""}`,
  );

  lines.push(...recordLines(s, opts.restDates));

  lines.push("", "Today's missions:");
  for (const p of PILLARS) {
    const qs = s.today.quests.filter((q) => q.pillar === p);
    const fmt = (st: string) =>
      qs
        .filter((q) => q.status === st)
        .map((q) => `"${q.title}" (+${q.xp}${q.autoOnly ? ", completes automatically from a logged record" : ""})`)
        .join("; ") || "none";
    lines.push(`- ${PILLAR_META[p].name}: done: ${fmt("done")} | open: ${fmt("open")} | skipped: ${fmt("skipped")}`);
  }
  const won = PILLARS.filter((p) => s.today.quests.some((q) => q.pillar === p && q.status === "done"));
  lines.push(`Pillars won today: ${won.length ? won.map((p) => PILLAR_META[p].name).join(", ") : "none"} (${won.length}/4).`);
  if (s.today.rest.all) lines.push("The player marked today as a full rest day.");
  else if (s.today.rest.physical) lines.push("The player marked today as a training rest day.");

  lines.push("", "Levels and XP:");
  for (const p of PILLARS) {
    const st = s.stats.pillars[p];
    lines.push(
      `- ${PILLAR_META[p].name}: level ${st.level}, ${st.xp} XP total (${st.into}/${st.needed} to next level), ${s.today.xpToday[p]} XP today (daily cap ${s.today.dailyCap}), ${s.stats.pillarStreaks[p]}-day streak, building: ${STAGE_NAMES[p][c.progress.stages[p]]} (${c.progress.pillarDays[p]} campaign days won)`,
    );
  }
  lines.push(`Overall streak: ${s.stats.streak.current} days (best ${s.stats.streak.best}). Rest days don't break streaks.`);

  lines.push("", "Savings vaults (recorded balances):");
  for (const g of s.savings.goals) {
    lines.push(
      `- ${g.name}: ${formatAud(g.balanceCents)} of ${formatAud(g.targetCents, { whole: true })} (${Math.floor(g.progress * 100)}%)${g.targetDate ? `, target date ${g.targetDate}` : ", no target date"}${g.monthlyNeededCents ? `, about ${formatAud(g.monthlyNeededCents, { whole: true })}/month needed` : ""}`,
    );
  }
  lines.push(`This month: income ${formatAud(s.finance.incomeCents)}, spending ${formatAud(s.finance.expenseCents)} (transfers excluded).`);

  const w = s.wellbeing.today;
  lines.push(
    "",
    w
      ? `Wellbeing check-in today (self-reported): ${WELLBEING_FIELDS.filter((f) => w[f] != null)
          .map((f) => `${WELLBEING_META[f].label.toLowerCase()} ${formatWellbeing(f, w[f])}`)
          .join(", ")}.`
      : "Wellbeing check-in today: not logged.",
  );

  lines.push("", `Training: ${s.body.workoutsThisWeek} workouts this week, ${s.body.workoutsTotal} total.${s.body.latest?.weightKg ? ` Latest weigh-in ${s.body.latest.weightKg} kg on ${s.body.latest.date}.` : ""}${s.body.targetWeightKg ? ` Body-weight target ${s.body.targetWeightKg} kg.` : ""}`);

  const recent = s.achievements.slice(-5).reverse();
  lines.push("", `Recent achievements: ${recent.length ? recent.map((a) => `${ACHIEVEMENTS_BY_KEY[a.key]?.name ?? a.key} (${a.earnedAt.slice(0, 10)})`).join(", ") : "none yet"}.`);

  const goals = s.goals.filter((g) => g.status === "active");
  if (goals.length) {
    lines.push("", "Active goals:");
    for (const g of goals) {
      lines.push(
        `- [${PILLAR_META[g.pillar].name}] ${g.title}: ${g.currentValue ?? "?"}${g.unit && g.unit !== "A$" ? ` ${g.unit}` : ""} of ${g.targetValue ?? "no target"} (${Math.floor(g.progress * 100)}%)${g.targetDate ? `, deadline ${g.targetDate}` : ""}`,
      );
    }
  }

  const coach = s.player.settings.aiInstructions?.trim();
  lines.push("", coach ? `How the player wants you to coach them (they wrote this in the Coach tab):\n"""\n${coach}\n"""` : "How the player wants you to coach them: not set, use your default style.");

  lines.push("");
  if (opts.memories === null) {
    lines.push("Memory: OFF — the player turned memory off. Do not propose memories.");
  } else if (!opts.memories.length) {
    lines.push("Memory: on, nothing saved yet.");
  } else {
    lines.push("Saved memories (the player wrote or approved these):");
    for (const m of opts.memories) lines.push(`- [${m.category}] ${m.content}`);
  }

  if (opts.location) {
    lines.push("", `Approximate location shared for this message only: ${opts.location.lat.toFixed(2)}, ${opts.location.lon.toFixed(2)} (about 1 km precision).`);
  }

  return `<game_data>\n${lines.join("\n")}\n</game_data>`;
}

export const RECORD_DAYS = 14;

/**
 * The day-by-day evidence for "why am I not progressing": what was actually
 * logged on each recent day. A day with no completed mission is reported as
 * exactly that, never filled in.
 */
function recordLines(s: GameState, restDates: string[] = []): string[] {
  const c = s.campaign;
  const today = s.now.date;
  const from = [addDays(today, -(RECORD_DAYS - 1)), c.startDate].sort().at(-1)!;
  if (from > today) return [];
  const won = new Map(c.days.map((d) => [d.date, d]));
  const rest = new Set([...restDates, ...[...s.week, ...s.calendar.days].filter((d) => d.rest).map((d) => d.date)]);
  const span = daysBetween(from, today) + 1;
  const lines = ["", `Daily record, last ${span} day${span === 1 ? "" : "s"} (a mission only counts once it is marked done or logged):`];
  const perPillar = Object.fromEntries(PILLARS.map((p) => [p, 0])) as Record<(typeof PILLARS)[number], number>;
  let empty = 0;
  let fourWins = 0;
  for (let i = 0; i < span; i++) {
    const date = addDays(from, i);
    const d = won.get(date);
    const pillars = PILLARS.filter((p) => d?.pillars.includes(p));
    for (const p of pillars) perPillar[p]++;
    if (pillars.length === 4) fourWins++;
    // Today is still in progress, so an empty today is not counted as a missed day.
    const missed = !pillars.length && !rest.has(date) && date !== today;
    if (missed) empty++;
    const what = pillars.length
      ? `${pillars.length}/4 pillars won (${pillars.map((p) => PILLAR_META[p].name).join(", ")}), ${d!.quests} mission${d!.quests === 1 ? "" : "s"}, ${d!.xp} XP`
      : rest.has(date)
        ? "rest day, nothing logged"
        : date === today
          ? "nothing logged yet (day in progress)"
          : "nothing logged";
    lines.push(`- ${formatShortDate(date)}${date === today ? " (today)" : ""}: ${what}`);
  }
  lines.push(
    `Summary of those ${span} days: ${empty} with nothing logged, ${fourWins} Four Wins day${fourWins === 1 ? "" : "s"}; days won per pillar: ${PILLARS.map((p) => `${PILLAR_META[p].name} ${perPillar[p]}`).join(", ")}.`,
  );
  const last = s.stats.lastWinDate;
  lines.push(last ? `Last completed mission: ${formatShortDate(last)} (${daysBetween(last, today)} day${daysBetween(last, today) === 1 ? "" : "s"} ago).` : "No mission has ever been completed.");
  // Check-ins are loaded for the last seven days only, so that is all this reports.
  const week = addDays(today, -6);
  const checkins = s.wellbeing.recent.filter((w) => w.date >= week).sort((a, b) => a.date.localeCompare(b.date));
  lines.push(`Wellbeing check-ins, last 7 days (self-reported): ${checkins.length} of 7 logged.`);
  for (const w of checkins) {
    const parts = WELLBEING_FIELDS.filter((f) => w[f] != null).map((f) => `${WELLBEING_META[f].label.toLowerCase()} ${formatWellbeing(f, w[f])}`);
    if (parts.length) lines.push(`- ${formatShortDate(w.date)}: ${parts.join(", ")}`);
  }
  return lines;
}
