import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// No "server-only" import: the CLI setup script uses this module too.

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEYLEN = 64;

/** Format: scrypt$N$r$p$<salt b64>$<hash b64> */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret.normalize("NFKC"), salt, KEYLEN, { ...PARAMS, maxmem: 128 * PARAMS.N * PARAMS.r * 2 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const N = Number(n);
  const R = Number(r);
  const key = await scrypt(secret.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: 128 * N * R * 2,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A password is "weak" if it is short or only digits (e.g. a 4-digit PIN). */
export function isWeakPassword(password: string): boolean {
  return password.length < 12 || /^\d+$/.test(password);
}
