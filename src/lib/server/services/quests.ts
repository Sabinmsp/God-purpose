import "server-only";
import type { Pillar } from "@/lib/shared/pillars";
import { MAX_QUESTS_PER_PILLAR, cappedAward } from "@/lib/shared/progression";
import { addDays, weekdayOf } from "@/lib/shared/time";
import type { DailyQuest, GameEvent, QuestDefinition } from "@/lib/shared/types";
import type { Q, Tx } from "../db";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { awardXp, mutate, today, type Ctx } from "./progress";

interface DailyRow {
  id: string;
  quest_def_id: string;
  local_date: string;
  pillar: Pillar;
  title: string;
  xp: number;
  status: DailyQuest["status"];
  xp_awarded: number;
  auto_key: string | null;
  auto_only: boolean;
}

const toDaily = (r: DailyRow): DailyQuest => ({
  id: r.id,
  questDefId: r.quest_def_id,
  pillar: r.pillar,
  title: r.title,
  xp: r.xp,
  status: r.status,
  xpAwarded: r.xp_awarded,
  autoKey: r.auto_key,
  autoOnly: r.auto_only,
});

/**
 * Generates the day's board the first time that local date is seen.
 * Idempotent: concurrent first requests produce exactly one board.
 */
export async function ensureBoard(q: Q, playerId: string, date: string) {
  const created = await q`
    insert into daily_boards (player_id, local_date) values (${playerId}, ${date})
    on conflict do nothing returning local_date
  `;
  if (!created.length) return;
  await q`
    insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp)
    select player_id, ${date}, id, pillar, title, xp
    from quest_definitions
    where player_id = ${playerId}
      and archived_at is null
      and on_board
      and ${weekdayOf(date)}::int = any(days_of_week)
    on conflict do nothing
  `;
}

export async function listDaily(q: Q, playerId: string, date: string): Promise<DailyQuest[]> {
  const rows = await q<DailyRow[]>`
    select dq.id, dq.quest_def_id, dq.local_date, dq.pillar, dq.title, dq.xp, dq.status, dq.xp_awarded,
           qd.auto_key, qd.auto_only
    from daily_quests dq
    join quest_definitions qd on qd.id = dq.quest_def_id
    where dq.player_id = ${playerId} and dq.local_date = ${date} and dq.status <> 'moved'
    order by array_position(array['mental','physical','spiritual','financial'], dq.pillar), qd.sort_order, dq.created_at
  `;
  return rows.map(toDaily);
}

export async function listDefinitions(q: Q, playerId: string): Promise<QuestDefinition[]> {
  const rows = await q<
    {
      id: string;
      pillar: Pillar;
      title: string;
      xp: number;
      auto_key: string | null;
      auto_only: boolean;
      on_board: boolean;
      days_of_week: number[];
      goal_id: string | null;
    }[]
  >`
    select id, pillar, title, xp, auto_key, auto_only, on_board, days_of_week, goal_id
    from quest_definitions
    where player_id = ${playerId} and archived_at is null
    order by array_position(array['mental','physical','spiritual','financial'], pillar), sort_order, created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    pillar: r.pillar,
    title: r.title,
    xp: r.xp,
    autoKey: r.auto_key,
    autoOnly: r.auto_only,
    onBoard: r.on_board,
    daysOfWeek: r.days_of_week,
    goalId: r.goal_id,
  }));
}

/** Net quest XP already granted to a pillar today (used for the daily cap). */
export async function questXpToday(q: Q, playerId: string, pillar: Pillar, date: string) {
  const [row] = await q<{ xp: number }[]>`
    select coalesce(sum(amount), 0)::int as xp from xp_transactions
    where player_id = ${playerId} and pillar = ${pillar} and local_date = ${date}
      and source_type in ('quest', 'quest_undo')
  `;
  return row.xp;
}

async function loadDaily(tx: Q, ctx: Ctx, dailyQuestId: string) {
  const [row] = await tx<DailyRow[]>`
    select dq.id, dq.quest_def_id, dq.local_date, dq.pillar, dq.title, dq.xp, dq.status, dq.xp_awarded,
           qd.auto_key, qd.auto_only
    from daily_quests dq
    join quest_definitions qd on qd.id = dq.quest_def_id
    where dq.id = ${dailyQuestId} and dq.player_id = ${ctx.playerId}
  `;
  if (!row) throw notFound("Quest not found");
  return row;
}

async function completeRow(tx: Tx, ctx: Ctx, row: DailyRow): Promise<GameEvent[]> {
  const earned = await questXpToday(tx, ctx.playerId, row.pillar, row.local_date);
  const award = cappedAward(row.xp, earned);
  const updated = await tx`
    update daily_quests set status = 'done', xp_awarded = ${award}, completed_at = ${ctx.now}
    where id = ${row.id} and status in ('open', 'skipped')
    returning id
  `;
  if (!updated.length) throw conflict("This quest is already complete", "ALREADY_DONE");
  await awardXp(tx, ctx, row.pillar, award, "quest", row.id);
  const events: GameEvent[] = [{ type: "action", pillar: row.pillar }];
  if (award < row.xp) events.push({ type: "cap", pillar: row.pillar });
  return events;
}

export function completeQuest(ctx: Ctx, dailyQuestId: string) {
  return mutate(ctx, async (tx) => {
    const row = await loadDaily(tx, ctx, dailyQuestId);
    if (row.local_date !== today(ctx)) throw conflict("Only today's quests can be completed");
    if (row.status === "done") throw conflict("This quest is already complete", "ALREADY_DONE");
    if (row.status === "moved") throw conflict("This quest was moved to another day");
    if (row.auto_only) throw conflict("This quest completes itself when you log the real record", "AUTO_ONLY");
    return completeRow(tx, ctx, row);
  });
}

export function undoQuest(ctx: Ctx, dailyQuestId: string) {
  return mutate(ctx, async (tx) => {
    const row = await loadDaily(tx, ctx, dailyQuestId);
    if (row.local_date !== today(ctx)) throw conflict("Only today's quests can be undone");
    if (row.auto_only) throw conflict("Auto-verified quests can't be undone by hand");
    const updated = await tx`
      update daily_quests set status = 'open', xp_awarded = 0, completed_at = null
      where id = ${row.id} and status = 'done'
      returning id
    `;
    if (!updated.length) throw conflict("This quest is not complete");
    await awardXp(tx, ctx, row.pillar, -row.xp_awarded, "quest_undo", row.id);
  });
}

/** Skipping is free: no XP lost, no streak penalty. Calling again un-skips. */
export function toggleSkipQuest(ctx: Ctx, dailyQuestId: string) {
  return mutate(ctx, async (tx) => {
    const row = await loadDaily(tx, ctx, dailyQuestId);
    if (row.local_date !== today(ctx)) throw conflict("Only today's quests can be changed");
    if (row.status === "open") await tx`update daily_quests set status = 'skipped' where id = ${row.id}`;
    else if (row.status === "skipped") await tx`update daily_quests set status = 'open' where id = ${row.id}`;
    else throw conflict("Only open quests can be skipped");
  });
}

export function moveQuestToTomorrow(ctx: Ctx, dailyQuestId: string) {
  return mutate(ctx, async (tx) => {
    const row = await loadDaily(tx, ctx, dailyQuestId);
    const date = today(ctx);
    if (row.local_date !== date) throw conflict("Only today's quests can be rescheduled");
    if (row.status !== "open" && row.status !== "skipped") throw conflict("Only open quests can be rescheduled");
    await tx`update daily_quests set status = 'moved' where id = ${row.id}`;
    await tx`
      insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp)
      values (${ctx.playerId}, ${addDays(date, 1)}, ${row.quest_def_id}, ${row.pillar}, ${row.title}, ${row.xp})
      on conflict (player_id, local_date, quest_def_id) do update set status = 'open'
        where daily_quests.status in ('moved', 'skipped')
    `;
  });
}

export function addQuestToToday(ctx: Ctx, questDefId: string) {
  return mutate(ctx, async (tx) => {
    const [def] = await tx<{ id: string; pillar: Pillar; title: string; xp: number }[]>`
      select id, pillar, title, xp from quest_definitions
      where id = ${questDefId} and player_id = ${ctx.playerId} and archived_at is null
    `;
    if (!def) throw notFound("Quest not found");
    await tx`
      insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp)
      values (${ctx.playerId}, ${today(ctx)}, ${def.id}, ${def.pillar}, ${def.title}, ${def.xp})
      on conflict (player_id, local_date, quest_def_id) do update set status = 'open'
        where daily_quests.status in ('moved', 'skipped')
    `;
  });
}

/**
 * Completes today's quest linked to a real record (a logged workout, a
 * savings deposit, an expense entry …). Once per quest per day. If the quest
 * is not on today's board it is added, because the activity really happened.
 */
export async function autoComplete(tx: Tx, ctx: Ctx, autoKey: string): Promise<GameEvent[]> {
  const date = today(ctx);
  const [def] = await tx<{ id: string; pillar: Pillar; title: string; xp: number }[]>`
    select id, pillar, title, xp from quest_definitions
    where player_id = ${ctx.playerId} and auto_key = ${autoKey} and archived_at is null
    order by created_at limit 1
  `;
  if (!def) return [];
  await tx`
    insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp)
    values (${ctx.playerId}, ${date}, ${def.id}, ${def.pillar}, ${def.title}, ${def.xp})
    on conflict (player_id, local_date, quest_def_id) do nothing
  `;
  const [row] = await tx<DailyRow[]>`
    select dq.id, dq.quest_def_id, dq.local_date, dq.pillar, dq.title, dq.xp, dq.status, dq.xp_awarded,
           qd.auto_key, qd.auto_only
    from daily_quests dq join quest_definitions qd on qd.id = dq.quest_def_id
    where dq.player_id = ${ctx.playerId} and dq.local_date = ${date} and dq.quest_def_id = ${def.id}
  `;
  if (!row || row.status === "done") return [];
  if (row.status === "moved") await tx`update daily_quests set status = 'open' where id = ${row.id}`;
  return completeRow(tx, ctx, { ...row, status: "open" });
}

export interface QuestInput {
  pillar: Pillar;
  title: string;
  xp: number;
  onBoard: boolean;
  daysOfWeek: number[];
  goalId?: string | null;
}

async function assertGoal(tx: Q, ctx: Ctx, goalId: string | null | undefined) {
  if (!goalId) return;
  const [g] = await tx`select id from goals where id = ${goalId} and player_id = ${ctx.playerId}`;
  if (!g) throw badRequest("Linked goal not found");
}

export function createQuest(ctx: Ctx, input: QuestInput) {
  return mutate(ctx, async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from quest_definitions
      where player_id = ${ctx.playerId} and pillar = ${input.pillar} and archived_at is null
    `;
    if (n >= MAX_QUESTS_PER_PILLAR) throw conflict(`Keep it manageable: at most ${MAX_QUESTS_PER_PILLAR} quests per pillar`);
    await assertGoal(tx, ctx, input.goalId);
    const [def] = await tx<{ id: string }[]>`
      insert into quest_definitions (player_id, pillar, title, xp, on_board, days_of_week, goal_id, sort_order)
      values (${ctx.playerId}, ${input.pillar}, ${input.title}, ${input.xp}, ${input.onBoard},
              ${input.daysOfWeek}, ${input.goalId ?? null}, ${n + 100})
      returning id
    `;
    const date = today(ctx);
    if (input.onBoard && input.daysOfWeek.includes(weekdayOf(date))) {
      await tx`
        insert into daily_quests (player_id, local_date, quest_def_id, pillar, title, xp)
        values (${ctx.playerId}, ${date}, ${def.id}, ${input.pillar}, ${input.title}, ${input.xp})
        on conflict do nothing
      `;
    }
  });
}

export function updateQuest(
  ctx: Ctx,
  id: string,
  patch: Partial<Pick<QuestInput, "title" | "xp" | "onBoard" | "daysOfWeek" | "goalId">>,
) {
  return mutate(ctx, async (tx) => {
    const [def] = await tx<{ id: string; title: string; xp: number; on_board: boolean; days_of_week: number[]; goal_id: string | null }[]>`
      select id, title, xp, on_board, days_of_week, goal_id from quest_definitions
      where id = ${id} and player_id = ${ctx.playerId} and archived_at is null
    `;
    if (!def) throw notFound("Quest not found");
    if (patch.goalId !== undefined) await assertGoal(tx, ctx, patch.goalId);
    const next = {
      title: patch.title ?? def.title,
      xp: patch.xp ?? def.xp,
      on_board: patch.onBoard ?? def.on_board,
      days_of_week: patch.daysOfWeek ?? def.days_of_week,
      goal_id: patch.goalId === undefined ? def.goal_id : patch.goalId,
    };
    await tx`
      update quest_definitions
      set title = ${next.title}, xp = ${next.xp}, on_board = ${next.on_board},
          days_of_week = ${next.days_of_week}, goal_id = ${next.goal_id}
      where id = ${id}
    `;
    // Keep today's not-yet-completed copy in sync. Completed copies keep the XP they were awarded.
    await tx`
      update daily_quests set title = ${next.title}, xp = ${next.xp}
      where quest_def_id = ${id} and local_date >= ${today(ctx)} and status <> 'done'
    `;
  });
}

export function archiveQuest(ctx: Ctx, id: string) {
  return mutate(ctx, async (tx) => {
    const updated = await tx`
      update quest_definitions set archived_at = ${ctx.now}
      where id = ${id} and player_id = ${ctx.playerId} and archived_at is null
      returning id
    `;
    if (!updated.length) throw notFound("Quest not found");
    await tx`delete from daily_quests where quest_def_id = ${id} and local_date >= ${today(ctx)} and status <> 'done'`;
  });
}

export function setRestDay(ctx: Ctx, scope: "all" | "physical", on: boolean, note: string) {
  return mutate(ctx, async (tx) => {
    if (on) {
      await tx`
        insert into rest_days (player_id, local_date, scope, note) values (${ctx.playerId}, ${today(ctx)}, ${scope}, ${note})
        on conflict (player_id, local_date, scope) do update set note = excluded.note
      `;
    } else {
      await tx`delete from rest_days where player_id = ${ctx.playerId} and local_date = ${today(ctx)} and scope = ${scope}`;
    }
  });
}

export function assertNever(x: never): never {
  throw new AppError(400, `Unknown action ${String(x)}`);
}
