import "server-only";
import { PILLARS, type Pillar } from "@/lib/shared/pillars";
import { DAILY_PILLAR_XP_CAP, levelFromXp, levelProgress, overallProgress } from "@/lib/shared/progression";

import { APP_TIMEZONE, addDays, localClock } from "@/lib/shared/time";
import type { DayProgress, GameState, ProgressSnapshot, WelcomeData } from "@/lib/shared/types";
import { sanitizeEquipped, unlockedKeys } from "@/lib/shared/unlocks";
import type { Q } from "../db";
import { bodySummary } from "./body";
import { listGoals } from "./goals";
import { journalForDay } from "./journal";
import { financeSummary, listSavings } from "./money";
import { getPlayer, settingsOf } from "./player";
import { activeDays, levelsOf, pillarXp, streaksFrom, type Ctx } from "./progress";
import { ensureBoard, listDaily, listDefinitions } from "./quests";

/** A new "visit" starts when the game is opened after this long away. */
const VISIT_GAP_MS = 30 * 60 * 1000;

async function weekProgress(q: Q, playerId: string, date: string): Promise<DayProgress[]> {
  const from = addDays(date, -6);
  const xpRows = await q<{ local_date: string; xp: number }[]>`
    select local_date, sum(amount)::int as xp from xp_transactions
    where player_id = ${playerId} and local_date between ${from} and ${date}
    group by local_date
  `;
  const questRows = await q<{ local_date: string; n: number; pillars: Pillar[] }[]>`
    select local_date, count(*)::int as n, array_agg(distinct pillar) as pillars from daily_quests
    where player_id = ${playerId} and status = 'done' and local_date between ${from} and ${date}
    group by local_date
  `;
  const restRows = await q<{ local_date: string }[]>`
    select distinct local_date from rest_days
    where player_id = ${playerId} and scope = 'all' and local_date between ${from} and ${date}
  `;
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    const qr = questRows.find((r) => r.local_date === d);
    return {
      date: d,
      xp: Math.max(0, xpRows.find((r) => r.local_date === d)?.xp ?? 0),
      quests: qr?.n ?? 0,
      pillars: qr?.pillars ?? [],
      rest: restRows.some((r) => r.local_date === d),
    };
  });
}

export async function buildState(ctx: Ctx, opts: { welcome?: boolean } = {}): Promise<GameState> {
  const q = ctx.sql;
  const clock = localClock(ctx.now);
  const date = clock.date;
  await ensureBoard(q, ctx.playerId, date);

  const [player, xp, quests, library, savings, finance, body, goals, journal, week, days, unlockRows, achievementRows, xpTodayRows, creds] =
    await Promise.all([
      getPlayer(q, ctx.playerId),
      pillarXp(q, ctx.playerId),
      listDaily(q, ctx.playerId, date),
      listDefinitions(q, ctx.playerId),
      listSavings(q, ctx.playerId, date),
      financeSummary(q, ctx.playerId, date),
      bodySummary(q, ctx.playerId, date),
      listGoals(q, ctx.playerId, date),
      journalForDay(q, ctx.playerId, date),
      weekProgress(q, ctx.playerId, date),
      activeDays(q, ctx.playerId),
      q<{ key: string; unlocked_at: Date }[]>`select key, unlocked_at from unlocks where player_id = ${ctx.playerId} order by unlocked_at`,
      q<{ key: string; earned_at: Date }[]>`select key, earned_at from achievements where player_id = ${ctx.playerId} order by earned_at`,
      q<{ pillar: Pillar; xp: number }[]>`
        select pillar, coalesce(sum(amount), 0)::int as xp from xp_transactions
        where player_id = ${ctx.playerId} and local_date = ${date} and source_type in ('quest', 'quest_undo')
        group by pillar
      `,
      q<{ pin_hash: string | null; password_weak: boolean }[]>`
        select pin_hash, password_weak from auth_credentials where player_id = ${ctx.playerId}
      `,
    ]);

  const levels = levelsOf(xp);
  const unlocked = unlockedKeys(levels);
  const streaks = streaksFrom(days.rows, days.rest, date);
  const doneToday = new Set(quests.filter((qq) => qq.status === "done").map((qq) => qq.pillar));
  const restToday = days.rest.filter((r) => r.local_date === date).map((r) => r.scope);

  const state: GameState = {
    now: { date, hour: clock.hour, minute: clock.minute, weekday: clock.weekday, timezone: APP_TIMEZONE },
    player: {
      name: player.display_name,
      characterClass: player.character_class,
      startingAge: player.starting_age,
      position: { scene: player.pos_scene, x: player.pos_x, y: player.pos_y, facing: player.facing },
      equipped: sanitizeEquipped(player.equipped ?? {}, unlocked),
      settings: settingsOf(player),
    },
    stats: {
      pillars: Object.fromEntries(PILLARS.map((p) => [p, levelProgress(xp[p])])) as GameState["stats"]["pillars"],
      overall: overallProgress(xp),
      streak: streaks.all,
      pillarStreaks: streaks.perPillar,
    },
    today: {
      quests,
      xpToday: Object.fromEntries(PILLARS.map((p) => [p, Math.max(0, xpTodayRows.find((r) => r.pillar === p)?.xp ?? 0)])) as Record<Pillar, number>,
      dailyCap: DAILY_PILLAR_XP_CAP,
      rest: { all: restToday.includes("all"), physical: restToday.includes("physical") },
      fourWins: doneToday.size === 4,
      journal,
    },
    week,
    questLibrary: library,
    savings,
    finance,
    body,
    goals,
    unlocks: unlockRows.map((r) => ({ key: r.key, unlockedAt: r.unlocked_at.toISOString() })),
    achievements: achievementRows.map((r) => ({ key: r.key, earnedAt: r.earned_at.toISOString() })),
    welcome: null,
    security: { pinEnabled: Boolean(creds[0]?.pin_hash), weakPassword: Boolean(creds[0]?.password_weak) },
  };

  if (opts.welcome) {
    const lastAt = player.last_snapshot_at?.getTime() ?? 0;
    const prev = (player.last_snapshot as ProgressSnapshot | null) ?? null;
    if (!prev || ctx.now.getTime() - lastAt > VISIT_GAP_MS) {
      state.welcome = welcomeDiff(prev, snapshotOf(state, ctx.now), state.savings.goals);
    }
  }
  return state;
}

export function snapshotOf(state: GameState, now: Date): ProgressSnapshot {
  return {
    at: now.toISOString(),
    pillarXp: Object.fromEntries(PILLARS.map((p) => [p, state.stats.pillars[p].xp])) as Record<Pillar, number>,
    levels: Object.fromEntries(PILLARS.map((p) => [p, state.stats.pillars[p].level])) as Record<Pillar, number>,
    overallLevel: state.stats.overall.level,
    savings: Object.fromEntries(state.savings.goals.map((g) => [g.key, g.balanceCents])),
    unlocks: state.unlocks.map((u) => u.key),
    achievements: state.achievements.map((a) => a.key),
    streak: state.stats.streak.current,
    physiqueTier: state.body.physiqueTier,
  };
}

/**
 * What really changed since the last visit, computed from two snapshots of
 * stored data. Opening the game never creates XP or money by itself.
 */
export function welcomeDiff(
  prev: ProgressSnapshot | null,
  cur: ProgressSnapshot,
  vaults: { key: string; name: string; progress: number; balanceCents: number }[],
): WelcomeData {
  const xpGained = Object.fromEntries(
    PILLARS.map((p) => [p, prev ? Math.max(0, cur.pillarXp[p] - (prev.pillarXp?.[p] ?? 0)) : 0]),
  ) as Record<Pillar, number>;
  const levelUps: WelcomeData["levelUps"] = [];
  if (prev) {
    for (const p of PILLARS) {
      const from = prev.levels?.[p] ?? levelFromXp(prev.pillarXp?.[p] ?? 0);
      if (cur.levels[p] > from) levelUps.push({ pillar: p, from, to: cur.levels[p] });
    }
    if (cur.overallLevel > prev.overallLevel) levelUps.push({ pillar: "overall", from: prev.overallLevel, to: cur.overallLevel });
  }
  return {
    firstVisit: !prev,
    since: prev?.at ?? null,
    xpGained,
    levelUps,
    newUnlocks: prev ? cur.unlocks.filter((k) => !prev.unlocks.includes(k)) : [],
    newAchievements: prev ? cur.achievements.filter((k) => !prev.achievements.includes(k)) : [],
    vaults: vaults.map((v) => ({
      key: v.key,
      name: v.name,
      progress: v.progress,
      deltaCents: prev ? v.balanceCents - (prev.savings?.[v.key] ?? 0) : 0,
    })),
    streak: cur.streak,
    physiqueChanged: Boolean(prev && cur.physiqueTier > prev.physiqueTier),
  };
}

/** Stores "what the player has seen" so the next visit can show the difference. */
export async function acknowledgeWelcome(ctx: Ctx) {
  const state = await buildState(ctx);
  const snap = snapshotOf(state, ctx.now);
  await ctx.sql`
    update players set last_snapshot = ${ctx.sql.json(snap as never)}, last_snapshot_at = ${ctx.now}
    where id = ${ctx.playerId}
  `;
}

