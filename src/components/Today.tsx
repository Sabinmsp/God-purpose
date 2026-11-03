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
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-navy-950" data-testid="today-app">
      <div ref={scroller} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">{tab === "today" ? <TodayScreen /> : <ProgressScreen />}</div>
      </div>
      <nav className="shrink-0 border-t border-white/10 bg-navy-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <TabButton icon="◉" label="Today" active={tab === "today" && panel !== "ai"} onClick={() => (openPanel(null), setTab("today"))} />
          <TabButton icon="▲" label="Progress" active={tab === "progress" && panel !== "ai"} onClick={() => (openPanel(null), setTab("progress"))} />
          <TabButton icon="✦" label="AI" active={panel === "ai"} onClick={() => openPanel(panel === "ai" ? null : "ai")} />
          <TabButton icon="▦" label="World" onClick={() => (openPanel(null), setView("world"))} />
        </div>
      </nav>
      {panel === "ai" && <AiPanel onClose={() => openPanel(null)} />}
    </div>
  );
}

function TabButton({ icon, label, active = false, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${active ? "text-gold" : "text-cream-faint hover:text-cream"}`}
      aria-current={active ? "page" : undefined}
      onClick={() => (play("click"), onClick())}
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Header() {
  const s = useGameState();
  const c = s.campaign;
  const day = c.dayNumber < 1 ? `Starts in ${1 - c.dayNumber}d` : c.dayNumber > c.totalDays ? "Journey complete" : `Day ${c.dayNumber} / ${c.totalDays}`;
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="font-pixel text-xl leading-none tracking-wide text-gold">FOUR WINS</h1>
        <p className="mt-1 text-sm text-cream-dim" data-testid="today-day">
          {day}
        </p>
      </div>
      <div className="rounded-full bg-white/5 px-3 py-1 text-sm text-cream-dim" aria-label={`${s.stats.streak.current} day streak`}>
        🔥 {s.stats.streak.current}
      </div>
    </header>
  );
}

function TodayScreen() {
  const s = useGameState();
  const won = new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));
  const [open, setOpen] = useState<Pillar | null>(null);
  return (
    <div className="space-y-6">
      <Header />
      <section className="flex flex-col items-center pt-2" aria-label="Today's wins">
        <WinsRing won={won} />
      </section>
      <section aria-label="Four life areas">
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-navy-900">
          {PILLARS.map((p) => (
            <PillarRow key={p} pillar={p} won={won.has(p)} open={open === p} onToggle={() => setOpen(open === p ? null : p)} />
          ))}
        </ul>
      </section>
      <NextStep />
    </div>
  );
}

/** Four quarter arcs that fill with each pillar's colour once it is won. */
function WinsRing({ won }: { won: Set<Pillar> }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = 10;
  const seg = c / 4 - gap;
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
            stroke={won.has(p) ? PILLAR_META[p].color : "rgb(255 255 255 / .08)"}
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-(i * (c / 4) + gap / 2)}
            className="transition-[stroke] duration-500"
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="leading-none" data-testid="today-wins" aria-label={`${won.size} of 4`}>
            <span className="font-pixel text-5xl text-cream">{won.size}</span>
            <span className="ml-1 text-2xl text-cream-faint">/ 4</span>
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-cream-faint">wins today</div>
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
      <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={onToggle} aria-expanded={open} data-testid={`today-pillar-${pillar}`}>
        <span aria-hidden className="text-xl">
          {m.icon}
        </span>
        <span className="flex-1">
          <span className="block">{m.name}</span>
          <span className="block text-xs text-cream-faint">
            {done}/{quests.length} done · Lv {s.stats.pillars[pillar].level}
          </span>
        </span>
        <span
          className="grid h-7 w-7 place-items-center rounded-full border-2 text-sm"
          style={{ borderColor: won ? m.color : "rgb(255 255 255 / .2)", background: won ? m.color : "transparent", color: "#070a1f" }}
          aria-label={won ? "Won" : "Not yet"}
        >
          {won ? "✓" : ""}
        </span>
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-3">
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
      <section className="rounded-2xl bg-navy-900 p-5 text-center" data-testid="next-step">
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
    <section className="rounded-2xl bg-navy-900 p-5" data-testid="next-step" aria-labelledby="next-step-title">
      <div className="flex items-center justify-between">
        <h2 id="next-step-title" className="text-xs uppercase tracking-[0.2em] text-gold">
          ✦ Your next step
        </h2>
        {steps.length > 1 && endsAt === null && (
          <button className="text-xs text-cream-faint hover:text-cream" onClick={() => setSkip((n) => n + 1)}>
            Something else
          </button>
        )}
      </div>
      <p className="mt-3 text-lg leading-snug" data-testid="next-step-title">
        {q.title}
      </p>
      <p className="mt-1 text-sm" style={{ color: m.color }}>
        {m.icon} {m.name} · +{q.xp} XP
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
      <section className="rounded-2xl bg-navy-900 p-4">
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
          <div key={l} className="rounded-2xl bg-navy-900 px-2 py-3">
            <div className="font-pixel text-2xl">{v}</div>
            <div className="text-[11px] text-cream-faint">{l}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-navy-900 p-4" aria-label={`${c.totalDays}-day journey`}>
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
          <button key={id} className="rounded-2xl bg-navy-900 py-3 text-sm text-cream-dim hover:text-cream" onClick={() => openPanel(id)}>
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
