/**
 * Tiny pixel-art painter. All game art is drawn procedurally at 1x into
 * these buffers and rendered by Phaser with nearest-neighbour scaling, so
 * every sprite stays crisp at any zoom.
 */

const colorCache = new Map<string, number>();

/** '#rrggbb' or '#rrggbbaa' → little-endian ABGR for an ImageData Uint32 view. */
export function rgba(hex: string): number {
  let v = colorCache.get(hex);
  if (v === undefined) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    colorCache.set(hex, v);
  }
  return v;
}

export class Pixels {
  readonly buf: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.buf = new Uint32Array(w * h);
  }

  set(x: number, y: number, color: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.buf[y * this.w + x] = color ? rgba(color) : 0;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.buf[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, color: string | null) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  hline(x: number, y: number, w: number, color: string) {
    this.rect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: string) {
    this.rect(x, y, 1, h, color);
  }

  /** Filled ellipse inside the given box. */
  ellipse(x: number, y: number, w: number, h: number, color: string) {
    const cx = x + (w - 1) / 2;
    const cy = y + (h - 1) / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const dx = (x + i - cx) / rx;
        const dy = (y + j - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) this.set(x + i, y + j, color);
      }
  }

  /** Rounded rectangle with 1px-cut corners. */
  rrect(x: number, y: number, w: number, h: number, color: string) {
    this.rect(x + 1, y, w - 2, h, color);
    this.rect(x, y + 1, w, h - 2, color);
  }

  /** Draws `color` on every pixel matching a predicate (used for dithering). */
  dither(x: number, y: number, w: number, h: number, color: string, density = 0.5, seed = 1) {
    let s = seed;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        s = (s * 16807) % 2147483647;
        if ((s % 1000) / 1000 < density) this.set(x + i, y + j, color);
      }
  }

  /** Adds a 1px outline around every opaque region (4-neighbourhood). */
  outline(color: string, opts: { onlyEmpty?: boolean } = {}) {
    const c = rgba(color);
    const src = this.buf.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] !== 0) continue;
        const n =
          (x > 0 && src[y * this.w + x - 1] !== 0) ||
          (x < this.w - 1 && src[y * this.w + x + 1] !== 0) ||
          (y > 0 && src[(y - 1) * this.w + x] !== 0) ||
          (y < this.h - 1 && src[(y + 1) * this.w + x] !== 0);
        if (n && (!opts.onlyEmpty || src[y * this.w + x] === 0)) this.buf[y * this.w + x] = c;
      }
  }

  /** Copies another buffer on top (transparent pixels skipped). */
  blit(src: Pixels, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const v = src.buf[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (!v) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        this.buf[ty * this.w + tx] = v;
      }
  }

  /** Replace one colour with another everywhere (palette swaps). */
  swap(from: string, to: string) {
    const a = rgba(from);
    const b = rgba(to);
    for (let i = 0; i < this.buf.length; i++) if (this.buf[i] === a) this.buf[i] = b;
  }

  /** Draws ASCII art: each char maps to a colour via the legend ('.' = skip). */
  pattern(x: number, y: number, rows: string[], legend: Record<string, string | null>) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === "." || ch === " ") continue;
        const color = legend[ch];
        if (color !== undefined) this.set(x + i, y + j, color);
      }
    });
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.w;
    canvas.height = this.h;
    this.drawTo(canvas.getContext("2d")!, 0, 0);
    return canvas;
  }

  drawTo(ctx: CanvasRenderingContext2D, dx: number, dy: number) {
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.buf);
    // putImageData ignores compositing, so stage through a scratch canvas.
    const scratch = document.createElement("canvas");
    scratch.width = this.w;
    scratch.height = this.h;
    scratch.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(scratch, dx, dy);
  }
}

/** Deterministic PRNG so the world looks the same on every device. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Lays frames out in a grid on one canvas and returns frame rectangles. */
export function packFrames(frames: { name: string; px: Pixels }[], cols = 16) {
  const fw = Math.max(...frames.map((f) => f.px.w));
  const fh = Math.max(...frames.map((f) => f.px.h));
  const rows = Math.ceil(frames.length / cols);
  const canvas = document.createElement("canvas");
  const W = (canvas.width = fw * Math.min(cols, frames.length));
  canvas.height = fh * rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, canvas.height);
  const view = new Uint32Array(img.data.buffer);
  const rects = frames.map((f, i) => {
    const x0 = (i % cols) * fw;
    const y0 = Math.floor(i / cols) * fh;
    for (let y = 0; y < f.px.h; y++) view.set(f.px.buf.subarray(y * f.px.w, (y + 1) * f.px.w), (y0 + y) * W + x0);
    return { name: f.name, x: x0, y: y0, w: f.px.w, h: f.px.h };
  });
  ctx.putImageData(img, 0, 0);
  return { canvas, rects };
}
