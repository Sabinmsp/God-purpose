import { aiChatSchema } from "@/lib/shared/ai";
import { authed, json, readJson } from "@/lib/server/http";
import { aiStatus, clearChat, listMessages, listProposals, sendChat } from "@/lib/server/services/ai";

/** Conversation history, pending suggestions and whether the AI is configured. */
export const GET = authed(async (ctx) =>
  json({
    ok: true,
    status: await aiStatus(ctx),
    messages: await listMessages(ctx.sql, ctx.playerId),
    proposals: await listProposals(ctx.sql, ctx.playerId),
  }),
);

/** Sends one message to Four Wins AI with the player's real game data as context. */
export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, aiChatSchema);
  const result = await sendChat(ctx, input);
  return json({ ok: true, ...result, status: await aiStatus(ctx) });
});

/** Deletes the conversation history (memories are managed separately). */
export const DELETE = authed(async (ctx) => {
  await clearChat(ctx);
  return json({ ok: true });
});
