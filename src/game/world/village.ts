import { rng } from "../art/paint";
import { T, TILE } from "../art/tiles";
import type { PanelId } from "../bridge";

export const VILLAGE_W = 64;
export const VILLAGE_H = 48;

export interface Prop {
  key: string;
  x: number;
  /** y of the sprite's base (used for depth sorting). */
  y: number;
  /** Collision box centred on x, ending `oy` px above the base. */
  collide?: { w: number; h: number; oy?: number };
  flat?: boolean;
  anim?: string;
}

export type InteractAction =
  | { type: "panel"; panel: PanelId }
  | { type: "scene"; scene: "home" | "village" }
  | { type: "npc"; npc: string }
  | { type: "talk"; speaker: string; lines: string[] };

export interface Interactable {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  verb: string;
  action: InteractAction;
}

export interface Light {
  x: number;
  y: number;
  size: number;
  color: "warm" | "cool" | "purple" | "pink";
}

export interface NpcSpawn {
  id: string;
  look: string;
  name: string;
  x: number;
  y: number;
  wander: number;
  activity?: "exercise" | "read" | "meditate";
}

/** Fixed anchor points in world pixels. */
export const SPOTS = {
  home: { x: 512, y: 224 },
  temple: { x: 208, y: 224 },
  arena: { x: 816, y: 224 },
  sanctuary: { x: 208, y: 544 },
  bank: { x: 800, y: 544 },
  vault: { x: 680, y: 544 },
  garage: { x: 924, y: 544 },
  fountain: { x: 512, y: 372 },
  board: { x: 452, y: 318 },
  spawn: { x: 512, y: 246 },
};

export function buildVillage() {
  const W = VILLAGE_W;
  const H = VILLAGE_H;
  const r = rng(20261028);
  const ground: number[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => {
      const v = r();
      return v < 0.06 ? T.GRASS_FLOWERS : v < 0.1 ? T.GRASS_FLOWERS_B : v < 0.35 ? T.GRASS_TUFT : T.GRASS;
    }),
  );
  const blocked: boolean[][] = Array.from({ length: H }, () => Array(W).fill(false));
  const fill = (x0: number, y0: number, w: number, h: number, tile: number | (() => number), block = false) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        ground[y][x] = typeof tile === "function" ? tile() : tile;
        if (block) blocked[y][x] = true;
      }
  };
  const reserve = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (blocked[y]?.[x] !== undefined) blocked[y][x] = true;
  };
  const pathTile = () => (r() < 0.25 ? T.PATH_PEBBLE : T.PATH);

  // District ground
  fill(5, 16, 16, 7, () => (r() < 0.2 ? T.GRASS_TUFT : T.MEADOW)); // knowledge garden
  fill(44, 16, 15, 7, T.CLAY); // training yard
  fill(10, 37, 10, 6, () => (r() < 0.5 ? T.GRAVEL_RAKED : T.GRAVEL)); // zen garden
  fill(44, 37, 15, 6, () => (r() < 0.5 ? T.GOLD_STONE : T.STONE)); // market square

  // Roads and plaza
  fill(6, 14, 53, 2, pathTile);
  fill(6, 34, 53, 2, pathTile);
  fill(31, 16, 2, 18, pathTile);
  fill(26, 17, 12, 10, () => (r() < 0.5 ? T.STONE : T.STONE_ALT));
  fill(12, 16, 2, 1, pathTile);
  // Pond with shore + waterfall corner (south-west)
  for (let y = 37; y < 43; y++) for (let x = 2; x < 9; x++) ground[y][x] = y === 37 ? T.SHORE_A : T.WATER_A;
  reserve(2, 37, 7, 6);

  // Random scatter must keep paths walkable and leave designed districts alone.
  const designed = new Set<number>([T.PATH, T.PATH_PEBBLE, T.STONE, T.STONE_ALT, T.CLAY, T.GRAVEL, T.GRAVEL_RAKED, T.GOLD_STONE, T.MEADOW]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (designed.has(ground[y][x])) blocked[y][x] = true;
    }

  const props: Prop[] = [];
  const interact: Interactable[] = [];
  const lights: Light[] = [];
  const add = (p: Prop) => props.push(p);

  // Building footprints (drawn by the scene, collision + reservations here)
  const buildings = [
    { id: "home", ...SPOTS.home, w: 72, h: 34, tiles: [29, 9, 7, 5] },
    { id: "temple", ...SPOTS.temple, w: 96, h: 44, tiles: [9, 7, 9, 7] },
    { id: "arena", ...SPOTS.arena, w: 100, h: 50, tiles: [47, 8, 9, 6] },
    { id: "sanctuary", ...SPOTS.sanctuary, w: 92, h: 40, tiles: [9, 27, 9, 7] },
    { id: "bank", ...SPOTS.bank, w: 92, h: 48, tiles: [46, 27, 8, 7] },
    { id: "vault", ...SPOTS.vault, w: 60, h: 40, tiles: [40, 30, 5, 4] },
    { id: "garage", ...SPOTS.garage, w: 72, h: 40, tiles: [55, 30, 6, 4] },
  ];
  for (const b of buildings) reserve(b.tiles[0], b.tiles[1], b.tiles[2], b.tiles[3]);

  // Plaza furniture
  add({ key: "fountain", x: SPOTS.fountain.x, y: SPOTS.fountain.y, collide: { w: 44, h: 16, oy: 2 }, anim: "fountain" });
  add({ key: "quest-board", x: SPOTS.board.x, y: SPOTS.board.y, collide: { w: 32, h: 8 } });
  add({ key: "signpost", x: 560, y: 300, collide: { w: 10, h: 6 } });
  for (const [x, y] of [[424, 296], [600, 296], [424, 424], [600, 424]]) {
    add({ key: "lamp", x, y, collide: { w: 6, h: 4 } });
    lights.push({ x, y: y - 24, size: 120, color: "warm" });
  }
  add({ key: "bench", x: 448, y: 420, collide: { w: 24, h: 6 } });
  add({ key: "bench", x: 576, y: 420, collide: { w: 24, h: 6 } });
  for (const [x, y] of [[440, 268], [584, 268]]) add({ key: "bush-berry", x, y, collide: { w: 14, h: 6 } });

  // Home garden
  add({ key: "mailbox", x: 564, y: 232, collide: { w: 6, h: 4 } });
  add({ key: "pot-red", x: 470, y: 232, collide: { w: 8, h: 4 } });
  add({ key: "pot-yellow", x: 556, y: 210, collide: { w: 8, h: 4 } });
  for (const x of [448, 464, 560, 576]) add({ key: "fence", x, y: 214, collide: { w: 16, h: 4 } });
  lights.push({ x: 488, y: 196, size: 56, color: "warm" }, { x: 536, y: 196, size: 56, color: "warm" });

  // Mind Temple district
  for (const [x, y] of [[104, 252], [312, 252], [140, 352], [280, 360]]) add({ key: "tree-knowledge", x, y, collide: { w: 10, h: 6 } });
  for (const [x, y] of [[176, 300], [240, 304]]) add({ key: "tablet", x, y, collide: { w: 12, h: 6 } });
  add({ key: "books", x: 210, y: 330, collide: { w: 12, h: 4 } });
  add({ key: "bench", x: 120, y: 300, collide: { w: 24, h: 6 } });
  lights.push({ x: 208, y: 190, size: 90, color: "purple" }, { x: 104, y: 226, size: 50, color: "purple" }, { x: 312, y: 226, size: 50, color: "purple" });

  // Strength Arena district
  add({ key: "dumbbell-rack", x: 728, y: 296, collide: { w: 32, h: 8 } });
  add({ key: "barbell", x: 784, y: 320, collide: { w: 26, h: 6 } });
  add({ key: "dummy", x: 880, y: 300, collide: { w: 10, h: 6 } });
  add({ key: "dummy", x: 912, y: 330, collide: { w: 10, h: 6 } });
  for (const x of [720, 912]) {
    add({ key: "lamp", x, y: 262, collide: { w: 6, h: 4 } });
    lights.push({ x, y: 238, size: 100, color: "warm" });
  }

  // Sanctuary district
  for (const [x, y] of [[112, 520], [304, 520], [96, 636], [330, 650]]) add({ key: "tree-cherry", x, y, collide: { w: 10, h: 6 } });
  for (const x of [176, 240]) {
    add({ key: "stone-lantern", x, y: 560, collide: { w: 10, h: 6 } });
    lights.push({ x, y: 548, size: 70, color: "warm" });
  }
  add({ key: "gate", x: 104, y: 576, collide: undefined });
  add({ key: "bamboo", x: 340, y: 600, collide: { w: 12, h: 6 } });
  add({ key: "bamboo", x: 356, y: 612, collide: { w: 12, h: 6 } });
  for (const [x, y] of [[200, 640], [256, 660], [176, 672]]) add({ key: "rock", x, y, collide: { w: 14, h: 6 } });
  add({ key: "waterfall", x: 34, y: 610, collide: { w: 36, h: 30 }, anim: "waterfall" });
  for (const [x, y] of [[80, 640], [116, 668], [60, 674]]) add({ key: "lily", x, y, flat: true });
  lights.push({ x: 208, y: 470, size: 90, color: "pink" });

  // Wealth Kingdom district
  add({ key: "stall-a", x: 744, y: 648, collide: { w: 38, h: 10 } });
  add({ key: "stall-b", x: 856, y: 648, collide: { w: 38, h: 10 } });
  add({ key: "coin-pile", x: 800, y: 664, collide: { w: 14, h: 6 } });
  add({ key: "money-bag", x: 720, y: 600, collide: { w: 10, h: 6 } });
  for (const x of [712, 888]) {
    add({ key: "lamp", x, y: 596, collide: { w: 6, h: 4 } });
    lights.push({ x, y: 572, size: 100, color: "warm" });
  }
  lights.push({ x: 800, y: 500, size: 90, color: "warm" });

  // Forest border + scattered trees on free grass
  const treeKinds = ["tree-oak", "tree-pine", "tree-oak", "tree-autumn"];
  const canPlace = (tx: number, ty: number) => {
    for (let y = ty - 1; y <= ty; y++) for (let x = tx - 1; x <= tx + 1; x++) if (blocked[y]?.[x] !== false) return false;
    return true;
  };
  const placeTree = (tx: number, ty: number, kind?: string) => {
    if (!canPlace(tx, ty)) return;
    for (let y = ty - 1; y <= ty; y++) for (let x = tx - 1; x <= tx + 1; x++) blocked[y][x] = true;
    add({ key: kind ?? treeKinds[Math.floor(r() * treeKinds.length)], x: tx * TILE + 8, y: ty * TILE + 14, collide: { w: 10, h: 6 } });
  };
  for (let x = 1; x < W - 1; x += 2) {
    placeTree(x, 2 + Math.floor(r() * 2));
    placeTree(x, H - 2 - Math.floor(r() * 2));
  }
  for (let y = 3; y < H - 2; y += 2) {
    placeTree(1 + Math.floor(r() * 2), y);
    placeTree(W - 2 - Math.floor(r() * 2), y);
  }
  for (let i = 0; i < 70; i++) placeTree(3 + Math.floor(r() * (W - 6)), 4 + Math.floor(r() * (H - 8)));
  for (let i = 0; i < 40; i++) {
    const tx = 3 + Math.floor(r() * (W - 6));
    const ty = 4 + Math.floor(r() * (H - 8));
    if (blocked[ty][tx] || blocked[ty][tx + 1]) continue;
    blocked[ty][tx] = true;
    add({ key: r() < 0.5 ? "bush" : "rock", x: tx * TILE + 8, y: ty * TILE + 12, collide: { w: 12, h: 5 } });
  }

  // Interactables
  interact.push(
    { id: "home", ...SPOTS.home, y: SPOTS.home.y + 10, r: 22, label: "Your Home", verb: "Enter", action: { type: "scene", scene: "home" } },
    { id: "temple", ...SPOTS.temple, y: SPOTS.temple.y + 10, r: 26, label: "Mind Temple", verb: "Enter", action: { type: "panel", panel: "mental" } },
    { id: "arena", ...SPOTS.arena, y: SPOTS.arena.y + 10, r: 26, label: "Strength Arena", verb: "Enter", action: { type: "panel", panel: "physical" } },
    { id: "sanctuary", ...SPOTS.sanctuary, y: SPOTS.sanctuary.y + 10, r: 26, label: "Spirit Sanctuary", verb: "Enter", action: { type: "panel", panel: "spiritual" } },
    { id: "bank", ...SPOTS.bank, y: SPOTS.bank.y + 10, r: 26, label: "Wealth Kingdom Bank", verb: "Enter", action: { type: "panel", panel: "financial" } },
    { id: "vault", ...SPOTS.vault, y: SPOTS.vault.y + 10, r: 26, label: "Tuition Vault", verb: "Open", action: { type: "panel", panel: "financial" } },
    { id: "garage", ...SPOTS.garage, y: SPOTS.garage.y + 10, r: 28, label: "Car Garage", verb: "Open", action: { type: "panel", panel: "financial" } },
    { id: "board", ...SPOTS.board, y: SPOTS.board.y + 10, r: 26, label: "Daily Quest Board", verb: "Read", action: { type: "panel", panel: "quests" } },
    {
      id: "fountain",
      ...SPOTS.fountain,
      y: SPOTS.fountain.y + 8,
      r: 30,
      label: "Fountain",
      verb: "Look",
      action: { type: "talk", speaker: "Fountain", lines: ["The water ripples with your reflection.", "No wish needed here — every real win you log changes this world."] },
    },
    {
      id: "signpost",
      x: 560,
      y: 306,
      r: 18,
      label: "Signpost",
      verb: "Read",
      action: {
        type: "talk",
        speaker: "Signpost",
        lines: ["↖ Mind Temple   ↗ Strength Arena", "↙ Spirit Sanctuary   ↘ Wealth Kingdom", "↑ Home — your house grows as you do."],
      },
    },
  );

  const npcs: NpcSpawn[] = [
    { id: "guide", look: "guide", name: "The Guide", x: 568, y: 352, wander: 0 },
    { id: "librarian", look: "librarian", name: "Librarian Iris", x: 268, y: 280, wander: 40, activity: "read" },
    { id: "coach", look: "coach", name: "Coach Rafa", x: 816, y: 288, wander: 30, activity: "exercise" },
    { id: "keeper", look: "keeper", name: "Keeper Hana", x: 288, y: 596, wander: 30, activity: "meditate" },
    { id: "banker", look: "banker", name: "Banker Otto", x: 752, y: 580, wander: 30 },
  ];

  const colliders = [
    ...props.filter((p) => p.collide).map((p) => ({ x: p.x, y: p.y - (p.collide!.oy ?? 0) - p.collide!.h / 2, w: p.collide!.w, h: p.collide!.h })),
    ...buildings.map((b) => ({ x: b.x, y: b.y - 6 - b.h / 2, w: b.w, h: b.h })),
    // pond water
    { x: 5.5 * TILE, y: 40.5 * TILE, w: 7 * TILE, h: 5 * TILE },
  ];

  return { ground, props, interact, lights, npcs, colliders, width: W * TILE, height: H * TILE };
}

export type VillageLayout = ReturnType<typeof buildVillage>;
