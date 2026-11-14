import "server-only";
import { createECDH, hkdfSync } from "node:crypto";
import { authSecret } from "../env";

/**
 * The server's Web Push identity (VAPID, RFC 8292): a P-256 key pair derived
 * from AUTH_SECRET, so reminders need no extra configuration and the private
 * key is never stored. Rotating AUTH_SECRET changes the pair; each device
 * re-subscribes the next time the game is opened there.
 */
export interface VapidKeys {
  /** Uncompressed public point, base64url: what browsers subscribe with. */
  publicKey: string;
  privateKey: string;
}

let cached: { secret: string; keys: VapidKeys } | undefined;

export function vapidKeys(): VapidKeys {
  const secret = authSecret();
  if (cached?.secret === secret) return cached.keys;
  // A derived value is a valid private key unless it is 0 or ≥ the curve
  // order (odds about 2^-32); the counter covers that case.
  for (let i = 0; ; i++) {
    const d = Buffer.from(hkdfSync("sha256", secret, "four-wins", `vapid-p256-v1:${i}`, 32));
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(d);
      const keys = { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: d.toString("base64url") };
      cached = { secret, keys };
      return keys;
    } catch {
      if (i > 8) throw new Error("Could not derive a VAPID key");
    }
  }
}

/** Contact URL sent to push services. Never the player's email unless they set VAPID_SUBJECT themselves. */
export function vapidSubject(origin?: string): string {
  const configured = process.env.VAPID_SUBJECT?.trim();
  if (configured) return configured;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) return `https://${host}`;
  return origin && origin.startsWith("https://") ? origin : "https://four-wins.invalid";
}
