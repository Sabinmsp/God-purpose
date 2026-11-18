import type { Pillar } from "@/lib/shared/pillars";
import { packTile } from "./pack";
import { Pixels } from "./paint";

const TILE = 16;
const COLUMNS = 12;
const ROOF_COLORS: Record<Pillar, readonly string[]> = {
  mental: ["#8774b9", "#685492", "#443b69"],
  physical: ["#de8a65", "#b95c49", "#753e3f"],
  spiritual: ["#82bab1", "#4e928b", "#32626a"],
  financial: ["#e0b86b", "#b48447", "#775239"],
};

export function townTile(index: number) {
  return packTile("town", index % COLUMNS, Math.floor(index / COLUMNS));
}

/** A cropped prop from the 64px Tiny Swords atlas, scaled to the village's tile grid. */
export function gardenProp(index: number) {
  const sprite = packTile("swords", index * 4, 0, 4, 4);
  if (!sprite) return null;
  const out = new Pixels(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) out.buf[y * out.w + x] = sprite.get(x * 2, y * 2);
  }
  return out;
}

const TERRAIN_COLORS = {
  "#84c669": "#628c64",
  "#65a556": "#4f7557",
  "#eaa56c": "#c7aa79",
  "#cf8254": "#b49264",
  "#fec99c": "#e0c299",
};

export function gardenTile(index: number) {
  const tile = townTile(index);
  if (!tile) return null;
  Object.entries(TERRAIN_COLORS).forEach(([original, replacement]) => tile.swap(original, replacement));
  return tile;
}

function drawRange(target: Pixels, row: readonly number[], x: number, y: number) {
  row.forEach((index, i) => {
    const tile = townTile(index);
    if (tile) target.blit(tile, x + i * TILE, y);
  });
}

function recolorRoof(tile: Pixels, colors: readonly string[]) {
  // Preserve the atlas' lines and tile highlights while giving each district
  // a roof that can be recognized from across the village.
  const swatches = ["#fcbc8f", "#f28462", "#c34b35"];
  swatches.forEach((color, i) => tile.swap(color, colors[i]));
}

type Facade = { width: number; masonry: boolean; color: readonly string[] };

function facade(out: Pixels, left: number, foot: number, spec: Facade) {
  const { width, masonry, color } = spec;
  const start = masonry ? 76 : 72;
  const window = masonry ? 88 : 84;
  const door = masonry ? 89 : 85;
  const wall = Array.from({ length: width }, (_, i) => i === 0 ? start : i === width - 1 ? start + 3 : start + 1);
  drawRange(out, wall, left, foot - 32);
  drawRange(out, wall, left, foot - 16);
  const center = Math.floor(width / 2);
  for (let i = 1; i < width - 1; i++) drawRange(out, [i === center ? door : window], left + i * TILE, foot - 16);

  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < width; i++) {
      const tile = townTile((row ? 64 : 52) + (i === 0 ? 0 : i === width - 1 ? 2 : 1));
      if (!tile) continue;
      recolorRoof(tile, color);
      out.blit(tile, left + i * TILE, foot - 58 + row * TILE);
    }
  }
}

function tower(out: Pixels, x: number, foot: number, tall: number) {
  for (let i = 0; i < tall - 1; i++) drawRange(out, [108, i === 0 ? 125 : 109, 110], x, foot - (i + 1) * TILE);
  drawRange(out, [96, 97, 98], x, foot - tall * TILE);
}

export function townHome() {
  if (!townTile(0)) return null;
  const out = new Pixels(112, 86);
  out.ellipse(7, 74, 98, 12, "#233a38");
  facade(out, 16, 83, { width: 5, masonry: false, color: ROOF_COLORS.spiritual });
  drawRange(out, [103], 77, 16);
  drawRange(out, [130], 5, 69);
  drawRange(out, [107], 90, 69);
  return out;
}

export function townLandmark(pillar: Pillar, stage: number) {
  if (!townTile(0)) return null;
  const out = new Pixels(144, 130);
  const foot = 126;
  const width = pillar === "physical" || pillar === "financial" ? 7 : 5;
  out.ellipse(5, 116, 134, 14, "#233a38");
  if (pillar === "mental" || stage >= 3) tower(out, 14, 119, 5);
  if (pillar === "financial" || stage >= 3) tower(out, 84, 119, 6);
  if (pillar === "spiritual") {
    drawRange(out, [4, 16, 5], 7, 110);
    drawRange(out, [3, 15, 5], 91, 110);
  }
  facade(out, (out.w - width * TILE) / 2, foot, {
    width,
    masonry: pillar !== "spiritual",
    color: ROOF_COLORS[pillar],
  });

  if (pillar === "physical") {
    drawRange(out, [95], 23, 101);
    drawRange(out, [95], 105, 101);
  }
  if (pillar === "financial") drawRange(out, [93], 64, 88);
  if (pillar === "mental") drawRange(out, [57], 65, 87);
  if (pillar === "spiritual") drawRange(out, [104], 64, 83);

  for (let i = 0; i < stage; i++) {
    const x = 72 + (i - (stage - 1) / 2) * 10;
    out.rrect(x - 3, 63, 6, 9, "#50394b");
    out.rect(x - 2, 65, 4, 4, "#ffda83");
    out.set(x, 65, "#fff3ce");
  }
  return out;
}
