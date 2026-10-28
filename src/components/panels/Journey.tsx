"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/client/api";
import { useGameState } from "@/client/store";
import { renderVillage, type SnapshotState } from "@/game/snapshot";
import { worldStages } from "@/game/world/growth";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import {
  DECORATION_NAMES,
  EVOLUTION,
  STAGE_NAMES,
  isFourWinsDay,
  nextStage,
  progressOn,
  unlocksOnDay,
  type CampaignDay,
} from "@/lib/shared/campaign";
import { carStage, formatAud } from "@/lib/shared/money";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { formatLongDate } from "@/lib/shared/time";
import { UNLOCKS_BY_KEY } from "@/lib/shared/unlocks";
import { Bar, Empty, Section, Sheet, Tabs } from "../ui";

interface DayDetail {
  date: string;
  dayNumber: number;
  quests: { title: string; pillar: (typeof PILLARS)[number]; xp: number }[];
  journal: { kind: string; body: string }[];
  workouts: { title: string; kind: string; durationMin: number }[];
  measurements: { weightKg: number | null; waistCm: number | null; bodyFatPct: number | null }[];
  savings: { goalName: string; kind: string; amountCents: number }[];
  finance: Record<string, number>;
  achievements: string[];
  unlocks: string[];
}

/** Renders the village for a campaign state onto a scaled, crisp canvas. */
function VillageSnapshot({ state, label }: { state: SnapshotState; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(state);
  useEffect(() => {
    const src = renderVillage(JSON.parse(key));
    const c = ref.current!;
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
  }, [key]);
  return <canvas ref={ref} className="block h-auto w-full" style={{ imageRendering: "pixelated" }} role="img" aria-label={label} />;
}

function DayCell({ day, n, selected, today, onSelect }: { day?: CampaignDay; n: number; selected: boolean; today: boolean; onSelect: () => void }) {
  const future = !day;
  const four = day && isFourWinsDay(day);
  return (
    <button
      onClick={onSelect}
      disabled={future}
      aria-pressed={selected}
      aria-label={`Day ${n}${four ? ", Four Wins" : day ? `, ${day.pillars.length} of 4 pillars` : ", upcoming"}`}
      data-testid={`journey-day-${n}`}
      className={`relative aspect-square rounded border-2 text-[10px] ${selected ? "border-gold-light" : today ? "border-gold" : "border-[#04061a]"} ${future ? "opacity-35" : "hover:brightness-125"}`}
      style={{ background: four ? "#f2c14e" : day?.pillars.length ? "var(--navy-700)" : "var(--navy-950)" }}
    >
      <span className={`font-pixel absolute left-1 top-0.5 ${four ? "text-[#2a1a05]" : "text-cream-dim"}`}>{n}</span>
      {four && <span className="absolute bottom-0 right-1 text-[11px] text-[#2a1a05]">★</span>}
      {!four && day && day.pillars.length > 0 && (
        <span className="absolute bottom-1 left-0 right-0 flex justify-center gap-px">
          {PILLARS.map((p) => (
            <span key={p} className="h-1 w-1" style={{ background: day.pillars.includes(p) ? PILLAR_META[p].color : "transparent" }} />
          ))}
        </span>
      )}
    </button>
  );
}

function DayView({ date }: { date: string }) {
  const s = useGameState();
  const c = s.campaign;
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [error, setError] = useState("");
  const [showVillage, setShowVillage] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ day: DayDetail }>(`/api/campaign/day?date=${date}`)
      .then((r) => alive && (setDetail(r.day), setError("")))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load this day"));
    return () => {
      alive = false;
    };
  }, [date, s.campaign.days]);

  const record = c.days.find((d) => d.date === date);
  const unlocked = unlocksOnDay(c, c.days, date);
  const progress = progressOn(c, c.days, date);
  const changes: { text: string; color?: string }[] = [];
  for (const p of unlocked.decorations) changes.push({ text: `${PILLAR_META[p].icon} New piece added to your ${DECORATION_NAMES[p]}`, color: PILLAR_META[p].color });
  for (const u of unlocked.stageUps) changes.push({ text: `🏛️ ${PILLAR_META[u.pillar].world} became the ${u.name}`, color: PILLAR_META[u.pillar].color });
  if (unlocked.lantern) changes.push({ text: `🏮 Victory lantern #${unlocked.lantern} lit in the plaza`, color: "#f2c14e" });
  if (unlocked.evolved) changes.push({ text: `✨ You evolved into ${unlocked.evolved.title}`, color: "#fff1b0" });
  for (const k of detail?.unlocks ?? []) if (UNLOCKS_BY_KEY[k]) changes.push({ text: `🎁 Unlocked ${UNLOCKS_BY_KEY[k].name}` });

  const status = !record
    ? "Upcoming"
    : isFourWinsDay(record)
      ? "★ Four Wins day"
      : record.pillars.length
        ? `${record.pillars.length} of 4 pillars won`
        : "No wins logged";

  return (
    <div className="px-card p-3" data-testid="journey-day">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-pixel text-lg text-gold">
          Day {detail?.dayNumber ?? "…"} · {formatLongDate(date)}
        </h4>
        <span className="font-pixel text-sm" style={{ color: record && isFourWinsDay(record) ? "#f2c14e" : undefined }}>
          {status}
        </span>
      </div>
      {record && record.xp > 0 && <p className="text-xs text-cream-dim">{record.xp} XP earned</p>}

      <h5 className="font-pixel mt-3 text-sm text-cream-dim">World changes</h5>
      {changes.length ? (
        <ul className="mt-1 space-y-1 text-sm" data-testid="journey-changes">
          {changes.map((ch, i) => (
            <li key={i} style={{ color: ch.color }}>
              {ch.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-cream-faint">No visual upgrades this day.</p>
      )}

      <h5 className="font-pixel mt-3 text-sm text-cream-dim">What you did</h5>
      {error && <p className="text-sm text-danger">{error}</p>}
      {detail && (
        <div className="mt-1 space-y-2 text-sm">
          {detail.quests.length ? (
            <ul className="space-y-0.5">
              {detail.quests.map((q, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    <span style={{ color: PILLAR_META[q.pillar].color }}>■</span> {q.title}
                  </span>
                  <span className="font-pixel text-xs text-cream-dim">+{q.xp}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-cream-faint">No quests completed.</p>
          )}
          {detail.workouts.map((w, i) => (
            <p key={`w${i}`} className="text-cream-dim">
              🏋️ {w.title} · {w.durationMin} min
            </p>
          ))}
          {detail.measurements.map((m, i) => (
            <p key={`m${i}`} className="text-cream-dim">
              ⚖️ {[m.weightKg != null && `${m.weightKg} kg`, m.waistCm != null && `${m.waistCm} cm waist`].filter(Boolean).join(" · ")}
            </p>
          ))}
          {detail.savings.map((v, i) => (
            <p key={`s${i}`} className="text-cream-dim">
              💰 {v.goalName}: {v.amountCents >= 0 ? "+" : "−"}
              {formatAud(Math.abs(v.amountCents))}
            </p>
          ))}
          {detail.journal.map((j, i) => (
            <p key={`j${i}`} className="text-cream-dim">
              ✍️ <span className="capitalize">{j.kind}</span>: {j.body.length > 120 ? `${j.body.slice(0, 120)}…` : j.body}
            </p>
          ))}
          {detail.achievements.length > 0 && (
            <p className="text-cream-dim">🏆 {detail.achievements.map((k) => ACHIEVEMENTS_BY_KEY[k]?.name ?? k).join(" · ")}</p>
          )}
        </div>
      )}

      <button className="px-btn secondary small mt-3" onClick={() => setShowVillage((v) => !v)} aria-expanded={showVillage}>
        {showVillage ? "Hide village" : "🗺️ See the village on this day"}
      </button>
      {showVillage && (
        <div className="mt-2 overflow-hidden rounded border-2 border-[#04061a]">
          <VillageSnapshot state={{ stages: progress.stages, pillarDays: progress.pillarDays, fourWinsDays: progress.fourWinsDays }} label={`Village on day ${detail?.dayNumber ?? ""}`} />
        </div>
      )}
    </div>
  );
}

function BeforeAfter() {
  const s = useGameState();
  const c = s.campaign;
  const [split, setSplit] = useState(50);
  const day1 = progressOn(c, [], c.startDate);
  const stages = worldStages(s);
  const tuition = s.savings.goals.find((g) => g.key === "tuition");
  const car = s.savings.goals.find((g) => g.key === "car");
  const now: SnapshotState = {
    stages,
    pillarDays: c.progress.pillarDays,
    fourWinsDays: c.progress.fourWinsDays,
    vaultLevel: tuition ? Math.min(10, tuition.balanceCents > 0 ? Math.ceil(tuition.progress * 10) : 0) : 0,
    carStage: car ? carStage(car.progress) : 0,
  };
  const decorations = PILLARS.reduce((n, p) => n + c.progress.pillarDays[p], 0);
  return (
    <>
      <p className="mb-2 text-sm text-cream-dim">Drag the slider to compare your village on Day 1 with today.</p>
      <div className="relative overflow-hidden rounded border-2 border-[#04061a]" data-testid="before-after">
        <VillageSnapshot state={now} label="Your village today" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <VillageSnapshot state={{ stages: day1.stages, pillarDays: day1.pillarDays, fourWinsDays: 0 }} label="Your village on Day 1" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${split}%` }} />
        <span className="font-pixel absolute left-2 top-2 rounded bg-navy-950/80 px-1.5 text-xs">Day 1</span>
        <span className="font-pixel absolute right-2 top-2 rounded bg-navy-950/80 px-1.5 text-xs text-gold">Day {Math.max(1, Math.min(c.dayNumber, c.totalDays))}</span>
      </div>
      <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="mt-2 w-full accent-[var(--gold)]" aria-label="Before and after slider" />
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <li className="px-card px-3 py-2">🌱 {decorations} district decorations</li>
        <li className="px-card px-3 py-2">🏮 {c.progress.fourWinsDays} victory lanterns</li>
        {PILLARS.map((p) => (
          <li key={p} className="px-card px-3 py-2" style={{ color: PILLAR_META[p].color }}>
            {STAGE_NAMES[p][0]} → {STAGE_NAMES[p][stages[p]]}
          </li>
        ))}
      </ul>
    </>
  );
}

export function JourneyPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const c = s.campaign;
  const [tab, setTab] = useState<"timeline" | "compare">("timeline");
  const lastDay = c.days.length ? c.days[c.days.length - 1].date : c.startDate;
  const [selected, setSelected] = useState(lastDay);
  const byNumber = useMemo(() => new Map(c.days.map((d, i) => [i + 1, d])), [c.days]);
  const tier = EVOLUTION[c.progress.tier];
  const nextTier = EVOLUTION[c.progress.tier + 1];
  const before = c.dayNumber < 1;
  const after = c.dayNumber > c.totalDays;

  return (
    <Sheet title="75-Day Journey" subtitle={`${c.title} · ${formatLongDate(c.startDate)} → ${formatLongDate(c.endDate)}`} icon="🗺️" onClose={onClose} wide>
      <div className="px-card mb-4 p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="font-pixel text-2xl text-gold" data-testid="journey-day-number">
            {before ? `Starts in ${1 - c.dayNumber} day${c.dayNumber === 0 ? "" : "s"}` : after ? "Journey complete" : `Day ${c.dayNumber} of ${c.totalDays}`}
          </div>
          <div className="font-pixel text-sm" data-testid="journey-fourwins">
            ★ {c.progress.fourWinsDays} Four Wins day{c.progress.fourWinsDays === 1 ? "" : "s"}
          </div>
        </div>
        <Bar value={Math.max(0, Math.min(c.dayNumber, c.totalDays)) / c.totalDays} className="mt-2" label="Campaign progress" />
        <p className="mt-2 text-sm">
          <span className="text-gold">{tier.title}</span>
          <span className="text-cream-dim">
            {nextTier ? ` · ${nextTier.at - c.progress.fourWinsDays} more Four Wins day${nextTier.at - c.progress.fourWinsDays === 1 ? "" : "s"} to become ${nextTier.title}` : " · Final form reached"}
          </span>
        </p>
      </div>

      <Section title="Buildings">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PILLARS.map((p) => {
            const days = c.progress.pillarDays[p];
            const next = nextStage(p, days);
            return (
              <li key={p} className="px-card p-2.5" data-testid={`journey-building-${p}`}>
                <div className="flex justify-between gap-2 text-sm">
                  <span style={{ color: PILLAR_META[p].color }}>
                    {PILLAR_META[p].icon} {STAGE_NAMES[p][c.progress.stages[p]]}
                  </span>
                  <span className="font-pixel text-xs text-cream-dim">Stage {c.progress.stages[p] + 1}/6</span>
                </div>
                <Bar value={next ? days / next.at : 1} color={PILLAR_META[p].color} className="mt-1.5" />
                <p className="mt-1 text-xs text-cream-faint">
                  {days} day{days === 1 ? "" : "s"} won{next ? ` · ${next.remaining} more → ${next.name}` : " · fully evolved"}
                </p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Tabs
        tabs={[
          { id: "timeline", label: "Timeline" },
          { id: "compare", label: "Before & after" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "timeline" && (
        <>
          <div className="mb-3 grid grid-cols-10 gap-1 sm:grid-cols-15">
            {Array.from({ length: c.totalDays }, (_, i) => {
              const n = i + 1;
              const day = byNumber.get(n);
              return <DayCell key={n} n={n} day={day} today={day?.date === s.now.date} selected={day?.date === selected} onSelect={() => day && setSelected(day.date)} />;
            })}
          </div>
          <p className="mb-3 text-xs text-cream-faint">Gold ★ = Four Wins day (all four pillars). Dots = pillars won. Calendar days count whether or not you win.</p>
          {c.days.length ? <DayView date={selected} /> : <Empty>Your journey begins on {formatLongDate(c.startDate)}.</Empty>}
        </>
      )}
      {tab === "compare" && <BeforeAfter />}
    </Sheet>
  );
}
