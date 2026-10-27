"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGame, useGameState } from "@/client/store";
import type { Pixels } from "@/game/art/paint";
import { formatAud } from "@/lib/shared/money";
import { PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { totalXpForLevel } from "@/lib/shared/progression";
import { formatShortDate } from "@/lib/shared/time";
import type { GoalView } from "@/lib/shared/types";
import { UNLOCKS } from "@/lib/shared/unlocks";
import { Bar, Field, useBusy } from "../ui";

/** Renders procedural pixel art (the same art the game world uses). */
export function PixelArt({ draw, scale = 2, className = "", label }: { draw: () => Pixels; scale?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = useMemo(() => draw(), [draw]);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.clearRect(0, 0, px.w, px.h);
    px.drawTo(ctx, 0, 0);
  }, [px]);
  return (
    <canvas
      ref={ref}
      width={px.w}
      height={px.h}
      className={className}
      style={{ width: px.w * scale, height: px.h * scale }}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}

export function PillarHeader({ pillar }: { pillar: Pillar }) {
  const s = useGameState();
  const p = s.stats.pillars[pillar];
  const m = PILLAR_META[pillar];
  return (
    <div className="px-card mb-4 p-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-pixel text-2xl" style={{ color: m.color }}>
            Level {p.level}
          </div>
          <div className="text-xs text-cream-dim">{m.blurb}</div>
        </div>
        <div className="text-right text-xs text-cream-dim">
          <div>
            <span className="font-pixel" style={{ color: m.color }}>
              {s.today.xpToday[pillar]}
            </span>{" "}
            / {s.today.dailyCap} XP today
          </div>
          <div>🔥 {s.stats.pillarStreaks[pillar]}-day streak</div>
        </div>
      </div>
      <Bar value={p.pct} color={m.color} className="mt-2" label={`${m.name} XP`} />
      <div className="mt-1 text-right text-xs text-cream-faint">
        {p.into} / {p.needed} XP to level {p.level + 1}
      </div>
    </div>
  );
}

export function UnlockTrack({ pillar }: { pillar: Pillar }) {
  const s = useGameState();
  const xp = s.stats.pillars[pillar].xp;
  const level = s.stats.pillars[pillar].level;
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {UNLOCKS.filter((u) => u.pillar === pillar).map((u) => {
        const got = level >= u.level;
        return (
          <li key={u.key} className={`px-card flex items-center gap-2 px-2 py-1.5 text-sm ${got ? "" : "opacity-70"}`}>
            <span className="font-pixel w-10 shrink-0 text-xs" style={{ color: got ? PILLAR_META[pillar].color : undefined }}>
              {got ? "✓" : `LV${u.level}`}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{u.name}</span>
              <span className="block truncate text-xs text-cream-faint">
                {got ? u.description : `${Math.max(0, totalXpForLevel(u.level) - xp)} XP to go`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const fmtValue = (g: GoalView, v: number | null) => (v == null ? "—" : g.unit === "A$" ? formatAud(Math.round(v * 100), { whole: true }) : `${+v.toFixed(1)} ${g.unit}`);

export function GoalCard({ goal }: { goal: GoalView }) {
  const [edit, setEdit] = useState(false);
  const s = useGameState();
  const m = PILLAR_META[goal.pillar];
  const quests = s.questLibrary.filter((q) => goal.linkedQuestIds.includes(q.id));
  if (edit) return <GoalEditor goal={goal} onDone={() => setEdit(false)} />;
  const next = goal.milestones.find((ms) => goal.currentValue == null || goal.currentValue < ms.value);
  return (
    <article className="px-card p-3" data-testid="goal-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-pixel leading-tight">{goal.title}</h4>
          {goal.description && <p className="text-xs text-cream-dim">{goal.description}</p>}
        </div>
        <span className={`font-pixel shrink-0 rounded px-1.5 py-0.5 text-[10px] ${goal.status === "completed" ? "bg-forest text-cream" : "bg-navy-700 text-cream-dim"}`}>
          {goal.status.toUpperCase()}
        </span>
      </div>
      <Bar value={goal.progress} color={m.color} className="mt-2" label={goal.title} />
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-cream-dim">
        <span>
          {fmtValue(goal, goal.currentValue)} of {fmtValue(goal, goal.targetValue)} · {Math.floor(goal.progress * 100)}%
        </span>
        <span>
          {formatShortDate(goal.startDate)} → {goal.targetDate ? formatShortDate(goal.targetDate) : "no deadline"}
        </span>
      </div>
      {goal.targetValue == null && <p className="mt-1 text-xs text-gold">Set a measurable target to track this goal.</p>}
      {goal.milestones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {goal.milestones.map((ms) => {
            const hit = goal.currentValue != null && (goal.targetValue ?? 0) >= (goal.startValue ?? 0) ? goal.currentValue >= ms.value : goal.currentValue != null && goal.currentValue <= ms.value;
            return (
              <span key={ms.label} className={`rounded border border-[#04061a] px-1.5 text-[11px] ${hit ? "bg-gold text-[#2a1a05]" : ms === next ? "bg-navy-700 text-cream" : "bg-navy-950 text-cream-faint"}`}>
                {hit ? "★ " : ""}
                {ms.label}
              </span>
            );
          })}
        </div>
      )}
      {quests.length > 0 && <p className="mt-2 text-xs text-cream-faint">Quests: {quests.map((q) => q.title).join(" · ")}</p>}
      {goal.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-cream-dim">{goal.notes}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-cream-faint">{goal.linkedSource ? "Tracked automatically from your records" : "Updated by you"}</span>
        <button className="px-ghost text-xs" onClick={() => setEdit(true)}>
          Edit
        </button>
      </div>
    </article>
  );
}

export function GoalEditor({ goal, pillar, onDone }: { goal?: GoalView; pillar?: Pillar; onDone: () => void }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const num = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    unit: goal?.unit ?? "",
    startValue: num(goal?.startValue),
    targetValue: num(goal?.targetValue),
    currentValue: num(goal?.currentValue),
    startDate: goal?.startDate ?? "",
    targetDate: goal?.targetDate ?? "",
    notes: goal?.notes ?? "",
    status: goal?.status ?? "active",
    milestones: (goal?.milestones ?? []).map((m) => `${m.label}=${m.value}`).join(", "),
  });
  const linked = Boolean(goal?.linkedSource);
  const savingsLinked = goal?.linkedSource?.startsWith("savings:");
  const toNum = (v: string) => (v.trim() === "" ? null : Number(v));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = () =>
    run(async () => {
      const milestones = f.milestones
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [label, value] = s.split("=");
          return { label: label.trim(), value: Number(value ?? label) };
        })
        .filter((m) => m.label && Number.isFinite(m.value));
      const body = {
        title: f.title.trim(),
        description: f.description,
        unit: f.unit,
        startValue: toNum(f.startValue),
        targetValue: savingsLinked ? undefined : toNum(f.targetValue),
        ...(linked ? {} : { currentValue: toNum(f.currentValue) }),
        ...(f.startDate ? { startDate: f.startDate } : {}),
        targetDate: f.targetDate || null,
        notes: f.notes,
        milestones,
        ...(goal ? { status: f.status } : { pillar }),
      };
      const ok = goal ? await act(`/api/goals/${goal.id}`, body, "PATCH") : await act("/api/goals", body);
      if (ok) onDone();
    });

  return (
    <form
      className="px-card space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Goal">
        <input className="px-input" value={f.title} onChange={set("title")} required minLength={2} maxLength={100} />
      </Field>
      <Field label="Description">
        <input className="px-input" value={f.description} onChange={set("description")} maxLength={500} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Start value">
          <input className="px-input" inputMode="decimal" value={f.startValue} onChange={set("startValue")} />
        </Field>
        <Field label="Target" hint={savingsLinked ? "Set on the vault" : undefined}>
          <input className="px-input" inputMode="decimal" value={f.targetValue} onChange={set("targetValue")} disabled={savingsLinked} />
        </Field>
        <Field label="Current" hint={linked ? "From your records" : undefined}>
          <input className="px-input" inputMode="decimal" value={f.currentValue} onChange={set("currentValue")} disabled={linked} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Unit">
          <input className="px-input" value={f.unit} onChange={set("unit")} maxLength={20} />
        </Field>
        <Field label="Start date">
          <input className="px-input" type="date" value={f.startDate} onChange={set("startDate")} />
        </Field>
        <Field label="Target date">
          <input className="px-input" type="date" value={f.targetDate} onChange={set("targetDate")} />
        </Field>
      </div>
      <Field label="Milestones" hint="Comma separated, e.g. 25%=3250, Halfway=6500">
        <input className="px-input" value={f.milestones} onChange={set("milestones")} />
      </Field>
      <Field label="Notes">
        <textarea className="px-input min-h-16" value={f.notes} onChange={set("notes")} maxLength={2000} />
      </Field>
      {goal && (
        <Field label="Status">
          <select className="px-input" value={f.status} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived (hide)</option>
          </select>
        </Field>
      )}
      <div className="flex gap-2">
        <button className="px-btn flex-1" disabled={busy}>
          Save goal
        </button>
        <button type="button" className="px-btn secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PillarGoals({ pillar }: { pillar: Pillar }) {
  const s = useGameState();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      {s.goals
        .filter((g) => g.pillar === pillar)
        .map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      {adding ? (
        <GoalEditor pillar={pillar} onDone={() => setAdding(false)} />
      ) : (
        <button className="px-btn secondary small" onClick={() => setAdding(true)}>
          + New {PILLAR_META[pillar].name.toLowerCase()} goal
        </button>
      )}
    </div>
  );
}
