import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as setup2fa } from "@/app/api/auth/2fa/setup/route";
import { POST as confirm2fa } from "@/app/api/auth/2fa/confirm/route";
import { POST as disable2fa } from "@/app/api/auth/2fa/disable/route";
import { POST as recovery2fa } from "@/app/api/auth/2fa/recovery-codes/route";
import { GET as getState } from "@/app/api/state/route";
import { GET as exportData } from "@/app/api/export/route";
import { LIMITS } from "@/lib/server/auth/rate-limit";
import { base32Decode, base32Encode, decryptSecret, stepAt, totpAt, verifyTotp } from "@/lib/server/auth/totp";
import { TEST_PASSWORD, apiRequest, closeDb, resetDb, sessionCookie } from "../helpers/db";

let base: Awaited<ReturnType<typeof resetDb>>;
beforeEach(async () => {
  base = await resetDb();
});
afterAll(closeDb);

const tryLogin = (body: { password: string; code?: string }, ip = "198.51.100.1") => login(apiRequest("/api/auth/login", { body, ip }));
const nextCode = (secret: string, offset = 1) => totpAt(secret, stepAt(new Date()) + offset);

/** Turns 2FA on through the real API and returns the secret and recovery codes. */
async function enable() {
  const cookie = await sessionCookie(base);
  const start = await setup2fa(apiRequest("/api/auth/2fa/setup", { cookie, body: { currentPassword: TEST_PASSWORD } }));
  expect(start.status).toBe(200);
  const { secret, uri, qrSvg } = await start.json();
  expect(uri).toMatch(/^otpauth:\/\/totp\/Four%20Wins%3ASabin\?secret=[A-Z2-7]+&issuer=Four%20Wins/);
  expect(qrSvg).toMatch(/^<svg/);
  const done = await confirm2fa(apiRequest("/api/auth/2fa/confirm", { cookie, body: { code: totpAt(secret, stepAt(new Date())) } }));
  expect(done.status).toBe(200);
  const { recoveryCodes } = await done.json();
  return { cookie, secret: secret as string, recoveryCodes: recoveryCodes as string[] };
}

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    // RFC values are 8 digits; authenticator apps use the last 6.
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(secret, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totpAt(secret, Math.floor(20000000000 / 30))).toBe("353130");
  });

  it("accepts one step of drift and refuses replays", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = new Date(1111111109 * 1000);
    const step = stepAt(now);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now, null)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, "12345", now, null)).toBeNull();
  });
});

describe("two-factor login", () => {
  it("needs the current password to start setup and a valid code to turn on", async () => {
    const cookie = await sessionCookie(base);
    expect((await setup2fa(apiRequest("/api/auth/2fa/setup", { cookie, body: { currentPassword: "wrong" } }))).status).toBe(403);
    const { secret } = await (await setup2fa(apiRequest("/api/auth/2fa/setup", { cookie, body: { currentPassword: TEST_PASSWORD } }))).json();
    const bad = String((Number(totpAt(secret, stepAt(new Date()))) + 1) % 1_000_000).padStart(6, "0");
    expect((await confirm2fa(apiRequest("/api/auth/2fa/confirm", { cookie, body: { code: bad } }))).status).toBe(403);
    // Still off: the password alone logs in.
    expect((await tryLogin({ password: TEST_PASSWORD })).status).toBe(200);
  });

  it("stores the secret encrypted and recovery codes only as hashes", async () => {
    const { secret, recoveryCodes } = await enable();
    expect(recoveryCodes).toHaveLength(10);
    const [row] = await base.sql<{ totp_secret_enc: string; recovery_hashes: string[] }[]>`select totp_secret_enc, recovery_hashes from auth_credentials`;
    expect(row.totp_secret_enc).not.toContain(secret);
    expect(decryptSecret(row.totp_secret_enc)).toBe(secret);
    expect(row.recovery_hashes.join()).not.toContain(recoveryCodes[0].replace("-", ""));
    // Neither the secret nor recovery codes leak through state or the backup export.
    const state = await (await getState(apiRequest("/api/state", { cookie: await sessionCookie(base) }))).text();
    const backup = await (await exportData(apiRequest("/api/export", { cookie: await sessionCookie(base) }))).text();
    for (const text of [state, backup]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(row.totp_secret_enc);
      expect(text).not.toContain(recoveryCodes[0]);
    }
    expect(JSON.parse(state).state.security).toMatchObject({ twoFactorEnabled: true, recoveryCodesLeft: 10 });
  });

  it("signs out other devices when turned on", async () => {
    const other = await sessionCookie(base);
    const { cookie } = await enable();
    expect((await getState(apiRequest("/api/state", { cookie: other }))).status).toBe(401);
    expect((await getState(apiRequest("/api/state", { cookie }))).status).toBe(200);
  });

  it("asks for a code after the password, opens no session without it, and refuses replays", async () => {
    const { secret } = await enable();
    const noCode = await tryLogin({ password: TEST_PASSWORD });
    expect(noCode.status).toBe(401);
    expect((await noCode.json()).code).toBe("TOTP_REQUIRED");
    expect(noCode.headers.get("set-cookie")).toBeNull();

    // Wrong password never reaches the code step, even with a valid code.
    const wrongPw = await tryLogin({ password: "nope", code: nextCode(secret) });
    expect((await wrongPw.json()).code).toBe("BAD_PASSWORD");

    const code = nextCode(secret);
    const ok = await tryLogin({ password: TEST_PASSWORD, code });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^fw_session=/);

    const replay = await tryLogin({ password: TEST_PASSWORD, code });
    expect(replay.status).toBe(401);
    expect((await replay.json()).code).toBe("BAD_CODE");
  });

  it("accepts each recovery code exactly once", async () => {
    const { recoveryCodes } = await enable();
    const code = recoveryCodes[3].toLowerCase().replace("-", " ");
    expect((await tryLogin({ password: TEST_PASSWORD, code })).status).toBe(200);
    expect((await tryLogin({ password: TEST_PASSWORD, code })).status).toBe(401);
    const [{ n }] = await base.sql<{ n: number }[]>`select cardinality(recovery_hashes)::int as n from auth_credentials`;
    expect(n).toBe(9);
  });

  it("rate-limits wrong codes per IP", async () => {
    const { secret } = await enable();
    for (let i = 0; i < LIMITS.ip.max; i++) expect((await tryLogin({ password: TEST_PASSWORD, code: "000000" })).status).toBe(401);
    expect((await tryLogin({ password: TEST_PASSWORD, code: nextCode(secret) })).status).toBe(429);
    expect((await tryLogin({ password: TEST_PASSWORD, code: nextCode(secret) }, "198.51.100.42")).status).toBe(200);
  });

  it("needs password and code to make new recovery codes or turn it off", async () => {
    const { cookie, secret, recoveryCodes } = await enable();
    expect((await disable2fa(apiRequest("/api/auth/2fa/disable", { cookie, body: { currentPassword: TEST_PASSWORD, code: "000000" } }))).status).toBe(403);
    expect((await disable2fa(apiRequest("/api/auth/2fa/disable", { cookie, body: { currentPassword: "wrong", code: nextCode(secret) } }))).status).toBe(403);

    const fresh = await recovery2fa(apiRequest("/api/auth/2fa/recovery-codes", { cookie, body: { currentPassword: TEST_PASSWORD, code: recoveryCodes[0] } }));
    expect(fresh.status).toBe(200);
    const { recoveryCodes: replaced } = await fresh.json();
    expect(replaced).toHaveLength(10);
    // Old codes are gone.
    expect((await tryLogin({ password: TEST_PASSWORD, code: recoveryCodes[1] })).status).toBe(401);

    const off = await disable2fa(apiRequest("/api/auth/2fa/disable", { cookie, body: { currentPassword: TEST_PASSWORD, code: nextCode(secret) } }));
    expect(off.status).toBe(200);
    expect((await off.json()).state.security.twoFactorEnabled).toBe(false);
    expect((await tryLogin({ password: TEST_PASSWORD }, "198.51.100.77")).status).toBe(200);
  });
});
