"use client";

import { useEffect, useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { setView, type View } from "@/client/view";
import { bridge } from "@/game/bridge";
import { play } from "@/game/audio";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { formatLongDate } from "@/lib/shared/time";
import type { DailyQuest, DayProgress } from "@/lib/shared/types";
import { HABIT_LOG_LABELS, isHabitLogKey } from "./panels/HabitLog";
import { HabitHistory } from "./panels/HabitHistory";
import { WellbeingCard } from "./panels/Wellbeing";
import { ReminderCard } from "./Reminders";
import { Bar, Portrait, useBusy } from "./ui";

export function TodayApp({ view }: { view: "today" | "progress" }) {
  return (
    <div key={view} className="today-bg scrollbar-thin min-h-0 flex-1 overflow-y-auto" data-testid="today-app">
      <div className="habit-layout">
        {view === "today" ? <TodayScreen /> : <ProgressScreen />}
      </div>
    </div>
  );
}

export function MainNavigation({ view }: { view: View }) {
  const { panel, openPanel } = useGame();
  function navigate(destination: View) {
    openPanel(null);
    setView(destination);
  }

  return (
    <nav className="habit-nav" aria-label="Main">
      <div>
        <TabButton icon="today" label="Today" active={view === "today" && panel !== "ai"} onClick={() => navigate("today")} />
        <TabButton icon="progress" label="Progress" active={view === "progress" && panel !== "ai"} onClick={() => navigate("progress")} />
        <TabButton icon="world" label="Village" active={view === "world" && panel !== "ai"} onClick={() => navigate("world")} />
        <TabButton icon="ai" label="AI" active={panel === "ai"} onClick={() => openPanel(panel === "ai" ? null : "ai")} />
      </div>
    </nav>
  );
}

const TAB_ICONS = {
  today: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </>
  ),
  progress: <path d="M4 19h16M7 15v-3M12 15V8M17 15V5" />,
  ai: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  world: <path d="M3.5 18.5l5-9 4 6 2.5-3.5 5.5 6.5zM16 7.5a1.75 1.75 0 1 0 0-.01" />,
} as const;

function TabButton({ icon, label, active = false, onClick }: { icon: keyof typeof TAB_ICONS; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      className={`group flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? "text-gold" : "text-cream-faint hover:text-cream"}`}
      aria-current={active ? "page" : undefined}
      onClick={() => (play("click"), onClick())}
    >
      <span aria-hidden className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-gold/15" : "group-hover:bg-white/5"}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {TAB_ICONS[icon]}
        </svg>
      </span>
      {label}
    </button>
  );
}

function PageHeading({ title }: { title: string }) {
  const s = useGameState();
  return (
    <header className="habit-page-heading">
      <h1 className="font-pixel">{title}</h1>
      <time dateTime={s.now.date}>{formatLongDate(s.now.date)}</time>
    </header>
  );
}

function TodayScreen() {
  const s = useGameState();
  const { openPanel } = useGame();
  const won = new Set(s.today.quests.filter((quest) => quest.status === "done").map((quest) => quest.pillar));
  const level = s.stats.overall;
  const xpToday = PILLARS.reduce((total, pillar) => total + s.today.xpToday[pillar], 0);
  const [fresh, setFresh] = useState<Pillar[]>([]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = bridge.on("events", (events) => {
      const pillars = events.flatMap((event) => event.type === "decoration" ? [event.pillar] : []);
      if (!pillars.length) return;
      setFresh(pillars);
      clearTimeout(timer);
      timer = setTimeout(() => setFresh([]), 650);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <PageHeading title="Today" />
      <section className="habit-character" aria-label="Character and daily progress">
        <button className="habit-portrait" aria-label="Open character profile" onClick={() => openPanel("profile")}>
          <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={54} art={s.player.settings.characterArt} />
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="font-pixel truncate text-lg leading-none">{s.player.name}</p>
            <span className="text-xs font-bold text-gold">Lv {level.level}</span>
          </div>
          <Bar value={level.pct} label="Overall XP" className="mt-2 !h-2" />
          <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-xs text-cream-dim">
            <span>{level.into}/{level.needed} XP</span>
            <span data-testid="today-xp">+{xpToday} today</span>
          </div>
        </div>
        <div className="habit-streak">
          <span aria-hidden className="text-physical">◆</span>
          <strong>{s.stats.streak.current}</strong>
          <span>{s.stats.streak.current === 1 ? "day" : "days"} streak</span>
        </div>
        <div className="habit-wins">
          <div>
            <p className="font-pixel" data-testid="today-wins" aria-label={`${won.size} of 4`} aria-live="polite"><strong>{won.size}/4</strong> wins today</p>
            <div className="habit-win-marks" aria-label="Pillar wins">
              {PILLARS.map((pillar) => (
                <span key={pillar} className={fresh.includes(pillar) ? "habit-reward-pop" : undefined}
                  style={{ borderColor: PILLAR_META[pillar].color, color: won.has(pillar) ? "#10182a" : PILLAR_META[pillar].color, background: won.has(pillar) ? PILLAR_META[pillar].color : undefined }}
                  title={`${PILLAR_META[pillar].name}: ${won.has(pillar) ? "won" : "open"}`}
                >{won.has(pillar) ? "✓" : "·"}</span>
              ))}
            </div>
          </div>
          {s.today.fourWins ? <span className="habit-chest-message habit-reward-pop" role="status">✦ Village chest unlocked</span> : <span className="habit-chest-message text-cream-dim">Win all four to open the chest</span>}
        </div>
      </section>
      <div className="habit-list-heading">
        <h2 className="font-pixel">Your habits</h2>
        <button className="habit-manage" onClick={() => openPanel("manage-habits")}>Manage habits</button>
      </div>
      <div className="habit-grid">
        {PILLARS.map((pillar) => {
          const q = s.today.quests.filter((quest) => quest.pillar === pillar && (quest.status === "open" || quest.status === "done"));
          const meta = PILLAR_META[pillar];
          return (
            <section key={pillar} className="habit-pillar" style={{ "--habit-accent": meta.color } as React.CSSProperties}
              aria-labelledby={`today-${pillar}-heading`} data-testid={`today-pillar-${pillar}`}>
              <header>
                <h3 id={`today-${pillar}-heading`} className="font-pixel"><span aria-hidden>{meta.icon}</span> {meta.name}</h3>
                {won.has(pillar) && <span className="habit-won">✓ Win earned</span>}
              </header>
              {q.length ? <ul>{q.map((quest) => <HabitRow key={quest.id} quest={quest} />)}</ul> : <p className="px-4 py-3 text-sm text-cream-dim">No habits scheduled today.</p>}
            </section>
          );
        })}
      </div>
      <section className="habit-week" aria-labelledby="week-heading">
        <div className="flex items-center justify-between">
          <h2 className="font-pixel" id="week-heading">Last seven days</h2>
          <button className="habit-manage" onClick={() => setView("progress")}>Full history</button>
        </div>
        <ol>{s.week.map((day) => <WeekDay key={day.date} day={day} today={day.date === s.now.date} />)}</ol>
      </section>
      <ReminderCard />
    </>
  );
}

function HabitRow({ quest }: { quest: DailyQuest }) {
  const { act, openPanel } = useGame();
  const { busy, run } = useBusy();
  const done = quest.status === "done";
  const log = isHabitLogKey(quest.autoKey) ? quest.autoKey : null;
  return (
    <li className="habit-row">
      <div className="min-w-0">
        <p className={done ? "habit-done" : undefined}>{quest.title}</p>
        <span className="habit-xp">+{done ? quest.xpAwarded : quest.xp} XP</span>
      </div>
      {!done && log && <button className="habit-log" aria-label={`${HABIT_LOG_LABELS[log]} for ${quest.title}`} onClick={() => openPanel(`log:${log}`)}>Log</button>}
      {(!quest.autoOnly || done) && (
        <button
          role="checkbox"
          aria-checked={done}
          aria-label={done && !quest.autoOnly ? `Undo ${quest.title}` : quest.title}
          className="habit-check"
          disabled={busy || quest.autoOnly}
          title={done && log && !quest.autoOnly ? "Undo the habit and XP. Your saved log stays in your records." : undefined}
          onClick={() => run(() => act(`/api/quests/${done ? "undo" : "complete"}`, { dailyQuestId: quest.id }))}
        >
          <span aria-hidden>{done ? "✓" : ""}</span>
        </button>
      )}
    </li>
  );
}

function WeekDay({ day, today }: { day: DayProgress; today: boolean }) {
  const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" });
  return (
    <li aria-current={today ? "date" : undefined} aria-label={`${formatLongDate(day.date)}, ${day.pillars.length} wins${day.rest ? ", rest day" : ""}`}>
      <span>{label}</span>
      <strong>{day.pillars.length}/4</strong>
      <span className="habit-week-dots" aria-hidden>
        {PILLARS.map((pillar) => <i key={pillar} style={{ background: day.pillars.includes(pillar) ? PILLAR_META[pillar].color : undefined }} />)}
      </span>
    </li>
  );
}

function ProgressScreen() {
  const s = useGameState();
  const { openPanel } = useGame();
  const c = s.campaign;
  const byDate = new Map(c.days.map((d) => [d.date, d.pillars.length]));
  const start = new Date(`${c.startDate}T00:00:00Z`);
  const cells = Array.from({ length: c.totalDays }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { d, n: byDate.get(d) ?? 0, today: d === s.now.date, future: d > s.now.date };
  });
  return (
    <div className="space-y-5">
      <PageHeading title="Progress" />
      <HabitHistory />
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Level {s.stats.overall.level}</h2>
          <span className="text-xs text-cream-faint">
            {s.stats.overall.into} / {s.stats.overall.needed} XP
          </span>
        </div>
        <Bar value={s.stats.overall.pct} color="var(--gold)" className="mt-2 !h-2 !border-0" label="Overall level progress" />
        <ul className="mt-4 space-y-3">
          {PILLARS.map((p) => {
            const lp = s.stats.pillars[p];
            return (
              <li key={p}>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {PILLAR_META[p].icon} {PILLAR_META[p].name} <span className="text-cream-faint">· Lv {lp.level}</span>
                  </span>
                  <span className="text-xs text-cream-faint">🔥 {s.stats.pillarStreaks[p]}</span>
                </div>
                <Bar value={lp.pct} color={PILLAR_META[p].color} className="mt-1 !h-1.5 !border-0" label={`${PILLAR_META[p].name} level progress`} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        {[
          [String(s.stats.streak.current), "day streak"],
          [String(c.progress.fourWinsDays), "Four Wins days"],
          [String(PILLARS.reduce((a, p) => a + s.stats.missionsDone[p], 0)), "missions"],
        ].map(([v, l]) => (
          <div key={l} className="card px-2 py-3">
            <div className="font-pixel text-2xl">{v}</div>
            <div className="text-[11px] text-cream-faint">{l}</div>
          </div>
        ))}
      </section>

      <section className="card p-4" aria-label={`${c.totalDays}-day journey`}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{c.title}</h2>
          <button className="text-xs text-cream-faint hover:text-cream" onClick={() => openPanel("journey")}>
            Details →
          </button>
        </div>
        <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
          {cells.map((x) => (
            <span
              key={x.d}
              title={`${x.d}: ${x.n}/4`}
              className={`aspect-square rounded-[3px] ${x.today ? "ring-1 ring-cream" : ""}`}
              style={{ background: x.future ? "rgb(255 255 255 / .04)" : x.n === 0 ? "rgb(255 255 255 / .1)" : `rgb(242 193 78 / ${0.25 + x.n * 0.1875})` }}
            />
          ))}
        </div>
      </section>

      <WellbeingCard />

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["achievements", "🏆", "Trophies"],
            ["goals", "🗓️", "Goals"],
            ["settings", "⚙️", "Settings"],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className="card py-3 text-sm text-cream-dim hover:text-cream" onClick={() => openPanel(id)}>
            <span aria-hidden className="mr-1">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
