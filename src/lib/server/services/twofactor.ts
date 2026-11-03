import "server-only";
import QRCode from "qrcode";
import {
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from "../auth/totp";
import type { Sql } from "../db";
import { AppError, badRequest } from "../errors";
import type { AuthedContext } from "../http";
import { checkPassword } from "./player";

type Ctx = Pick<AuthedContext, "sql" | "playerId" | "sessionId" | "now">;

interface TotpRow {
  totp_secret_enc: string | null;
  totp_pending_enc: string | null;
  totp_last_step: number | null;
  recovery_hashes: string[];
}

const badCode = () => new AppError(403, "That code isn't right.", "BAD_CODE");

/**
 * Checks an authenticator code or a recovery code against the stored secret,
 * inside a row lock so the same code can never be accepted twice. Returns false
 * when 2FA is off or the code is wrong.
 */
export async function consumeSecondFactor(sql: Sql, playerId: string, code: string, now: Date): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [row] = await tx<TotpRow[]>`
      select totp_secret_enc, totp_pending_enc, totp_last_step, recovery_hashes
      from auth_credentials where player_id = ${playerId} for update
    `;
    if (!row?.totp_secret_enc) return false;
    const step = verifyTotp(decryptSecret(row.totp_secret_enc), code.trim(), now, row.totp_last_step);
    if (step !== null) {
      await tx`update auth_credentials set totp_last_step = ${step} where player_id = ${playerId}`;
      return true;
    }
    if (looksLikeRecoveryCode(code)) {
      const hash = hashRecoveryCode(code);
      if (row.recovery_hashes.includes(hash)) {
        await tx`update auth_credentials set recovery_hashes = array_remove(recovery_hashes, ${hash}) where player_id = ${playerId}`;
        return true;
      }
    }
    return false;
  }) as Promise<boolean>;
}

/** Step 1: after re-checking the password, create a pending secret and its QR code. */
export async function startSetup(ctx: Ctx, currentPassword: string) {
  await checkPassword(ctx.sql, ctx.playerId, currentPassword);
  const [{ display_name }] = await ctx.sql<{ display_name: string }[]>`select display_name from players where id = ${ctx.playerId}`;
  const secret = newTotpSecret();
  await ctx.sql`update auth_credentials set totp_pending_enc = ${encryptSecret(secret)} where player_id = ${ctx.playerId}`;
  const uri = otpauthUri(secret, display_name);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return { secret, uri, qrSvg };
}

/**
 * Step 2: the first code from the app proves it was scanned. Turns 2FA on,
 * returns fresh recovery codes (shown once) and signs out every other device.
 */
export async function confirmSetup(ctx: Ctx, code: string) {
  const codes = newRecoveryCodes();
  await ctx.sql.begin(async (tx) => {
    const [row] = await tx<TotpRow[]>`
      select totp_secret_enc, totp_pending_enc, totp_last_step, recovery_hashes
      from auth_credentials where player_id = ${ctx.playerId} for update
    `;
    if (!row?.totp_pending_enc) throw badRequest("Start the setup again.", "NO_PENDING_2FA");
    const secret = decryptSecret(row.totp_pending_enc);
    const step = verifyTotp(secret, code.trim(), ctx.now, null);
    if (step === null) throw badCode();
    await tx`
      update auth_credentials set
        totp_secret_enc = ${row.totp_pending_enc}, totp_pending_enc = null, totp_enabled_at = ${ctx.now},
        totp_last_step = ${step}, recovery_hashes = ${codes.map(hashRecoveryCode)}, updated_at = ${ctx.now}
      where player_id = ${ctx.playerId}
    `;
    await tx`update sessions set revoked_at = ${ctx.now} where player_id = ${ctx.playerId} and id <> ${ctx.sessionId} and revoked_at is null`;
  });
  return codes;
}

/** Needs the password and a current code (or a recovery code). */
async function requireBoth(ctx: Ctx, currentPassword: string, code: string) {
  await checkPassword(ctx.sql, ctx.playerId, currentPassword);
  if (!(await consumeSecondFactor(ctx.sql, ctx.playerId, code, ctx.now))) throw badCode();
}

export async function disable(ctx: Ctx, currentPassword: string, code: string) {
  await requireBoth(ctx, currentPassword, code);
  await ctx.sql`
    update auth_credentials set totp_secret_enc = null, totp_pending_enc = null, totp_enabled_at = null,
      totp_last_step = null, recovery_hashes = '{}', updated_at = ${ctx.now}
    where player_id = ${ctx.playerId}
  `;
}

export async function regenerateRecoveryCodes(ctx: Ctx, currentPassword: string, code: string) {
  await requireBoth(ctx, currentPassword, code);
  const codes = newRecoveryCodes();
  await ctx.sql`update auth_credentials set recovery_hashes = ${codes.map(hashRecoveryCode)} where player_id = ${ctx.playerId}`;
  return codes;
}
