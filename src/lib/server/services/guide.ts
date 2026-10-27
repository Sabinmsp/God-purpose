import "server-only";
import { formatAud } from "@/lib/shared/money";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { addDays, daysBetween, formatShortDate, startOfWeek } from "@/lib/shared/time";
import { type Ctx, today } from "./progress";
import { buildState } from "./state";

export type GuideQuestion = "focus_today" | "gym_consistency" | "tuition_progress" | "neglected_habit" | "improve_week";

export interface GuideAnswer {
  title: string;
  lines: string[];
  basis: string;
}

/**
 * The Guide answers only from records stored in the database. It needs no
 * AI subscription; when nothing has been logged it says so instead of guessing.
 */
export async function askGuide(ctx: Ctx, question: GuideQuestion): Promise<GuideAnswer> {
  const state = await buildState(ctx);
  const date = today(ctx);

  const lastWin = await ctx.sql<{ pillar: Pillar; last: string }[]>`
    select pillar, max(local_date) as last from daily_quests
    where player_id = ${ctx.playerId} and status = 'done' group by pillar
  `;
  const daysSince = (p: Pillar) => {
    const row = lastWin.find((r) => r.pillar === p);
    return row ? daysBetween(row.last, date) : null;
  };
  const neglected = [...PILLARS].sort((a, b) => (daysSince(b) ?? 999) - (daysSince(a) ?? 999))[0];
  const open = state.today.quests.filter((q) => q.status === "open" && !q.autoOnly);
  const basis = "Based only on what you've logged in Four Wins.";

  switch (question) {
    case "focus_today": {
      const lines: string[] = [];
      const missing = PILLARS.filter((p) => !state.today.quests.some((q) => q.pillar === p && q.status === "done"));
      if (!missing.length) {
        lines.push("You've already won all four pillars today. Protect your evening and rest well.");
      } else {
        lines.push(`Pillars still open today: ${missing.map((p) => PILLAR_META[p].name).join(", ")}.`);
        const pick = open.find((q) => q.pillar === neglected) ?? open.sort((a, b) => a.xp - b.xp)[0];
        if (pick) lines.push(`Start small: “${pick.title}” (+${pick.xp} ${PILLAR_META[pick.pillar].name} XP).`);
        const ds = daysSince(neglected);
        lines.push(
          ds == null
            ? `${PILLAR_META[neglected].name} has no wins logged yet — one quest there will move you the most.`
            : `${PILLAR_META[neglected].name} last won ${ds === 0 ? "today" : `${ds} day${ds === 1 ? "" : "s"} ago`}.`,
        );
      }
      if (state.today.rest.all) lines.push("You marked today as a rest day — your streak is safe either way.");
      return { title: "What to focus on today", lines, basis };
    }

    case "gym_consistency": {
      const weeks = await ctx.sql<{ week: string; n: number }[]>`
        select date_trunc('week', local_date)::date as week, count(*)::int as n from workouts
        where player_id = ${ctx.playerId} and local_date >= ${addDays(startOfWeek(date), -21)}
        group by 1 order by 1
      `;
      const target = state.goals.find((g) => g.linkedSource === "workouts:week")?.targetValue ?? null;
      const lines: string[] = [];
      if (!state.body.workoutsTotal) {
        lines.push("No workouts logged yet. Log your next session in the Strength Arena to start tracking consistency.");
      } else {
        lines.push(`This week: ${state.body.workoutsThisWeek} workout${state.body.workoutsThisWeek === 1 ? "" : "s"}${target ? ` of your ${target} target` : ""}.`);
        const series = Array.from({ length: 4 }, (_, i) => {
          const wk = addDays(startOfWeek(date), -7 * (3 - i));
          return weeks.find((w) => w.week === wk)?.n ?? 0;
        });
        lines.push(`Last 4 weeks: ${series.join(" → ")} sessions.`);
        const last = state.body.workouts[0];
        if (last) {
          const gap = daysBetween(last.date, date);
          lines.push(`Last workout: ${last.title} on ${formatShortDate(last.date)} (${gap === 0 ? "today" : `${gap} day${gap === 1 ? "" : "s"} ago`}).`);
        }
        if (state.body.prs.length) lines.push(`Recorded bests: ${state.body.prs.slice(0, 3).map((p) => `${p.exercise} ${p.weightKg} kg`).join(", ")}.`);
      }
      return { title: "Gym consistency", lines, basis };
    }

    case "tuition_progress": {
      const vault = state.savings.goals.find((g) => g.key === "tuition");
      if (!vault) return { title: "Tuition progress", lines: ["No tuition vault found."], basis };
      const lines = [
        `Tuition Vault: ${formatAud(vault.balanceCents)} of ${formatAud(vault.targetCents, { whole: true })} (${Math.floor(vault.progress * 100)}%).`,
        `Still needed: ${formatAud(Math.max(0, vault.targetCents - vault.balanceCents))}.`,
      ];
      const [recent] = await ctx.sql<{ net: number }[]>`
        select coalesce(sum(amount_cents), 0)::bigint as net from savings_ledger
        where goal_id = ${vault.id} and occurred_on >= ${addDays(date, -30)}
      `;
      lines.push(`Net change in the last 30 days: ${formatAud(recent.net)}.`);
      if (vault.monthlyNeededCents) lines.push(`To hit your target date, aim for about ${formatAud(vault.monthlyNeededCents)} per month.`);
      else if (!vault.targetDate) lines.push("Set a target date on the vault to see how much to save each month.");
      return { title: "Tuition progress", lines, basis };
    }

    case "neglected_habit": {
      const rates = await ctx.sql<{ title: string; pillar: Pillar; planned: number; done: number }[]>`
        select title, pillar, count(*)::int as planned, count(*) filter (where status = 'done')::int as done
        from daily_quests
        where player_id = ${ctx.playerId} and local_date between ${addDays(date, -13)} and ${addDays(date, -1)}
          and status <> 'moved'
        group by title, pillar having count(*) >= 2
        order by (count(*) filter (where status = 'done'))::float / count(*) asc, count(*) desc
        limit 3
      `;
      const lines = PILLARS.map((p) => {
        const ds = daysSince(p);
        return `${PILLAR_META[p].icon} ${PILLAR_META[p].name}: ${ds == null ? "no wins yet" : ds === 0 ? "won today" : `last win ${ds} day${ds === 1 ? "" : "s"} ago`}`;
      });
      if (rates.length) {
        lines.push(`Most-missed over the last two weeks: “${rates[0].title}” (${rates[0].done}/${rates[0].planned} days).`);
      } else {
        lines.push("Not enough history yet to spot a pattern — check back after a few days of quests.");
      }
      return { title: "Which habit needs attention", lines, basis };
    }

    case "improve_week": {
      const weekXp = state.week.reduce((s, d) => s + d.xp, 0);
      const activeDays = state.week.filter((d) => d.quests > 0).length;
      const byPillar = await ctx.sql<{ pillar: Pillar; n: number }[]>`
        select pillar, count(*)::int as n from daily_quests
        where player_id = ${ctx.playerId} and status = 'done' and local_date >= ${addDays(date, -6)}
        group by pillar
      `;
      const counts = Object.fromEntries(PILLARS.map((p) => [p, byPillar.find((r) => r.pillar === p)?.n ?? 0])) as Record<Pillar, number>;
      const weakest = [...PILLARS].sort((a, b) => counts[a] - counts[b])[0];
      const lines = [
        `Last 7 days: ${weekXp} XP across ${activeDays} active day${activeDays === 1 ? "" : "s"}.`,
        `Quests won: ${PILLARS.map((p) => `${PILLAR_META[p].name} ${counts[p]}`).join(" · ")}.`,
        counts[weakest] === 0
          ? `Biggest opportunity: ${PILLAR_META[weakest].name} — one small daily quest there would rebalance your week.`
          : `Lightest pillar: ${PILLAR_META[weakest].name}. Add one more ${PILLAR_META[weakest].name.toLowerCase()} quest this week.`,
      ];
      if (state.stats.streak.current > 0) lines.push(`Current streak: ${state.stats.streak.current} day${state.stats.streak.current === 1 ? "" : "s"}. Rest days won't break it.`);
      return { title: "How to improve this week", lines, basis };
    }
  }
}
