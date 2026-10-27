import "server-only";
import type { GameEvent } from "@/lib/shared/types";
import { json, type AuthedContext } from "./http";
import { buildState } from "./services/state";

/** Every mutation answers with the fresh server-computed state plus what changed. */
export async function stateResponse(ctx: AuthedContext, events: GameEvent[] = []) {
  const state = await buildState(ctx);
  return json({ ok: true, state, events });
}
