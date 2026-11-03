"use client";

import { useEffect, useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { setLocation, useLocation } from "@/client/location";
import type { Pixels } from "@/game/art/paint";
import { bookshelf, cushion, bonsai, desk, piggyBank, plant, rug, smallDumbbells, sofa, squatRack, weightBench } from "@/game/art/furniture";
import { coinSprite, fox, owl } from "@/game/art/props";
import { play } from "@/game/audio";
import { checkLocation, LocationError } from "@/lib/location/geolocation";
import { EVOLUTION } from "@/lib/shared/campaign";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import { localClock } from "@/lib/shared/time";
import { UNLOCKS_BY_KEY, nextUnlocks, type UnlockDef } from "@/lib/shared/unlocks";
import { PixelArt } from "./panels/common";
import { Bar, PillarChip, Portrait } from "./ui";

function useDarwinClock() {
  const [clock, setClock] = useState(() => localClock());
  useEffect(() => {
    const t = setInterval(() => setClock(localClock()), 20_000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

export function campaignLabel(day: number, total: number) {
  if (day < 1) return `Starts in ${1 - day}d`;
  if (day > total) return "Journey complete";
  return `Day ${day} of ${total}`;
}

/** Everything drawn over the world: status at the top, character and location at the bottom. */
export function Hud() {
  return (
    <>
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-20 flex items-start justify-between gap-2 pt-[env(safe-area-inset-top)] lg:left-3 lg:right-3 lg:top-3">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-1.5 lg:gap-2">
          <PlayerCard />
          <PillarRow />
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 lg:gap-2">
          <DateCard />
          <NavBar />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden items-end gap-3 pb-[env(safe-area-inset-bottom)] md:flex">
        <LocationCard />
        <CharacterBar />
      </div>
    </>
  );
}

function PlayerCard() {
  const s = useGameState();
  const { openPanel } = useGame();
  const o = s.stats.overall;
  return (
    <button className="px-panel flex items-center gap-2 !rounded-md px-2 py-1.5 text-left lg:gap-3 lg:px-3 lg:py-2" onClick={() => openPanel("profile")} aria-label="Open character profile">
      <div className="rounded bg-navy-950 p-0.5 [&>*]:!h-10 [&>*]:!w-10 lg:[&>*]:!h-12 lg:[&>*]:!w-12">
        <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={48} art={s.player.settings.characterArt} />
      </div>
      <div className="min-w-0">
        <div className="font-pixel truncate leading-tight lg:text-xl" data-testid="hud-name">
          {s.player.name}
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-pixel text-xs text-gold lg:text-sm" data-testid="hud-level">
            LV {o.level} · {EVOLUTION[s.campaign.progress.tier].title}
          </span>
          <span className="font-pixel hidden whitespace-nowrap text-xs text-cream-dim lg:inline">
            {o.into} / {o.needed} XP
          </span>
        </div>
        <Bar value={o.pct} className="mt-1 !h-2 w-28 lg:!h-2.5 lg:w-52" label="Overall XP" />
      </div>
    </button>
  );
}

function PillarRow() {
  const s = useGameState();
  const { openPanel } = useGame();
  return (
    <div className="flex gap-1 lg:gap-1.5">
      {PILLARS.map((p) => (
        <PillarChip key={p} pillar={p} level={s.stats.pillars[p].level} pct={s.stats.pillars[p].pct} onClick={() => openPanel(p)} />
      ))}
    </div>
  );
}

function DateCard() {
  const s = useGameState();
  const { openPanel } = useGame();
  const clock = useDarwinClock();
  const time = `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
  const dateLabel = new Date(`${clock.date}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const year = clock.date.slice(0, 4);
  const daytime = clock.hour >= 6 && clock.hour < 18;
  return (
    <div className="px-panel !rounded-md px-2.5 py-1 text-right lg:px-4 lg:py-2">
      <div className="font-pixel text-sm leading-tight lg:text-lg">
        {dateLabel}
        <span className="hidden lg:inline"> {year}</span> · {time}
      </div>
      <div className="mt-0.5 flex flex-col items-end gap-x-4 text-xs sm:flex-row sm:items-center sm:justify-end lg:text-sm">
        <button className="font-pixel whitespace-nowrap text-cream hover:text-gold" onClick={() => (play("click"), openPanel("journey"))} aria-label="Open the 75-day journey" data-testid="hud-campaign">
          <span aria-hidden>{daytime ? "☀️" : "🌙"}</span> <span className="hidden sm:inline">{campaignLabel(s.campaign.dayNumber, s.campaign.totalDays)}</span>
          <span className="sm:hidden">{campaignLabel(s.campaign.dayNumber, s.campaign.totalDays).replace(" of ", "/")}</span>
        </button>
        <span className="font-pixel whitespace-nowrap text-gold" title="Current streak — rest days never break it">
          🔥 {s.stats.streak.current}
          <span className="hidden sm:inline"> day streak</span>
        </span>
      </div>
    </div>
  );
}

const MENUS = [
  ["quests", "📜", "Daily quests (Q)"],
  ["journey", "🗺️", "75-day journey"],
  ["ai", "🤖", "Four Wins AI"],
  ["goals", "🗓️", "Goals & calendar"],
  ["achievements", "🏆", "Trophies"],
  ["settings", "⚙️", "Settings"],
] as const;

function NavBar() {
  const { openPanel } = useGame();
  return (
    <nav className="flex flex-col gap-1 sm:flex-row lg:gap-1.5" aria-label="Menus">
      {MENUS.map(([id, icon, label]) => (
        <button key={id} className="px-btn secondary !h-9 !w-9 !p-0 text-lg lg:!h-11 lg:!w-11 lg:text-xl" onClick={() => (play("click"), openPanel(id))} aria-label={label} title={label}>
          {icon}
        </button>
      ))}
    </nav>
  );
}

/** RPG attributes: all-time missions completed in each pillar. */
const ATTRIBUTES: [Pillar, string, string][] = [
  ["mental", "INT", "Intelligence"],
  ["physical", "STR", "Strength"],
  ["spiritual", "WIS", "Wisdom"],
  ["financial", "WEA", "Wealth"],
];

function CharacterBar() {
  const s = useGameState();
  const { openPanel } = useGame();
  const o = s.stats.overall;
  return (
    <div className="px-panel pointer-events-auto mx-auto flex items-center gap-3 !rounded-md px-3 py-2" data-testid="character-bar">
      <button className="flex items-center gap-3 text-left" onClick={() => openPanel("profile")} aria-label="Open character sheet">
        <div className="rounded bg-navy-950 p-0.5">
          <Portrait equipped={s.player.equipped} tier={s.body.physiqueTier} size={44} art={s.player.settings.characterArt} />
        </div>
        <div className="w-40 lg:w-52">
          <div className="font-pixel truncate text-sm text-gold">
            LV {o.level} · {EVOLUTION[s.campaign.progress.tier].title}
          </div>
          <Bar value={o.pct} className="mt-1 !h-2.5" label="Overall XP" />
          <div className="font-pixel mt-0.5 text-right text-xs text-cream-dim">
            {o.into} / {o.needed} XP
          </div>
        </div>
      </button>
      <div className="h-10 w-0.5 bg-navy-700" aria-hidden />
      <div className="flex gap-1.5">
        {ATTRIBUTES.map(([p, abbr, name]) => {
          const n = s.stats.missionsDone[p];
          return (
            <button
              key={p}
              className="px-card flex items-center gap-1.5 px-2 py-1 hover:bg-navy-800"
              onClick={() => openPanel(p)}
              title={`${name}: ${n} ${PILLAR_META[p].name} mission${n === 1 ? "" : "s"} completed`}
              aria-label={`${name} ${n}`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {PILLAR_META[p].icon}
              </span>
              <span className="text-left">
                <span className="font-pixel block text-[11px] leading-none text-cream-dim">{abbr}</span>
                <span className="font-pixel block text-lg leading-none" style={{ color: PILLAR_META[p].color }}>
                  {n}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Optional one-off location check. Off by default; coordinates stay in this tab. */
function LocationCard() {
  const s = useGameState();
  const { act } = useGame();
  const coords = useLocation();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const enabled = s.player.settings.locationAwareness;

  const check = async () => {
    setChecking(true);
    setError("");
    try {
      setLocation(await checkLocation());
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location.");
    } finally {
      setChecking(false);
    }
  };
  const turn = (on: boolean) => {
    if (!on) setLocation(null);
    setError("");
    void act("/api/player/settings", { locationAwareness: on }, "PATCH");
  };

  return (
    <section className="px-panel pointer-events-auto hidden w-60 shrink-0 p-2.5 min-[1180px]:block" aria-labelledby="loc-title" data-testid="location-card">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 id="loc-title" className="font-pixel text-sm">
          📍 Current Location
        </h2>
        {enabled && coords && (
          <button className="px-ghost !px-1 text-sm" onClick={() => void check()} disabled={checking} aria-label="Check location again" title="Check again">
            ↻
          </button>
        )}
      </div>
      {!enabled ? (
        <>
          <p className="text-xs text-cream-dim">Off. Location is never tracked — turn this on to check where you are, once, when you ask.</p>
          <button className="px-btn secondary small mt-2 w-full" onClick={() => turn(true)}>
            Turn on
          </button>
        </>
      ) : coords ? (
        <>
          <div className="loc-radar relative h-16 overflow-hidden rounded border-2 border-[#04061a]" aria-hidden>
            <span className="loc-dot absolute left-1/2 top-1/2" />
          </div>
          <p className="font-pixel mt-1.5 text-xs">
            {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
          </p>
          <p className="text-[11px] text-cream-faint">
            ±{Math.round(coords.accuracy)} m · checked {new Date(coords.at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} · not saved
          </p>
          <button className="px-btn secondary small mt-2 w-full" onClick={() => turn(false)}>
            Disable GPS
          </button>
        </>
      ) : (
        <>
          <button className="px-btn small w-full" onClick={() => void check()} disabled={checking} data-testid="location-card-check">
            {checking ? "Locating…" : "📍 Check my location"}
          </button>
          {error && (
            <p className="mt-1.5 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
          <button className="px-ghost mt-1 w-full text-xs" onClick={() => turn(false)}>
            Turn off
          </button>
        </>
      )}
    </section>
  );
}

const ITEM_ART: Record<string, () => Pixels> = {
  desk_lamp: () => desk(false, true),
  bookshelf,
  better_desk: () => desk(true, true),
  dumbbells: smallDumbbells,
  weight_bench: weightBench,
  squat_rack: squatRack,
  house_plant: plant,
  meditation_cushion: cushion,
  bonsai,
  piggy_bank: piggyBank,
  cozy_rug: rug,
  comfy_sofa: sofa,
  owl_companion: () => owl(0),
  spirit_fox: () => fox(0),
  coin_sprite: () => coinSprite(0),
};
const KIND_ICON: Record<UnlockDef["kind"], string> = { outfit: "👕", hat: "🧢", aura: "✨", companion: "🐾", effect: "✨", home: "🏠", building: "🏛️" };

function ItemIcon({ def }: { def: UnlockDef }) {
  const art = ITEM_ART[def.key];
  if (art) return <PixelArt draw={art} scale={2} fit={26} />;
  return (
    <span className="text-xl leading-none" aria-hidden>
      {KIND_ICON[def.kind]}
    </span>
  );
}

const HOTBAR_SLOTS = 7;

/** Backpack plus the newest things you've earned; the rest preview what unlocks next. */
export function Hotbar() {
  const s = useGameState();
  const { openPanel } = useGame();
  const equipped = new Set(Object.values(s.player.equipped));
  const earned = s.unlocks
    .map((u) => UNLOCKS_BY_KEY[u.key])
    .filter((u): u is UnlockDef => Boolean(u))
    .reverse()
    .slice(0, HOTBAR_SLOTS);
  const levels = Object.fromEntries(PILLARS.map((p) => [p, s.stats.pillars[p].level])) as Record<Pillar, number>;
  const upcoming = nextUnlocks(levels).slice(0, HOTBAR_SLOTS - earned.length);
  const empty = HOTBAR_SLOTS - earned.length - upcoming.length;
  return (
    <nav className="px-panel flex gap-1.5 p-2" aria-label="Items" data-testid="hotbar">
      <button className="hotbar-slot !border-gold/70 text-2xl" onClick={() => openPanel("profile")} aria-label="Backpack — equipment" title="Backpack — equipment">
        🎒
      </button>
      {earned.map((u) => (
        <button
          key={u.key}
          className={`hotbar-slot ${equipped.has(u.key) ? "!border-gold" : ""}`}
          style={{ boxShadow: `inset 0 -3px 0 ${PILLAR_META[u.pillar].color}88` }}
          onClick={() => openPanel("profile")}
          title={`${u.name} — ${u.description}${equipped.has(u.key) ? " (equipped)" : ""}`}
          aria-label={u.name}
        >
          <ItemIcon def={u} />
        </button>
      ))}
      {upcoming.map((u) => (
        <div key={u.key} className="hotbar-slot relative opacity-45 grayscale" title={`${u.name} — unlocks at ${PILLAR_META[u.pillar].name} level ${u.level}`}>
          <ItemIcon def={u} />
          <span className="font-pixel absolute bottom-0 right-0.5 text-[9px] text-cream">🔒{u.level}</span>
        </div>
      ))}
      {Array.from({ length: Math.max(0, empty) }, (_, i) => (
        <div key={i} className="hotbar-slot" aria-hidden />
      ))}
    </nav>
  );
}
