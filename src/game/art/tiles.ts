import { Pixels, rng } from "./paint";

export const TILE = 16;

/** Tile indices in the generated tileset. */
export const T = {
  GRASS: 0,
  GRASS_TUFT: 1,
  GRASS_FLOWERS: 2,
  GRASS_DARK: 3,
  PATH: 4,
  PATH_PEBBLE: 5,
  STONE: 6,
  STONE_ALT: 7,
  WATER_A: 8,
  WATER_B: 9,
  SHORE_A: 10,
  SHORE_B: 11,
  GRAVEL: 12,
  GRAVEL_RAKED: 13,
  WOOD: 14,
  WOOD_ALT: 15,
  WALL: 16,
  WALL_BASE: 17,
  MEADOW: 18,
  CLAY: 19,
  GOLD_STONE: 20,
  BRIDGE: 21,
  GRASS_FLOWERS_B: 22,
  TATAMI: 23,
} as const;

const G = { base: "#4c8b45", light: "#5d9e50", dark: "#3f7439", tuft: "#76b85d" };

function grass(seed: number, flowers?: [string, string]) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, G.base);
  const r = rng(seed);
  for (let i = 0; i < 10; i++) p.set(Math.floor(r() * 16), Math.floor(r() * 16), r() > 0.5 ? G.light : G.dark);
  if (seed % 2) {
    const x = 3 + Math.floor(r() * 9);
    const y = 4 + Math.floor(r() * 8);
    p.set(x, y, G.tuft);
    p.set(x + 1, y - 1, G.tuft);
    p.set(x + 2, y, G.tuft);
  }
  if (flowers) {
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(r() * 12);
      const y = 2 + Math.floor(r() * 12);
      p.set(x, y, flowers[0]);
      p.set(x - 1, y, flowers[0]);
      p.set(x + 1, y, flowers[0]);
      p.set(x, y - 1, flowers[0]);
      p.set(x, y + 1, flowers[0]);
      p.set(x, y, flowers[1]);
    }
  }
  return p;
}

function path(pebbles: boolean, seed: number) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#b8925f");
  p.dither(0, 0, TILE, TILE, "#a9844f", 0.18, seed);
  p.dither(0, 0, TILE, TILE, "#c7a26f", 0.08, seed + 7);
  if (pebbles) {
    const r = rng(seed);
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(r() * 13);
      const y = 1 + Math.floor(r() * 13);
      p.rect(x, y, 2, 1, "#d9c29a");
      p.set(x, y + 1, "#8f6e43");
    }
  }
  return p;
}

function stone(alt: boolean, gold = false) {
  const p = new Pixels(TILE, TILE);
  const [fill, grout, hi] = gold ? ["#e3cf98", "#bfa463", "#f2e2b2"] : ["#d9ccb0", "#b5a585", "#e9dfc8"];
  p.rect(0, 0, TILE, TILE, fill);
  p.hline(0, 7, TILE, grout);
  p.hline(0, 15, TILE, grout);
  p.vline(alt ? 4 : 11, 0, 7, grout);
  p.vline(alt ? 11 : 4, 8, 7, grout);
  p.hline(1, 1, 3, hi);
  p.hline(6, 9, 3, hi);
  return p;
}

function water(phase: number, shore: boolean) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#3d7dc0");
  p.dither(0, 0, TILE, TILE, "#3772b2", 0.15, 3);
  const off = phase ? 4 : 0;
  p.hline((2 + off) % 16, 4, 4, "#6aa8e0");
  p.hline((9 + off) % 16, 10, 3, "#6aa8e0");
  p.hline((12 + off) % 16, 14, 2, "#5a9ad6");
  if (shore) {
    p.rect(0, 0, TILE, 3, "#3f7439");
    p.hline(0, 3, TILE, "#e8d9a8");
    p.hline(0, 4, TILE, "#2f64a0");
  }
  return p;
}

function gravel(raked: boolean) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#e6dcc2");
  p.dither(0, 0, TILE, TILE, "#d8ccae", 0.2, 11);
  if (raked) for (const y of [2, 6, 10, 14]) p.hline(0, y, TILE, "#cbbd9b");
  return p;
}

function wood(alt: boolean) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#b07a4a");
  for (const y of [3, 7, 11, 15]) p.hline(0, y, TILE, "#94643a");
  p.vline(alt ? 5 : 11, 0, 3, "#94643a");
  p.vline(alt ? 12 : 3, 4, 3, "#94643a");
  p.vline(alt ? 2 : 8, 8, 3, "#94643a");
  p.vline(alt ? 9 : 14, 12, 3, "#94643a");
  p.hline(1, 1, 3, "#c28c5a");
  return p;
}

function wall(baseboard: boolean) {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#e8d9b8");
  for (let x = 0; x < TILE; x += 4) p.vline(x, 0, TILE, "#e0cfaa");
  if (baseboard) {
    p.rect(0, 11, TILE, 5, "#8a5a36");
    p.hline(0, 11, TILE, "#a8744a");
  } else {
    p.hline(0, 0, TILE, "#cdbb95");
  }
  return p;
}

function meadow() {
  const p = grass(5);
  p.dither(0, 0, TILE, TILE, "#5b8f55", 0.1, 21);
  p.set(4, 5, "#b49be8");
  p.set(11, 10, "#b49be8");
  p.set(8, 2, "#d6c8ff");
  return p;
}

function clay() {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#c46a46");
  p.dither(0, 0, TILE, TILE, "#b55d3c", 0.2, 17);
  p.hline(0, 0, TILE, "#e8d9b8");
  return p;
}

function bridge() {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#9a6a3e");
  for (const x of [0, 4, 8, 12]) p.vline(x, 0, TILE, "#7a5030");
  p.hline(0, 0, TILE, "#5e3d24");
  p.hline(0, 15, TILE, "#5e3d24");
  return p;
}

function tatami() {
  const p = new Pixels(TILE, TILE);
  p.rect(0, 0, TILE, TILE, "#cfc58e");
  p.dither(0, 0, TILE, TILE, "#bfb47c", 0.25, 5);
  p.rect(0, 0, TILE, 1, "#4a6a4a");
  p.rect(0, 0, 1, TILE, "#4a6a4a");
  return p;
}

export function buildTileset(): Pixels {
  const tiles: Pixels[] = [];
  tiles[T.GRASS] = grass(2);
  tiles[T.GRASS_TUFT] = grass(3);
  tiles[T.GRASS_FLOWERS] = grass(4, ["#f2efe4", "#f2c14e"]);
  tiles[T.GRASS_DARK] = (() => {
    const p = grass(6);
    p.swap(G.base, "#447e3e");
    return p;
  })();
  tiles[T.PATH] = path(false, 9);
  tiles[T.PATH_PEBBLE] = path(true, 13);
  tiles[T.STONE] = stone(false);
  tiles[T.STONE_ALT] = stone(true);
  tiles[T.WATER_A] = water(0, false);
  tiles[T.WATER_B] = water(1, false);
  tiles[T.SHORE_A] = water(0, true);
  tiles[T.SHORE_B] = water(1, true);
  tiles[T.GRAVEL] = gravel(false);
  tiles[T.GRAVEL_RAKED] = gravel(true);
  tiles[T.WOOD] = wood(false);
  tiles[T.WOOD_ALT] = wood(true);
  tiles[T.WALL] = wall(false);
  tiles[T.WALL_BASE] = wall(true);
  tiles[T.MEADOW] = meadow();
  tiles[T.CLAY] = clay();
  tiles[T.GOLD_STONE] = stone(false, true);
  tiles[T.BRIDGE] = bridge();
  tiles[T.GRASS_FLOWERS_B] = grass(8, ["#f08aa8", "#fff1f5"]);
  tiles[T.TATAMI] = tatami();
  const out = new Pixels(TILE * 8, TILE * Math.ceil(tiles.length / 8));
  tiles.forEach((t, i) => out.blit(t, (i % 8) * TILE, Math.floor(i / 8) * TILE));
  return out;
}
