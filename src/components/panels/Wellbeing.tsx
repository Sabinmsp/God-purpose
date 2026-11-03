"use client";

import { useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { WELLBEING_FIELDS, WELLBEING_META, formatWellbeing, wellbeingFill, type WellbeingInput, type WellbeingView } from "@/lib/shared/wellbeing";
import { Bar, useBusy } from "../ui";

/** Brain & Wellbeing: today's self-reported check-in. Never awards XP. */
export function WellbeingCard() {
  const s = useGameState();
  const [editing, setEditing] = useState(false);
  const w = s.wellbeing.today;
  return (
    <section className="px-panel shrink-0 p-3" aria-labelledby="wellbeing-title" data-testid="wellbeing">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="wellbeing-title" className="font-pixel whitespace-nowrap text-lg">
          🪷 Brain &amp; Wellbeing
        </h2>
        <button className="px-ghost whitespace-nowrap text-xs" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          {editing ? "Close" : w ? "Edit →" : "Check in →"}
        </button>
      </div>
      {editing ? (
        <CheckinForm initial={w} onDone={() => setEditing(false)} />
      ) : (
        <>
          <ul className="space-y-1.5">
            {WELLBEING_FIELDS.map((f) => {
              const m = WELLBEING_META[f];
              const v = w?.[f] ?? null;
              return (
                <li key={f} className="grid grid-cols-[1.25rem_6rem_1fr_3.5rem] items-center gap-2 text-sm">
                  <span aria-hidden>{m.icon}</span>
                  <span>{m.label}</span>
                  <Bar value={wellbeingFill(f, v)} color={m.color} className="!h-2.5" label={m.label} />
                  <span className="font-pixel text-right text-xs" data-testid={`wellbeing-${f}`}>
                    {formatWellbeing(f, v)}
                  </span>
                </li>
              );
            })}
          </ul>
          {!w && <p className="mt-2 text-xs text-cream-faint">Not logged today. A quick check-in lets Four Wins AI plan around how you actually feel.</p>}
        </>
      )}
    </section>
  );
}

function Scale({ label, value, onChange, faces }: { label: string; value: number | null; onChange: (v: number | null) => void; faces?: string[] }) {
  return (
    <div>
      <span className="px-label">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n}
            className={`font-pixel h-8 flex-1 rounded border-2 border-[#04061a] text-sm ${value === n ? "bg-gold text-[#2a1a05]" : "bg-navy-950 text-cream-dim hover:text-cream"}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {faces?.[n - 1] ?? n}
          </button>
        ))}
      </div>
    </div>
  );
}

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

function CheckinForm({ initial, onDone }: { initial: WellbeingView | null; onDone: () => void }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [sleep, setSleep] = useState(initial?.sleepMinutes != null ? String(initial.sleepMinutes / 60) : "");
  const [energy, setEnergy] = useState(initial?.energy ?? null);
  const [mood, setMood] = useState(initial?.mood ?? null);
  const [focus, setFocus] = useState(initial?.focus ?? null);
  const [distraction, setDistraction] = useState(initial?.distractionMinutes != null ? String(initial.distractionMinutes) : "");

  const hours = sleep.trim() === "" ? null : Number(sleep);
  const minutes = distraction.trim() === "" ? null : Number(distraction);
  const valid = (hours === null || (Number.isFinite(hours) && hours >= 0 && hours <= 24)) && (minutes === null || (Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440));

  const save = () =>
    run(async () => {
      const body: WellbeingInput = {
        sleepMinutes: hours === null ? null : Math.round(hours * 60),
        energy,
        mood,
        focus,
        distractionMinutes: minutes,
      };
      if (await act("/api/wellbeing", body)) onDone();
    });

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="wellbeing-form"
    >
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="block">
          <span className="px-label">🌙 Sleep (hours)</span>
          <input className="px-input !py-1" inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" aria-invalid={hours !== null && !(hours >= 0 && hours <= 24)} />
        </label>
        <label className="block">
          <span className="px-label">📱 Distractions (min)</span>
          <input className="px-input !py-1" inputMode="numeric" value={distraction} onChange={(e) => setDistraction(e.target.value)} placeholder="45" />
        </label>
      </div>
      <Scale label="⚡ Energy" value={energy} onChange={setEnergy} />
      <Scale label="🙂 Mood" value={mood} onChange={setMood} faces={MOODS} />
      <label className="block">
        <span className="px-label">
          🎯 Focus {focus != null ? `· ${focus}%` : "· not set"}
        </span>
        <input type="range" min={0} max={100} step={10} value={focus ?? 50} onChange={(e) => setFocus(Number(e.target.value))} className="w-full accent-[var(--spiritual)]" aria-label="Focus percent" />
      </label>
      <p className="text-[11px] text-cream-faint">Self-reported, private, and never worth XP. Leave anything blank.</p>
      <button className="px-btn w-full" disabled={busy || !valid}>
        Save check-in
      </button>
    </form>
  );
}
