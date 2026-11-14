import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { authSecret } from "../env";

/**
 * Action tokens ride inside a push notification so its "Done" button works
 * with no session: by the time a reminder is useful the login has usually
 * expired. A token is a narrow capability: it can complete or undo exactly
 * one of today's quests for one player, it expires, and it is signed with a
 * key derived from AUTH_SECRET. Push payloads are end-to-end encrypted to the
 * browser, so only the player's device ever holds it.
 */
export const ACTION_TOKEN_TTL_MS = 36 * 60 * 60 * 1000;

const key = () => Buffer.from(hkdfSync("sha256", authSecret(), "four-wins", "push-action-v1", 32));

const sign = (playerId: string, questId: string, exp: number) =>
  createHmac("sha256", key()).update(`${playerId}|${questId}|${exp}`).digest("base64url");

export function mintActionToken(playerId: string, questId: string, now: Date): string {
  const exp = Math.floor((now.getTime() + ACTION_TOKEN_TTL_MS) / 1000);
  return `${questId}.${exp}.${sign(playerId, questId, exp)}`;
}

/** Splits a token without trusting it. The signature is checked by `verifyActionToken`. */
export function parseActionToken(token: string): { questId: string; exp: number; sig: string } | null {
  const [questId, expStr, sig, ...rest] = token.split(".");
  if (rest.length || !sig || !/^\d{9,11}$/.test(expStr ?? "") || !z.uuid().safeParse(questId).success) return null;
  return { questId, exp: Number(expStr), sig };
}

export function verifyActionToken(parsed: { questId: string; exp: number; sig: string }, playerId: string, now: Date): "ok" | "expired" | "bad" {
  const expected = Buffer.from(sign(playerId, parsed.questId, parsed.exp));
  const given = Buffer.from(parsed.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "bad";
  return parsed.exp * 1000 < now.getTime() ? "expired" : "ok";
}
