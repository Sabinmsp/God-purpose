"use client";

import { api } from "./api";
import type { MutationResult } from "@/lib/shared/types";

/**
 * Browser side of reminders: one service worker, one push subscription per
 * device. Nothing secret lives here; the subscription only lets our own
 * server (holding the matching private key) send this device a message.
 */
export type PushSupport =
  | "ready" // can be turned on
  | "on" // this device is subscribed
  | "blocked" // notifications were denied in the browser's site settings
  | "needs-install" // iPhone/iPad: only works once added to the Home Screen
  | "unsupported";

const SW_URL = "/sw.js";
/** One re-sync per page load is plenty. */
let synced = false;

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

function register() {
  return navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
}

export async function pushStatus(): Promise<PushSupport> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return typeof window !== "undefined" && isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "ready";
  } catch {
    return "unsupported";
  }
}

/** Asks for permission (must run from a tap), subscribes this device and tells the server. */
export async function enablePush(publicKey: string): Promise<MutationResult> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked for this site" : "Notifications were not allowed");
  const reg = await register();
  await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // Private/incognito windows and some locked-down browsers have no push service.
    throw new Error("This browser window can't receive notifications. Try a normal (not private) window.");
  }
  return api<MutationResult>("/api/push/subscribe", { body: sub.toJSON() });
}

export async function disablePush(): Promise<MutationResult | null> {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return api<MutationResult>("/api/push/subscribe", { method: "DELETE", body: { endpoint } });
}

/**
 * Runs quietly on every visit: keeps the worker current and re-sends this
 * device's subscription, so a browser that rotated its endpoint (or a server
 * whose key changed) heals itself without the player doing anything.
 */
export async function syncPush(publicKey: string): Promise<void> {
  if (synced || (await pushStatus()) !== "on") return;
  synced = true;
  try {
    const reg = await register();
    const key = keyBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    if (sub) await api("/api/push/subscribe", { body: sub.toJSON() });
  } catch {
    /* reminders are a convenience; never get in the way of the game */
  }
}

export const sendTestPush = () => api<{ delivered: number }>("/api/push/test", { body: {} });
