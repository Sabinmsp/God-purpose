"use client";

import { useCallback, useState } from "react";
import { newRequestId } from "@/client/api";
import { useGame, useGameState } from "@/client/store";
import { garage, vault } from "@/game/art/buildings";
import { CAR_STAGES, carStage, formatAud, parseAudToCents } from "@/lib/shared/money";
import { PILLAR_META } from "@/lib/shared/pillars";
import { formatShortDate } from "@/lib/shared/time";
import type { SavingsGoalView } from "@/lib/shared/types";
import { AddFromLibrary, QuestList } from "../quests";
import { Bar, Empty, Field, MoneyInput, Section, Sheet, Stat, Tabs, useBusy } from "../ui";
import { PillarGoals, PillarHeader, PixelArt, UnlockTrack } from "./common";

const GOLD = PILLAR_META.financial.color;

function VaultCard({ goal }: { goal: SavingsGoalView }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [mode, setMode] = useState<"deposit" | "withdrawal" | "balance" | "settings" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [target, setTarget] = useState(String(goal.targetCents / 100));
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const isCar = goal.key === "car";
  const stage = carStage(goal.progress);
  const level = Math.min(10, goal.balanceCents > 0 ? Math.ceil(goal.progress * 10) : 0);
  const draw = useCallback(() => (isCar ? garage(stage) : vault(level)), [isCar, stage, level]);
  const cents = parseAudToCents(amount);

  const submit = () =>
    run(async () => {
      let ok: unknown = null;
      if (mode === "deposit" || mode === "withdrawal") {
        if (!cents) return;
        ok = await act("/api/savings/move", { requestId, goalId: goal.id, direction: mode, amountCents: cents, note });
      } else if (mode === "balance") {
        if (cents === null) return;
        ok = await act("/api/savings/balance", { requestId, goalId: goal.id, balanceCents: cents, note });
      } else if (mode === "settings") {
        const t = parseAudToCents(target);
        if (!t) return;
        ok = await act(`/api/savings/goals/${goal.id}`, { targetCents: t, targetDate: targetDate || null }, "PATCH");
      }
      if (ok) {
        setAmount("");
        setNote("");
        setRequestId(newRequestId());
        setMode(null);
      }
    });

  return (
    <article className="px-card p-3" data-testid={`vault-${goal.key}`}>
      <div className="flex gap-3">
        <div className="grid shrink-0 place-items-center rounded bg-navy-950 p-1">
          <PixelArt draw={draw} scale={1.5} label={isCar ? `Car garage: ${CAR_STAGES[stage].label}` : `Tuition vault ${Math.floor(goal.progress * 100)}% full`} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-pixel text-lg" style={{ color: GOLD }}>
            {isCar ? "🚗" : "🎓"} {goal.name}
          </h4>
          <div className="font-pixel text-xl" data-testid={`vault-${goal.key}-balance`}>
            {formatAud(goal.balanceCents)}
          </div>
          <div className="text-xs text-cream-dim">of {formatAud(goal.targetCents, { whole: true })}</div>
          <Bar value={goal.progress} color={GOLD} className="mt-2" label={`${goal.name} progress`} />
          <div className="mt-1 flex justify-between text-xs text-cream-dim">
            <span>{Math.floor(goal.progress * 100)}%</span>
            <span>{isCar ? CAR_STAGES[stage].label : `${formatAud(Math.max(0, goal.targetCents - goal.balanceCents), { whole: true })} to go`}</span>
          </div>
        </div>
      </div>
      {isCar && (
        <div className="mt-2 flex gap-1" aria-label="Car build stages">
          {CAR_STAGES.slice(1).map((s, i) => (
            <span key={s.label} className={`flex-1 rounded border border-[#04061a] px-1 py-0.5 text-center text-[10px] ${stage > i ? "bg-gold text-[#2a1a05]" : "bg-navy-950 text-cream-faint"}`} title={s.label}>
              {Math.round(s.at * 100)}%
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-cream-faint">
        {goal.targetDate ? `Target ${formatShortDate(goal.targetDate)}${goal.monthlyNeededCents ? ` · about ${formatAud(goal.monthlyNeededCents, { whole: true })}/month` : ""}` : "No target date yet"}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["deposit", "withdrawal", "balance", "settings"] as const).map((m) => (
          <button key={m} className={`px-btn small ${mode === m ? "" : "secondary"}`} onClick={() => setMode(mode === m ? null : m)}>
            {{ deposit: "+ Deposit", withdrawal: "− Withdraw", balance: "Set balance", settings: "Target" }[m]}
          </button>
        ))}
      </div>
      {mode && (
        <form
          className="mt-3 space-y-2 anim-pop"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "settings" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Target amount">
                <MoneyInput value={target} onChange={setTarget} />
              </Field>
              <Field label="Target date">
                <input className="px-input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </Field>
            </div>
          ) : (
            <>
              <Field
                label={mode === "balance" ? "Actual balance in your account" : mode === "deposit" ? "Amount saved" : "Amount withdrawn"}
                hint={mode === "balance" ? "Use this to match the vault to your real bank balance. The difference is recorded as an adjustment." : undefined}
              >
                <MoneyInput value={amount} onChange={setAmount} />
              </Field>
              <Field label="Note (optional)">
                <input className="px-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
              </Field>
            </>
          )}
          <button className="px-btn w-full" disabled={busy || (mode !== "settings" && (mode === "balance" ? cents === null : !cents))}>
            {{ deposit: "Add to vault", withdrawal: "Withdraw", balance: "Reconcile balance", settings: "Save target" }[mode]}
          </button>
        </form>
      )}
    </article>
  );
}

function CashFlowForm() {
  const { act } = useGame();
  const s = useGameState();
  const { busy, run } = useBusy();
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(s.now.date);
  const [requestId, setRequestId] = useState(newRequestId);
  const cents = parseAudToCents(amount);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          if (!cents) return;
          if (await act("/api/finance/entries", { requestId, kind, amountCents: cents, category, note, occurredOn: date })) {
            setAmount("");
            setNote("");
            setRequestId(newRequestId());
          }
        });
      }}
    >
      <div className="grid grid-cols-3 gap-1 rounded border-2 border-[#04061a] bg-navy-950 p-1" role="radiogroup" aria-label="Entry type">
        {(["expense", "income", "transfer"] as const).map((k) => (
          <button type="button" role="radio" aria-checked={kind === k} key={k} className={`font-pixel rounded py-1 text-sm ${kind === k ? "bg-navy-700 text-gold" : "text-cream-dim"}`} onClick={() => setKind(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Date">
          <input className="px-input" type="date" max={s.now.date} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <input className="px-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={kind === "income" ? "Pay" : kind === "transfer" ? "To savings account" : "Groceries"} maxLength={40} />
        </Field>
        <Field label="Note">
          <input className="px-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
      {kind === "transfer" && <p className="text-xs text-cream-faint">Transfers between your own accounts are tracked separately — never counted as income or spending.</p>}
      <button className="px-btn w-full" disabled={busy || !cents}>
        Record {kind}
      </button>
    </form>
  );
}

export function WealthPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const { act } = useGame();
  const [tab, setTab] = useState<"vaults" | "cash" | "history" | "goals">("vaults");
  const f = s.finance;
  return (
    <Sheet title="Wealth Kingdom" subtitle="Savings · budgeting · freedom" icon="💰" accent={GOLD} onClose={onClose}>
      <PillarHeader pillar="financial" />
      <Tabs
        tabs={[
          { id: "vaults", label: "Vaults" },
          { id: "cash", label: "Cash flow" },
          { id: "history", label: "History" },
          { id: "goals", label: "Goals" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "vaults" && (
        <>
          <div className="px-card mb-4 p-3">
            <div className="flex justify-between text-sm">
              <span className="font-pixel text-cream-dim">Combined mission</span>
              <span className="font-pixel text-gold">
                {formatAud(s.savings.totalBalanceCents, { whole: true })} / {formatAud(s.savings.totalTargetCents, { whole: true })}
              </span>
            </div>
            <Bar value={s.savings.totalTargetCents ? s.savings.totalBalanceCents / s.savings.totalTargetCents : 0} color={GOLD} className="mt-2" />
          </div>
          <div className="mb-5 space-y-3">
            {s.savings.goals.map((g) => (
              <VaultCard key={g.id} goal={g} />
            ))}
          </div>
          <Section title="Today's financial quests">
            <QuestList pillar="financial" />
            <AddFromLibrary pillar="financial" />
            <p className="mt-2 text-xs text-cream-faint">XP rewards responsible actions — logging, saving, reviewing — never the size of your income.</p>
          </Section>
          <Section title="Kingdom unlocks">
            <UnlockTrack pillar="financial" />
          </Section>
        </>
      )}
      {tab === "cash" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Stat label="Income (month)" value={formatAud(f.incomeCents, { whole: true })} color="#5fc4a4" />
            <Stat label="Spending (month)" value={formatAud(f.expenseCents, { whole: true })} color="#e0794f" />
            <Stat label="Net cash flow" value={formatAud(f.netCents, { whole: true })} color={f.netCents >= 0 ? "#5fc4a4" : "#e05f5f"} />
            <Stat label="Transfers" value={formatAud(f.transferCents, { whole: true })} sub="not income" />
          </div>
          <Section title="Record income, spending or a transfer">
            <CashFlowForm />
          </Section>
          <Section title="Recent entries">
            {f.recent.length ? (
              <ul className="space-y-1">
                {f.recent.map((e) => (
                  <li key={e.id} className="px-card flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="w-16 shrink-0 text-xs text-cream-dim">{formatShortDate(e.occurredOn)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.category || e.kind}
                      {e.note && <span className="text-cream-faint"> · {e.note}</span>}
                    </span>
                    <span className="font-pixel" style={{ color: e.kind === "income" ? "#5fc4a4" : e.kind === "expense" ? "#e0794f" : "#c9bd9f" }}>
                      {e.kind === "income" ? "+" : e.kind === "expense" ? "−" : "⇄"}
                      {formatAud(e.amountCents)}
                    </span>
                    <button className="px-ghost text-xs" aria-label="Delete entry" onClick={() => confirm("Delete this entry?") && act(`/api/finance/entries/${e.id}`, undefined, "DELETE")}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No entries yet. Logging today&apos;s spending completes the expense quest.</Empty>
            )}
          </Section>
        </>
      )}
      {tab === "history" && (
        <Section title="Vault history">
          {s.savings.recent.length ? (
            <ul className="space-y-1">
              {s.savings.recent.map((r) => (
                <li key={r.id} className="px-card flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="w-16 shrink-0 text-xs text-cream-dim">{formatShortDate(r.occurredOn)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.goalName} · {r.kind}
                    {r.note && <span className="text-cream-faint"> · {r.note}</span>}
                  </span>
                  <span className="font-pixel" style={{ color: r.amountCents >= 0 ? "#5fc4a4" : "#e0794f" }}>
                    {r.amountCents >= 0 ? "+" : "−"}
                    {formatAud(Math.abs(r.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No savings movements yet.</Empty>
          )}
        </Section>
      )}
      {tab === "goals" && <PillarGoals pillar="financial" />}
    </Sheet>
  );
}
