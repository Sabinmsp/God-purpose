import { journalSchema } from "@/lib/shared/schemas";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import { addJournalEntry } from "@/lib/server/services/journal";

export const POST = authed(async (ctx) => {
  const input = await readJson(ctx.req, journalSchema);
  return stateResponse(ctx, await addJournalEntry(ctx, input));
});
