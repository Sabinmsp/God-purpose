"use client";

import { useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { totalXpForLevel } from "@/lib/shared/progression";
import { formatLongDate, weekdayOf } from "@/lib/shared/time";
import { nextUnlocks } from "@/lib/shared/unlocks";
import { AddFromLibrary, QuestEditor, QuestList, QuestManager } from "../quests";
import { Bar, Section, Sheet, Tabs, useBusy } from "../ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function QuestBoardPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [tab, setTab] = useState<"today" | "manage" | "milestones">("today");
  const [creating, setCreating] = useState(false);
  const xpToday = PILLARS.reduce((sum, p) => sum + s.today.xpToday[p], 0);
  const done = s.today.quests.filter((q) => q.status === "done").length;
  const won = new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));
  const weekXp = s.week.reduce((a, d) => a + d.xp, 0);
  const maxDay = Math.max(100, ...s.week.map((d) => d.xp));
  const levels = Object.fromEntries(PILLARS.map((p) => [p, s.stats.pillars[p].level])) as Record<(typeof PILLARS)[number], number>;

  return (
    <Sheet title="The Daily Four Wins" subtitle={formatLongDate(s.now.date)} icon="📜" onClose={onClose}>
      <Tabs
        tabs={[
          { id: "today", label: "Today" },
          { id: "milestones", label: "Milestones" },
          { id: "manage", label: "Manage" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "today" && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="px-card p-2">
              <div className="font-pixel text-xl text-gold">🔥 {s.stats.streak.current}</div>
              <div className="text-xs text-cream-dim">day streak</div>
            </div>
            <div className="px-card p-2">
              <div className="font-pixel text-xl text-gold">{xpToday}</div>
              <div className="text-xs text-cream-dim">XP today</div>
            </div>
            <div className="px-card p-2">
              <div className="font-pixel text-xl text-gold">
                {done}/{s.today.quests.filter((q) => q.status !== "skipped").length}
              </div>
              <div className="text-xs text-cream-dim">quests won</div>
            </div>
          </div>

          <div className="px-card mb-4 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-sm text-cream-dim">This week</span>
              <span className="font-pixel text-sm text-gold">{weekXp} XP</span>
            </div>
            <div className="grid grid-cols-7 gap-1" aria-label="XP over the last seven days">
              {s.week.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1" title={`${d.date}: ${d.xp} XP`}>
                  <div className="flex h-14 w-full items-end overflow-hidden rounded border-2 border-[#04061a] bg-navy-950">
                    <div className="w-full bg-gold" style={{ height: `${(d.xp / maxDay) * 100}%`, opacity: d.date === s.now.date ? 1 : 0.7 }} />
                  </div>
                  <div className="flex h-2 gap-px">
                    {PILLARS.map((p) => (
                      <span key={p} className="h-1.5 w-1.5 rounded-sm" style={{ background: d.pillars.includes(p) ? PILLAR_META[p].color : "var(--navy-700)" }} />
                    ))}
                  </div>
                  <span className={`font-pixel text-[10px] ${d.date === s.now.date ? "text-gold" : "text-cream-faint"}`}>
                    {d.rest ? "REST" : DOW[weekdayOf(d.date)]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-cream-dim">
              {PILLARS.map((p) => (
                <span key={p} className="font-pixel" style={{ color: won.has(p) ? PILLAR_META[p].color : "var(--cream-faint)" }}>
                  {won.has(p) ? "★" : "☆"} {PILLAR_META[p].name}
                </span>
              ))}
            </div>
            {s.today.fourWins && <p className="font-pixel mt-2 text-sm text-gold anim-shimmer">All four pillars won today! 🏆</p>}
          </div>

          {PILLARS.map((p) => (
            <Section
              key={p}
              title={`${PILLAR_META[p].icon} ${PILLAR_META[p].name.toUpperCase()}`}
              right={
                <span className="font-pixel text-xs" style={{ color: PILLAR_META[p].color }}>
                  {s.today.xpToday[p]} XP
                </span>
              }
            >
              <QuestList pillar={p} />
              <AddFromLibrary pillar={p} />
            </Section>
          ))}

          <Section title="Rest & recovery">
            <p className="mb-2 text-sm text-cream-dim">Rest days never break your streak. Recovery is part of the plan.</p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`px-btn small ${s.today.rest.physical ? "" : "secondary"}`}
                disabled={busy}
                aria-pressed={s.today.rest.physical}
                onClick={() => run(() => act("/api/rest", { scope: "physical", on: !s.today.rest.physical }))}
              >
                💤 {s.today.rest.physical ? "Training rest day ✓" : "Training rest day"}
              </button>
              <button
                className={`px-btn small ${s.today.rest.all ? "" : "secondary"}`}
                disabled={busy}
                aria-pressed={s.today.rest.all}
                onClick={() => run(() => act("/api/rest", { scope: "all", on: !s.today.rest.all }))}
              >
                🌙 {s.today.rest.all ? "Full rest day ✓" : "Full rest day"}
              </button>
            </div>
          </Section>

          <Section title="Create a quest">
            {creating ? <QuestEditor onDone={() => setCreating(false)} /> : (
              <button className="px-btn secondary small" onClick={() => setCreating(true)}>
                + New custom quest
              </button>
            )}
          </Section>
        </>
      )}

      {tab === "milestones" && (
        <>
          <Section title="Next unlocks">
            <ul className="space-y-2">
              {nextUnlocks(levels).map((u) => {
                const xp = s.stats.pillars[u.pillar].xp;
                const need = totalXpForLevel(u.level);
                return (
                  <li key={u.key} className="px-card p-3">
                    <div className="flex justify-between text-sm">
                      <span>
                        {PILLAR_META[u.pillar].icon} <b>{u.name}</b>
                      </span>
                      <span className="font-pixel text-xs" style={{ color: PILLAR_META[u.pillar].color }}>
                        LV {u.level}
                      </span>
                    </div>
                    <Bar value={xp / need} color={PILLAR_META[u.pillar].color} className="mt-2" />
                    <div className="mt-1 text-xs text-cream-faint">{Math.max(0, need - xp)} XP to go · {u.description}</div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Goal deadlines">
            <ul className="space-y-1 text-sm">
              {s.goals.filter((g) => g.targetDate && g.status === "active").length === 0 && (
                <li className="text-cream-dim">No deadlines set yet. Add target dates to your goals.</li>
              )}
              {s.goals
                .filter((g) => g.targetDate && g.status === "active")
                .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))
                .map((g) => (
                  <li key={g.id} className="px-card flex justify-between px-3 py-2">
                    <span>{g.title}</span>
                    <span className="font-pixel text-xs text-gold">{g.targetDate}</span>
                  </li>
                ))}
            </ul>
          </Section>
        </>
      )}

      {tab === "manage" && (
        <>
          <p className="mb-3 text-sm text-cream-dim">
            Edit, reschedule or archive quests. XP values are limited to a fixed set and capped per pillar per day, so progress always reflects real effort.
          </p>
          <QuestManager />
        </>
      )}
    </Sheet>
  );
}
