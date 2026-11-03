"use client";

import { useSyncExternalStore } from "react";

/**
 * Which screen the app shows: the calm "today" view (default on phones) or the
 * pixel world (default on larger screens). The choice is a per-device
 * convenience kept in localStorage; it holds no game data.
 */
export type View = "today" | "world";

const KEY = "fw:view";
const listeners = new Set<() => void>();
let current: View | null = null;

function initial(): View {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "today" || saved === "world") return saved;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia("(max-width: 767px)").matches ? "today" : "world";
}

export function getView(): View {
  if (current === null) current = initial();
  return current;
}

export function setView(v: View) {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Null during server render and hydration, so nothing flashes the wrong screen. */
export function useView(): View | null {
  return useSyncExternalStore(subscribe, getView, () => null);
}
