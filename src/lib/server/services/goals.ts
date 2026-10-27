import "server-only";
import type { Pillar } from "@/lib/shared/pillars";
import { startOfWeek } from "@/lib/shared/time";
import type { GoalMilestone, GoalView } from "@/lib/shared/types";
import type { Q } from "../db";
import { notFound } from "../errors";
import { mutate, today, weightProgress, type Ctx } from "./progress";

interface GoalRow {
  id: string;
  pillar: Pillar;
  title: string;
  description: string;
  unit: string;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  linked_source: string | null;
  start_date: string;
  target_date: string | null;
  milestones: GoalMilestone[];
  notes: string;
  status: GoalView["status"];
}

/** Progress toward a target from a starting point; works for goals that go up or down. */
export function goalProgress(start: number | null, current: number | null, target: number | null, status: string): number {
  if (status === "completed") return 1;
  if (target == null || current == null) return 0;
  const from = start ?? 0;
  if (from === target) return current === target ? 1 : 0;
  return Math.max(0, Math.min(1, (current - from) / (target - from)));
}

/**
 * Linked goals read their current value from real records (vault ledger,
 * body measurements, workouts, quest history) so they can never drift from
 * what was actually logged.
 */
async function linkedValues(q: Q, playerId: string, date: string) {
  const vaults = await q<{ key: string; balance: number; target: number }[]>`
    select g.key, g.target_cents as target, coalesce(sum(l.amount_cents), 0)::bigint as balance
    from savings_goals g left join savings_ledger l on l.goal_id = g.id
    where g.player_id = ${playerId} group by g.id
  `;
  const weight = await weightProgress(q, playerId);
  const [counts] = await q<{ week_workouts: number; mental_days: number; spiritual_days: number; gratitude_days: number }[]>`
    select
      (select count(*) from workouts where player_id = ${playerId} and local_date >= ${startOfWeek(date)})::int as week_workouts,
      (select count(distinct local_date) from daily_quests where player_id = ${playerId} and pillar = 'mental' and status = 'done')::int as mental_days,
      (select count(distinct local_date) from daily_quests where player_id = ${playerId} and pillar = 'spiritual' and status = 'done')::int as spiritual_days,
      (select count(distinct local_date) from journal_entries where player_id = ${playerId} and kind = 'gratitude')::int as gratitude_days
  `;
  const values: Record<string, number | null> = {
    "body:weight": weight.current,
    "workouts:week": counts.week_workouts,
    "days:mental": counts.mental_days,
    "days:spiritual": counts.spiritual_days,
    "days:gratitude": counts.gratitude_days,
  };
  const targets: Record<string, number> = {};
  for (const v of vaults) {
    values[`savings:${v.key}`] = v.balance / 100;
    targets[`savings:${v.key}`] = v.target / 100;
  }
  return { values, targets, weightStart: weight.start };
}

export async function listGoals(q: Q, playerId: string, date: string): Promise<GoalView[]> {
  const rows = await q<GoalRow[]>`
    select id, pillar, title, description, unit, start_value, target_value, current_value, linked_source,
           start_date, target_date, milestones, notes, status
    from goals where player_id = ${playerId} and status <> 'archived'
    order by array_position(array['mental','physical','spiritual','financial'], pillar), sort_order, created_at
  `;
  const quests = await q<{ id: string; goal_id: string }[]>`
    select id, goal_id from quest_definitions where player_id = ${playerId} and goal_id is not null and archived_at is null
  `;
  const linked = await linkedValues(q, playerId, date);
  return rows.map((r) => {
    const current = r.linked_source && r.linked_source in linked.values ? linked.values[r.linked_source] : r.current_value;
    const start = r.linked_source === "body:weight" ? (r.start_value ?? linked.weightStart) : r.start_value;
    const target = (r.linked_source ? linked.targets[r.linked_source] : undefined) ?? r.target_value;
    return {
      id: r.id,
      pillar: r.pillar,
      title: r.title,
      description: r.description,
      unit: r.unit,
      startValue: start,
      targetValue: target,
      currentValue: current,
      linkedSource: r.linked_source,
      startDate: r.start_date,
      targetDate: r.target_date,
      milestones: r.milestones ?? [],
      notes: r.notes,
      status: r.status,
      progress: goalProgress(start, current, target, r.status),
      linkedQuestIds: quests.filter((qd) => qd.goal_id === r.id).map((qd) => qd.id),
    };
  });
}

export interface GoalInput {
  pillar: Pillar;
  title: string;
  description: string;
  unit: string;
  startValue?: number | null;
  targetValue?: number | null;
  currentValue?: number | null;
  startDate?: string;
  targetDate?: string | null;
  milestones: GoalMilestone[];
  notes: string;
}

export function createGoal(ctx: Ctx, input: GoalInput) {
  return mutate(ctx, async (tx) => {
    await tx`
      insert into goals (player_id, pillar, title, description, unit, start_value, target_value, current_value,
                         start_date, target_date, milestones, notes, sort_order)
      values (${ctx.playerId}, ${input.pillar}, ${input.title}, ${input.description}, ${input.unit},
              ${input.startValue ?? null}, ${input.targetValue ?? null}, ${input.currentValue ?? null},
              ${input.startDate ?? today(ctx)}, ${input.targetDate ?? null}, ${tx.json(input.milestones as never)},
              ${input.notes}, 100)
    `;
  });
}

export function updateGoal(ctx: Ctx, id: string, patch: Partial<Omit<GoalInput, "pillar">> & { status?: GoalView["status"] }) {
  return mutate(ctx, async (tx) => {
    const [g] = await tx<(GoalRow & { completed_at: Date | null })[]>`
      select * from goals where id = ${id} and player_id = ${ctx.playerId}
    `;
    if (!g) throw notFound("Goal not found");
    const pick = <K extends keyof typeof patch, T>(key: K, fallback: T) => (patch[key] === undefined ? fallback : patch[key]);
    const status = patch.status ?? g.status;
    const completedAt = status === "completed" ? (g.completed_at ?? ctx.now) : null;
    await tx`
      update goals set
        title = ${pick("title", g.title) as string},
        description = ${pick("description", g.description) as string},
        unit = ${pick("unit", g.unit) as string},
        start_value = ${pick("startValue", g.start_value) as number | null},
        target_value = ${pick("targetValue", g.target_value) as number | null},
        current_value = ${pick("currentValue", g.current_value) as number | null},
        start_date = ${pick("startDate", g.start_date) as string},
        target_date = ${pick("targetDate", g.target_date) as string | null},
        milestones = ${tx.json((patch.milestones ?? g.milestones) as never)},
        notes = ${pick("notes", g.notes) as string},
        status = ${status},
        completed_at = ${completedAt},
        updated_at = ${ctx.now}
      where id = ${id}
    `;
  });
}
