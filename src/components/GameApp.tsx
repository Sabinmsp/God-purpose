"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/client/api";
import { GameProvider, useGame, useGameState } from "@/client/store";
import { useView } from "@/client/view";
import { bridge, touchInput, type Focus } from "@/game/bridge";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { AiPanel } from "./panels/Ai";
import { JourneyPanel } from "./panels/Journey";
import { AchievementsPanel, GoalsPanel, GuidePanel, ProfilePanel, SettingsPanel } from "./panels/Meta";
import { HabitLogPanel, isHabitLogKey } from "./panels/HabitLog";
import { MindPanel, SanctuaryPanel } from "./panels/MindSpirit";
import { ManageHabitsPanel, QuestBoardPanel } from "./panels/QuestBoard";
import { StrengthPanel } from "./panels/Strength";
import { WealthPanel } from "./panels/Wealth";
import { Hud, Journal } from "./Hud";
import { ReminderCard } from "./Reminders";
import { FloatingXp, LevelUpMoment, WorldMusic } from "./Juice";
import { MainNavigation, TodayApp } from "./Today";
import { QuestRow } from "./quests";
import { Bar } from "./ui";

export default function GameApp() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}

function Shell() {
  const { state, loading, locked, dismissWelcome } = useGame();
  useEffect(() => {
    if (!state) return;
    document.documentElement.style.setProperty("--text-scale", String(state.player.settings.textScale));
    document.documentElement.classList.toggle("reduced-motion", state.player.settings.reducedMotion);
  }, [state]);

  useEffect(() => {
    if (state?.welcome && !locked) dismissWelcome();
  }, [state?.welcome, locked, dismissWelcome]);

  const view = useView();
  // The world (and its Phaser canvas) only mounts when it is on screen, so the
  // today view stays light on battery.
  const world = view === "world";

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-navy-950">
      {state && view && !world ? (
        <TodayApp view={view} />
      ) : (
        // Fade only: a transform here would re-anchor the world's fixed pop-ups to this box.
        <div className={`relative min-h-0 min-w-0 flex-1 ${world ? "anim-fade" : ""}`}>
          {world && <GameCanvas />}
          {state && world && (
            <>
              <Hud />
              <FocusPrompt />
              <TouchControls />
              <AiHost />
            </>
          )}
          {(loading || !state || !view) && !locked && <Loading />}
        </div>
      )}
      {state && view && <MainNavigation view={view} />}
      {state && view && !world && <AiHost />}
      {state && <PanelHost />}
      {state && <DialogBox />}
      {world && <Celebration />}
      <LevelUpMoment />
      <FloatingXp />
      <WorldMusic />
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
      if (!active || active === document.body || active.closest(".habit-nav")) el.focus({ preventScroll: true });
    });
    // Mirrors what has grown in the world (read by e2e tests; harmless otherwise).
    const offWorld = bridge.on("world", (w) => {
      el.setAttribute("data-decorations", String(w.decorations));
      el.setAttribute("data-lanterns", String(w.lanterns));
      el.setAttribute("data-stages", JSON.stringify(w.stages));
    });
    // The asset pack sheets are decoded before Phaser draws any texture.
    void Promise.all([import("@/game/createGame"), import("@/game/art/pack").then((m) => m.loadPack())]).then(([{ createGame }]) => {
      if (cancelled || !ref.current) return;
      game = createGame(ref.current);
      if (process.env.NODE_ENV === "development") Object.assign(window, { __fourWins: { game, bridge } });
    });
    return () => {
      cancelled = true;
      offReady();
      offWorld();
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

function DailyFour() {
  const s = useGameState();
  const { openPanel } = useGame();
  const done = s.today.quests.filter((q) => q.status === "done").length;
  return (
    <section className="px-panel scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-labelledby="daily-four-title">
      <div className="flex items-center justify-between">
        <h2 id="daily-four-title" className="font-pixel whitespace-nowrap text-lg text-gold">
          The Daily Four
        </h2>
        <button className="px-ghost whitespace-nowrap text-xs" onClick={() => openPanel("quests")}>
          Open board →
        </button>
      </div>
      <div className="font-pixel -mt-1 text-xs text-cream-dim">
        {done} won today · {PILLARS.reduce((a, p) => a + s.today.xpToday[p], 0)} XP · 🔥 {s.stats.streak.current} · ★ {s.campaign.progress.fourWinsDays}
      </div>
      {PILLARS.map((p) => (
        <section key={p}>
          <h3 className="font-pixel mb-1 text-sm" style={{ color: PILLAR_META[p].color }}>
            {PILLAR_META[p].icon} {PILLAR_META[p].name.toUpperCase()}
          </h3>
          <ul className="space-y-1">
            {s.today.quests
              .filter((q) => q.pillar === p && q.status !== "skipped")
              .map((q) => (
                <QuestRow key={q.id} q={q} compact />
              ))}
          </ul>
          {p === "financial" &&
            s.savings.goals.map((g) => (
              <button key={g.id} className="mt-1.5 block w-full px-1 text-left" onClick={() => openPanel("financial")} aria-label={`${g.name} ${Math.floor(g.progress * 100)}%`}>
                <div className="flex justify-between text-xs text-cream-dim">
                  <span>{g.name}</span>
                  <span>{Math.floor(g.progress * 100)}%</span>
                </div>
                <Bar value={g.progress} color="#f2c14e" className="mt-0.5 !h-1.5 !border" />
              </button>
            ))}
        </section>
      ))}
    </section>
  );
}

function PanelHost() {
  const { panel, openPanel } = useGame();
  const close = () => openPanel(null);
  const state = useGameState();
  const log = panel?.startsWith("log:") ? panel.slice(4) : null;
  if (isHabitLogKey(log)) return <HabitLogPanel key={log} kind={log} onClose={close} />;
  switch (panel) {
    case "journal":
      return <Journal onClose={close}>
        {state.player.settings.showSidePanel && <DailyFour />}
        <ReminderCard />
      </Journal>;
    case "workout":
      return <StrengthPanel fromTrainer onClose={close} />;
    case "manage-habits":
      return <ManageHabitsPanel onClose={close} />;
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
    case "journey":
      return <JourneyPanel onClose={close} />;
    case "guide":
      return <GuidePanel onClose={close} />;
    default:
      return null;
  }
}

/** Four Wins AI floats beside the player, so it lives inside the world container. */
function AiHost() {
  const { panel, openPanel } = useGame();
  return panel === "ai" ? <AiPanel onClose={() => openPanel(null)} /> : null;
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
      if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement)?.closest("button")) return;
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex justify-center p-3">
      <div className="px-panel pointer-events-auto w-full max-w-xl p-4 anim-pop" role="dialog" aria-live="polite" aria-label={dialog.speaker}>
        <div className="font-pixel mb-1 text-gold">{dialog.speaker}</div>
        <p className="min-h-12 text-lg leading-snug">{dialog.lines[i]}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          {dialog.action && (
            <button className="px-btn" autoFocus onClick={() => openPanel(dialog.action!.panel)}>
              {dialog.action.label}
            </button>
          )}
          <button className="px-btn secondary" onClick={() => (last ? setDialog(null) : setI(i + 1))} autoFocus={!dialog.action}>
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
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center md:bottom-28">
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
  const view = useView();
  // On the Today view toasts sit above the tab bar, so they never cover the wins ring.
  const place = view === "world" ? "top-24 flex-col" : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex-col-reverse";
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-50 flex items-center gap-2 px-3 ${place}`} aria-live="polite">
      {(view === "world" ? toasts : toasts.slice(-3)).map((t) => (
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

const CONFETTI_COLORS = ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e", "#fff1b0"];

/** Full-screen moment for a complete Four Wins day (fireworks play in the world too). */
function Celebration() {
  const { celebration } = useGame();
  if (!celebration) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" data-testid="celebration" role="status" aria-live="assertive">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="confetti absolute top-[-12px] block h-2.5 w-2"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 9) * 0.18}s`,
            animationDuration: `${2.6 + (i % 5) * 0.35}s`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-[22%] flex justify-center px-4">
        <div className="px-panel celebrate-pop px-8 py-5 text-center !border-gold">
          <div className="font-pixel text-4xl text-gold drop-shadow-[0_3px_0_#04061a] sm:text-5xl">FOUR WINS!</div>
          <div className="font-pixel mt-1 text-lg">Day {celebration.day} complete</div>
          <div className="mt-2 flex justify-center gap-2 text-2xl" aria-hidden>
            {PILLARS.map((p) => (
              <span key={p}>{PILLAR_META[p].icon}</span>
            ))}
          </div>
          <div className="mt-2 text-sm text-cream-dim">
            Victory lantern #{celebration.total} lit in the plaza
          </div>
        </div>
      </div>
    </div>
  );
}
