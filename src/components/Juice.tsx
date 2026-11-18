"use client";

import { useEffect, useRef, useState } from "react";
import { useGame } from "@/client/store";
import { useView } from "@/client/view";
import { startMusic } from "@/game/audio";
import { bridge } from "@/game/bridge";
import { PILLAR_META } from "@/lib/shared/pillars";

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
