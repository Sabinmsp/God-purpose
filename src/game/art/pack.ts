import { Pixels } from "./paint";

/**
 * Ninja Adventure asset pack by Pixel-boy and AAA, released under CC0:
 * https://pixel-boy.itch.io/ninja-adventure-asset-pack
 *
 * The sheets live in public/assets/ninja-adventure and are decoded once, before
 * any texture is drawn (the live game and the Journey snapshots both wait for
 * `loadPack()`). Everything that uses them falls back to the procedural art if
 * a sheet is missing or fails to load, so the game is complete either way.
 */
export const PACK_DIR = "/assets/ninja-adventure";
export const PACK_TILE = 16;

const SHEETS = {
  floor: "TilesetFloor.png",
  detail: "TilesetFloorDetail.png",
  nature: "TilesetNature.png",
  water: "TilesetWater.png",
} as const;
export type Sheet = keyof typeof SHEETS;

const sheets = new Map<Sheet, Pixels>();
let loading: Promise<void> | null = null;

async function decode(src: string): Promise<Pixels> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const px = new Pixels(canvas.width, canvas.height);
  // ImageData bytes are RGBA, which is the same little-endian layout Pixels uses.
  px.buf.set(new Uint32Array(data.buffer, data.byteOffset, px.w * px.h));
  return px;
}

/** Decodes every sheet once; resolves even if some fail (those pieces stay procedural). */
export function loadPack(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(SHEETS) as Sheet[]).map(async (key) => {
      try {
        sheets.set(key, await decode(`${PACK_DIR}/${SHEETS[key]}`));
      } catch {
        /* missing sheet: keep the procedural art */
      }
    }),
  ).then(() => undefined);
  return loading;
}

/** A w×h-tile region of a sheet, or null when that sheet isn't loaded. */
export function packTile(sheet: Sheet, col: number, row: number, w = 1, h = 1): Pixels | null {
  const src = sheets.get(sheet);
  if (!src) return null;
  const out = new Pixels(w * PACK_TILE, h * PACK_TILE);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) out.buf[y * out.w + x] = src.get(col * PACK_TILE + x, row * PACK_TILE + y);
  return out;
}

/**
 * A sprite cut from a sheet, with empty rows trimmed from the bottom so it
 * stands on its base (world props are anchored bottom-centre).
 */
export function packSprite(sheet: Sheet, col: number, row: number, w = 1, h = 1): Pixels | null {
  const px = packTile(sheet, col, row, w, h);
  if (!px) return null;
  let bottom = px.h;
  while (bottom > 1 && px.buf.subarray((bottom - 1) * px.w, bottom * px.w).every((v) => !(v >>> 24))) bottom--;
  if (bottom === px.h) return px;
  const out = new Pixels(px.w, bottom);
  out.buf.set(px.buf.subarray(0, px.w * bottom));
  return out;
}

/** Stacks pieces (e.g. a flower over a grass tile); null if any piece is missing. */
export function layered(...parts: (Pixels | null)[]): Pixels | null {
  if (parts.some((p) => !p)) return null;
  const [base, ...rest] = parts as Pixels[];
  const out = new Pixels(base.w, base.h);
  out.buf.set(base.buf);
  for (const p of rest) out.blit(p, 0, 0);
  return out;
}
