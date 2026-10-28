"use client";

import { useMemo, useState } from "react";
import { newRequestId } from "@/client/api";
import { useGame, useGameState } from "@/client/store";
import { PILLAR_META } from "@/lib/shared/pillars";
import { formatShortDate } from "@/lib/shared/time";
import type { WorkoutView } from "@/lib/shared/types";
import { PHYSIQUE_NAMES } from "@/lib/shared/unlocks";
import { AddFromLibrary, QuestList } from "../quests";
import { Bar, Empty, Field, Portrait, Section, Sheet, Stat, Tabs, useBusy } from "../ui";
import { PillarGoals, PillarHeader, UnlockTrack } from "./common";

const KINDS: WorkoutView["kind"][] = ["strength", "cardio", "mobility", "sport", "other"];

function WorkoutForm({ onSaved }: { onSaved: () => void }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [requestId, setRequestId] = useState(newRequestId);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<WorkoutView["kind"]>("strength");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState([{ exercise: "", weightKg: "", reps: "8", sets: "3" }]);

  const submit = () =>
    run(async () => {
      const body = {
        requestId,
        title: title.trim() || "Workout",
        kind,
        durationMin: Number(duration),
        notes,
        sets: sets
          .filter((s) => s.exercise.trim())
          .map((s) => ({ exercise: s.exercise.trim(), weightKg: Number(s.weightKg || 0), reps: Number(s.reps || 1), sets: Number(s.sets || 1) })),
      };
      if (await act("/api/body/workouts", body)) {
        setRequestId(newRequestId());
        setTitle("");
        setNotes("");
        setSets([{ exercise: "", weightKg: "", reps: "8", sets: "3" }]);
        onSaved();
      }
    });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Session">
          <input className="px-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Push day" maxLength={60} />
        </Field>
        <Field label="Type">
          <select className="px-input" value={kind} onChange={(e) => setKind(e.target.value as WorkoutView["kind"])}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Duration (minutes)">
        <input className="px-input" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} required />
      </Field>
      <div>
        <span className="px-label">Exercises (optional — used for personal records)</span>
        <div className="space-y-1.5">
          {sets.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_3.5rem_3.5rem_auto] gap-1">
              {(["exercise", "weightKg", "reps", "sets"] as const).map((k) => (
                <input
                  key={k}
                  className="px-input !px-2 text-sm"
                  inputMode={k === "exercise" ? "text" : "decimal"}
                  placeholder={{ exercise: "Bench press", weightKg: "kg", reps: "reps", sets: "sets" }[k]}
                  aria-label={`${k} ${i + 1}`}
                  value={s[k]}
                  onChange={(e) => setSets((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                />
              ))}
              <button type="button" className="px-ghost" aria-label="Remove exercise" onClick={() => setSets((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : xs))}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="px-ghost mt-1 text-sm" onClick={() => setSets((xs) => [...xs, { exercise: "", weightKg: "", reps: "8", sets: "3" }])}>
          + Add exercise
        </button>
      </div>
      <Field label="Notes">
        <textarea className="px-input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </Field>
      <button className="px-btn w-full" disabled={busy}>
        Log workout
      </button>
    </form>
  );
}

function WeightChart() {
  const s = useGameState();
  const pts = useMemo(() => s.body.measurements.filter((m) => m.weightKg != null).slice().reverse(), [s.body.measurements]);
  if (pts.length < 2) return <Empty>Log at least two weigh-ins to see your trend.</Empty>;
  const target = s.body.targetWeightKg;
  const vals = pts.map((p) => p.weightKg!).concat(target != null ? [target] : []);
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const W = 300;
  const H = 110;
  const x = (i: number) => 8 + (i / (pts.length - 1)) * (W - 16);
  const y = (v: number) => H - 10 - ((v - min) / (max - min)) * (H - 20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="px-card w-full" role="img" aria-label="Body weight trend">
      {target != null && (
        <>
          <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="#f2c14e" strokeDasharray="4 4" strokeWidth={1} />
          <text x={W - 6} y={y(target) - 4} textAnchor="end" fontSize="9" fill="#f2c14e">
            target {target} kg
          </text>
        </>
      )}
      <polyline fill="none" stroke={PILLAR_META.physical.color} strokeWidth={2} points={pts.map((p, i) => `${x(i)},${y(p.weightKg!)}`).join(" ")} />
      {pts.map((p, i) => (
        <rect key={p.id} x={x(i) - 2} y={y(p.weightKg!) - 2} width={4} height={4} fill="#f4ead2" />
      ))}
    </svg>
  );
}

function MeasurementForm() {
  const { act } = useGame();
  const s = useGameState();
  const { busy, run } = useBusy();
  const [f, setF] = useState({ weightKg: "", waistCm: "", bodyFatPct: "", date: s.now.date, notes: "" });
  const n = (v: string) => (v.trim() ? Number(v) : null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const ok = await act("/api/body/measurements", { date: f.date, weightKg: n(f.weightKg), waistCm: n(f.waistCm), bodyFatPct: n(f.bodyFatPct), notes: f.notes });
          if (ok) setF((x) => ({ ...x, weightKg: "", waistCm: "", bodyFatPct: "", notes: "" }));
        });
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Weight kg">
          <input className="px-input" inputMode="decimal" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} />
        </Field>
        <Field label="Waist cm">
          <input className="px-input" inputMode="decimal" value={f.waistCm} onChange={(e) => setF({ ...f, waistCm: e.target.value })} />
        </Field>
        <Field label="Body fat %">
          <input className="px-input" inputMode="decimal" value={f.bodyFatPct} onChange={(e) => setF({ ...f, bodyFatPct: e.target.value })} />
        </Field>
      </div>
      <Field label="Date">
        <input className="px-input" type="date" max={s.now.date} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <button className="px-btn w-full" disabled={busy || (!f.weightKg && !f.waistCm && !f.bodyFatPct)}>
        Save measurement
      </button>
    </form>
  );
}

export function StrengthPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const { act } = useGame();
  const [tab, setTab] = useState<"today" | "log" | "body" | "history" | "goals">("today");
  const b = s.body;
  const trainingGoal = s.goals.find((g) => g.linkedSource === "workouts:week");

  return (
    <Sheet title="Strength Arena" subtitle="Training · body · recovery" icon="💪" accent={PILLAR_META.physical.color} onClose={onClose}>
      <PillarHeader pillar="physical" />
      <Tabs
        tabs={[
          { id: "today", label: "Today" },
          { id: "log", label: "Log workout" },
          { id: "body", label: "Body" },
          { id: "history", label: "History" },
          { id: "goals", label: "Goals" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "today" && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Stat label="This week" value={`${b.workoutsThisWeek}${trainingGoal?.targetValue ? `/${trainingGoal.targetValue}` : ""}`} sub="workouts" color={PILLAR_META.physical.color} />
            <Stat label="All time" value={b.workoutsTotal} sub="workouts" />
            <Stat label="Streak" value={`🔥 ${s.stats.pillarStreaks.physical}`} sub="days" />
          </div>
          <Section title="Today's physical quests">
            <QuestList pillar="physical" />
            <AddFromLibrary pillar="physical" />
            <button
              className={`px-btn small mt-3 ${s.today.rest.physical ? "" : "secondary"}`}
              onClick={() => act("/api/rest", { scope: "physical", on: !s.today.rest.physical })}
            >
              💤 {s.today.rest.physical ? "Rest day logged — streak protected" : "Mark today as a rest day"}
            </button>
          </Section>
          <Section title="Arena unlocks">
            <UnlockTrack pillar="physical" />
          </Section>
        </>
      )}
      {tab === "log" && (
        <Section title="Log a real workout">
          <p className="mb-3 text-sm text-cream-dim">Logging completes today&apos;s workout quest. Beating a previous best weight sets a personal record.</p>
          <WorkoutForm onSaved={() => setTab("history")} />
        </Section>
      )}
      {tab === "body" && (
        <>
          <Section title="Transformation">
            <div className="px-card flex items-center gap-3 p-3">
              <Portrait equipped={s.player.equipped} tier={b.physiqueTier} size={72} art="classic" />
              <div className="min-w-0 flex-1">
                <div className="font-pixel" style={{ color: PILLAR_META.physical.color }}>
                  {PHYSIQUE_NAMES[b.physiqueTier]}
                </div>
                <Bar value={b.physiqueProgress} color={PILLAR_META.physical.color} className="mt-1" label="Body goal progress" />
                <div className="mt-1 text-xs text-cream-dim">
                  {b.startWeightKg != null ? `${b.startWeightKg} kg` : "—"} → {b.latest?.weightKg ?? "—"} kg · target {b.targetWeightKg ?? "—"} kg
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-cream-faint">
              Your character&apos;s build only changes from measurements you record — never from check-ins alone. Choose a target that&apos;s right for you; heavier or leaner isn&apos;t automatically healthier.
            </p>
          </Section>
          <Section title="Weight trend">
            <WeightChart />
          </Section>
          <Section title="Record measurements">
            <MeasurementForm />
          </Section>
          {b.measurements.length > 0 && (
            <Section title="Recent">
              <ul className="space-y-1 text-sm">
                {b.measurements.slice(0, 8).map((m) => (
                  <li key={m.id} className="px-card flex justify-between px-3 py-1.5">
                    <span className="text-cream-dim">{formatShortDate(m.date)}</span>
                    <span>
                      {[m.weightKg != null && `${m.weightKg} kg`, m.waistCm != null && `${m.waistCm} cm waist`, m.bodyFatPct != null && `${m.bodyFatPct}% BF`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
      {tab === "history" && (
        <>
          <Section title="Personal records">
            {b.prs.length ? (
              <ul className="grid grid-cols-2 gap-1.5">
                {b.prs.map((p) => (
                  <li key={p.exercise} className="px-card px-3 py-2 text-sm">
                    <div className="truncate">{p.exercise}</div>
                    <div className="font-pixel text-physical">{p.weightKg} kg</div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Add exercises with weights to your workouts to track records.</Empty>
            )}
          </Section>
          <Section title="Workout journal">
            {b.workouts.length ? (
              <ul className="space-y-1.5">
                {b.workouts.map((w) => (
                  <li key={w.id} className="px-card px-3 py-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <b>{w.title}</b>
                      <span className="text-cream-dim">
                        {formatShortDate(w.date)} · {w.durationMin} min
                      </span>
                    </div>
                    {w.sets.length > 0 && <div className="text-xs text-cream-dim">{w.sets.map((x) => `${x.exercise} ${x.sets}×${x.reps}${x.weightKg ? ` @ ${x.weightKg}kg` : ""}`).join(" · ")}</div>}
                    {w.notes && <div className="text-xs text-cream-faint">{w.notes}</div>}
                    <button className="px-ghost mt-1 text-xs text-danger" onClick={() => confirm("Delete this workout log?") && act(`/api/body/workouts/${w.id}`, undefined, "DELETE")}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No workouts logged yet.</Empty>
            )}
          </Section>
        </>
      )}
      {tab === "goals" && <PillarGoals pillar="physical" />}
    </Sheet>
  );
}
