import { PILLARS } from "@/lib/shared/pillars";
import * as B from "./buildings";
import { aiBot } from "./companion";
import { DECORATIONS, buildingStage, victoryLantern } from "./evolution";
import { bookshelf } from "./furniture";
import { packSprite } from "./pack";
import type { Pixels } from "./paint";
import * as P from "./props";

/**
 * Every static world image by texture key. Phaser registers these at boot,
 * and the timeline's village snapshots draw the very same art without Phaser.
 * Nature props come from the Ninja Adventure pack when it is loaded (./pack);
 * the pillar buildings, decorations and village fixtures are procedural.
 */
/** Dots ripe berries onto a pack bush (the pack has no green berry bush). */
function berries(px: Pixels | null): Pixels | null {
  if (!px) return null;
  for (const [x, y] of [[4, 6], [10, 4], [8, 10], [12, 9]]) {
    px.set(x, y, "#d24b4b");
    px.set(x, y - 1, "#ff9a9a");
  }
  return px;
}

export const WORLD_ART: Record<string, () => Pixels> = {
  home: () => B.home(),
  "tree-oak": () => packSprite("nature", 6, 8, 2, 2) ?? P.tree("oak"),
  "tree-pine": () => packSprite("nature", 2, 0, 2, 2) ?? P.tree("pine"),
  "tree-cherry": () => packSprite("nature", 0, 18, 3, 3) ?? P.tree("cherry"),
  "tree-knowledge": () => P.tree("knowledge"),
  "tree-autumn": () => packSprite("nature", 9, 18, 3, 3) ?? P.tree("autumn"),
  bush: () => packSprite("nature", 2, 10) ?? P.bush(),
  "bush-berry": () => berries(packSprite("nature", 1, 10)) ?? P.bush(true),
  rock: () => packSprite("nature", 18, 9) ?? P.rock(),
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
  bamboo: () => packSprite("nature", 11, 8, 1, 3) ?? P.bamboo(),
  "pot-red": () => P.flowerPot("#e05f5f"),
  "pot-yellow": () => P.flowerPot("#f2c14e"),
  mailbox: () => P.mailbox(),
  books: () => P.bookStack(),
  "empty-shelf": () => bookshelf(0),
  reeds: () => P.reeds(),
  tablet: () => P.tablet(),
  lily: () => P.lilyPad(),
  fence: () => P.fence(),
  "coin-pile": () => P.coinPile(),
  "money-bag": () => P.moneyBag(),
  "banner-red": () => P.banner("#d24b4b"),
  "victory-lantern": () => victoryLantern(),
  fountain: () => P.fountain(0),
  waterfall: () => P.waterfall(0),
  "ai-bot": () => aiBot(0),
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
export const ANIMATED_PROPS = new Set(["fountain", "waterfall", "ai-bot"]);
