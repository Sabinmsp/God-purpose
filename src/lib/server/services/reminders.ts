import "server-only";
import { PILLAR_META } from "@/lib/shared/pillars";
import {
  NUDGE_URL,
  SLOTS_FOR,
  composeNudge,
  nudgeBody,
  nudgeQuests,
  slotAt,
  type Nudge,
  type NudgeQuest,
  type NudgeSlot,
  type PushPayload,
} from "@/lib/shared/nudge";
import { addDays, localClock } from "@/lib/shared/time";
import type { GameEvent, GameState } from "@/lib/shared/types";
import type { Q, Sql } from "../db";
import { AppError, badRequest } from "../errors";
import { isPushServiceUrl, pushSender, type PushTarget } from "../push/send";
import { mintActionToken, parseActionToken, verifyActionToken } from "../push/token";
import { getPlayer, settingsOf } from "./player";
import type { Ctx } from "./progress";
import { completeQuest, undoQuest } from "./quests";
import { buildState } from "./state";

const MAX_DEVICES = 8;

export async function deviceCount(q: Q, playerId: string): Promise<number> {
  const [row] = await q<{ n: number }[]>`select count(*)::int as n from push_subscriptions where player_id = ${playerId}`;
  return row.n;
}

/** Stores (or refreshes) this browser's push subscription. Safe to call on every visit. */
export async function saveSubscription(ctx: Ctx, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  if (!isPushServiceUrl(sub.endpoint)) throw badRequest("That is not a push service this app sends to", "BAD_PUSH_ENDPOINT");
  await ctx.sql`
    insert into push_subscriptions (player_id, endpoint, p256dh, auth, user_agent, created_at)
    values (${ctx.playerId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent?.slice(0, 200) ?? null}, ${ctx.now})
    on conflict (endpoint) do update
      set player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth,
          user_agent = excluded.user_agent, failures = 0
  `;
  // Old phones and reinstalled browsers pile up; keep the most recent few.
  await ctx.sql`
    delete from push_subscriptions where player_id = ${ctx.playerId} and id not in (
      select id from push_subscriptions where player_id = ${ctx.playerId} order by created_at desc limit ${MAX_DEVICES}
    )
  `;
}

export async function removeSubscription(ctx: Ctx, endpoint: string) {
  await ctx.sql`delete from push_subscriptions where player_id = ${ctx.playerId} and endpoint = ${endpoint}`;
}

/** Sends one payload to every device of a player; returns how many accepted it. */
export async function pushToPlayer(sql: Sql, playerId: string, payload: PushPayload, now: Date, origin?: string): Promise<number> {
  const subs = await sql<(PushTarget & { id: string })[]>`
    select id, endpoint, p256dh, auth from push_subscriptions where player_id = ${playerId} order by created_at
  `;
  const send = pushSender();
  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const result = await send(sub, body, origin);
      if (result === "ok") {
        delivered++;
        await sql`update push_subscriptions set last_ok_at = ${now}, failures = 0 where id = ${sub.id}`;
      } else if (result === "gone") {
        await sql`delete from push_subscriptions where id = ${sub.id}`;
      } else {
        await sql`update push_subscriptions set failures = failures + 1 where id = ${sub.id}`;
      }
    }),
  );
  return delivered;
}

const item = (playerId: string, q: NudgeQuest, body: string, now: Date) => ({
  body,
  token: q.tickable ? mintActionToken(playerId, q.id, now) : null,
});

export function nudgePayload(playerId: string, nudge: Nudge, now: Date, title = nudge.title): PushPayload {
  return {
    title,
    items: nudge.quests.map((q, i) => item(playerId, q, nudgeBody(nudge, i), now)),
    fallback: nudge.note,
    undo: null,
    url: NUDGE_URL,
  };
}

export interface NudgeRun {
  slot: NudgeSlot | null;
  players: number;
  sent: number;
  delivered: number;
}

/**
 * The scheduled job. For the current Darwin slot it sends each player with
 * reminders on at most one nudge. The (player, day, slot) row is claimed
 * first, so overlapping or repeated runs cannot double-send. Building the
 * state also creates today's board, which otherwise only exists once the
 * game has been opened.
 */
export async function runNudges(sql: Sql, now: Date, origin?: string): Promise<NudgeRun> {
  const clock = localClock(now);
  const slot = slotAt(clock.hour);
  const run: NudgeRun = { slot, players: 0, sent: 0, delivered: 0 };
  if (!slot) return run;

  const players = await sql<{ player_id: string }[]>`select distinct player_id from push_subscriptions`;
  for (const { player_id: playerId } of players) {
    try {
      const level = settingsOf(await getPlayer(sql, playerId)).reminders;
      if (!SLOTS_FOR[level]?.includes(slot)) continue;
      run.players++;
      const claimed = await sql`
        insert into nudges (player_id, local_date, slot, sent_at) values (${playerId}, ${clock.date}, ${slot}, ${now})
        on conflict do nothing returning slot
      `;
      if (!claimed.length) continue;
      const state = await buildState({ sql, playerId, now });
      const nudge = composeNudge(state, slot);
      if (!nudge) {
        await sql`update nudges set kind = 'quiet' where player_id = ${playerId} and local_date = ${clock.date} and slot = ${slot}`;
        continue;
      }
      const delivered = await pushToPlayer(sql, playerId, nudgePayload(playerId, nudge, now), now, origin);
      run.sent++;
      run.delivered += delivered;
      await sql`
        update nudges set kind = ${nudge.kind}, title = ${nudge.title}, delivered = ${delivered}
        where player_id = ${playerId} and local_date = ${clock.date} and slot = ${slot}
      `;
    } catch (err) {
      console.error("[nudge] failed for a player", err);
    }
  }
  await sql`delete from nudges where local_date < ${addDays(clock.date, -90)}`;
  return run;
}

/** "Send me one now": a real nudge for this moment, so the player sees exactly what will arrive. */
export async function sendTestNudge(ctx: Ctx, origin?: string): Promise<number> {
  const state = await buildState(ctx);
  const hour = state.now.hour;
  const slot = slotAt(hour) ?? (hour < 12 ? "morning" : hour < 17 ? "midday" : "evening");
  const nudge = composeNudge(state, slot);
  const payload: PushPayload = nudge
    ? nudgePayload(ctx.playerId, { ...nudge, note: "This is what a nudge looks like. Tap Done when it's finished." }, ctx.now, "Reminders are on ✓")
    : { title: "Reminders are on ✓", items: [], fallback: "Nothing left on today's board. Your next nudge comes tomorrow.", undo: null, url: NUDGE_URL };
  return pushToPlayer(ctx.sql, ctx.playerId, payload, ctx.now, origin);
}

const wins = (s: GameState) => new Set(s.today.quests.filter((q) => q.status === "done").map((q) => q.pillar)).size;

function afterComplete(playerId: string, s: GameState, quest: { id: string; title: string }, events: GameEvent[], token: string, now: Date): PushPayload {
  const xp = events.reduce((sum, e) => (e.type === "xp" ? sum + e.amount : sum), 0);
  const level = events.find((e) => e.type === "levelup");
  const parts = [
    ...(xp ? [`+${xp} XP`] : []),
    `${wins(s)}/4 wins today`,
    ...(s.stats.streak.current ? [`🔥 ${s.stats.streak.current}`] : []),
  ];
  let result = parts.join(" · ");
  if (level) result = `Level up! ${level.pillar === "overall" ? "Overall" : PILLAR_META[level.pillar].name} level ${level.level}. ${result}`;
  if (s.today.fourWins) {
    return { title: `✓ ${quest.title}`, items: [], fallback: `${result}\nAll four wins. Today is won. 🏆`, undo: token, url: NUDGE_URL };
  }
  const next = nudgeQuests(s, false).filter((q) => q.tickable);
  return {
    title: `✓ ${quest.title}`,
    items: next.map((q) => item(playerId, q, `${result}\nNext: ${q.title} · +${q.xp} XP`, now)),
    fallback: result,
    undo: token,
    url: NUDGE_URL,
  };
}

/**
 * Runs a notification button. Authorised by the signed token alone (see
 * push/token.ts), and goes through the same quest rules as the in-game
 * buttons: today's quests only, once each, daily XP caps.
 */
export async function actOnNudge(sql: Sql, token: string, action: "complete" | "undo", now: Date): Promise<PushPayload> {
  const parsed = parseActionToken(token);
  if (!parsed) throw new AppError(403, "This reminder can't be used", "BAD_TOKEN");
  const [row] = await sql<{ player_id: string; title: string; xp: number; status: string }[]>`
    select player_id, title, xp, status from daily_quests where id = ${parsed.questId}
  `;
  const verdict = row ? verifyActionToken(parsed, row.player_id, now) : "bad";
  if (!row || verdict === "bad") throw new AppError(403, "This reminder can't be used", "BAD_TOKEN");
  if (verdict === "expired") throw new AppError(410, "This reminder is from another day. Open Four Wins for today's board.", "EXPIRED");

  const ctx: Ctx = { sql, playerId: row.player_id, now };
  const quest = { id: parsed.questId, title: row.title };
  if (action === "complete") {
    let events: GameEvent[] = [];
    try {
      events = await completeQuest(ctx, quest.id);
    } catch (err) {
      // A second tap, or the quest was ticked in the game meanwhile: same outcome, no error.
      if (!(err instanceof AppError && err.code === "ALREADY_DONE")) throw err;
    }
    return afterComplete(ctx.playerId, await buildState(ctx), quest, events, token, now);
  }
  if (row.status === "done") await undoQuest(ctx, quest.id);
  const state = await buildState(ctx);
  const others = nudgeQuests(state, false).filter((q) => q.tickable && q.id !== quest.id);
  const note = `Nothing counted. ${wins(state)}/4 wins today.`;
  return {
    title: `Undone: ${quest.title}`,
    items: [
      { body: `${quest.title} · +${row.xp} XP\n${note}`, token },
      ...others.slice(0, 3).map((q) => item(ctx.playerId, q, `${q.title} · +${q.xp} XP\n${note}`, now)),
    ],
    fallback: note,
    undo: null,
    url: NUDGE_URL,
  };
}
