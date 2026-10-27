import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pillarXp } from "@/lib/server/services/progress";
import { addFinanceEntry, moveSavings, setSavingsBalance } from "@/lib/server/services/money";
import { buildState } from "@/lib/server/services/state";
import { closeDb, ctxAt, resetDb, rid } from "../helpers/db";

const NOW = new Date("2026-10-28T01:00:00Z");
let base: Awaited<ReturnType<typeof resetDb>>;
const ctx = (now = NOW) => ctxAt(base, now);

beforeEach(async () => {
  base = await resetDb(NOW);
});
afterAll(closeDb);

const vaults = async () => {
  const s = await buildState(ctx());
  return Object.fromEntries(s.savings.goals.map((g) => [g.key, g])) as Record<"tuition" | "car", (typeof s.savings.goals)[number]>;
};

describe("savings vaults", () => {
  it("start empty at A$13,000 and A$10,000 targets", async () => {
    const v = await vaults();
    expect(v.tuition).toMatchObject({ targetCents: 1_300_000, balanceCents: 0, progress: 0 });
    expect(v.car).toMatchObject({ targetCents: 1_000_000, balanceCents: 0 });
  });

  it("does not double count a re-submitted deposit", async () => {
    const { tuition } = await vaults();
    const requestId = rid();
    await moveSavings(ctx(), { requestId, goalId: tuition.id, direction: "deposit", amountCents: 50_000, note: "" });
    await moveSavings(ctx(), { requestId, goalId: tuition.id, direction: "deposit", amountCents: 50_000, note: "" });
    await Promise.allSettled([
      moveSavings(ctx(), { requestId, goalId: tuition.id, direction: "deposit", amountCents: 50_000, note: "" }),
      moveSavings(ctx(), { requestId, goalId: tuition.id, direction: "deposit", amountCents: 50_000, note: "" }),
    ]);
    expect((await vaults()).tuition.balanceCents).toBe(50_000);
  });

  it("allows withdrawals, never below zero, and keeps earned XP and achievements", async () => {
    const { car } = await vaults();
    const events = await moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "deposit", amountCents: 100_000, note: "" });
    expect(events.map((e) => e.type)).toContain("achievement"); // first_deposit + car_10
    const xpAfterDeposit = (await pillarXp(base.sql, base.playerId)).financial;
    expect(xpAfterDeposit).toBeGreaterThan(0);

    await expect(
      moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "withdrawal", amountCents: 100_001, note: "" }),
    ).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT" });

    await moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "withdrawal", amountCents: 40_000, note: "Rego" });
    expect((await vaults()).car.balanceCents).toBe(60_000);
    expect((await pillarXp(base.sql, base.playerId)).financial).toBe(xpAfterDeposit);
    const state = await buildState(ctx());
    expect(state.achievements.map((a) => a.key)).toContain("car_10");
  });

  it("grants a milestone bonus only once, even after withdrawing and re-saving", async () => {
    const { car } = await vaults();
    await moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "deposit", amountCents: 100_000, note: "" });
    const xp1 = (await pillarXp(base.sql, base.playerId)).financial;
    await moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "withdrawal", amountCents: 100_000, note: "" });
    await moveSavings(ctx(), { requestId: rid(), goalId: car.id, direction: "deposit", amountCents: 100_000, note: "" });
    expect((await pillarXp(base.sql, base.playerId)).financial).toBe(xp1);
  });

  it("rewards the habit, not the amount", async () => {
    const { tuition } = await vaults();
    const small = await moveSavings(ctx(), { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: 100, note: "" });
    const questXp = small.filter((e) => e.type === "xp" && e.pillar === "financial");
    // A$1 completes the same savings quest a large deposit would (30 XP). No milestone reached.
    expect(questXp).toEqual([{ type: "xp", pillar: "financial", amount: 30 }]);
  });

  it("reconciles to a user-entered balance with an auditable adjustment", async () => {
    const { tuition } = await vaults();
    await setSavingsBalance(ctx(), { requestId: rid(), goalId: tuition.id, balanceCents: 250_000, note: "" });
    let v = await vaults();
    expect(v.tuition.balanceCents).toBe(250_000);
    await setSavingsBalance(ctx(new Date(NOW.getTime() + 60_000)), { requestId: rid(), goalId: tuition.id, balanceCents: 200_000, note: "" });
    v = await vaults();
    expect(v.tuition.balanceCents).toBe(200_000);
    const state = await buildState(ctx());
    expect(state.savings.recent.filter((r) => r.kind === "adjustment").map((r) => r.amountCents)).toEqual([-50_000, 250_000]);
  });
});

describe("cash flow", () => {
  it("never counts transfers or savings as income", async () => {
    await addFinanceEntry(ctx(), { requestId: rid(), kind: "income", amountCents: 200_000, category: "Pay", note: "" });
    await addFinanceEntry(ctx(), { requestId: rid(), kind: "expense", amountCents: 4_550, category: "Food", note: "" });
    await addFinanceEntry(ctx(), { requestId: rid(), kind: "transfer", amountCents: 100_000, category: "To savings acct", note: "" });
    const { tuition } = await vaults();
    await moveSavings(ctx(), { requestId: rid(), goalId: tuition.id, direction: "deposit", amountCents: 100_000, note: "" });

    const { finance } = await buildState(ctx());
    expect(finance.incomeCents).toBe(200_000);
    expect(finance.expenseCents).toBe(4_550);
    expect(finance.transferCents).toBe(100_000);
    expect(finance.netCents).toBe(200_000 - 4_550);
  });

  it("logging an expense completes today's expense quest once", async () => {
    const first = await addFinanceEntry(ctx(), { requestId: rid(), kind: "expense", amountCents: 1_000, category: "", note: "" });
    expect(first).toContainEqual({ type: "xp", pillar: "financial", amount: 15 });
    const second = await addFinanceEntry(ctx(), { requestId: rid(), kind: "expense", amountCents: 1_000, category: "", note: "" });
    expect(second.filter((e) => e.type === "xp")).toEqual([]);
  });

  it("refuses future-dated entries", async () => {
    await expect(
      addFinanceEntry(ctx(), { requestId: rid(), kind: "income", amountCents: 1, category: "", note: "", occurredOn: "2026-11-30" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
