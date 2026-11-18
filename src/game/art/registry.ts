import { PILLARS } from "@/lib/shared/pillars";
import * as B from "./buildings";
import { aiBot } from "./companion";
import { DECORATIONS, buildingStage, victoryLantern } from "./evolution";
import { bookshelf } from "./furniture";
import { packSprite } from "./pack";
import { Pixels } from "./paint";
import * as P from "./props";
import { gardenProp, townHome, townLandmark, townTile } from "./town";

/**
 * Every static world image by texture key. Phaser registers these at boot,
 * and the timeline's village snapshots draw the very same art without Phaser.
 * The village combines Tiny Town structures with handmade progression details.
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

function townTree(kind: "oak" | "pine" | "autumn") {
  const index = { oak: 16, pine: 4, autumn: 15 }[kind];
  const tile = townTile(index);
  if (!tile) return null;
  const out = new Pixels(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) out.buf[y * out.w + x] = tile.get(x >> 1, y >> 1);
  }
  return out;
}

export const WORLD_ART: Record<string, () => Pixels> = {
  home: () => townHome() ?? B.home(),
  "tree-oak": () => townTree("oak") ?? packSprite("nature", 6, 8, 2, 2) ?? P.tree("oak"),
  "tree-pine": () => townTree("pine") ?? packSprite("nature", 2, 0, 2, 2) ?? P.tree("pine"),
  "tree-cherry": () => packSprite("nature", 0, 18, 3, 3) ?? P.tree("cherry"),
  "tree-knowledge": () => P.tree("knowledge"),
  "tree-autumn": () => townTree("autumn") ?? packSprite("nature", 9, 18, 3, 3) ?? P.tree("autumn"),
  bush: () => packSprite("nature", 2, 10) ?? P.bush(),
  "bush-berry": () => berries(packSprite("nature", 1, 10)) ?? P.bush(true),
  rock: () => gardenProp(1) ?? packSprite("nature", 18, 9) ?? P.rock(),
  mushrooms: () => gardenProp(6) ?? P.bush(),
  "river-rock": () => gardenProp(2) ?? P.rock(),
  "river-grass": () => gardenProp(8) ?? P.bamboo(),
  "garden-fence": () => townTile(81) ?? P.fence(),
  "waystone": () => townTile(83) ?? P.signpost(),
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
  for (let s = 0; s <= 5; s++) WORLD_ART[`building-${pillar}-${s}`] = () => townLandmark(pillar, s) ?? buildingStage(pillar, s);
  DECORATIONS[pillar].forEach((draw, i) => (WORLD_ART[`deco-${pillar}-${i}`] = draw));
}

/** Building texture key for a pillar at an evolution stage. */
export const buildingKey = (pillar: string, stage: number) => `building-${pillar}-${stage}`;

/** Decoration texture for the n-th day won in a pillar (cycles through six items). */
export const decorationKey = (pillar: string, n: number) => `deco-${pillar}-${n % 6}`;

/** Animated props are registered as sheets by Phaser; snapshots use frame 0. */
export const ANIMATED_PROPS = new Set(["fountain", "waterfall", "ai-bot"]);
