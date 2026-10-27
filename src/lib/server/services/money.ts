import "server-only";
import { formatAud, pct } from "@/lib/shared/money";
import { daysBetween, startOfMonth } from "@/lib/shared/time";
import type { FinanceEntryView, FinanceSummary, LedgerRow, SavingsGoalView } from "@/lib/shared/types";
import type { Q } from "../db";
import { conflict, notFound } from "../errors";
import { mutate, savingsBalances, today, type Ctx } from "./progress";
import { autoComplete } from "./quests";

// ── Savings vaults ─────────────────────────────────────────────────────────
// Balances are always recomputed from the ledger on the server. The client
// only ever sends a single movement (with an idempotency key), never totals.

export async function listSavings(q: Q, playerId: string, date: string) {
  const balances = await savingsBalances(q, playerId);
  const meta = await q<{ id: string; start_date: string; target_date: string | null }[]>`
    select id, start_date, target_date from savings_goals where player_id = ${playerId}
  `;
  const byId = new Map(meta.map((m) => [m.id, m]));
  const goals: SavingsGoalView[] = balances.map((g) => {
    const m = byId.get(g.id)!;
    const remaining = Math.max(0, g.target_cents - g.balance_cents);
    let monthlyNeededCents: number | null = null;
    if (m.target_date && remaining > 0) {
      const months = Math.max(1, daysBetween(date, m.target_date) / 30.44);
      monthlyNeededCents = Math.ceil(remaining / months);
    }
    return {
      id: g.id,
      key: g.key,
      name: g.name,
      targetCents: g.target_cents,
      balanceCents: g.balance_cents,
      progress: pct(g.balance_cents, g.target_cents),
      startDate: m.start_date,
      targetDate: m.target_date,
      monthlyNeededCents,
    };
  });
  const recent = await q<
    { id: string; goal_id: string; name: string; kind: LedgerRow["kind"]; amount_cents: number; note: string; occurred_on: string }[]
  >`
    select l.id, l.goal_id, g.name, l.kind, l.amount_cents, l.note, l.occurred_on
    from savings_ledger l join savings_goals g on g.id = l.goal_id
    where l.player_id = ${playerId}
    order by l.created_at desc limit 25
  `;
  return {
    goals,
    totalTargetCents: goals.reduce((s, g) => s + g.targetCents, 0),
    totalBalanceCents: goals.reduce((s, g) => s + g.balanceCents, 0),
    recent: recent.map((r) => ({
      id: r.id,
      goalId: r.goal_id,
      goalName: r.name,
      kind: r.kind,
      amountCents: r.amount_cents,
      note: r.note,
      occurredOn: r.occurred_on,
    })),
  };
}

async function goalBalance(tx: Q, ctx: Ctx, goalId: string) {
  const [goal] = await tx<{ id: string; balance_cents: number }[]>`
    select g.id, coalesce((select sum(amount_cents) from savings_ledger where goal_id = g.id), 0)::bigint as balance_cents
    from savings_goals g where g.id = ${goalId} and g.player_id = ${ctx.playerId}
  `;
  if (!goal) throw notFound("Savings goal not found");
  return goal.balance_cents;
}

async function alreadyApplied(tx: Q, ctx: Ctx, requestId: string) {
  const [row] = await tx`select id from savings_ledger where player_id = ${ctx.playerId} and request_id = ${requestId}`;
  return Boolean(row);
}

export function moveSavings(
  ctx: Ctx,
  input: { requestId: string; goalId: string; direction: "deposit" | "withdrawal"; amountCents: number; note: string },
) {
  return mutate(ctx, async (tx) => {
    if (await alreadyApplied(tx, ctx, input.requestId)) return []; // duplicate submit: no double counting
    const balance = await goalBalance(tx, ctx, input.goalId);
    if (input.direction === "withdrawal" && input.amountCents > balance) {
      throw conflict(`You can't withdraw more than this vault holds (${formatAud(balance)})`, "INSUFFICIENT");
    }
    const signed = input.direction === "deposit" ? input.amountCents : -input.amountCents;
    await tx`
      insert into savings_ledger (player_id, goal_id, request_id, kind, amount_cents, note, occurred_on, created_at)
      values (${ctx.playerId}, ${input.goalId}, ${input.requestId}, ${input.direction}, ${signed}, ${input.note}, ${today(ctx)}, ${ctx.now})
    `;
    return input.direction === "deposit" ? autoComplete(tx, ctx, "savings_deposit") : [];
  });
}

/**
 * Reconciles a vault to the balance the player actually has in the bank.
 * Records the difference as an 'adjustment' so history stays auditable.
 */
export function setSavingsBalance(ctx: Ctx, input: { requestId: string; goalId: string; balanceCents: number; note: string }) {
  return mutate(ctx, async (tx) => {
    if (await alreadyApplied(tx, ctx, input.requestId)) return [];
    const balance = await goalBalance(tx, ctx, input.goalId);
    const delta = input.balanceCents - balance;
    if (delta === 0) return [];
    await tx`
      insert into savings_ledger (player_id, goal_id, request_id, kind, amount_cents, note, occurred_on, created_at)
      values (${ctx.playerId}, ${input.goalId}, ${input.requestId}, 'adjustment', ${delta},
              ${input.note || "Balance reconciled"}, ${today(ctx)}, ${ctx.now})
    `;
  });
}

export function updateSavingsGoal(ctx: Ctx, goalId: string, patch: { name?: string; targetCents?: number; targetDate?: string | null }) {
  return mutate(ctx, async (tx) => {
    const [g] = await tx<{ name: string; target_cents: number; target_date: string | null }[]>`
      select name, target_cents, target_date from savings_goals where id = ${goalId} and player_id = ${ctx.playerId}
    `;
    if (!g) throw notFound("Savings goal not found");
    await tx`
      update savings_goals set
        name = ${patch.name ?? g.name},
        target_cents = ${patch.targetCents ?? g.target_cents},
        target_date = ${patch.targetDate === undefined ? g.target_date : patch.targetDate}
      where id = ${goalId}
    `;
  });
}

// ── Income / expenses / transfers ──────────────────────────────────────────

export async function financeSummary(q: Q, playerId: string, date: string): Promise<FinanceSummary> {
  const monthStart = startOfMonth(date);
  const [sums] = await q<{ income: number; expense: number; transfer: number; today_expenses: number }[]>`
    select
      coalesce(sum(amount_cents) filter (where kind = 'income' and occurred_on >= ${monthStart}), 0)::bigint as income,
      coalesce(sum(amount_cents) filter (where kind = 'expense' and occurred_on >= ${monthStart}), 0)::bigint as expense,
      coalesce(sum(amount_cents) filter (where kind = 'transfer' and occurred_on >= ${monthStart}), 0)::bigint as transfer,
      count(*) filter (where kind = 'expense' and occurred_on = ${date})::int as today_expenses
    from finance_entries
    where player_id = ${playerId} and deleted_at is null
  `;
  const recent = await q<
    { id: string; kind: FinanceEntryView["kind"]; amount_cents: number; category: string; note: string; occurred_on: string }[]
  >`
    select id, kind, amount_cents, category, note, occurred_on from finance_entries
    where player_id = ${playerId} and deleted_at is null
    order by occurred_on desc, created_at desc limit 30
  `;
  return {
    monthStart,
    incomeCents: sums.income,
    expenseCents: sums.expense,
    transferCents: sums.transfer,
    // Transfers move money between your own accounts: never income, never spending.
    netCents: sums.income - sums.expense,
    todayExpenseCount: sums.today_expenses,
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCents: r.amount_cents,
      category: r.category,
      note: r.note,
      occurredOn: r.occurred_on,
    })),
  };
}

export function addFinanceEntry(
  ctx: Ctx,
  input: { requestId: string; kind: "income" | "expense" | "transfer"; amountCents: number; category: string; note: string; occurredOn?: string },
) {
  return mutate(ctx, async (tx) => {
    const date = today(ctx);
    const occurredOn = input.occurredOn ?? date;
    if (occurredOn > date) throw conflict("Entries can't be dated in the future");
    const inserted = await tx`
      insert into finance_entries (player_id, request_id, kind, amount_cents, category, note, occurred_on, created_at)
      values (${ctx.playerId}, ${input.requestId}, ${input.kind}, ${input.amountCents}, ${input.category}, ${input.note}, ${occurredOn}, ${ctx.now})
      on conflict (player_id, request_id) do nothing
      returning id
    `;
    if (!inserted.length) return [];
    // Logging spending is the responsible action being rewarded, not the amount.
    return input.kind === "expense" ? autoComplete(tx, ctx, "expense_log") : [];
  });
}

export function deleteFinanceEntry(ctx: Ctx, id: string) {
  return mutate(ctx, async (tx) => {
    const updated = await tx`
      update finance_entries set deleted_at = ${ctx.now}
      where id = ${id} and player_id = ${ctx.playerId} and deleted_at is null
      returning id
    `;
    if (!updated.length) throw notFound("Entry not found");
  });
}
