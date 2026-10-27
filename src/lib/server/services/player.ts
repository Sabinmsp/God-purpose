import "server-only";
import { DEFAULT_SETTINGS, type PlayerSettings } from "@/lib/shared/types";
import { UNLOCKS_BY_KEY, sanitizeEquipped, unlockedKeys, type EquipSlot, type Equipped } from "@/lib/shared/unlocks";
import { hashSecret, isWeakPassword, verifySecret } from "../auth/password";
import type { Q } from "../db";
import { AppError, badRequest } from "../errors";
import { levelsOf, mutate, pillarXp, type Ctx } from "./progress";

export interface PlayerRow {
  id: string;
  display_name: string;
  character_class: string;
  starting_age: number;
  pos_scene: string;
  pos_x: number | null;
  pos_y: number | null;
  facing: string;
  equipped: Equipped;
  settings: Partial<PlayerSettings>;
  last_snapshot: unknown;
  last_snapshot_at: Date | null;
}

export async function getPlayer(q: Q, playerId: string): Promise<PlayerRow> {
  const [row] = await q<PlayerRow[]>`select * from players where id = ${playerId}`;
  if (!row) throw new AppError(404, "Player not found");
  return row;
}

export const settingsOf = (row: PlayerRow): PlayerSettings => ({ ...DEFAULT_SETTINGS, ...row.settings });

/** Saving where the character stands does not touch XP or progress. */
export async function savePosition(ctx: Ctx, pos: { scene: string; x: number; y: number; facing: string }) {
  await ctx.sql`
    update players set pos_scene = ${pos.scene}, pos_x = ${pos.x}, pos_y = ${pos.y}, facing = ${pos.facing}
    where id = ${ctx.playerId}
  `;
}

export async function updateSettings(ctx: Ctx, patch: Partial<PlayerSettings> & { displayName?: string }) {
  const { displayName, ...settings } = patch;
  await ctx.sql.begin(async (tx) => {
    const row = await getPlayer(tx, ctx.playerId);
    const next = { ...settingsOf(row), ...settings };
    await tx`
      update players set settings = ${tx.json(next as never)}, display_name = ${displayName ?? row.display_name}
      where id = ${ctx.playerId}
    `;
  });
}

/** Equips a cosmetic. The server checks the unlock against current pillar levels. */
export function equip(ctx: Ctx, slot: EquipSlot, key: string | null) {
  return mutate(ctx, async (tx) => {
    const row = await getPlayer(tx, ctx.playerId);
    const unlocked = unlockedKeys(levelsOf(await pillarXp(tx, ctx.playerId)));
    if (key) {
      const def = UNLOCKS_BY_KEY[key];
      if (!def || def.kind !== slot) throw badRequest("That item doesn't fit this slot");
      if (!unlocked.includes(key)) throw new AppError(403, "Not unlocked yet — keep levelling up", "LOCKED_ITEM");
    }
    const next = sanitizeEquipped({ ...row.equipped, [slot]: key ?? undefined }, unlocked);
    await tx`update players set equipped = ${tx.json(next as never)} where id = ${ctx.playerId}`;
  });
}

async function checkPassword(q: Q, playerId: string, password: string) {
  const [cred] = await q<{ password_hash: string }[]>`select password_hash from auth_credentials where player_id = ${playerId}`;
  if (!cred || !(await verifySecret(password, cred.password_hash))) {
    throw new AppError(403, "Current password is incorrect", "BAD_PASSWORD");
  }
}

export async function changePassword(ctx: Ctx, sessionId: string, current: string, next: string) {
  await checkPassword(ctx.sql, ctx.playerId, current);
  const hash = await hashSecret(next);
  await ctx.sql.begin(async (tx) => {
    await tx`
      update auth_credentials set password_hash = ${hash}, password_weak = ${isWeakPassword(next)}, updated_at = ${ctx.now}
      where player_id = ${ctx.playerId}
    `;
    // Sign out every other device.
    await tx`update sessions set revoked_at = ${ctx.now} where player_id = ${ctx.playerId} and id <> ${sessionId} and revoked_at is null`;
  });
}

export async function setPin(ctx: Ctx, current: string, pin: string | null) {
  await checkPassword(ctx.sql, ctx.playerId, current);
  const hash = pin ? await hashSecret(pin) : null;
  await ctx.sql`update auth_credentials set pin_hash = ${hash}, updated_at = ${ctx.now} where player_id = ${ctx.playerId}`;
}
