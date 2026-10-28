import { memoryInputSchema } from "@/lib/shared/ai";
import { authed, json, readJson } from "@/lib/server/http";
import { createMemory, deleteAllMemories, listMemories } from "@/lib/server/services/ai";

export const GET = authed(async (ctx) => json({ ok: true, memories: await listMemories(ctx.sql, ctx.playerId) }));

export const POST = authed(async (ctx) => {
  await createMemory(ctx, await readJson(ctx.req, memoryInputSchema));
  return json({ ok: true, memories: await listMemories(ctx.sql, ctx.playerId) });
});

/** Deletes every saved memory. */
export const DELETE = authed(async (ctx) => {
  await deleteAllMemories(ctx);
  return json({ ok: true, memories: [] });
});
