// Four Wins service worker: shows reminders and runs their buttons.
// It caches nothing, so the game itself always comes fresh from the server.

const ICON = "/icon-192.png";
const BADGE = "/badge-96.png";
const TAG = "fw-nudge";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/**
 * Shows the i-th suggestion of a payload. Android shows at most two buttons.
 * `quiet` updates the notification in place without buzzing again: used for
 * everything that follows the player's own tap.
 */
function show(payload, i, quiet) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const index = items.length ? i % items.length : 0;
  const current = items[index];
  const actions = [];
  if (current && current.token) actions.push({ action: "done", title: "✅ Done" });
  if (payload.undo) actions.push({ action: "undo", title: "↩ Undo" });
  else if (items.length > 1) actions.push({ action: "another", title: "🔁 Another" });
  return self.registration.showNotification(payload.title || "Four Wins", {
    body: current ? current.body : payload.fallback || "",
    icon: ICON,
    badge: BADGE,
    tag: TAG,
    renotify: !quiet,
    silent: Boolean(quiet),
    actions,
    data: { payload, index },
  });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  event.waitUntil(show(payload, 0));
});

async function act(token, action, url) {
  try {
    const res = await fetch("/api/push/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action }),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.payload) return show(data.payload, 0, true);
    return show({ title: "Four Wins", fallback: data.error || "That didn't save. Tap to open the game.", url }, 0, true);
  } catch {
    return show({ title: "Four Wins", fallback: "You're offline, so that didn't save. Tap to open the game.", url }, 0, true);
  }
}

async function openGame(url) {
  const target = new URL(url || "/", self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) await client.navigate(target).catch(() => {});
      return;
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const payload = data.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const current = items[data.index || 0];
  event.notification.close();
  if (event.action === "done" && current && current.token) event.waitUntil(act(current.token, "complete", payload.url));
  else if (event.action === "undo" && payload.undo) event.waitUntil(act(payload.undo, "undo", payload.url));
  else if (event.action === "another") event.waitUntil(show(payload, (data.index || 0) + 1, true));
  else event.waitUntil(openGame(payload.url));
});
