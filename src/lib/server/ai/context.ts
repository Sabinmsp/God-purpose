import "server-only";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import type { AiMemoryView } from "@/lib/shared/ai";
import { EVOLUTION, STAGE_NAMES, isFourWinsDay } from "@/lib/shared/campaign";
import { formatAud } from "@/lib/shared/money";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { formatLongDate } from "@/lib/shared/time";
import type { GameState } from "@/lib/shared/types";

/**
 * Builds the per-turn <game_data> block from stored records only. Nothing here
 * is inferred: if a figure isn't in the database it isn't in the context.
 */
export function buildAiContext(
  s: GameState,
  opts: { memories: AiMemoryView[] | null; location?: { lat: number; lon: number } | null },
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
