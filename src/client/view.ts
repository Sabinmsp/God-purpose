"use client";

import { useSyncExternalStore } from "react";

export type View = "today" | "progress" | "world";

const listeners = new Set<() => void>();
let current: View = "today";

export function getView(): View {
  return current;
}

export function setView(view: View) {
  current = view;
  listeners.forEach((listener) => listener());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Null during server render and hydration, so nothing flashes the wrong screen. */
export function useView(): View | null {
  return useSyncExternalStore(subscribe, getView, () => null);
}
