import "server-only";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import { VAULT_MILESTONES, pct } from "@/lib/shared/money";
import { PILLARS, type Pillar } from "@/lib/shared/pillars";
import { levelFromXp, overallProgress } from "@/lib/shared/progression";
import { computeStreak } from "@/lib/shared/streaks";
import { localDate } from "@/lib/shared/time";
import type { GameEvent } from "@/lib/shared/types";
import { physiqueProgress, physiqueTier, unlockedKeys } from "@/lib/shared/unlocks";
import type { Q, Sql, Tx } from "../db";

export interface Ctx {
  sql: Sql;
  playerId: string;
  now: Date;
}

export const today = (ctx: { now: Date }) => localDate(ctx.now);

export async function pillarXp(q: Q, playerId: string): Promise<Record<Pillar, number>> {
  const rows = await q<{ pillar: Pillar; xp: number }[]>`
    select pillar, coalesce(sum(amount), 0)::int as xp from xp_transactions where player_id = ${playerId} group by pillar
  `;
  const out = { mental: 0, physical: 0, spiritual: 0, financial: 0 };
  for (const r of rows) out[r.pillar] = Math.max(0, r.xp);
  return out;
}

export function levelsOf(xp: Record<Pillar, number>): Record<Pillar, number> {
  return Object.fromEntries(PILLARS.map((p) => [p, levelFromXp(xp[p])])) as Record<Pillar, number>;
}

export async function awardXp(tx: Q, ctx: Ctx, pillar: Pillar, amount: number, sourceType: string, sourceId: string) {
  if (amount === 0) return;
  await tx`
    insert into xp_transactions (player_id, pillar, amount, source_type, source_id, local_date, created_at)
    values (${ctx.playerId}, ${pillar}, ${amount}, ${sourceType}, ${sourceId}, ${today(ctx)}, ${ctx.now})
  `;
}

/** Inserts an achievement once; grants its XP bonus only on first insert. */
export async function grantAchievement(tx: Q, ctx: Ctx, key: string) {
  const def = ACHIEVEMENTS_BY_KEY[key];
  if (!def) return;
  const inserted = await tx`
    insert into achievements (player_id, key, xp_awarded, earned_at)
    values (${ctx.playerId}, ${key}, ${def.xp}, ${ctx.now})
    on conflict do nothing
    returning key
  `;
  if (inserted.length && def.pillar && def.xp > 0) {
    await awardXp(tx, ctx, def.pillar, def.xp, "achievement", key);
  }
}

export async function savingsBalances(q: Q, playerId: string) {
  return q<{ id: string; key: string; name: string; target_cents: number; balance_cents: number }[]>`
    select g.id, g.key, g.name, g.target_cents, coalesce(sum(l.amount_cents), 0)::bigint as balance_cents
    from savings_goals g
    left join savings_ledger l on l.goal_id = g.id
    where g.player_id = ${playerId}
    group by g.id
    order by g.sort_order, g.created_at
  `;
}

/** Start / current / target weight used for physique progress. */
export async function weightProgress(q: Q, playerId: string) {
  const [goal] = await q<{ start_value: number | null; target_value: number | null }[]>`
    select start_value, target_value from goals
    where player_id = ${playerId} and linked_source = 'body:weight' and status <> 'archived'
    order by created_at limit 1
  `;
  const [first] = await q<{ weight_kg: number }[]>`
    select weight_kg from body_measurements where player_id = ${playerId} and weight_kg is not null
    order by local_date asc limit 1
  `;
  const [latest] = await q<{ weight_kg: number }[]>`
    select weight_kg from body_measurements where player_id = ${playerId} and weight_kg is not null
    order by local_date desc limit 1
  `;
  const start = goal?.start_value ?? first?.weight_kg ?? null;
  const target = goal?.target_value ?? null;
  const current = latest?.weight_kg ?? null;
  const progress = physiqueProgress(start, current, target);
  return { start, target, current, progress, tier: physiqueTier(progress) };
}

export async function activeDays(q: Q, playerId: string) {
  const rows = await q<{ local_date: string; pillar: Pillar }[]>`
    select distinct local_date, pillar from daily_quests
    where player_id = ${playerId} and status = 'done'
  `;
  const rest = await q<{ local_date: string; scope: string }[]>`
    select local_date, scope from rest_days where player_id = ${playerId}
  `;
  return { rows, rest };
}

export function streaksFrom(
  rows: { local_date: string; pillar: Pillar }[],
  rest: { local_date: string; scope: string }[],
  date: string,
) {
  const all = computeStreak(
    rows.map((r) => r.local_date),
    rest.filter((r) => r.scope === "all").map((r) => r.local_date),
    date,
  );
  const perPillar = Object.fromEntries(
    PILLARS.map((p) => [
      p,
      computeStreak(
        rows.filter((r) => r.pillar === p).map((r) => r.local_date),
        rest.filter((r) => r.scope === "all" || (p === "physical" && r.scope === "physical")).map((r) => r.local_date),
        date,
      ).current,
    ]),
  ) as Record<Pillar, number>;
  return { all, perPillar };
}

/**
 * Checks every achievement and unlock condition against real stored records.
 * Runs inside each mutation transaction. Inserts are idempotent.
 */
export async function evaluateProgress(tx: Tx, ctx: Ctx) {
  const date = today(ctx);
  const xp = await pillarXp(tx, ctx.playerId);
  const levels = levelsOf(xp);
  const overall = overallProgress(xp).level;

  for (const key of unlockedKeys(levels)) {
    await tx`insert into unlocks (player_id, key, unlocked_at) values (${ctx.playerId}, ${key}, ${ctx.now}) on conflict do nothing`;
  }

  const earned: string[] = [];
  const { rows, rest } = await activeDays(tx, ctx.playerId);
  if (rows.length) earned.push("first_quest");
  if (new Set(rows.filter((r) => r.local_date === date).map((r) => r.pillar)).size === 4) earned.push("four_wins_day");
  const { all } = streaksFrom(rows, rest, date);
  const bestStreak = Math.max(all.current, all.best);
  if (bestStreak >= 3) earned.push("streak_3");
  if (bestStreak >= 7) earned.push("streak_7");
  if (bestStreak >= 30) earned.push("streak_30");
  const maxLevel = Math.max(...PILLARS.map((p) => levels[p]));
  if (maxLevel >= 5) earned.push("level_5");
  if (maxLevel >= 10) earned.push("level_10");
  if (overall >= 5) earned.push("overall_5");
  if (overall >= 10) earned.push("overall_10");
  for (const p of ["mental", "spiritual"] as const) {
    if (new Set(rows.filter((r) => r.pillar === p).map((r) => r.local_date)).size >= 7) earned.push(`${p}_days_7`);
  }

  const [counts] = await tx<{ gratitude_days: number; workouts: number; measurements: number; deposits: number }[]>`
    select
      (select count(distinct local_date) from journal_entries where player_id = ${ctx.playerId} and kind = 'gratitude')::int as gratitude_days,
      (select count(*) from workouts where player_id = ${ctx.playerId})::int as workouts,
      (select count(*) from body_measurements where player_id = ${ctx.playerId})::int as measurements,
      (select count(*) from savings_ledger where player_id = ${ctx.playerId} and kind = 'deposit')::int as deposits
  `;
  if (counts.gratitude_days >= 7) earned.push("gratitude_7");
  if (counts.workouts >= 1) earned.push("first_workout");
  if (counts.workouts >= 10) earned.push("workouts_10");
  if (counts.workouts >= 50) earned.push("workouts_50");
  if (counts.measurements >= 1) earned.push("first_weigh_in");
  if (counts.deposits >= 1) earned.push("first_deposit");

  const physique = await weightProgress(tx, ctx.playerId);
  for (let t = 1; t <= physique.tier; t++) earned.push(`physique_${t}`);

  for (const goal of await savingsBalances(tx, ctx.playerId)) {
    if (goal.key !== "tuition" && goal.key !== "car") continue;
    const progress = pct(goal.balance_cents, goal.target_cents);
    for (const m of VAULT_MILESTONES) {
      if (progress >= m) earned.push(`${goal.key}_${Math.round(m * 100)}`);
    }
  }

  for (const key of earned) await grantAchievement(tx, ctx, key);
}

interface Facts {
  xp: Record<Pillar, number>;
  unlocks: Set<string>;
  achievements: Set<string>;
}

async function facts(q: Q, playerId: string): Promise<Facts> {
  const [xp, unlocks, achievements] = await Promise.all([
    pillarXp(q, playerId),
    q<{ key: string }[]>`select key from unlocks where player_id = ${playerId}`,
    q<{ key: string }[]>`select key from achievements where player_id = ${playerId}`,
  ]);
  return { xp, unlocks: new Set(unlocks.map((r) => r.key)), achievements: new Set(achievements.map((r) => r.key)) };
}

function diffEvents(before: Facts, after: Facts): GameEvent[] {
  const events: GameEvent[] = [];
  for (const p of PILLARS) {
    const delta = after.xp[p] - before.xp[p];
    if (delta > 0) events.push({ type: "xp", pillar: p, amount: delta });
    const [l0, l1] = [levelFromXp(before.xp[p]), levelFromXp(after.xp[p])];
    if (l1 > l0) events.push({ type: "levelup", pillar: p, level: l1 });
  }
  const [o0, o1] = [overallProgress(before.xp).level, overallProgress(after.xp).level];
  if (o1 > o0) events.push({ type: "levelup", pillar: "overall", level: o1 });
  for (const key of after.unlocks) if (!before.unlocks.has(key)) events.push({ type: "unlock", key });
  for (const key of after.achievements) if (!before.achievements.has(key)) events.push({ type: "achievement", key });
  return events;
}

/**
 * Every state change runs through here: one transaction, the player row is
 * locked so concurrent requests (double taps, two devices) apply one at a
 * time, achievements are re-evaluated, and the resulting events are derived
 * from the before/after difference in stored data — never from the client.
 */
export async function mutate(ctx: Ctx, fn: (tx: Tx) => Promise<GameEvent[] | void>): Promise<GameEvent[]> {
  return ctx.sql.begin(async (tx) => {
    const [player] = await tx`select id from players where id = ${ctx.playerId} for update`;
    if (!player) throw new Error("Player not found");
    const before = await facts(tx, ctx.playerId);
    const extra = (await fn(tx)) ?? [];
    await evaluateProgress(tx, ctx);
    const after = await facts(tx, ctx.playerId);
    return [...extra, ...diffEvents(before, after)];
  }) as Promise<GameEvent[]>;
}
