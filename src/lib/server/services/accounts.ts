import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { hashSecret, isWeakPassword } from "../auth/password";
import type { Q, Sql } from "../db";
import { AppError } from "../errors";
import { checkPassword } from "./player";
import { seedPlayer } from "./seed";
import { DEFAULT_CAMPAIGN } from "@/lib/shared/campaign";
import { addDays, daysBetween, localDate } from "@/lib/shared/time";

const CAMPAIGN_DAYS = daysBetween(DEFAULT_CAMPAIGN.startDate, DEFAULT_CAMPAIGN.endDate) + 1;

/**
 * Who may create an account, from server-only environment variables:
 *   SIGNUPS       open (default) | closed
 *   SIGNUP_CODE   when set, a new account needs this invite code
 */
export interface SignupPolicy {
  open: boolean;
  needsCode: boolean;
}

export function signupPolicy(): SignupPolicy {
  const open = (process.env.SIGNUPS ?? "open").trim().toLowerCase() !== "closed";
  return { open, needsCode: open && Boolean(process.env.SIGNUP_CODE?.trim()) };
}

const digest = (s: string) => createHash("sha256").update(s).digest();

function codeMatches(given: string | undefined) {
  const expected = process.env.SIGNUP_CODE?.trim();
  if (!expected) return true;
  // Compare digests so the check takes the same time whatever was typed.
  return timingSafeEqual(digest(given?.trim() ?? ""), digest(expected));
}

/** Creates a player with their own world, quests, vaults and 75-day campaign starting today. */
export async function createAccount(
  sql: Sql,
  input: { displayName: string; username: string; password: string; code?: string },
  now = new Date(),
): Promise<string> {
  const policy = signupPolicy();
  if (!policy.open) throw new AppError(403, "New accounts are closed right now.", "SIGNUPS_CLOSED");
  if (!codeMatches(input.code)) throw new AppError(403, "That invite code isn't right.", "BAD_INVITE");

  const hash = await hashSecret(input.password);
  try {
    return await sql.begin(async (tx) => {
      const [player] = await tx<{ id: string }[]>`insert into players (display_name) values (${input.displayName}) returning id`;
      await tx`
        insert into auth_credentials (player_id, username, password_hash, password_weak, updated_at)
        values (${player.id}, ${input.username}, ${hash}, ${isWeakPassword(input.password)}, ${now})
      `;
      const today = localDate(now);
      await seedPlayer(tx, player.id, today);
      // Everyone gets their own 75 days, starting the day they join.
      await tx`update campaigns set start_date = ${today}, end_date = ${addDays(today, CAMPAIGN_DAYS - 1)} where player_id = ${player.id}`;
      return player.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new AppError(409, "That username is taken. Try another.", "USERNAME_TAKEN");
    throw err;
  }
}

/** Removes the player and every record they own; all game tables cascade from players. */
export async function deleteAccount(sql: Q, playerId: string, password: string) {
  await checkPassword(sql, playerId, password);
  await sql`delete from players where id = ${playerId}`;
}
