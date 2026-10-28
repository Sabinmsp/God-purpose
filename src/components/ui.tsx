"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buildCharacter, playerLook } from "@/game/art/character";
import { PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { parseAudToCents } from "@/lib/shared/money";
import type { Equipped } from "@/lib/shared/unlocks";

export function Bar({ value, color, className = "", label }: { value: number; color?: string; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={`px-bar ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ ["--bar" as string]: color }}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Sheet({
  title,
  subtitle,
  accent = "#f2c14e",
  icon,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <button aria-label="Close panel" className="absolute inset-0 bg-navy-950/40 md:bg-navy-950/20" onClick={onClose} tabIndex={-1} />
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`px-panel anim-slide relative flex h-full w-full flex-col outline-none md:m-3 md:h-[calc(100%-1.5rem)] ${wide ? "md:w-[min(720px,60vw)]" : "md:w-[min(520px,46vw)]"}`}
      >
        <header className="flex items-center gap-3 border-b-2 border-[#04061a] px-4 py-3" style={{ boxShadow: `inset 0 -3px 0 ${accent}` }}>
          {icon && <span className="text-2xl" aria-hidden>{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={id} className="font-pixel truncate text-xl" style={{ color: accent }}>
              {title}
            </h2>
            {subtitle && <p className="truncate text-sm text-cream-dim">{subtitle}</p>}
          </div>
          <button className="px-btn secondary small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
      </section>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-pixel text-base text-gold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded border-2 border-[#04061a] bg-navy-950 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`font-pixel flex-1 whitespace-nowrap rounded px-3 py-1.5 text-sm ${value === t.id ? "bg-navy-700 text-gold" : "text-cream-dim hover:text-cream"}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="px-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-cream-faint">{hint}</span>}
    </label>
  );
}

/** Dollar input that only ever hands integer cents to its owner. */
export function MoneyInput({ value, onChange, placeholder = "0.00", id }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  const invalid = value !== "" && parseAudToCents(value) === null;
  return (
    <div className="relative">
      <span className="font-pixel pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-dim">A$</span>
      <input
        id={id}
        className="px-input pl-10"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        style={invalid ? { borderColor: "var(--danger)" } : undefined}
      />
    </div>
  );
}

export function PillarChip({ pillar, level, pct, onClick }: { pillar: Pillar; level: number; pct: number; onClick?: () => void }) {
  const m = PILLAR_META[pillar];
  return (
    <button
      onClick={onClick}
      className="group flex min-w-0 items-center gap-1.5 rounded border-2 border-[#04061a] bg-navy-900/85 px-1.5 py-1 text-left backdrop-blur hover:bg-navy-800"
      aria-label={`${m.name} level ${level}`}
      title={`${m.name} — ${m.world}`}
    >
      <span className="text-base leading-none" aria-hidden>
        {m.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-pixel block whitespace-nowrap text-[11px] leading-none" style={{ color: m.color }}>
          LV {level}
        </span>
        <Bar value={pct} color={m.color} className="mt-1 !h-[7px] w-9 !border sm:w-12" />
      </span>
    </button>
  );
}

const PIXELLAB_PORTRAIT = "/assets/pixellab/sabin/rotations/south.png";
let pixelLabCheck: Promise<boolean> | null = null;

/** True once we know PixelLab art has been synced into /public. */
function usePixelLabArt() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    pixelLabCheck ??= fetch("/assets/pixellab/sabin/manifest.json", { method: "HEAD" })
      .then((r) => r.ok)
      .catch(() => false);
    let alive = true;
    void pixelLabCheck.then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

export function Portrait({
  equipped,
  tier,
  size = 64,
  anim = "idle-down-0",
  art = "pixellab",
}: {
  equipped: Equipped;
  tier: number;
  size?: number;
  anim?: string;
  art?: "pixellab" | "classic";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pixelLab = usePixelLabArt() && art === "pixellab";
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { frames } = buildCharacter(playerLook(equipped, tier));
    const frame = frames.find((f) => f.name === anim) ?? frames[0];
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.px.toCanvas(), 0, 0, 32, 32, 0, 0, canvas.width, canvas.height);
  }, [equipped, tier, anim, pixelLab]);
  if (pixelLab) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny pixel sprite, must not be resampled
    return <img src={PIXELLAB_PORTRAIT} width={size} height={size} alt="" style={{ width: size, height: size, imageRendering: "pixelated" }} aria-hidden />;
  }
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} aria-hidden />;
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="px-card px-3 py-2">
      <div className="font-pixel text-xs text-cream-dim">{label}</div>
      <div className="font-pixel text-lg" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-cream-faint">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-card px-3 py-3 text-sm text-cream-dim">{children}</p>;
}

/** Small async-button helper: disables while the request is in flight. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>) => {
    if (busy) return undefined;
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
