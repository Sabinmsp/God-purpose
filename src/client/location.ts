"use client";

import { useSyncExternalStore } from "react";
import type { Coordinates } from "@/lib/location/geolocation";

// The last one-off location check lives only in memory for this tab; it is
// never saved anywhere. Shared by the HUD card and the AI panel.
let current: Coordinates | null = null;
const listeners = new Set<() => void>();

export function getLocation() {
  return current;
}

export function setLocation(c: Coordinates | null) {
  current = c;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLocation() {
  return useSyncExternalStore(subscribe, getLocation, () => null);
}
