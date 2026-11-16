"use client";

import { useCallback, useEffect, useState } from "react";
import { disablePush, enablePush, pushStatus, sendTestPush, syncPush, type PushSupport } from "@/client/push";
import { useGame, useGameState } from "@/client/store";
import { SLOT_TIMES, type ReminderLevel } from "@/lib/shared/nudge";
import { useBusy } from "./ui";

const SNOOZE_KEY = "fw:reminders-later";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** This device's reminder status, plus the actions that change it. */
function useReminders() {
  const s = useGameState();
  const { applyResult, toast } = useGame();
  const { busy, run } = useBusy();
  const [status, setStatus] = useState<PushSupport | null>(null);
  const key = s.reminders.publicKey;

  useEffect(() => {
    let live = true;
    void pushStatus().then((st) => {
      if (!live) return;
      setStatus(st);
      if (st === "on") void syncPush(key);
    });
    return () => {
      live = false;
    };
  }, [key]);

  const fail = useCallback((err: unknown) => toast({ kind: "error", title: err instanceof Error ? err.message : "Reminders could not be changed" }), [toast]);

  const turnOn = () =>
    run(async () => {
      try {
        applyResult(await enablePush(key));
        setStatus("on");
        // Prove it works straight away: the first nudge arrives while they are still looking.
        await sendTestPush().catch(() => {});
        toast({ kind: "info", title: "Reminders are on", detail: "A sample just landed in your notifications." });
      } catch (err) {
        setStatus(await pushStatus());
        fail(err);
      }
    });

  const turnOff = () =>
    run(async () => {
      try {
        const res = await disablePush();
        if (res) applyResult(res);
        setStatus(await pushStatus());
      } catch (err) {
        fail(err);
      }
    });

  const test = () =>
    run(async () => {
      try {
        const { delivered } = await sendTestPush();
        toast(delivered ? { kind: "info", title: "Sent. Check your notifications." } : { kind: "error", title: "No device accepted it. Turn reminders off and on again." });
      } catch (err) {
        fail(err);
      }
    });

  return { status, busy, turnOn, turnOff, test };
}

const BLOCKED_HELP = "Notifications are blocked for this site. Tap the icon left of the address bar → Permissions → Notifications → Allow, then reload.";
const INSTALL_HELP = "On iPhone and iPad, reminders work once the game is on your Home Screen: tap Share → Add to Home Screen, then open it from there.";

/**
 * The invitation on the Today screen. Shown until this device has reminders
 * on, because a game you have to remember to open cannot help on the days
 * you forget it exists.
 */
export function ReminderCard({ floating = false }: { floating?: boolean }) {
  const { status, busy, turnOn } = useReminders();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHidden(snoozed()), 0);
    return () => clearTimeout(t);
  }, []);
  if (!status || status === "on" || status === "unsupported" || hidden) return null;
  // Over the world it is an interruption, so it only appears when one tap can act on it.
  if (floating && status !== "ready") return null;
  const later = (
    <button
      className={status === "ready" ? "px-btn secondary" : "shrink-0 rounded-full px-2.5 py-1 text-xs text-cream-faint transition-colors hover:bg-white/5 hover:text-cream"}
      onClick={() => {
        try {
          localStorage.setItem(SNOOZE_KEY, String(Date.now()));
        } catch {
          /* storage blocked */
        }
        setHidden(true);
      }}
    >
      Not now
    </button>
  );
  return (
    <section
      // Floating over the world on a phone, it sits above the touch joystick and
      // action buttons (which reach ~9.75rem up from the bottom), never on them:
      // covering them would leave the character unable to move until dismissed.
      className={`${status === "ready" ? "border-gold/40 p-5" : "px-4 py-3"} card ${
        floating ? "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] z-30 mx-auto max-w-md shadow-2xl md:bottom-auto md:top-28" : ""
      }`}
      data-testid="reminder-card"
      aria-labelledby="reminder-card-title"
    >
      <h2 id="reminder-card-title" className={status === "ready" ? "font-semibold" : "text-sm font-semibold text-cream-dim"}>
        🔔 Let Four Wins come to you
      </h2>
      {status === "ready" ? (
        <>
          <p className="mt-1 text-sm text-cream-dim">
            Three small nudges a day ({SLOT_TIMES.morning}, {SLOT_TIMES.midday}, {SLOT_TIMES.evening}), each with one step and a <b>Done</b> button. You can win the day from your
            lock screen without opening the game.
          </p>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button className="px-btn" disabled={busy} onClick={turnOn} data-testid="reminders-on">
              Turn on reminders
            </button>
            {later}
          </div>
        </>
      ) : (
        <div className="mt-1 flex items-start gap-2">
          <p className="flex-1 text-xs leading-relaxed text-cream-faint">{status === "blocked" ? BLOCKED_HELP : INSTALL_HELP}</p>
          {later}
        </div>
      )}
    </section>
  );
}

const LEVELS: { id: ReminderLevel; label: string; hint: string }[] = [
  { id: "standard", label: "3 a day", hint: `${SLOT_TIMES.morning}, ${SLOT_TIMES.midday} and ${SLOT_TIMES.evening}` },
  { id: "gentle", label: "1 a day", hint: `${SLOT_TIMES.evening} only` },
  { id: "off", label: "Paused", hint: "No nudges on any device" },
];

/** Settings → Reminders. */
export function RemindersSection() {
  const s = useGameState();
  const { act } = useGame();
  const { status, busy, turnOn, turnOff, test } = useReminders();
  const level = s.player.settings.reminders;
  return (
    <div className="space-y-3" data-testid="reminders-section">
      <p className="text-sm text-cream-dim">
        Nudges arrive as phone notifications with a <b>Done</b> button, so a win takes one tap from the lock screen. They stop for the day once all four wins are in, and stay silent on rest
        days. Times are Darwin time and can land up to an hour late.
      </p>
      {status === "on" ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="px-btn secondary" disabled={busy} onClick={test}>
            Send one now
          </button>
          <button className="px-btn secondary" disabled={busy} onClick={turnOff}>
            Turn off here
          </button>
        </div>
      ) : status === "ready" ? (
        <button className="px-btn w-full" disabled={busy} onClick={turnOn}>
          🔔 Turn on reminders on this device
        </button>
      ) : (
        <p className="px-card p-3 text-sm">{status === "blocked" ? BLOCKED_HELP : status === "needs-install" ? INSTALL_HELP : "This browser can't show reminders. Open the game in Chrome, Edge, Firefox or Safari."}</p>
      )}
      <div>
        <span className="px-label">How often</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How often">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={level === l.id}
              className={`px-btn small ${level === l.id ? "" : "secondary"}`}
              title={l.hint}
              onClick={() => act("/api/player/settings", { reminders: l.id }, "PATCH")}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-cream-faint">
          {LEVELS.find((l) => l.id === level)?.hint} · on {s.reminders.devices} device{s.reminders.devices === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
