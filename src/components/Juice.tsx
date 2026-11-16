"use client";

import { useEffect, useRef, useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { useView } from "@/client/view";
import { play, startMusic } from "@/game/audio";
import { bridge } from "@/game/bridge";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { Portrait } from "./ui";

/*
 * "Game feel" layer shared by the Today view and the world: the daily title
 * screen, the overall level-up moment and floating XP numbers. Everything here
 * is decoration on top of real server events; none of it changes progress.
 */

const TITLE_KEY = "fw:title-seen";

function titleSeenOn(date: string) {
  try {
    return localStorage.getItem(TITLE_KEY) === date;
  } catch {
    return false;
  }
}

export function markTitleSeen(date: string) {
  try {
    localStorage.setItem(TITLE_KEY, date);
  } catch {
    /* storage blocked: the title just shows again next time */
  }
}

/**
 * Once a day, the game opens on a title screen. It is skipped when the
 * welcome-back screen has news to show, and when a reminder was tapped
 * (those land straight on the Today view so a win is one tap away).
 */
export function TitleScreen() {
  const s = useGameState();
  const { titleOpen, setTitleOpen } = useGame();
  const [leaving, setLeaving] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const fromReminder = new URLSearchParams(window.location.search).has("view");
    if (s.welcome || fromReminder || titleSeenOn(s.now.date)) {
      markTitleSeen(s.now.date);
      return;
    }
    setTitleOpen(true);
  }, [s.welcome, s.now.date, setTitleOpen]);

  if (!titleOpen) return null;
  const c = s.campaign;
  const won = new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar));
  const day = c.dayNumber < 1 ? `Starts in ${1 - c.dayNumber} days` : c.dayNumber > c.totalDays ? "Journey complete" : `Day ${c.dayNumber} of ${c.totalDays}`;
  const go = () => {
    if (leaving) return;
    play("start");
    startMusic();
    markTitleSeen(s.now.date);
    setLeaving(true);
    setTimeout(() => setTitleOpen(false), 450);
  };

  return (
    <div
      className={`title-screen fixed inset-0 z-[57] grid place-items-center overflow-hidden px-4 ${leaving ? "title-leave" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="title-heading"
      data-testid="title-screen"
    >
      <div aria-hidden className="title-stars absolute inset-0" />
      <div aria-hidden className="title-hills absolute inset-x-0 bottom-0 h-1/3" />
      <div className="relative w-full max-w-sm text-center">
        <div className="title-float mx-auto mb-4 w-fit">
          <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={112} art={s.player.settings.characterArt} anim="idle-down-0" />
        </div>
        <h1 id="title-heading" className="font-pixel title-logo text-6xl leading-none text-gold">
          FOUR WINS
        </h1>
        <p className="font-pixel mt-2 text-cream-dim">The Life RPG</p>
        <div className="mt-5 flex justify-center gap-2" aria-label={`${won.size} of 4 pillars won today`}>
          {PILLARS.map((p, i) => (
            <span
              key={p}
              className={`title-pillar grid h-11 w-11 place-items-center rounded-lg border-2 text-xl ${won.has(p) ? "" : "opacity-50 grayscale"}`}
              style={{ borderColor: won.has(p) ? PILLAR_META[p].color : "#04061a", background: PILLAR_META[p].soft, animationDelay: `${300 + i * 90}ms` }}
              aria-hidden
            >
              {PILLAR_META[p].icon}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-cream-dim">
          {s.player.name} · Level {s.stats.overall.level} · {day}
          {s.stats.streak.current > 0 && <> · 🔥 {s.stats.streak.current}</>}
        </p>
        <button className="px-btn title-cta mt-6 w-full text-xl" onClick={go} autoFocus>
          Continue ▸
        </button>
        <p className="mt-3 text-xs text-cream-faint">Every win comes from real life.</p>
      </div>
    </div>
  );
}

/** Full-screen moment for a new overall level, on top of the toast and the in-world effect. */
export function LevelUpMoment() {
  const { levelUp, celebration } = useGame();
  if (!levelUp || celebration) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[56] grid place-items-center overflow-hidden" role="status" aria-live="assertive" data-testid="level-up">
      <div aria-hidden className="levelup-dim absolute inset-0" />
      <div aria-hidden className="levelup-rays absolute h-[140vmax] w-[140vmax]" />
      <div className="levelup-card px-panel relative mx-4 !border-gold px-8 py-6 text-center">
        <div className="font-pixel text-2xl tracking-widest text-gold-light drop-shadow-[0_3px_0_#04061a]">LEVEL UP!</div>
        <div className="font-pixel levelup-number text-8xl leading-none text-gold drop-shadow-[0_5px_0_#04061a]">{levelUp.level}</div>
        <div className="font-pixel mt-1 text-cream drop-shadow-[0_2px_0_#04061a]">Your character grows stronger</div>
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="levelup-spark absolute block h-2 w-2 rotate-45 bg-gold-light"
          style={{ ["--a" as string]: `${(i / 14) * 360}deg`, animationDelay: `${(i % 4) * 70}ms` }}
        />
      ))}
    </div>
  );
}

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  delay: number;
}

let floaterId = 0;

/**
 * "+20 XP" numbers that rise from where you tapped. The world draws its own
 * floating text over the character, so these only appear on the Today view.
 */
export function FloatingXp() {
  const view = useView();
  const [items, setItems] = useState<Floater[]>([]);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => (origin.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  useEffect(() => {
    if (view === "world") return;
    return bridge.on("events", (events) => {
      const at = origin.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const next: Floater[] = [];
      let delay = 0;
      for (const e of events) {
        if (e.type !== "xp") continue;
        next.push({ id: ++floaterId, x: at.x, y: at.y, text: `+${e.amount} XP`, color: PILLAR_META[e.pillar].color, delay });
        delay += 180;
      }
      if (!next.length) return;
      setItems((cur) => [...cur.slice(-6), ...next]);
      const ids = new Set(next.map((n) => n.id));
      setTimeout(() => setItems((cur) => cur.filter((x) => !ids.has(x.id))), 1600 + delay);
    });
  }, [view]);

  if (view === "world" || !items.length) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[54]">
      {items.map((f) => (
        <span
          key={f.id}
          className="font-pixel xp-float absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-lg drop-shadow-[0_2px_0_#04061a]"
          style={{ left: f.x, top: f.y - 8, color: f.color, animationDelay: `${f.delay}ms` }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}

/** In the world, music starts with the first tap or key press (browsers need a gesture first). */
export function WorldMusic() {
  const view = useView();
  useEffect(() => {
    if (view !== "world") return;
    const go = () => startMusic();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
  }, [view]);
  return null;
}
