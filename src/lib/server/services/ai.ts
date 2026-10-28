import "server-only";
import {
  AI_LIMITS,
  type AiMemoryView,
  type AiMessageView,
  type AiProposalView,
  type AiReply,
  type AiStatus,
  type MemoryCategory,
  type MemoryProposal,
  type MissionProposal,
} from "@/lib/shared/ai";
import { ALLOWED_QUEST_XP } from "@/lib/shared/progression";
import type { GameEvent } from "@/lib/shared/types";
import { buildAiContext } from "../ai/context";
import { SYSTEM_PROMPT } from "../ai/prompt";
import { AiError, configuredProviderName, getAiProvider, type AiTurn } from "../ai/provider";
import type { Q } from "../db";
import { AppError, conflict, notFound } from "../errors";
import { getPlayer, settingsOf } from "./player";
import { mutate, type Ctx } from "./progress";
import { insertQuestDef } from "./quests";
import { buildState } from "./state";

const MAX_MEMORIES = 100;

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listMemories(q: Q, playerId: string): Promise<AiMemoryView[]> {
  const rows = await q<{ id: string; category: MemoryCategory; content: string; source: "user" | "ai_approved"; updated_at: Date }[]>`
    select id, category, content, source, updated_at from ai_memories
    where player_id = ${playerId} order by updated_at desc limit ${MAX_MEMORIES}
  `;
  return rows.map((r) => ({ id: r.id, category: r.category, content: r.content, source: r.source, updatedAt: r.updated_at.toISOString() }));
}

export async function listMessages(q: Q, playerId: string, limit = 60): Promise<AiMessageView[]> {
  const rows = await q<{ id: string; role: "user" | "assistant"; content: string; created_at: Date }[]>`
    select id, role, content, created_at from (
      select * from ai_messages where player_id = ${playerId} order by created_at desc, role asc limit ${limit}
    ) m order by created_at asc, role desc
  `;
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at.toISOString() }));
}

export async function listProposals(q: Q, playerId: string): Promise<AiProposalView[]> {
  const rows = await q<{ id: string; message_id: string | null; kind: "mission" | "memory"; payload: never; status: AiProposalView["status"] }[]>`
    select id, message_id, kind, payload, status from ai_proposals
    where player_id = ${playerId} order by created_at desc limit 60
  `;
  return rows.map((r) => ({ id: r.id, messageId: r.message_id, kind: r.kind, payload: r.payload, status: r.status }) as AiProposalView);
}

async function requestsSince(q: Q, playerId: string, since: Date) {
  const [row] = await q<{ n: number }[]>`select count(*)::int as n from ai_requests where player_id = ${playerId} and created_at > ${since}`;
  return row.n;
}

export async function aiStatus(ctx: Ctx): Promise<AiStatus> {
  const provider = getAiProvider();
  const player = await getPlayer(ctx.sql, ctx.playerId);
  const usedToday = await requestsSince(ctx.sql, ctx.playerId, new Date(ctx.now.getTime() - 86_400_000));
  return {
    configured: Boolean(provider),
    provider: provider?.name ?? configuredProviderName(),
    model: provider?.model ?? null,
    memoryEnabled: settingsOf(player).aiMemory,
    remainingToday: Math.max(0, AI_LIMITS.perDay - usedToday),
  };
}

// ── Chat ──────────────────────────────────────────────────────────────────

const AI_STATUS: Record<AiError["kind"], number> = {
  rate_limited: 429,
  timeout: 504,
  refused: 422,
  bad_output: 502,
  auth: 502,
  unavailable: 502,
};

function snapXp(xp: number): number {
  return ALLOWED_QUEST_XP.reduce((best, v) => (Math.abs(v - xp) < Math.abs(best - xp) ? v : best), ALLOWED_QUEST_XP[0]);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The AI's suggestions are untrusted: clamp and validate every field and drop
 * duplicates. They are stored as *pending* proposals — never applied.
 */
export function sanitizeProposals(reply: AiReply, existingQuestTitles: string[], existingMemories: string[], memoryEnabled: boolean) {
  const seen = new Set(existingQuestTitles.map(norm));
  const missions: MissionProposal[] = [];
  for (const m of reply.proposed_missions ?? []) {
    const title = m.title.trim().slice(0, 80);
    if (title.length < 2 || seen.has(norm(title))) continue;
    seen.add(norm(title));
    missions.push({ pillar: m.pillar, title, xp: snapXp(m.xp), reason: m.reason.trim().slice(0, 200) });
    if (missions.length >= AI_LIMITS.maxMissionProposals) break;
  }
  const known = new Set(existingMemories.map(norm));
  const memories: MemoryProposal[] = [];
  if (memoryEnabled) {
    for (const m of reply.proposed_memories ?? []) {
      const content = m.content.trim().slice(0, AI_LIMITS.memoryChars);
      if (!content || known.has(norm(content))) continue;
      known.add(norm(content));
      memories.push({ category: m.category, content });
      if (memories.length >= AI_LIMITS.maxMemoryProposals) break;
    }
  }
  return { missions, memories };
}

export async function sendChat(ctx: Ctx, input: { message: string; location?: { lat: number; lon: number } | null }) {
  const provider = getAiProvider();
  if (!provider) {
    throw new AppError(503, "Four Wins AI isn't connected yet. Add an AI key to the server configuration to turn it on.", "AI_NOT_CONFIGURED");
  }

  const windowUsed = await requestsSince(ctx.sql, ctx.playerId, new Date(ctx.now.getTime() - AI_LIMITS.windowMs));
  const dayUsed = await requestsSince(ctx.sql, ctx.playerId, new Date(ctx.now.getTime() - 86_400_000));
  if (windowUsed >= AI_LIMITS.perWindow || dayUsed >= AI_LIMITS.perDay) {
    throw new AppError(429, "You've sent a lot of messages — give Four Wins AI a few minutes to rest.", "AI_RATE_LIMITED");
  }

  const state = await buildState(ctx);
  const memoryEnabled = state.player.settings.aiMemory;
  const memories = memoryEnabled ? await listMemories(ctx.sql, ctx.playerId) : null;
  const recent = await listMessages(ctx.sql, ctx.playerId, AI_LIMITS.historyTurns);
  const firstUser = recent.findIndex((m) => m.role === "user");
  const history: AiTurn[] = (firstUser >= 0 ? recent.slice(firstUser) : []).map((m) => ({ role: m.role, content: m.content }));
  // Coordinates are rounded to ~1 km and used for this one request only; they are never stored.
  const location = input.location ? { lat: Math.round(input.location.lat * 100) / 100, lon: Math.round(input.location.lon * 100) / 100 } : null;

  let reply: AiReply;
  try {
    reply = await provider.reply({
      system: SYSTEM_PROMPT,
      history,
      context: buildAiContext(state, { memories, location }),
      message: input.message,
    });
  } catch (err) {
    await ctx.sql`insert into ai_requests (player_id, ok, created_at) values (${ctx.playerId}, false, ${ctx.now})`;
    if (err instanceof AiError) throw new AppError(AI_STATUS[err.kind], err.message, `AI_${err.kind.toUpperCase()}`);
    throw err;
  }

  const questTitles = [...state.today.quests.map((q) => q.title), ...state.questLibrary.map((q) => q.title)];
  const { missions, memories: memoryProposals } = sanitizeProposals(reply, questTitles, (memories ?? []).map((m) => m.content), memoryEnabled);
  const text = reply.reply.trim().slice(0, 11000) || "I couldn't put an answer together — could you ask that another way?";

  return ctx.sql.begin(async (tx) => {
    // Assistant timestamp is 1 ms later so ordering is stable.
    const [user] = await tx<{ id: string }[]>`
      insert into ai_messages (player_id, role, content, created_at) values (${ctx.playerId}, 'user', ${input.message}, ${ctx.now}) returning id
    `;
    const [assistant] = await tx<{ id: string }[]>`
      insert into ai_messages (player_id, role, content, created_at)
      values (${ctx.playerId}, 'assistant', ${text}, ${new Date(ctx.now.getTime() + 1)}) returning id
    `;
    const proposals: AiProposalView[] = [];
    for (const [kind, list] of [
      ["mission", missions],
      ["memory", memoryProposals],
    ] as const) {
      for (const payload of list) {
        const [row] = await tx<{ id: string }[]>`
          insert into ai_proposals (player_id, message_id, kind, payload, created_at)
          values (${ctx.playerId}, ${assistant.id}, ${kind}, ${tx.json(payload as never)}, ${ctx.now}) returning id
        `;
        proposals.push({ id: row.id, messageId: assistant.id, kind, payload, status: "pending" } as AiProposalView);
      }
    }
    await tx`insert into ai_requests (player_id, ok, created_at) values (${ctx.playerId}, true, ${ctx.now})`;
    return {
      messages: [
        { id: user.id, role: "user" as const, content: input.message, createdAt: ctx.now.toISOString() },
        { id: assistant.id, role: "assistant" as const, content: text, createdAt: new Date(ctx.now.getTime() + 1).toISOString() },
      ],
      proposals,
    };
  });
}

/** Deletes the conversation (and any undecided suggestions). Memories are kept. */
export async function clearChat(ctx: Ctx) {
  await ctx.sql.begin(async (tx) => {
    await tx`delete from ai_proposals where player_id = ${ctx.playerId}`;
    await tx`delete from ai_messages where player_id = ${ctx.playerId}`;
  });
}

// ── Approvals ─────────────────────────────────────────────────────────────

/**
 * The only path from an AI suggestion to game state: the player approves a
 * single proposal, and it goes through the same validation and limits as a
 * quest they created themselves.
 */
export async function decideProposal(ctx: Ctx, id: string, decision: "approve" | "dismiss", repeat: boolean) {
  let events: GameEvent[] = [];
  let kind: "mission" | "memory" | null = null;
  const load = async (q: Q) => {
    const [row] = await q<{ id: string; kind: "mission" | "memory"; payload: MissionProposal & MemoryProposal; status: string }[]>`
      select id, kind, payload, status from ai_proposals where id = ${id} and player_id = ${ctx.playerId} for update
    `;
    if (!row) throw notFound("Suggestion not found");
    if (row.status !== "pending") throw conflict("You've already decided on this suggestion", "ALREADY_DECIDED");
    kind = row.kind;
    return row;
  };

  if (decision === "dismiss") {
    await ctx.sql.begin(async (tx) => {
      await load(tx);
      await tx`update ai_proposals set status = 'dismissed', decided_at = ${ctx.now} where id = ${id}`;
    });
  } else {
    const [peek] = await ctx.sql<{ kind: string }[]>`select kind from ai_proposals where id = ${id} and player_id = ${ctx.playerId}`;
    if (!peek) throw notFound("Suggestion not found");
    if (peek.kind === "mission") {
      events = await mutate(ctx, async (tx) => {
        const row = await load(tx);
        const p = row.payload;
        const defId = await insertQuestDef(tx, ctx, {
          pillar: p.pillar,
          title: p.title,
          xp: p.xp,
          onBoard: repeat,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          addToday: true,
        });
        await tx`update ai_proposals set status = 'approved', decided_at = ${ctx.now}, result_id = ${defId} where id = ${id}`;
      });
    } else {
      await ctx.sql.begin(async (tx) => {
        const row = await load(tx);
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from ai_memories where player_id = ${ctx.playerId}`;
        if (n >= MAX_MEMORIES) throw conflict(`You can keep up to ${MAX_MEMORIES} memories. Delete some first.`);
        const [mem] = await tx<{ id: string }[]>`
          insert into ai_memories (player_id, category, content, source, created_at, updated_at)
          values (${ctx.playerId}, ${row.payload.category}, ${row.payload.content}, 'ai_approved', ${ctx.now}, ${ctx.now}) returning id
        `;
        await tx`update ai_proposals set status = 'approved', decided_at = ${ctx.now}, result_id = ${mem.id} where id = ${id}`;
      });
    }
  }
  return { events, kind };
}

// ── Memories (player-managed) ─────────────────────────────────────────────

export async function createMemory(ctx: Ctx, input: { category: MemoryCategory; content: string }) {
  await ctx.sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from ai_memories where player_id = ${ctx.playerId}`;
    if (n >= MAX_MEMORIES) throw conflict(`You can keep up to ${MAX_MEMORIES} memories. Delete some first.`);
    await tx`
      insert into ai_memories (player_id, category, content, source, created_at, updated_at)
      values (${ctx.playerId}, ${input.category}, ${input.content}, 'user', ${ctx.now}, ${ctx.now})
    `;
  });
}

export async function updateMemory(ctx: Ctx, id: string, patch: { category?: MemoryCategory; content?: string }) {
  const rows = await ctx.sql`
    update ai_memories set
      category = coalesce(${patch.category ?? null}, category),
      content = coalesce(${patch.content ?? null}, content),
      updated_at = ${ctx.now}
    where id = ${id} and player_id = ${ctx.playerId}
    returning id
  `;
  if (!rows.length) throw notFound("Memory not found");
}

export async function deleteMemory(ctx: Ctx, id: string) {
  const rows = await ctx.sql`delete from ai_memories where id = ${id} and player_id = ${ctx.playerId} returning id`;
  if (!rows.length) throw notFound("Memory not found");
}

export async function deleteAllMemories(ctx: Ctx) {
  await ctx.sql`delete from ai_memories where player_id = ${ctx.playerId}`;
}
