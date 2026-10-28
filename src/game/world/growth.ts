import { PILLARS, type Pillar } from "@/lib/shared/pillars";
import type { GameState } from "@/lib/shared/types";
import { UNLOCKS_BY_KEY } from "@/lib/shared/unlocks";

/** Which building belongs to which pillar. */
export const PILLAR_BUILDING: Record<Pillar, "temple" | "arena" | "sanctuary" | "bank"> = {
  mental: "temple",
  physical: "arena",
  spiritual: "sanctuary",
  financial: "bank",
};

const LEVEL_UNLOCK: Record<Pillar, string> = {
  mental: "master_temple",
  physical: "champion_arena",
  spiritual: "sacred_garden",
  financial: "grand_treasury",
};

/**
 * Building stage shown in the world: the campaign stage, or the final stage
 * if a lifetime level-20 unlock already earned it.
 */
export function worldStages(state: GameState): Record<Pillar, number> {
  return Object.fromEntries(
    PILLARS.map((p) => {
      const unlock = UNLOCKS_BY_KEY[LEVEL_UNLOCK[p]];
      const levelBonus = state.stats.pillars[p].level >= unlock.level ? 5 : 0;
      return [p, Math.max(state.campaign.progress.stages[p], levelBonus)];
    }),
  ) as Record<Pillar, number>;
}
