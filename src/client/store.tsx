"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACHIEVEMENTS_BY_KEY } from "@/lib/shared/achievements";
import { PILLAR_META } from "@/lib/shared/pillars";
import type { GameEvent, GameState, MutationResult } from "@/lib/shared/types";
import { UNLOCKS_BY_KEY } from "@/lib/shared/unlocks";
import { play, setMuted } from "@/game/audio";
import { bridge, type Dialog, type PanelId } from "@/game/bridge";
import { ApiError, api } from "./api";

export interface Toast {
  id: number;
  kind: "xp" | "level" | "unlock" | "achievement" | "info" | "error" | "pr";
  title: string;
  detail?: string;
  color?: string;
}

interface Store {
  state: GameState | null;
  loading: boolean;
  locked: boolean;
  panel: PanelId | null;
  dialog: Dialog | null;
  toasts: Toast[];
  openPanel: (p: PanelId | null) => void;
  setDialog: (d: Dialog | null) => void;
  act: (path: string, body?: unknown, method?: string) => Promise<GameEvent[] | null>;
  refresh: () => Promise<void>;
  setUnlocked: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  dismissWelcome: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useGame() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useGame outside GameProvider");
  return s;
}

/** The loaded state; components rendered under <GameReady> can rely on it. */
export function useGameState(): GameState {
  const { state } = useGame();
  if (!state) throw new Error("Game state not loaded");
  return state;
}

let toastId = 0;

function eventToasts(events: GameEvent[]): Omit<Toast, "id">[] {
  const out: Omit<Toast, "id">[] = [];
  for (const e of events) {
    if (e.type === "xp") out.push({ kind: "xp", title: `+${e.amount} ${PILLAR_META[e.pillar].name} XP`, color: PILLAR_META[e.pillar].color });
    if (e.type === "levelup")
      out.push({
        kind: "level",
        title: e.pillar === "overall" ? `Level ${e.level}!` : `${PILLAR_META[e.pillar].name} level ${e.level}!`,
        detail: e.pillar === "overall" ? "Your character grows stronger." : `${PILLAR_META[e.pillar].world} recognises your effort.`,
        color: e.pillar === "overall" ? "#f2c14e" : PILLAR_META[e.pillar].color,
      });
    if (e.type === "unlock") {
      const u = UNLOCKS_BY_KEY[e.key];
      if (u) out.push({ kind: "unlock", title: `Unlocked: ${u.name}`, detail: u.description, color: PILLAR_META[u.pillar].color });
    }
    if (e.type === "achievement") {
      const a = ACHIEVEMENTS_BY_KEY[e.key];
      if (a) out.push({ kind: "achievement", title: `${a.icon} ${a.name}`, detail: a.xp ? `${a.description} +${a.xp} XP` : a.description, color: "#f2c14e" });
    }
    if (e.type === "pr") out.push({ kind: "pr", title: `New personal record!`, detail: `${e.exercise}: ${e.weightKg} kg`, color: "#e0794f" });
    if (e.type === "cap")
      out.push({ kind: "info", title: "Daily XP cap reached", detail: `${PILLAR_META[e.pillar].name} is maxed for today. Rest is progress too.` });
  }
  return out;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef<GameState | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId;
    setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.kind === "level" || t.kind === "unlock" ? 5200 : 3400);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const apply = useCallback((s: GameState) => {
    stateRef.current = s;
    setState(s);
    setMuted(s.player.settings.muted);
    bridge.emit("state", s);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (err instanceof ApiError && err.status === 423) {
        setLocked(true);
        return;
      }
      play("error");
      toast({ kind: "error", title: err instanceof Error ? err.message : "Something went wrong" });
    },
    [toast],
  );

  const refresh = useCallback(async () => {
    try {
      const { state: s } = await api<{ state: GameState }>(`/api/state${stateRef.current ? "" : "?welcome=1"}`);
      apply(s);
      setLocked(false);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [apply, handleError]);

  const act = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      try {
        const res = await api<MutationResult>(path, { body: body ?? (method === "DELETE" ? undefined : {}), method });
        apply(res.state);
        const events = res.events ?? [];
        if (events.length) {
          bridge.emit("events", events);
          eventToasts(events).forEach(toast);
          if (events.some((e) => e.type === "levelup")) play("levelup");
          else if (events.some((e) => e.type === "unlock" || e.type === "achievement")) play("unlock");
          else if (events.some((e) => e.type === "action" && e.pillar === "financial")) play("coin");
          else if (events.some((e) => e.type === "xp")) play("complete");
        }
        return events;
      } catch (err) {
        handleError(err);
        return null;
      }
    },
    [apply, handleError, toast],
  );

  const openPanel = useCallback((p: PanelId | null) => {
    setPanel(p);
    if (p) setDialog(null);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const offs = [
      bridge.on("open-panel", (p) => openPanel(p)),
      bridge.on("dialog", (d) => setDialog(d)),
      bridge.on("position", (pos) => {
        void api("/api/player/position", { body: pos, keepalive: true }).catch(() => {});
      }),
    ];
    // Pick up changes made on another device when the tab regains focus.
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => document.visibilityState === "visible" && void refresh(), 5 * 60_000);
    return () => {
      clearTimeout(first);
      offs.forEach((o) => o());
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [refresh, openPanel]);

  useEffect(() => {
    bridge.emit("ui-blocking", Boolean(panel || dialog || locked || state?.welcome));
  }, [panel, dialog, locked, state?.welcome]);

  const value = useMemo<Store>(
    () => ({
      state,
      loading,
      locked,
      panel,
      dialog,
      toasts,
      openPanel,
      setDialog,
      act,
      refresh,
      setUnlocked: () => setLocked(false),
      toast,
      dismissToast,
      dismissWelcome: () => {
        if (stateRef.current) apply({ ...stateRef.current, welcome: null });
        void api("/api/welcome/ack", { body: {} }).catch(() => {});
      },
    }),
    [state, loading, locked, panel, dialog, toasts, openPanel, act, refresh, toast, dismissToast, apply],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
