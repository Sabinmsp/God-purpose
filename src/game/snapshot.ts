import { PILLARS, type Pillar } from "@/lib/shared/pillars";
import { WORLD_ART, buildingKey, decorationKey } from "./art/registry";
import { buildTileset, TILE } from "./art/tiles";
import { PILLAR_BUILDING } from "./world/growth";
import { SPOTS, buildVillage, type VillageLayout } from "./world/village";

/**
 * Draws the whole village (1 px = 1 world pixel) for any campaign state,
 * using the same art and layout as the live game. Used by the timeline and
 * the before/after comparison; no Phaser required.
 */
export interface SnapshotState {
  stages: Record<Pillar, number>;
  pillarDays: Record<Pillar, number>;
  fourWinsDays: number;
  vaultLevel?: number;
  carStage?: number;
}

const artCache = new Map<string, HTMLCanvasElement>();
let layout: VillageLayout | null = null;
let ground: HTMLCanvasElement | null = null;

function art(key: string) {
  let c = artCache.get(key);
  if (!c) {
    c = WORLD_ART[key]().toCanvas();
    artCache.set(key, c);
  }
  return c;
}

function groundLayer(v: VillageLayout) {
  if (ground) return ground;
  const tiles = buildTileset().toCanvas();
  const cols = tiles.width / TILE;
  ground = document.createElement("canvas");
  ground.width = v.width;
  ground.height = v.height;
  const ctx = ground.getContext("2d")!;
  v.ground.forEach((row, ty) =>
    row.forEach((t, tx) => ctx.drawImage(tiles, (t % cols) * TILE, Math.floor(t / cols) * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE)),
  );
  return ground;
}

export function renderVillage(s: SnapshotState): HTMLCanvasElement {
  const v = (layout ??= buildVillage());
  const canvas = document.createElement("canvas");
  canvas.width = v.width;
  canvas.height = v.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(groundLayer(v), 0, 0);

  const items: { key: string; x: number; y: number }[] = [];
  for (const p of v.props) {
    if (p.flat) ctx.drawImage(art(p.key), Math.round(p.x - art(p.key).width / 2), p.y - art(p.key).height);
    else items.push({ key: p.anim ?? p.key, x: p.x, y: p.y });
  }
  items.push({ key: "home", ...SPOTS.home });
  items.push({ key: `vault-${s.vaultLevel ?? 0}`, ...SPOTS.vault });
  items.push({ key: `garage-${s.carStage ?? 0}`, ...SPOTS.garage });
  for (const p of PILLARS) {
    items.push({ key: buildingKey(p, s.stages[p]), ...SPOTS[PILLAR_BUILDING[p]] });
    const slots = v.decorSlots[p];
    for (let i = 0; i < Math.min(s.pillarDays[p], slots.length); i++) items.push({ key: decorationKey(p, i), ...slots[i] });
  }
  for (let i = 0; i < Math.min(s.fourWinsDays, v.lanternSlots.length); i++) items.push({ key: "victory-lantern", ...v.lanternSlots[i] });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    const img = art(it.key);
    ctx.drawImage(img, Math.round(it.x - img.width / 2), it.y - img.height);
  }
  return canvas;
}
