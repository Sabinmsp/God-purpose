"use client";

import { useState } from "react";
import { api } from "@/client/api";
import { useGame, useGameState } from "@/client/store";
import { setMuted } from "@/game/audio";
import { ACHIEVEMENTS } from "@/lib/shared/achievements";
import { PILLARS, PILLAR_META } from "@/lib/shared/pillars";
import { addDays, formatShortDate, startOfWeek } from "@/lib/shared/time";
import { EQUIP_SLOTS, PHYSIQUE_NAMES, UNLOCKS, type EquipSlot } from "@/lib/shared/unlocks";
import { Bar, Field, Portrait, Section, Sheet, Tabs, useBusy } from "../ui";
import { GoalCard, GoalEditor } from "./common";

const SLOT_LABEL: Record<EquipSlot, string> = { outfit: "Outfit", hat: "Headwear", aura: "Aura", companion: "Companion" };

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const { act } = useGame();
  const { busy, run } = useBusy();
  const levels = Object.fromEntries(PILLARS.map((p) => [p, s.stats.pillars[p].level]));
  return (
    <Sheet title={s.player.name} subtitle={`${s.player.characterClass} · started at age ${s.player.startingAge}`} icon="👤" onClose={onClose}>
      <div className="px-card mb-4 flex items-center gap-4 p-3">
        <div className="rounded bg-navy-950 p-2">
          <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={112} art={s.player.settings.characterArt} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-3xl text-gold">Level {s.stats.overall.level}</div>
          <Bar value={s.stats.overall.pct} className="mt-2" label="Overall level progress" />
          <div className="mt-1 text-xs text-cream-dim">
            {s.stats.overall.totalXp.toLocaleString()} total XP · {s.stats.overall.into}/{s.stats.overall.needed} to next
          </div>
          <div className="mt-2 text-xs text-cream-dim">
            Physique: <span className="text-physical">{PHYSIQUE_NAMES[s.body.physiqueTier]}</span> · Best streak {s.stats.streak.best}
          </div>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        {PILLARS.map((p) => (
          <div key={p} className="px-card p-2">
            <div className="flex justify-between">
              <span className="font-pixel text-sm" style={{ color: PILLAR_META[p].color }}>
                {PILLAR_META[p].icon} {PILLAR_META[p].name}
              </span>
              <span className="font-pixel text-sm">Lv {s.stats.pillars[p].level}</span>
            </div>
            <Bar value={s.stats.pillars[p].pct} color={PILLAR_META[p].color} className="mt-1" />
            <div className="mt-0.5 text-[11px] text-cream-faint">{s.stats.pillars[p].xp.toLocaleString()} XP</div>
          </div>
        ))}
      </div>
      <Section title="Equipment">
        {s.player.settings.characterArt !== "classic" && (
          <p className="mb-2 text-xs text-cream-faint">Outfits, headwear and physique show on Classic art (Settings). Auras and companions show on both.</p>
        )}
        <div className="space-y-3">
          {EQUIP_SLOTS.map((slot) => {
            const items = UNLOCKS.filter((u) => u.kind === slot);
            return (
              <div key={slot}>
                <span className="px-label">{SLOT_LABEL[slot]}</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className={`px-btn small ${!s.player.equipped[slot] ? "" : "secondary"}`}
                    disabled={busy}
                    onClick={() => run(() => act("/api/player/equip", { slot, key: null }))}
                  >
                    {slot === "outfit" ? "Casual" : "None"}
                  </button>
                  {items.map((u) => {
                    const unlocked = levels[u.pillar] >= u.level;
                    const on = s.player.equipped[slot] === u.key;
                    return (
                      <button
                        key={u.key}
                        className={`px-btn small ${on ? "" : "secondary"}`}
                        disabled={busy || !unlocked}
                        title={unlocked ? u.description : `${PILLAR_META[u.pillar].name} level ${u.level}`}
                        onClick={() => run(() => act("/api/player/equip", { slot, key: u.key }))}
                      >
                        {unlocked ? u.name : `🔒 ${u.name} · ${PILLAR_META[u.pillar].name.slice(0, 4)} ${u.level}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Unlock history">
        {s.unlocks.length ? (
          <ul className="space-y-1 text-sm">
            {s.unlocks
              .slice()
              .reverse()
              .map((u) => {
                const def = UNLOCKS.find((x) => x.key === u.key);
                return (
                  <li key={u.key} className="px-card flex justify-between px-3 py-1.5">
                    <span>{def?.name ?? u.key}</span>
                    <span className="text-xs text-cream-dim">{new Date(u.unlockedAt).toLocaleDateString("en-AU", { timeZone: "Australia/Darwin" })}</span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">Nothing yet — your first unlock arrives at level 2 in any pillar.</p>
        )}
      </Section>
    </Sheet>
  );
}

function Calendar() {
  const s = useGameState();
  const month = s.calendar.month;
  const first = `${month}-01`;
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).filter((d, i) => i < 35 || d.startsWith(month));
  const byDate = new Map(s.calendar.days.map((d) => [d.date, d]));
  const deadlines = new Map<string, string[]>();
  for (const g of s.goals) if (g.targetDate) deadlines.set(g.targetDate, [...(deadlines.get(g.targetDate) ?? []), g.title]);
  const max = Math.max(100, ...s.calendar.days.map((d) => d.xp));
  const monthName = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div>
      <h4 className="font-pixel mb-2 text-lg">{monthName}</h4>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="font-pixel text-xs text-cream-faint">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const p = byDate.get(d);
          const inMonth = d.startsWith(month);
          const isToday = d === s.now.date;
          const intensity = p ? p.xp / max : 0;
          return (
            <div
              key={d}
              className={`relative aspect-square rounded border-2 text-[11px] ${isToday ? "border-gold" : "border-[#04061a]"} ${inMonth ? "" : "opacity-25"}`}
              style={{ background: p?.rest ? "#26305f" : intensity ? `rgba(242,193,78,${0.15 + intensity * 0.75})` : "var(--navy-950)" }}
              title={`${d}${p ? ` · ${p.xp} XP · ${p.quests} quests` : ""}${deadlines.has(d) ? ` · Deadline: ${deadlines.get(d)!.join(", ")}` : ""}`}
            >
              <span className={`absolute left-1 top-0.5 ${intensity > 0.5 ? "text-[#2a1a05]" : "text-cream-dim"}`}>{Number(d.slice(8))}</span>
              {p && p.pillars.length > 0 && (
                <span className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-px">
                  {p.pillars.map((pl) => (
                    <span key={pl} className="h-1 w-1" style={{ background: PILLAR_META[pl].color }} />
                  ))}
                </span>
              )}
              {p?.rest && <span className="absolute right-0.5 top-0.5 text-[9px]">💤</span>}
              {deadlines.has(d) && <span className="absolute right-0.5 top-0.5 text-[9px]">🚩</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-cream-faint">Gold intensity = XP earned that day. Dots = pillars won. 💤 rest day · 🚩 goal deadline.</p>
    </div>
  );
}

export function GoalsPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const [tab, setTab] = useState<"goals" | "calendar">("goals");
  const [adding, setAdding] = useState<string | null>(null);
  const weekNo = s.week.filter((d) => d.quests > 0).length;
  return (
    <Sheet title="Goals & Calendar" subtitle={`Australia/Darwin · ${formatShortDate(s.now.date)} · week ${weekNo}/7 active days`} icon="🗓️" onClose={onClose} wide>
      <Tabs
        tabs={[
          { id: "goals", label: "Goals" },
          { id: "calendar", label: "Habit calendar" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "calendar" && <Calendar />}
      {tab === "goals" &&
        PILLARS.map((p) => (
          <Section
            key={p}
            title={`${PILLAR_META[p].icon} ${PILLAR_META[p].name}`}
            right={
              <button className="px-ghost text-xs" onClick={() => setAdding(adding === p ? null : p)}>
                + Goal
              </button>
            }
          >
            <div className="grid gap-2 lg:grid-cols-2">
              {adding === p && <GoalEditor pillar={p} onDone={() => setAdding(null)} />}
              {s.goals
                .filter((g) => g.pillar === p)
                .map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
            </div>
          </Section>
        ))}
    </Sheet>
  );
}

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const earned = new Map(s.achievements.map((a) => [a.key, a.earnedAt]));
  return (
    <Sheet title="Trophy Room" subtitle={`${earned.size} of ${ACHIEVEMENTS.length} earned`} icon="🏆" onClose={onClose} wide>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const at = earned.get(a.key);
          return (
            <li key={a.key} className={`px-card p-3 ${at ? "" : "opacity-45 grayscale"}`} data-earned={Boolean(at)}>
              <div className="text-2xl" aria-hidden>
                {at ? a.icon : "🔒"}
              </div>
              <div className="font-pixel mt-1 leading-tight text-gold">{a.name}</div>
              <div className="text-xs text-cream-dim">{a.description}</div>
              {a.xp > 0 && <div className="font-pixel mt-1 text-xs text-financial">+{a.xp} XP</div>}
              {at && <div className="mt-1 text-[11px] text-cream-faint">{new Date(at).toLocaleDateString("en-AU", { timeZone: "Australia/Darwin" })}</div>}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useGameState();
  const { act, toast } = useGame();
  const { busy, run } = useBusy();
  const st = s.player.settings;
  const [name, setName] = useState(s.player.name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pin, setPin] = useState({ current: "", pin: "" });

  const toggle = (key: "muted" | "reducedMotion" | "showSidePanel") =>
    run(async () => {
      if (key === "muted") setMuted(!st.muted);
      await act("/api/player/settings", { [key]: !st[key] }, "PATCH");
    });

  return (
    <Sheet title="Settings" icon="⚙️" onClose={onClose}>
      <Section title="Player">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => act("/api/player/settings", { displayName: name.trim() }, "PATCH"));
          }}
        >
          <input className="px-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          <button className="px-btn" disabled={busy || !name.trim()}>
            Save
          </button>
        </form>
      </Section>
      <Section title="Game">
        <div className="space-y-2">
          {(
            [
              ["muted", st.muted ? "🔇 Sound off" : "🔊 Sound on"],
              ["reducedMotion", st.reducedMotion ? "Reduced motion: on" : "Reduced motion: off"],
              ["showSidePanel", st.showSidePanel ? "Desktop side panel: shown" : "Desktop side panel: hidden"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} className="px-btn secondary w-full !justify-start" aria-pressed={st[key]} onClick={() => toggle(key)} disabled={busy}>
              {label}
            </button>
          ))}
          <button
            className="px-btn secondary w-full !justify-start"
            disabled={busy}
            onClick={() => run(() => act("/api/player/settings", { characterArt: st.characterArt === "classic" ? "pixellab" : "classic" }, "PATCH"))}
          >
            🎨 Character art: {st.characterArt === "classic" ? "Classic (shows outfits & physique)" : "PixelLab"}
          </button>
          <Field label={`Text size: ${Math.round(st.textScale * 100)}%`}>
            <input
              type="range"
              min={0.85}
              max={1.4}
              step={0.05}
              defaultValue={st.textScale}
              className="w-full accent-[var(--gold)]"
              onChange={(e) => document.documentElement.style.setProperty("--text-scale", e.target.value)}
              onPointerUp={(e) => act("/api/player/settings", { textScale: Number((e.target as HTMLInputElement).value) }, "PATCH")}
              onKeyUp={(e) => act("/api/player/settings", { textScale: Number((e.target as HTMLInputElement).value) }, "PATCH")}
            />
          </Field>
          <p className="text-xs text-cream-faint">Controls: WASD / arrows to move · Shift to run · E or Space to interact · Q for quests · Esc to close.</p>
        </div>
      </Section>
      <Section title="Security">
        {s.security.weakPassword && (
          <p className="px-card mb-3 border-l-4 !border-l-[var(--danger)] p-3 text-sm">
            ⚠️ Your access password is short or numeric-only. Before storing real financial records on a public URL, switch to a long passphrase and keep a short PIN for quick unlocks.
          </p>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) return toast({ kind: "error", title: "New passwords don't match" });
            void run(async () => {
              try {
                await api("/api/auth/password", { body: { currentPassword: pw.current, newPassword: pw.next } });
                setPw({ current: "", next: "", confirm: "" });
                toast({ kind: "info", title: "Password changed", detail: "Other devices were signed out." });
              } catch (err) {
                toast({ kind: "error", title: err instanceof Error ? err.message : "Could not change password" });
              }
            });
          }}
        >
          <span className="px-label">Change password</span>
          <input className="px-input" type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="px-input" type="password" autoComplete="new-password" placeholder="New passphrase (12+ characters recommended)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} minLength={4} />
          <input className="px-input" type="password" autoComplete="new-password" placeholder="Repeat new passphrase" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          <button className="px-btn w-full" disabled={busy || !pw.current || pw.next.length < 4}>
            Update password
          </button>
        </form>
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => act("/api/auth/pin", { currentPassword: pin.current, pin: pin.pin || null }));
            setPin({ current: "", pin: "" });
          }}
        >
          <span className="px-label">Unlock PIN {s.security.pinEnabled ? "(enabled)" : "(off)"}</span>
          <p className="text-xs text-cream-faint">With a PIN set, sessions idle for 12 hours lock and ask for the PIN. Five wrong PINs sign you out.</p>
          <input className="px-input" type="password" autoComplete="current-password" placeholder="Current password" value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value })} />
          <input className="px-input" inputMode="numeric" pattern="\d{4,8}" placeholder={s.security.pinEnabled ? "New PIN (leave empty to remove)" : "4–8 digit PIN"} value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, "") })} />
          <button className="px-btn secondary w-full" disabled={busy || !pin.current}>
            {pin.pin ? "Set PIN" : s.security.pinEnabled ? "Remove PIN" : "Set PIN"}
          </button>
        </form>
      </Section>
      <Section title="Your data">
        <p className="mb-2 text-sm text-cream-dim">Download a full JSON backup of your quests, XP, workouts, measurements, journal, money and goals.</p>
        <a className="px-btn secondary w-full" href="/api/export" download>
          ⬇ Export backup
        </a>
      </Section>
      <button
        className="px-btn danger w-full"
        onClick={async () => {
          await api("/api/auth/logout", { body: {} }).catch(() => {});
          window.location.replace("/login");
        }}
      >
        Log out
      </button>
    </Sheet>
  );
}

const QUESTIONS = [
  ["focus_today", "What should I focus on today?"],
  ["gym_consistency", "How is my gym consistency?"],
  ["tuition_progress", "Am I making progress toward tuition?"],
  ["neglected_habit", "Which habit am I neglecting?"],
  ["improve_week", "What should I improve this week?"],
] as const;

export function GuidePanel({ onClose }: { onClose: () => void }) {
  const { toast } = useGame();
  const { busy, run } = useBusy();
  const [answer, setAnswer] = useState<{ title: string; lines: string[]; basis: string } | null>(null);
  return (
    <Sheet title="The Guide" subtitle="Answers from your own records" icon="🧙" onClose={onClose}>
      <p className="mb-4 text-sm text-cream-dim">
        The Guide reads only what you&apos;ve logged — quests, workouts, vaults and journal — and never invents progress. It works without any AI subscription.
      </p>
      <div className="mb-4 grid gap-2">
        {QUESTIONS.map(([id, label]) => (
          <button
            key={id}
            className="px-btn secondary !justify-start text-left"
            disabled={busy}
            onClick={() =>
              run(async () => {
                try {
                  const res = await api<{ answer: { title: string; lines: string[]; basis: string } }>("/api/guide", { body: { question: id } });
                  setAnswer(res.answer);
                } catch (err) {
                  toast({ kind: "error", title: err instanceof Error ? err.message : "The Guide is quiet right now" });
                }
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {answer && (
        <article className="px-card p-4 anim-pop" aria-live="polite">
          <h3 className="font-pixel mb-2 text-lg text-gold">{answer.title}</h3>
          <ul className="space-y-2">
            {answer.lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold">▸</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-cream-faint">{answer.basis}</p>
        </article>
      )}
    </Sheet>
  );
}
