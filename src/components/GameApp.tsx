"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/client/api";
import { GameProvider, useGame, useGameState } from "@/client/store";
import { play } from "@/game/audio";
import { bridge, touchInput, type Focus } from "@/game/bridge";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import { formatAud } from "@/lib/shared/money";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { localClock } from "@/lib/shared/time";
import { UNLOCKS_BY_KEY } from "@/lib/shared/unlocks";
import { AchievementsPanel, GoalsPanel, GuidePanel, ProfilePanel, SettingsPanel } from "./panels/Meta";
import { MindPanel, SanctuaryPanel } from "./panels/MindSpirit";
import { QuestBoardPanel } from "./panels/QuestBoard";
import { StrengthPanel } from "./panels/Strength";
import { WealthPanel } from "./panels/Wealth";
import { QuestRow } from "./quests";
import { Bar, PillarChip, Portrait } from "./ui";

export default function GameApp() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell() {
  const { state, loading, locked } = useGame();
  const sidePanel = state?.player.settings.showSidePanel ?? true;
  useEffect(() => {
    if (!state) return;
    document.documentElement.style.setProperty("--text-scale", String(state.player.settings.textScale));
    document.documentElement.classList.toggle("reduced-motion", state.player.settings.reducedMotion);
  }, [state]);

  return (
    <main className="fixed inset-0 flex overflow-hidden bg-navy-950">
      <div className="relative min-w-0 flex-1">
        <GameCanvas />
        {state && (
          <>
            <Hud />
            <FocusPrompt />
            <TouchControls />
          </>
        )}
        {(loading || !state) && !locked && <Loading />}
      </div>
      {state && sidePanel && <SidePanel />}
      {state && <PanelHost />}
      {state && <DialogBox />}
      {state?.welcome && <WelcomeBack />}
      <Toasts />
      {locked && <PinLock />}
    </main>
  );
}

function Loading() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-navy-950">
      <div className="text-center">
        <div className="font-pixel text-3xl text-gold anim-shimmer">FOUR WINS</div>
        <div className="font-pixel mt-2 text-cream-dim">Loading your world…</div>
      </div>
    </div>
  );
}

function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const { state } = useGame();
  const started = useRef(false);
  useEffect(() => {
    if (!state || started.current || !ref.current) return;
    started.current = true;
    let game: { destroy: (b: boolean) => void } | null = null;
    let cancelled = false;
    const el = ref.current;
    // Marks the canvas once a world scene is live (used by e2e tests and for a11y).
    const offReady = bridge.on("ready", () => {
      el.setAttribute("data-ready", "true");
      // Give the world keyboard focus so WASD works without a click first.
      const active = document.activeElement;
      if (!active || active === document.body) el.focus({ preventScroll: true });
    });
    void import("@/game/createGame").then(({ createGame }) => {
      if (cancelled || !ref.current) return;
      game = createGame(ref.current);
      if (process.env.NODE_ENV === "development") Object.assign(window, { __fourWins: { game, bridge } });
    });
    return () => {
      cancelled = true;
      offReady();
      game?.destroy(true);
      started.current = false;
    };
    // Start once the first state is in; later states flow through the bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(state)]);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className="absolute inset-0 outline-none"
      data-testid="game-canvas"
      aria-label="Four Wins game world. Use WASD or arrow keys to move and E to interact."
      role="application"
      onPointerDown={() => ref.current?.focus({ preventScroll: true })}
    />
  );
}

function useDarwinClock() {
  const [clock, setClock] = useState(() => localClock());
  useEffect(() => {
    const t = setInterval(() => setClock(localClock()), 20_000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

function Hud() {
  const s = useGameState();
  const { openPanel } = useGame();
  const clock = useDarwinClock();
  const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const dateLabel = new Date(`${clock.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-20 flex items-start justify-between gap-2 pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-1.5">
          <button className="px-panel flex items-center gap-2 !rounded-md px-2 py-1.5 text-left" onClick={() => openPanel("profile")} aria-label="Open character profile">
            <div className="rounded bg-navy-950">
              <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={40} />
            </div>
            <div className="min-w-0">
              <div className="font-pixel truncate leading-tight" data-testid="hud-name">
                {s.player.name}
              </div>
              <div className="font-pixel text-xs text-gold" data-testid="hud-level">
                LV {s.stats.overall.level} · {s.player.characterClass}
              </div>
              <Bar value={s.stats.overall.pct} className="mt-1 !h-2 w-28" label="Overall XP" />
            </div>
          </button>
          <div className="flex gap-1">
            {PILLARS.map((p) => (
              <PillarChip key={p} pillar={p} level={s.stats.pillars[p].level} pct={s.stats.pillars[p].pct} onClick={() => openPanel(p)} />
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="px-panel !rounded-md px-2.5 py-1 text-right">
            <div className="font-pixel text-sm leading-tight">
              {dateLabel} · {time}
            </div>
            <div className="font-pixel text-xs text-gold" title="Current streak — rest days never break it">
              🔥 {s.stats.streak.current} day streak
            </div>
          </div>
          <nav className="flex gap-1" aria-label="Menus">
            {(
              [
                ["quests", "📜", "Daily quests (Q)"],
                ["goals", "🗓️", "Goals & calendar"],
                ["achievements", "🏆", "Trophies"],
                ["settings", "⚙️", "Settings"],
              ] as const
            ).map(([id, icon, label]) => (
              <button key={id} className="px-btn secondary !h-9 !w-9 !p-0 text-lg" onClick={() => (play("click"), openPanel(id))} aria-label={label} title={label}>
                {icon}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}

function SidePanel() {
  const s = useGameState();
  const { openPanel } = useGame();
  const done = s.today.quests.filter((q) => q.status === "done").length;
  return (
    <aside className="scrollbar-thin hidden w-[330px] shrink-0 flex-col gap-3 overflow-y-auto border-l-4 border-[#04061a] bg-navy-900 p-3 lg:flex" aria-label="Today">
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-lg text-gold">The Daily Four</h2>
        <button className="px-ghost text-xs" onClick={() => openPanel("quests")}>
          Open board →
        </button>
      </div>
      <div className="text-xs text-cream-dim">
        {done} won today · {PILLARS.reduce((a, p) => a + s.today.xpToday[p], 0)} XP · 🔥 {s.stats.streak.current}
      </div>
      {PILLARS.map((p) => (
        <section key={p}>
          <h3 className="font-pixel mb-1 text-xs" style={{ color: PILLAR_META[p].color }}>
            {PILLAR_META[p].icon} {PILLAR_META[p].name.toUpperCase()}
          </h3>
          <ul className="space-y-1">
            {s.today.quests
              .filter((q) => q.pillar === p && q.status !== "skipped")
              .map((q) => (
                <QuestRow key={q.id} q={q} compact />
              ))}
          </ul>
        </section>
      ))}
      <section className="px-card p-2">
        <h3 className="font-pixel mb-1 text-xs text-gold">💰 VAULTS</h3>
        {s.savings.goals.map((g) => (
          <button key={g.id} className="block w-full text-left" onClick={() => openPanel("financial")}>
            <div className="flex justify-between text-xs">
              <span>{g.name}</span>
              <span className="text-cream-dim">{Math.floor(g.progress * 100)}%</span>
            </div>
            <Bar value={g.progress} color="#f2c14e" className="mb-1 mt-0.5 !h-2" />
          </button>
        ))}
      </section>
      <p className="mt-auto text-[11px] text-cream-faint">WASD/arrows move · Shift run · E interact · Q quests</p>
    </aside>
  );
}

function PanelHost() {
  const { panel, openPanel } = useGame();
  const close = () => openPanel(null);
  switch (panel) {
    case "quests":
      return <QuestBoardPanel onClose={close} />;
    case "mental":
      return <MindPanel onClose={close} />;
    case "physical":
      return <StrengthPanel onClose={close} />;
    case "spiritual":
      return <SanctuaryPanel onClose={close} />;
    case "financial":
      return <WealthPanel onClose={close} />;
    case "profile":
      return <ProfilePanel onClose={close} />;
    case "goals":
      return <GoalsPanel onClose={close} />;
    case "achievements":
      return <AchievementsPanel onClose={close} />;
    case "settings":
      return <SettingsPanel onClose={close} />;
    case "guide":
      return <GuidePanel onClose={close} />;
    default:
      return null;
  }
}

function DialogBox() {
  const { dialog } = useGame();
  if (!dialog) return null;
  // A new dialog remounts the box, so it always starts at its first line.
  return <DialogContent key={`${dialog.speaker}|${dialog.lines.join("|")}`} dialog={dialog} />;
}

function DialogContent({ dialog }: { dialog: NonNullable<ReturnType<typeof useGame>["dialog"]> }) {
  const { setDialog, openPanel } = useGame();
  const [i, setI] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
      if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (i < dialog.lines.length - 1) setI(i + 1);
        else setDialog(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, i, setDialog]);
  const last = i >= dialog.lines.length - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="px-panel pointer-events-auto w-full max-w-xl p-4 anim-pop" role="dialog" aria-live="polite" aria-label={dialog.speaker}>
        <div className="font-pixel mb-1 text-gold">{dialog.speaker}</div>
        <p className="min-h-12 text-lg leading-snug">{dialog.lines[i]}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          {dialog.action && (
            <button className="px-btn" onClick={() => openPanel(dialog.action!.panel)}>
              {dialog.action.label}
            </button>
          )}
          <button className="px-btn secondary" onClick={() => (last ? setDialog(null) : setI(i + 1))} autoFocus>
            {last ? "Close" : "Next ▸"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FocusPrompt() {
  const [focus, setFocus] = useState<Focus | null>(null);
  const { panel, dialog } = useGame();
  useEffect(() => bridge.on("focus", setFocus), []);
  if (!focus || panel || dialog) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center md:bottom-6">
      <button
        className="px-panel font-pixel pointer-events-auto flex items-center gap-2 !rounded-md px-3 py-2 anim-pop"
        onClick={() => bridge.emit("interact")}
        data-testid="focus-prompt"
      >
        <kbd className="hidden rounded border-2 border-[#04061a] bg-gold px-1.5 text-sm text-[#2a1a05] md:inline">E</kbd>
        <span>
          {focus.verb} <span className="text-gold">{focus.label}</span>
        </span>
      </button>
    </div>
  );
}

function TouchControls() {
  // Only rendered client-side after state loads, so reading window here is safe.
  const isTouch = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  const [touch, setTouch] = useState(isTouch);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const { openPanel } = useGame();
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setTouch(isTouch());
    mq.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      mq.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  if (!touch) return null;
  const R = 44;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    touchInput.x = dx / R;
    touchInput.y = dy / R;
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    touchInput.x = 0;
    touchInput.y = 0;
  };
  return (
    <>
      <div
        ref={base}
        className="absolute bottom-6 left-6 z-20 grid h-32 w-32 touch-none place-items-center rounded-full border-4 border-[#04061a] bg-navy-900/60 pb-[env(safe-area-inset-bottom)]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Movement joystick"
        role="slider"
        aria-valuenow={0}
        data-testid="joystick"
      >
        <div className="h-14 w-14 rounded-full border-4 border-[#04061a] bg-gold/90 shadow-[inset_-3px_-4px_0_var(--gold-dark)]" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="absolute bottom-8 right-5 z-20 flex flex-col items-end gap-3">
        <button className="px-btn secondary !h-12 !w-12 !rounded-full text-xl" onClick={() => openPanel("quests")} aria-label="Daily quests">
          📜
        </button>
        <button className="px-btn !h-16 !w-16 !rounded-full text-lg" onClick={() => bridge.emit("interact")} aria-label="Interact" data-testid="action-button">
          A
        </button>
      </div>
    </>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex flex-col items-center gap-2 px-3" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`px-panel pointer-events-auto max-w-sm px-4 py-2 text-center anim-pop ${t.kind === "level" ? "!border-gold" : ""}`}
          style={{ boxShadow: t.color ? `inset 0 -3px 0 ${t.color}, 0 6px 0 #04061a` : undefined }}
          data-testid={`toast-${t.kind}`}
        >
          <div className={`font-pixel ${t.kind === "level" ? "text-2xl" : "text-base"}`} style={{ color: t.kind === "error" ? "var(--danger)" : t.color ?? "var(--cream)" }}>
            {t.title}
          </div>
          {t.detail && <div className="text-xs text-cream-dim">{t.detail}</div>}
        </button>
      ))}
    </div>
  );
}

function WelcomeBack() {
  const s = useGameState();
  const { dismissWelcome } = useGame();
  const w = s.welcome!;
  const gained = PILLARS.filter((p) => w.xpGained[p] > 0);
  const lines: { text: string; color?: string }[] = [];
  if (w.firstVisit) {
    lines.push({ text: `Level ${s.stats.overall.level} ${s.player.characterClass}. Your world starts here.` });
    lines.push({ text: "Nothing is earned just by logging in — every win comes from real life." });
    lines.push({ text: "Visit the Quest Board in the plaza, or press Q." });
  } else {
    for (const lu of w.levelUps)
      lines.push({
        text: lu.pillar === "overall" ? `You reached level ${lu.to}!` : `${PILLAR_META[lu.pillar].name} grew to level ${lu.to}!`,
        color: lu.pillar === "overall" ? "#f2c14e" : PILLAR_META[lu.pillar].color,
      });
    for (const p of gained) lines.push({ text: `+${w.xpGained[p]} ${PILLAR_META[p].name} XP`, color: PILLAR_META[p].color });
    if (w.xpGained.physical > 0 && !w.levelUps.some((l) => l.pillar === "physical")) lines.unshift({ text: "Your strength has increased!", color: PILLAR_META.physical.color });
    for (const u of w.newUnlocks) lines.push({ text: `Unlocked: ${UNLOCKS_BY_KEY[u]?.name ?? u}`, color: "#fff1b0" });
    for (const a of w.newAchievements) lines.push({ text: `Trophy: ${ACHIEVEMENTS_BY_KEY[a]?.name ?? a}`, color: "#f2c14e" });
    if (w.physiqueChanged) lines.push({ text: "Your measured progress changed your physique.", color: PILLAR_META.physical.color });
    for (const v of w.vaults)
      lines.push({
        text: `${v.name}: ${Math.floor(v.progress * 100)}% complete${v.deltaCents ? ` (${v.deltaCents > 0 ? "+" : "−"}${formatAud(Math.abs(v.deltaCents), { whole: true })})` : ""}`,
        color: "#f2c14e",
      });
    if (!gained.length && !w.levelUps.length) lines.unshift({ text: "No new wins logged since your last visit. Today is a fresh start." });
    if (w.streak > 0) lines.push({ text: `🔥 ${w.streak}-day streak` });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/80 p-4 backdrop-blur-sm">
      <div className="px-panel w-full max-w-md p-6 text-center anim-pop" role="dialog" aria-modal="true" aria-labelledby="welcome-title" data-testid="welcome">
        <div className="mx-auto mb-3 w-fit rounded-lg bg-navy-950 p-2">
          <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={96} anim={w.levelUps.length ? "celebrate-1" : "idle-down-0"} />
        </div>
        <h2 id="welcome-title" className="font-pixel text-2xl text-gold">
          {w.firstVisit ? `Welcome, ${s.player.name}!` : `Welcome back, ${s.player.name}!`}
        </h2>
        {w.since && (
          <p className="text-xs text-cream-faint">
            Since {new Date(w.since).toLocaleString("en-AU", { timeZone: "Australia/Darwin", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
        <ul className="my-4 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="font-pixel anim-pop" style={{ color: l.color, animationDelay: `${150 + i * 140}ms` }}>
              {l.text}
            </li>
          ))}
        </ul>
        <button className="px-btn w-full text-lg" onClick={() => (play("open"), dismissWelcome())} autoFocus>
          Enter the world ▸
        </button>
      </div>
    </div>
  );
}

function PinLock() {
  const { refresh, setUnlocked } = useGame();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submit = async (value: string) => {
    try {
      await api("/api/auth/unlock", { body: { pin: value } });
      setUnlocked();
      await refresh();
    } catch (err) {
      setPin("");
      setError(err instanceof Error ? err.message : "Wrong PIN");
      if ((err as { status?: number }).status === 401 && /log in/i.test(String((err as Error).message))) window.location.replace("/login");
    }
  };
  const press = (d: string) => {
    const next = (pin + d).slice(0, 8);
    setPin(next);
    setError("");
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-950 p-4">
      <div className="px-panel w-full max-w-xs p-6 text-center">
        <h2 className="font-pixel text-xl text-gold">Session locked</h2>
        <p className="mb-3 text-sm text-cream-dim">Enter your PIN to continue.</p>
        <div className="font-pixel mb-3 h-8 text-2xl tracking-[0.4em]">{"•".repeat(pin.length) || " "}</div>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((k) => (
            <button
              key={k}
              className={`px-btn ${k === "✓" ? "" : "secondary"} !py-3 text-lg`}
              onClick={() => (k === "⌫" ? setPin(pin.slice(0, -1)) : k === "✓" ? pin.length >= 4 && submit(pin) : press(k))}
            >
              {k}
            </button>
          ))}
        </div>
        <a href="/login" className="px-ghost mt-3 inline-block text-xs">
          Use password instead
        </a>
      </div>
    </div>
  );
}
