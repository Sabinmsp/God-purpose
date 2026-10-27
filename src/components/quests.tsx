"use client";

import { useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { ALLOWED_QUEST_XP } from "@/lib/shared/progression";
import type { DailyQuest, QuestDefinition } from "@/lib/shared/types";
import { play } from "@/game/audio";
import { Field, useBusy } from "./ui";

export const AUTO_HINT: Record<string, string> = {
  workout: "Completes when you log a workout",
  pr: "Completes when a logged lift beats your record",
  measurement: "Completes when you log a measurement",
  expense_log: "Also completes when you log an expense",
  savings_deposit: "Also completes when you deposit to a vault",
  gratitude3: "Completes after three gratitude notes",
  journal: "Completes when you write a journal entry",
  reflection: "Completes when you write an evening reflection",
  learning: "Completes when you log a learning note",
};

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function QuestRow({ q, compact = false }: { q: DailyQuest; compact?: boolean }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [menu, setMenu] = useState(false);
  const color = PILLAR_META[q.pillar].color;
  const done = q.status === "done";
  const skipped = q.status === "skipped";

  const toggle = () =>
    run(async () => {
      play("click");
      await act(`/api/quests/${done ? "undo" : "complete"}`, { dailyQuestId: q.id });
    });

  return (
    <li className={`px-card flex items-center gap-2 px-2 py-1.5 ${skipped ? "opacity-55" : ""}`} data-testid="quest-row" data-status={q.status}>
      <button
        onClick={toggle}
        disabled={busy || q.autoOnly}
        aria-pressed={done}
        aria-label={done ? `Undo ${q.title}` : `Complete ${q.title}`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded border-2 border-[#04061a] text-sm transition disabled:cursor-default"
        style={{ background: done ? color : "var(--navy-950)", boxShadow: done ? "inset 0 2px 0 rgb(255 255 255 / .4)" : `inset 0 0 0 1px ${color}55` }}
        title={q.autoOnly ? AUTO_HINT[q.autoKey ?? ""] : undefined}
      >
        {done ? "✓" : q.autoOnly ? "⚙" : ""}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`leading-tight ${done ? "text-cream-dim line-through decoration-2" : ""} ${compact ? "text-sm" : ""}`}>{q.title}</div>
        {!compact && q.autoKey && !done && <div className="text-xs text-cream-faint">{AUTO_HINT[q.autoKey]}</div>}
        {skipped && <div className="text-xs text-cream-faint">Skipped — no penalty</div>}
      </div>
      <span className="font-pixel shrink-0 text-xs" style={{ color }}>
        {done && q.xpAwarded < q.xp ? `+${q.xpAwarded}` : `+${q.xp}`}
      </span>
      {!compact && !done && (
        <div className="relative">
          <button className="px-ghost" aria-label="Quest options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            ⋯
          </button>
          {menu && (
            <div className="px-panel absolute right-0 top-8 z-10 w-44 p-1 anim-pop" onMouseLeave={() => setMenu(false)}>
              <button
                className="px-ghost block w-full text-left text-sm"
                onClick={() => run(async () => (setMenu(false), await act("/api/quests/skip", { dailyQuestId: q.id })))}
              >
                {skipped ? "Un-skip" : "Skip today"}
              </button>
              <button
                className="px-ghost block w-full text-left text-sm"
                onClick={() => run(async () => (setMenu(false), await act("/api/quests/move", { dailyQuestId: q.id })))}
              >
                Move to tomorrow
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function QuestList({ pillar, compact }: { pillar?: Pillar; compact?: boolean }) {
  const s = useGameState();
  const quests = s.today.quests.filter((q) => !pillar || q.pillar === pillar);
  if (!quests.length) return <p className="text-sm text-cream-faint">No quests on today&apos;s board{pillar ? " here" : ""}. Add one from your library.</p>;
  return (
    <ul className="space-y-1.5">
      {quests.map((q) => (
        <QuestRow key={q.id} q={q} compact={compact} />
      ))}
    </ul>
  );
}

export function AddFromLibrary({ pillar }: { pillar: Pillar }) {
  const s = useGameState();
  const { act } = useGame();
  const { busy, run } = useBusy();
  const onBoard = new Set(s.today.quests.map((q) => q.questDefId));
  const options = s.questLibrary.filter((d) => d.pillar === pillar && !onBoard.has(d.id) && !d.autoOnly);
  if (!options.length) return null;
  return (
    <select
      className="px-input mt-2 !py-1.5 text-sm"
      value=""
      disabled={busy}
      aria-label={`Add a ${PILLAR_META[pillar].name} quest to today`}
      onChange={(e) => e.target.value && run(() => act("/api/quests/add", { questDefId: e.target.value }))}
    >
      <option value="">+ Add a {PILLAR_META[pillar].name.toLowerCase()} quest to today…</option>
      {options.map((d) => (
        <option key={d.id} value={d.id}>
          {d.title} (+{d.xp} XP)
        </option>
      ))}
    </select>
  );
}

export function QuestEditor({ initial, onDone }: { initial?: QuestDefinition; onDone?: () => void }) {
  const { act } = useGame();
  const s = useGameState();
  const { busy, run } = useBusy();
  const [pillar, setPillar] = useState<Pillar>(initial?.pillar ?? "mental");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [xp, setXp] = useState(initial?.xp ?? 25);
  const [onBoard, setOnBoard] = useState(initial?.onBoard ?? true);
  const [days, setDays] = useState<number[]>(initial?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [goalId, setGoalId] = useState(initial?.goalId ?? "");

  const save = () =>
    run(async () => {
      const body = { title: title.trim(), xp, onBoard, daysOfWeek: days, goalId: goalId || null };
      const ok = initial
        ? await act(`/api/quests/definitions/${initial.id}`, body, "PATCH")
        : await act("/api/quests/definitions", { ...body, pillar });
      if (ok) {
        if (!initial) setTitle("");
        onDone?.();
      }
    });

  return (
    <form
      className="px-card space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {!initial && (
          <Field label="Pillar">
            <select className="px-input" value={pillar} onChange={(e) => setPillar(e.target.value as Pillar)}>
              {PILLARS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_META[p].icon} {PILLAR_META[p].name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="XP reward" hint="Capped at 300 XP per pillar per day">
          <select className="px-input" value={xp} onChange={(e) => setXp(Number(e.target.value))}>
            {ALLOWED_QUEST_XP.map((v) => (
              <option key={v} value={v}>
                {v} XP
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Quest">
        <input className="px-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stretch for 15 minutes" required minLength={2} />
      </Field>
      <div>
        <span className="px-label">Repeats on</span>
        <div className="flex gap-1">
          {DAYS.map((d, i) => (
            <button
              type="button"
              key={i}
              aria-pressed={days.includes(i)}
              className={`font-pixel h-8 w-8 rounded border-2 border-[#04061a] text-sm ${days.includes(i) ? "bg-gold text-[#2a1a05]" : "bg-navy-950 text-cream-dim"}`}
              onClick={() => setDays((ds) => (ds.includes(i) ? (ds.length > 1 ? ds.filter((x) => x !== i) : ds) : [...ds, i].sort()))}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} /> Put on the daily board
        </label>
        <select className="px-input !w-auto flex-1 !py-1 text-sm" value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Linked goal">
          <option value="">No linked goal</option>
          {s.goals
            .filter((g) => g.pillar === (initial?.pillar ?? pillar))
            .map((g) => (
              <option key={g.id} value={g.id}>
                ↳ {g.title}
              </option>
            ))}
        </select>
      </div>
      <button className="px-btn w-full" disabled={busy || title.trim().length < 2}>
        {initial ? "Save quest" : "Create quest"}
      </button>
    </form>
  );
}

export function QuestManager() {
  const s = useGameState();
  const { act } = useGame();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {PILLARS.map((p) => (
        <div key={p}>
          <h4 className="font-pixel mb-1 text-sm" style={{ color: PILLAR_META[p].color }}>
            {PILLAR_META[p].icon} {PILLAR_META[p].name}
          </h4>
          <ul className="space-y-1">
            {s.questLibrary
              .filter((d) => d.pillar === p)
              .map((d) => (
                <li key={d.id}>
                  {editing === d.id ? (
                    <QuestEditor initial={d} onDone={() => setEditing(null)} />
                  ) : (
                    <div className="px-card flex items-center gap-2 px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {d.title}
                        {d.onBoard && <span className="ml-2 text-xs text-gold">● daily</span>}
                        {d.autoKey && <span className="ml-2 text-xs text-cream-faint">auto</span>}
                      </span>
                      <span className="font-pixel text-xs text-cream-dim">{d.xp} XP</span>
                      <button className="px-ghost text-xs" onClick={() => setEditing(d.id)}>
                        Edit
                      </button>
                      {!d.autoKey && (
                        <button
                          className="px-ghost text-xs text-danger"
                          onClick={() => confirm(`Archive “${d.title}”? Past XP is kept.`) && act(`/api/quests/definitions/${d.id}`, undefined, "DELETE")}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
