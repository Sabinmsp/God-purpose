"use client";

import { useEffect, useRef, useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { setView } from "@/client/view";
import { play } from "@/game/audio";
import { nextSteps } from "@/lib/shared/brief";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import type { DailyQuest } from "@/lib/shared/types";
import { AiPanel } from "./panels/Ai";
import { WellbeingCard } from "./panels/Wellbeing";
import { AUTO_HINT, QuestRow } from "./quests";
import { ReminderCard } from "./Reminders";
import { Bar, useBusy } from "./ui";

type Tab = "today" | "progress";

/**
 * The calm, phone-first home: one screen, four wins, one next action.
 * Open it, see what to do, close it and go do it.
 */
export function TodayApp() {
  const { panel, openPanel } = useGame();
  const [tab, setTab] = useState<Tab>("today");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, which React would take as a cleanup.
    scroller.current?.scrollTo({ top: 0 });
  }, [tab]);
  return (
    <div className="today-bg relative flex h-full min-w-0 flex-1 flex-col" data-testid="today-app">
      <div ref={scroller} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">{tab === "today" ? <TodayScreen /> : <ProgressScreen />}</div>
      </div>
      <nav className="shrink-0 border-t border-white/10 bg-navy-900/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2">
          <TabButton icon="today" label="Today" active={tab === "today" && panel !== "ai"} onClick={() => (openPanel(null), setTab("today"))} />
          <TabButton icon="progress" label="Progress" active={tab === "progress" && panel !== "ai"} onClick={() => (openPanel(null), setTab("progress"))} />
          <TabButton icon="ai" label="AI" active={panel === "ai"} onClick={() => openPanel(panel === "ai" ? null : "ai")} />
          <TabButton icon="world" label="World" onClick={() => (openPanel(null), setView("world"))} />
        </div>
      </nav>
      {panel === "ai" && <AiPanel onClose={() => openPanel(null)} />}
    </div>
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

function Header() {
  const s = useGameState();
  const c = s.campaign;
  const day = c.dayNumber < 1 ? `Starts in ${1 - c.dayNumber}d` : c.dayNumber > c.totalDays ? "Journey complete" : `Day ${c.dayNumber} / ${c.totalDays}`;
  const part = s.now.hour < 12 ? "morning" : s.now.hour < 17 ? "afternoon" : "evening";
  const date = new Date(`${s.now.date}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const journey = Math.min(1, Math.max(0, c.dayNumber / c.totalDays));
  const streak = s.stats.streak.current;
  return (
    <header>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-cream-faint">{date}</p>
          <h1 className="mt-1 truncate text-2xl font-bold leading-tight">
            Good {part}, <span className="text-gold">{s.player.name}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-sm font-semibold ${streak > 0 ? "bg-physical/15 text-physical" : "bg-white/5 text-cream-faint"}`}
            aria-label={`${streak} day streak`}
          >
            🔥 {streak}
          </span>
          <span className="rounded-full bg-gold/15 px-2.5 py-1 text-sm font-semibold text-gold" aria-label={`Level ${s.stats.overall.level}`}>
            Lv {s.stats.overall.level}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 text-xs text-cream-dim" data-testid="today-day">
          {day}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <span className="block h-full rounded-full bg-gold/70 transition-[width] duration-700" style={{ width: `${journey * 100}%` }} />
        </span>
      </div>
    </header>
  );
}

function TodayScreen() {
  const s = useGameState();
  const won = new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));
  const [open, setOpen] = useState<Pillar | null>(null);
  const xp = PILLARS.reduce((a, p) => a + s.today.xpToday[p], 0);
  const left = 4 - won.size;
  return (
    <div className="space-y-5">
      <Header />
      <section className="card flex flex-col items-center px-4 pb-5 pt-6" aria-label="Today's wins">
        <WinsRing won={won} />
        <p className="mt-4 text-center text-sm text-cream-dim">
          {won.size === 4 ? (
            <>Every pillar won. That&apos;s a Four Wins day.</>
          ) : won.size === 0 ? (
            <>One small win in each pillar. Start anywhere.</>
          ) : (
            <>
              {left} to go{xp > 0 && <> · <span className="text-gold">+{xp} XP</span> earned</>}
            </>
          )}
        </p>
      </section>
      <NextStep />
      <section aria-labelledby="pillars-title">
        <h2 id="pillars-title" className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.18em] text-cream-faint">
          Four life areas
        </h2>
        <ul className="card divide-y divide-white/5 overflow-hidden">
          {PILLARS.map((p) => (
            <PillarRow key={p} pillar={p} won={won.has(p)} open={open === p} onToggle={() => setOpen(open === p ? null : p)} />
          ))}
        </ul>
      </section>
      <ReminderCard />
    </div>
  );
}

/** Four quarter arcs that fill with each pillar's colour once it is won. */
function WinsRing({ won }: { won: Set<Pillar> }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = 14;
  const seg = c / 4 - gap;
  // Icon badges sit on the middle of each arc (45° off the axes): top-right, bottom-right, bottom-left, top-left.
  const near = `${((90 - r * Math.SQRT1_2) / 180) * 100}%`;
  const far = `${((90 + r * Math.SQRT1_2) / 180) * 100}%`;
  const spots = [
    [far, near],
    [far, far],
    [near, far],
    [near, near],
  ];
  return (
    <div className="relative h-48 w-48">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" aria-hidden>
        {PILLARS.map((p, i) => (
          <circle
            key={p}
            cx="90"
            cy="90"
            r={r}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            stroke={won.has(p) ? PILLAR_META[p].color : "rgb(255 255 255 / .07)"}
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-(i * (c / 4) + gap / 2)}
            className="transition-[stroke] duration-500"
            style={won.has(p) ? { filter: `drop-shadow(0 0 6px ${PILLAR_META[p].color}88)` } : undefined}
          />
        ))}
      </svg>
      {PILLARS.map((p, i) => (
        <span
          key={p}
          aria-hidden
          className={`absolute -ml-[18px] -mt-[18px] grid h-9 w-9 place-items-center rounded-full border-2 text-base transition ${won.has(p) ? "" : "grayscale-[.6]"}`}
          style={{ left: spots[i][0], top: spots[i][1], background: won.has(p) ? PILLAR_META[p].soft : "var(--navy-850)", borderColor: won.has(p) ? PILLAR_META[p].color : "var(--navy-900)" }}
        >
          {PILLAR_META[p].icon}
        </span>
      ))}
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="leading-none" data-testid="today-wins" aria-label={`${won.size} of 4`}>
            <span className="font-pixel text-5xl text-cream">{won.size}</span>
            <span className="ml-1 text-2xl text-cream-faint">/ 4</span>
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cream-faint">wins today</div>
        </div>
      </div>
    </div>
  );
}

function PillarRow({ pillar, won, open, onToggle }: { pillar: Pillar; won: boolean; open: boolean; onToggle: () => void }) {
  const s = useGameState();
  const m = PILLAR_META[pillar];
  const quests = s.today.quests.filter((q) => q.pillar === pillar && q.status !== "skipped");
  const done = quests.filter((q) => q.status === "done").length;
  return (
    <li>
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[.03]"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`today-pillar-${pillar}`}
      >
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: m.soft }}>
          {m.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{m.name}</span>
            <span className="text-xs text-cream-faint">Lv {s.stats.pillars[pillar].level}</span>
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${quests.length ? (done / quests.length) * 100 : 0}%`, background: m.color }} />
            </span>
            <span className="text-xs tabular-nums text-cream-faint">
              {done}/{quests.length}
            </span>
          </span>
        </span>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition"
          style={{ borderColor: won ? m.color : "rgb(255 255 255 / .15)", background: won ? m.color : "transparent", color: "#070a1f" }}
          aria-label={won ? "Won" : "Not yet"}
        >
          {won ? "✓" : ""}
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-cream-faint transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-3 anim-pop">
          {quests.map((q) => (
            <QuestRow key={q.id} q={q} compact />
          ))}
          {quests.length === 0 && <li className="px-1 text-sm text-cream-faint">Nothing on today&apos;s board.</li>}
        </ul>
      )}
    </li>
  );
}

const PANEL_FOR: Record<Pillar, "mental" | "physical" | "spiritual" | "financial"> = { mental: "mental", physical: "physical", spiritual: "spiritual", financial: "financial" };
const FOCUS_SECONDS = 5 * 60;

function NextStep() {
  const s = useGameState();
  const { act, openPanel } = useGame();
  const { busy, run } = useBusy();
  const steps = nextSteps(s);
  const [skip, setSkip] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const q: DailyQuest | undefined = steps[skip % Math.max(1, steps.length)];

  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  const left = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0) navigator.vibrate?.(200);
  }, [left]);

  if (s.today.fourWins || !q) {
    return (
      <section className="card p-5 text-center" data-testid="next-step">
        <div className="text-2xl">🌿</div>
        <h2 className="mt-1 font-semibold">{s.today.fourWins ? "All four wins today." : "Nothing left on today's board."}</h2>
        <p className="mt-1 text-sm text-cream-dim">Put the phone down and enjoy the rest of your day.</p>
      </section>
    );
  }

  const m = PILLAR_META[q.pillar];
  const complete = () =>
    run(async () => {
      play("click");
      if (await act("/api/quests/complete", { dailyQuestId: q.id })) setEndsAt(null);
    });

  return (
    <section
      className="card relative overflow-hidden p-5"
      style={{ borderColor: `${m.color}55`, backgroundImage: `radial-gradient(120% 90% at 100% 0%, ${m.color}1f, transparent 60%)` }}
      data-testid="next-step"
      aria-labelledby="next-step-title"
    >
      <div className="flex items-center justify-between">
        <h2 id="next-step-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          ✦ Your next step
        </h2>
        {steps.length > 1 && endsAt === null && (
          <button className="rounded-full px-2 py-1 text-xs text-cream-faint transition-colors hover:bg-white/5 hover:text-cream" onClick={() => setSkip((n) => n + 1)}>
            Something else ↻
          </button>
        )}
      </div>
      <p className="mt-3 text-xl font-semibold leading-snug" data-testid="next-step-title">
        {q.title}
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm">
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: m.soft, color: m.color }}>
          {m.icon} {m.name}
        </span>
        <span className="font-semibold text-gold">+{q.xp} XP</span>
      </p>

      {q.autoOnly ? (
        <>
          <p className="mt-3 text-sm text-cream-faint">{AUTO_HINT[q.autoKey ?? ""]}.</p>
          <button className="px-btn mt-4 w-full" onClick={() => openPanel(PANEL_FOR[q.pillar])}>
            Log it
          </button>
        </>
      ) : left !== null ? (
        <div className="mt-4 text-center">
          {left > 0 ? (
            <div className="font-pixel text-4xl tabular-nums" aria-live="off" data-testid="focus-timer">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </div>
          ) : (
            <p className="text-cream-dim" role="status">
              Five minutes done. Did you do it?
            </p>
          )}
          <Bar value={1 - left / FOCUS_SECONDS} color={m.color} className="mt-3 !h-1.5 !border-0" label="Focus timer" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="px-btn secondary" onClick={() => setEndsAt(null)}>
              {left > 0 ? "Stop" : "Not yet"}
            </button>
            <button className="px-btn" disabled={busy} onClick={complete}>
              Done ✓
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button
            className="px-btn"
            onClick={() => {
              play("click");
              setNow(Date.now());
              setEndsAt(Date.now() + FOCUS_SECONDS * 1000);
            }}
          >
            Start 5 min
          </button>
          <button className="px-btn secondary" disabled={busy} onClick={complete} aria-label={`Mark ${q.title} done`}>
            Done ✓
          </button>
        </div>
      )}
    </section>
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
      <Header />
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
