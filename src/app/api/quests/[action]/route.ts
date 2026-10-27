import { addToTodaySchema, questActionSchema } from "@/lib/shared/schemas";
import { AppError } from "@/lib/server/errors";
import { authed, readJson } from "@/lib/server/http";
import { stateResponse } from "@/lib/server/respond";
import {
  addQuestToToday,
  completeQuest,
  moveQuestToTomorrow,
  toggleSkipQuest,
  undoQuest,
} from "@/lib/server/services/quests";

const ACTIONS = {
  complete: completeQuest,
  undo: undoQuest,
  skip: toggleSkipQuest,
  move: moveQuestToTomorrow,
};

export const POST = authed(async (ctx) => {
  const action = ctx.params.action;
  if (action === "add") {
    const { questDefId } = await readJson(ctx.req, addToTodaySchema);
    return stateResponse(ctx, await addQuestToToday(ctx, questDefId));
  }
  const run = ACTIONS[action as keyof typeof ACTIONS];
  if (!run) throw new AppError(404, "Unknown quest action", "NOT_FOUND");
  const { dailyQuestId } = await readJson(ctx.req, questActionSchema);
  return stateResponse(ctx, await run(ctx, dailyQuestId));
});
