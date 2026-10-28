"use client";

/**
 * Optional, one-off location checks. Nothing here runs unless the player
 * turns on location awareness and presses "Check my location": there is no
 * background tracking (no watchPosition) and coordinates are never stored —
 * they live only in component state for the current tab.
 */
export interface Coordinates {
  lat: number;
  lon: number;
  /** Radius of uncertainty in metres. */
  accuracy: number;
  at: number;
}

export type LocationErrorKind = "unsupported" | "denied" | "unavailable" | "timeout" | "insecure";

export class LocationError extends Error {
  constructor(
    public kind: LocationErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<LocationErrorKind, string> = {
  unsupported: "This browser can't share its location.",
  denied: "Location permission is blocked. Allow it for this site in your browser's settings, then try again.",
  unavailable: "Your device couldn't work out a location right now.",
  timeout: "Finding your location took too long. Try again outdoors or with Wi-Fi on.",
  insecure: "Location only works on a secure (https) connection.",
};

export async function permissionState(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Asks the browser once (prompting for permission if needed). */
export function checkLocation(timeoutMs = 15_000): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return reject(new LocationError("unsupported", MESSAGES.unsupported));
    if (!window.isSecureContext) return reject(new LocationError("insecure", MESSAGES.insecure));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp }),
      (err) => {
        const kind: LocationErrorKind = err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
        reject(new LocationError(kind, MESSAGES[kind]));
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: timeoutMs },
    );
  });
}
