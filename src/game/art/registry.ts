import { PILLARS } from "@/lib/shared/pillars";
import * as B from "./buildings";
import { DECORATIONS, buildingStage, victoryLantern } from "./evolution";
import type { Pixels } from "./paint";
import * as P from "./props";

/**
 * Every static world image by texture key. Phaser registers these at boot,
 * and the timeline's village snapshots draw the very same art without Phaser.
 */
export const WORLD_ART: Record<string, () => Pixels> = {
  home: () => B.home(),
  "tree-oak": () => P.tree("oak"),
  "tree-pine": () => P.tree("pine"),
  "tree-cherry": () => P.tree("cherry"),
  "tree-knowledge": () => P.tree("knowledge"),
  "tree-autumn": () => P.tree("autumn"),
  bush: () => P.bush(),
  "bush-berry": () => P.bush(true),
  rock: () => P.rock(),
  "stone-lantern": () => P.stoneLantern(),
  lamp: () => P.lampPost(),
  bench: () => P.bench(),
  "quest-board": () => P.questBoard(),
  signpost: () => P.signpost(),
  "dumbbell-rack": () => P.dumbbellRack(),
  dummy: () => P.dummy(),
  barbell: () => P.barbell(),
  "stall-a": () => P.stall(["#d24b4b", "#f4efe4"]),
  "stall-b": () => P.stall(["#3e7cc9", "#f2c14e"]),
  gate: () => P.gate(),
  bamboo: () => P.bamboo(),
  "pot-red": () => P.flowerPot("#e05f5f"),
  "pot-yellow": () => P.flowerPot("#f2c14e"),
  mailbox: () => P.mailbox(),
  books: () => P.bookStack(),
  tablet: () => P.tablet(),
  lily: () => P.lilyPad(),
  fence: () => P.fence(),
  "coin-pile": () => P.coinPile(),
  "money-bag": () => P.moneyBag(),
  "banner-red": () => P.banner("#d24b4b"),
  "victory-lantern": () => victoryLantern(),
  fountain: () => P.fountain(0),
  waterfall: () => P.waterfall(0),
};

for (let s = 0; s <= 5; s++) WORLD_ART[`garage-${s}`] = () => B.garage(s);
for (let l = 0; l <= 10; l++) WORLD_ART[`vault-${l}`] = () => B.vault(l);
for (const pillar of PILLARS) {
  for (let s = 0; s <= 5; s++) WORLD_ART[`building-${pillar}-${s}`] = () => buildingStage(pillar, s);
  DECORATIONS[pillar].forEach((draw, i) => (WORLD_ART[`deco-${pillar}-${i}`] = draw));
}

/** Building texture key for a pillar at an evolution stage. */
export const buildingKey = (pillar: string, stage: number) => `building-${pillar}-${stage}`;

/** Decoration texture for the n-th day won in a pillar (cycles through six items). */
export const decorationKey = (pillar: string, n: number) => `deco-${pillar}-${n % 6}`;

/** Animated props are registered as sheets by Phaser; snapshots use frame 0. */
export const ANIMATED_PROPS = new Set(["fountain", "waterfall"]);
