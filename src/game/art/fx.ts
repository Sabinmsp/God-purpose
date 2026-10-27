import { Pixels } from "./paint";

export function dot(size: number, color = "#ffffff"): Pixels {
  const p = new Pixels(size, size);
  p.rect(0, 0, size, size, color);
  return p;
}

export function spark(): Pixels {
  const p = new Pixels(7, 7);
  p.vline(3, 0, 7, "#ffffff");
  p.hline(0, 3, 7, "#ffffff");
  p.rect(2, 2, 3, 3, "#ffffff");
  return p;
}

export function petal(): Pixels {
  const p = new Pixels(4, 3);
  p.rect(1, 0, 2, 3, "#ffffff");
  p.rect(0, 1, 4, 1, "#ffffff");
  return p;
}

export function glyph(): Pixels {
  const p = new Pixels(5, 5);
  p.pattern(0, 0, ["#.#.#", ".###.", "##.##", ".###.", "#.#.#"], { "#": "#ffffff" });
  return p;
}

export function coin(): Pixels {
  const p = new Pixels(6, 6);
  p.ellipse(0, 0, 6, 6, "#f2c14e");
  p.rect(2, 1, 2, 4, "#fff1b0");
  return p;
}

export function zee(): Pixels {
  const p = new Pixels(5, 5);
  p.pattern(0, 0, ["#####", "...#.", "..#..", ".#...", "#####"], { "#": "#ffffff" });
  return p;
}

export function shadow(): Pixels {
  const p = new Pixels(16, 6);
  p.ellipse(0, 0, 16, 6, "#1b142455");
  return p;
}

export function arrow(): Pixels {
  const p = new Pixels(9, 7);
  p.pattern(0, 0, ["#########", ".#######.", "..#####..", "...###...", "....#....", ".........", "........."], { "#": "#fff1b0" });
  p.outline("#1b1424");
  return p;
}

/** Soft radial light (not pixelated) used additively for lamps and auras. */
export function glowCanvas(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
