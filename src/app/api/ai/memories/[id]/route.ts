import { memoryPatchSchema } from "@/lib/shared/ai";
import { authed, idParam, json, readJson } from "@/lib/server/http";
import { deleteMemory, listMemories, updateMemory } from "@/lib/server/services/ai";

export const PATCH = authed(async (ctx) => {
  await updateMemory(ctx, idParam(ctx.params), await readJson(ctx.req, memoryPatchSchema));
  return json({ ok: true, memories: await listMemories(ctx.sql, ctx.playerId) });
});

export const DELETE = authed(async (ctx) => {
  await deleteMemory(ctx, idParam(ctx.params));
  return json({ ok: true, memories: await listMemories(ctx.sql, ctx.playerId) });
});
