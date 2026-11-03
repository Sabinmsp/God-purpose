import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "../env";

/**
 * Time-based one-time passwords (RFC 6238: SHA-1, 6 digits, 30 s steps), the
 * format every authenticator app understands.
 */
export const TOTP_STEP_SEC = 30;
const DIGITS = 6;
/** Accept the previous and next step too, to tolerate phone clock drift. */
const WINDOW = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export const stepAt = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_STEP_SEC);

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Returns the matching step, or null. Steps at or before `lastStep` are refused
 * so a code that was already used (or seen over a shoulder) cannot be replayed.
 */
export function verifyTotp(secret: string, code: string, now: Date, lastStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepAt(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const step = current + d;
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "Four Wins"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SEC}`;
}

// ── Secret encryption at rest ──────────────────────────────────────────────

const key = () => createHash("sha256").update("fourwins:totp:v1:").update(authSecret()).digest();

/** Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url> */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

// ── Recovery codes ─────────────────────────────────────────────────────────

export const RECOVERY_CODE_COUNT = 10;

/** 10 characters of base32 (50 bits), shown as XXXXX-XXXXX. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const c = base32Encode(randomBytes(7)).slice(0, 10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();

export const hashRecoveryCode = (code: string) => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");

export const looksLikeRecoveryCode = (code: string) => /^[A-Z2-7]{10}$/.test(normalizeRecoveryCode(code));
