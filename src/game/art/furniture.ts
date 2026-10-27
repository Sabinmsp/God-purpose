import { Pixels } from "./paint";

const OUT = "#1b1424";

export function bed(): Pixels {
  const p = new Pixels(34, 44);
  p.rect(1, 0, 32, 8, "#7a5232");
  p.rect(2, 1, 30, 6, "#9a6a3e");
  p.rect(1, 8, 32, 32, "#8a5a36");
  p.rect(3, 9, 28, 10, "#f7f1e3");
  p.hline(3, 18, 28, "#d9cfb8");
  p.rect(3, 19, 28, 20, "#4f6fae");
  p.rect(3, 19, 28, 3, "#e9e2d0");
  p.hline(3, 29, 28, "#3d5a92");
  p.rect(1, 40, 3, 4, "#5e3d24");
  p.rect(30, 40, 3, 4, "#5e3d24");
  p.outline(OUT);
  return p;
}

export function desk(fancy: boolean, lamp: boolean): Pixels {
  const p = new Pixels(44, 34);
  p.rect(2, 16, 40, 5, fancy ? "#6b4a8a" : "#9a6a3e");
  p.hline(2, 16, 40, fancy ? "#8a6aaa" : "#c28c5a");
  p.rect(4, 21, 3, 13, "#5e3d24");
  p.rect(37, 21, 3, 13, "#5e3d24");
  if (fancy) {
    for (const mx of [8, 22]) {
      p.rect(mx, 2, 14, 10, "#26262e");
      p.rect(mx + 1, 3, 12, 8, "#3a5a8a");
      p.hline(mx + 2, 5, 6, "#8fd3ff");
      p.hline(mx + 2, 7, 8, "#5fc4a4");
      p.rect(mx + 6, 12, 2, 4, "#26262e");
    }
  } else {
    p.rect(14, 8, 14, 8, "#3b3f4f");
    p.rect(15, 9, 12, 6, "#4a5064");
    p.set(20, 11, "#9fb4ff");
  }
  if (lamp) {
    p.rect(36, 6, 5, 3, "#f2c14e");
    p.rect(38, 9, 1, 7, "#3a3646");
    p.rect(36, 15, 5, 1, "#3a3646");
  }
  p.outline(OUT);
  return p;
}

export function chair(): Pixels {
  const p = new Pixels(14, 18);
  p.rect(2, 0, 10, 8, "#8a5a36");
  p.rect(1, 8, 12, 4, "#9a6a3e");
  p.rect(2, 12, 2, 6, "#5e3d24");
  p.rect(10, 12, 2, 6, "#5e3d24");
  p.outline(OUT);
  return p;
}

export function bookshelf(): Pixels {
  const p = new Pixels(28, 36);
  p.rect(0, 0, 28, 36, "#7a5232");
  p.rect(2, 2, 24, 32, "#5e3d24");
  const colors = ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e", "#d24b4b", "#3e7cc9"];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 3 + shelf * 11;
    p.hline(2, y + 9, 24, "#9a6a3e");
    for (let i = 0; i < 7; i++) p.rect(3 + i * 3, y + 1 + (i % 3 === 0 ? 1 : 0), 2, 8 - (i % 3 === 0 ? 1 : 0), colors[(i + shelf) % colors.length]);
  }
  p.outline(OUT);
  return p;
}

export function weightBench(): Pixels {
  const p = new Pixels(36, 20);
  p.rect(4, 8, 28, 4, "#26262e");
  p.rect(6, 12, 2, 8, "#5e6474");
  p.rect(28, 12, 2, 8, "#5e6474");
  p.rect(2, 2, 32, 2, "#c9ced8");
  p.rect(1, 0, 3, 6, "#26262e");
  p.rect(32, 0, 3, 6, "#26262e");
  p.outline(OUT);
  return p;
}

export function squatRack(): Pixels {
  const p = new Pixels(32, 40);
  p.rect(4, 0, 3, 40, "#5e6474");
  p.rect(25, 0, 3, 40, "#5e6474");
  p.rect(4, 0, 24, 3, "#5e6474");
  p.rect(0, 14, 32, 2, "#c9ced8");
  p.rect(0, 10, 3, 10, "#26262e");
  p.rect(29, 10, 3, 10, "#26262e");
  p.rect(2, 37, 28, 3, "#4b5160");
  p.outline(OUT);
  return p;
}

export function smallDumbbells(): Pixels {
  const p = new Pixels(22, 12);
  for (const y of [2, 7]) {
    p.rect(3, y, 16, 2, "#c9ced8");
    p.rect(1, y - 1, 4, 4, "#26262e");
    p.rect(17, y - 1, 4, 4, "#26262e");
  }
  p.outline(OUT);
  return p;
}

export function plant(): Pixels {
  const p = new Pixels(16, 24);
  p.rect(4, 16, 8, 8, "#b8603e");
  p.hline(3, 16, 10, "#9a4a2e");
  for (const [x, y, w, h] of [[2, 4, 6, 10], [8, 2, 6, 12], [5, 0, 6, 9]] as const) p.ellipse(x, y, w, h, "#4f9a46");
  p.set(6, 3, "#6dbb5a");
  p.set(10, 5, "#6dbb5a");
  p.outline(OUT);
  return p;
}

export function cushion(): Pixels {
  const p = new Pixels(20, 12);
  p.ellipse(0, 2, 20, 10, "#5fc4a4");
  p.ellipse(3, 2, 14, 6, "#7fdcc0");
  p.set(10, 5, "#3a8a72");
  p.outline(OUT);
  return p;
}

export function bonsai(): Pixels {
  const p = new Pixels(20, 18);
  p.rect(4, 12, 12, 6, "#3a5a8a");
  p.hline(3, 12, 14, "#2a4068");
  p.rect(9, 7, 2, 5, "#7a5232");
  p.ellipse(2, 1, 9, 6, "#4f9a46");
  p.ellipse(9, 0, 10, 7, "#4f9a46");
  p.set(5, 2, "#6dbb5a");
  p.set(13, 2, "#6dbb5a");
  p.outline(OUT);
  return p;
}

export function piggyBank(): Pixels {
  const p = new Pixels(16, 12);
  p.ellipse(1, 1, 14, 10, "#f2a3c0");
  p.rect(13, 4, 3, 3, "#f2a3c0");
  p.set(14, 5, "#d97ea2");
  p.rect(3, 9, 2, 3, "#d97ea2");
  p.rect(10, 9, 2, 3, "#d97ea2");
  p.hline(6, 1, 3, "#7a3b54");
  p.set(11, 3, "#1d1626");
  p.outline(OUT);
  return p;
}

export function rug(): Pixels {
  const p = new Pixels(52, 32);
  p.rrect(0, 0, 52, 32, "#b8432f");
  p.rrect(3, 3, 46, 26, "#d9b44a");
  p.rrect(6, 6, 40, 20, "#8a2f22");
  for (let x = 10; x < 44; x += 8) p.rect(x, 14, 4, 4, "#d9b44a");
  return p;
}

export function sofa(): Pixels {
  const p = new Pixels(44, 26);
  p.rrect(0, 0, 44, 14, "#5b6fae");
  p.rect(0, 10, 6, 14, "#4a5c94");
  p.rect(38, 10, 6, 14, "#4a5c94");
  p.rect(6, 12, 32, 10, "#6d82c4");
  p.vline(22, 12, 10, "#5b6fae");
  p.rect(2, 24, 3, 2, "#5e3d24");
  p.rect(39, 24, 3, 2, "#5e3d24");
  p.outline(OUT);
  return p;
}

export function trophyShelf(count: number): Pixels {
  const p = new Pixels(40, 26);
  p.rect(0, 10, 40, 3, "#7a5232");
  p.rect(0, 23, 40, 3, "#7a5232");
  const n = Math.min(10, count);
  for (let i = 0; i < n; i++) {
    const x = 2 + (i % 5) * 8;
    const y = i < 5 ? 2 : 15;
    p.rect(x + 1, y, 5, 4, "#f2c14e");
    p.rect(x + 3, y + 4, 1, 2, "#b88a1e");
    p.rect(x + 2, y + 6, 3, 2, "#b88a1e");
    p.set(x + 2, y + 1, "#fff1b0");
  }
  p.outline(OUT);
  return p;
}

export function wardrobe(): Pixels {
  const p = new Pixels(24, 36);
  p.rect(0, 0, 24, 36, "#8a5a36");
  p.rect(2, 2, 9, 32, "#a8744a");
  p.rect(13, 2, 9, 24, "#c9e6ff");
  p.set(15, 4, "#ffffff");
  p.rect(13, 27, 9, 7, "#a8744a");
  p.set(10, 18, "#f2c14e");
  p.outline(OUT);
  return p;
}

export function windowFrame(night: boolean): Pixels {
  const p = new Pixels(26, 20);
  p.rect(0, 0, 26, 20, "#f3ead6");
  p.rect(2, 2, 22, 16, night ? "#1d2650" : "#8cc3e6");
  p.vline(12, 2, 16, "#f3ead6");
  p.hline(2, 9, 22, "#f3ead6");
  if (night) {
    p.set(6, 5, "#fff6c8");
    p.set(18, 13, "#fff6c8");
    p.ellipse(16, 3, 4, 4, "#f7e9b8");
  } else {
    p.hline(4, 4, 4, "#e6f4ff");
  }
  p.outline(OUT);
  return p;
}

/** Faint outline shown where a not-yet-unlocked item will go. */
export function ghost(src: Pixels): Pixels {
  const p = new Pixels(src.w, src.h);
  for (let i = 0; i < src.buf.length; i++) if (src.buf[i]) p.buf[i] = 0x33ffffff;
  return p;
}
