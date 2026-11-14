import "server-only";
import { sendNotification } from "web-push";
import { vapidKeys, vapidSubject } from "./vapid";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = "ok" | "gone" | "failed";

/** Sends one encrypted message to one device. */
export type PushSender = (target: PushTarget, payload: string, origin?: string) => Promise<PushResult>;

/** Undelivered reminders are dropped after this long: a morning nudge must not arrive at night. */
const TTL_SECONDS = 3 * 60 * 60;

const realSender: PushSender = async (target, payload, origin) => {
  const { publicKey, privateKey } = vapidKeys();
  try {
    await sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      vapidDetails: { subject: vapidSubject(origin), publicKey, privateKey },
      TTL: TTL_SECONDS,
      // High urgency wakes a dozing phone; the topic makes a newer nudge replace an undelivered older one.
      urgency: "high",
      topic: "fw-nudge",
      timeout: 10_000,
    });
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the browser dropped this subscription (uninstalled, permission revoked, key rotated).
    if (status === 404 || status === 410) return "gone";
    console.error("[push] send failed", status ?? (err instanceof Error ? err.message : err));
    return "failed";
  }
};

const globalForPush = globalThis as unknown as { __fourWinsPushSender?: PushSender };

export const pushSender = (): PushSender => globalForPush.__fourWinsPushSender ?? realSender;

/** For tests: capture messages instead of calling a push service. */
export function setPushSender(sender: PushSender | undefined) {
  globalForPush.__fourWinsPushSender = sender;
}

/**
 * Push services the server is willing to POST to. A subscription endpoint is
 * client-supplied, so without this an authenticated request could aim the
 * server at an arbitrary URL.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isPushServiceUrl(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}
