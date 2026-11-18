"use client";

import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { useGameState } from "@/client/store";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { formatShortDate } from "@/lib/shared/time";
import type { DayProgress } from "@/lib/shared/types";

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function HabitHistory() {
  const { calendar, now } = useGameState();
  const [month, setMonth] = useState(calendar.month);
  const [result, setResult] = useState<{ month: string; days: DayProgress[] | null }>();
  const current = month === calendar.month;
  useEffect(() => {
    if (current) return;
    let stale = false;
    api<{ days: DayProgress[] }>(`/api/progress/history?month=${month}`)
      .then(({ days }) => { if (!stale) setResult({ month, days }); })
      .catch(() => { if (!stale) setResult({ month, days: null }); });
    return () => { stale = true; };
  }, [current, month]);

  const days = current ? calendar.days : result?.month === month ? result.days : undefined;
  const activity = days?.filter((day) => day.quests > 0 || day.xp > 0 || day.rest);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="habit-history card p-4" aria-labelledby="habit-history-title">
      <h2 id="habit-history-title" className="font-pixel text-xl">Habit history</h2>
      <div className="my-2 flex items-center justify-between gap-2">
        <button className="habit-manage" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month === "1000-01"}>←</button>
        <label className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 text-sm">
          <span className="sr-only">History month</span>
          <input className="habit-month" type="month" value={month} min="1000-01" max={now.date.slice(0, 7)} onChange={(e) => {
            if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value <= calendar.month) setMonth(e.target.value);
          }} />
        </label>
        <button className="habit-manage" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= calendar.month}>→</button>
      </div>
      {days === undefined ? <p role="status" className="text-sm text-cream-dim">Loading {label}…</p>
        : days === null ? <p role="alert" className="text-sm text-danger">Couldn’t load {label}. Choose a month to try again.</p>
        : activity?.length ? (
          <ul className="divide-y divide-white/10" aria-label={label}>
            {[...activity].reverse().map((day) => (
              <li key={day.date} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <time dateTime={day.date}>{formatShortDate(day.date)}</time>
                <div className="habit-week-dots" aria-label={day.pillars.map((p) => PILLAR_META[p].name).join(", ") || "No wins"}>
                  {PILLARS.map((p) => <i key={p} style={{ background: day.pillars.includes(p) ? PILLAR_META[p].color : undefined }} />)}
                </div>
                <span className="text-cream-dim">{day.rest ? "Rest · " : ""}{day.pillars.length}/4 wins</span>
                <span className="text-gold">{day.xp} XP</span>
              </li>
            ))}
          </ul>
        ) : <p className="py-2 text-sm text-cream-dim">No habit activity in {label}.</p>}
    </section>
  );
}
