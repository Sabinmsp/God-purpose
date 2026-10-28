import type { Pillar } from "@/lib/shared/pillars";
import { arena, bank, mindTemple, sanctuary } from "./buildings";
import { Pixels } from "./paint";

/**
 * Building evolution (stages 0–5) layered on top of the original building
 * art, plus the small decorations each real day of progress adds to a
 * district. Stage 0 is exactly the original building.
 */

const OUT = "#1b1424";
/** Headroom above every building for spires, halos and domes. */
export const STAGE_TOP = 22;

function staged(base: Pixels, draw: (fx: Pixels, y: (v: number) => number) => void): Pixels {
  const out = new Pixels(base.w, base.h + STAGE_TOP);
  out.blit(base, 0, STAGE_TOP);
  const fx = new Pixels(out.w, out.h);
  draw(fx, (v) => v + STAGE_TOP);
  fx.outline(OUT);
  out.blit(fx, 0, 0);
  return out;
}

function lantern(p: Pixels, x: number, y: number, body = "#f2c14e", glow = "#fff1b0") {
  p.vline(x + 2, y, 2, "#5a3a24");
  p.rrect(x, y + 2, 5, 6, body);
  p.set(x + 2, y + 4, glow);
  p.set(x + 2, y + 5, glow);
}

function flowers(p: Pixels, x: number, y: number, w: number, colors: string[]) {
  p.rect(x, y + 3, w, 3, "#4f9a46");
  for (let i = 0; i < w; i += 2) p.set(x + i, y + 2 - ((i / 2) % 2), colors[(i / 2) % colors.length]);
}

function mental(stage: number): Pixels {
  const base = mindTemple(stage >= 3);
  if (stage >= 5) base.swap("#8a72d0", "#f2c14e");
  if (stage >= 2) {
    base.swap("#7fd0e8", "#ffe9a0");
    base.swap("#b49be8", "#f7d27a");
  }
  return staged(base, (p, y) => {
    if (stage >= 1) {
      for (const bx of [6, 100]) {
        p.rect(bx, y(51), 6, 15, "#6a4fb0");
        p.rect(bx, y(55), 6, 2, "#f2c14e");
        p.set(bx + 1, y(66), "#6a4fb0");
        p.set(bx + 4, y(66), "#6a4fb0");
      }
      flowers(p, 20, y(90), 12, ["#b49be8", "#fff1b0"]);
      flowers(p, 80, y(90), 12, ["#b49be8", "#fff1b0"]);
    }
    if (stage >= 2) {
      lantern(p, 37, y(74), "#8fd3ff");
      lantern(p, 70, y(74), "#8fd3ff");
    }
    if (stage >= 3) {
      for (const sx of [0, 102]) {
        p.rect(sx, y(78), 10, 18, "#7a5232");
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) p.rect(sx + 1 + i * 2, y(80 + r * 5), 1, 4, ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e"][(i + r) % 4]);
      }
    }
    if (stage >= 4) {
      p.ellipse(36, y(-20), 40, 12, "#b49be8");
      p.ellipse(39, y(-18), 34, 8, "#00000000");
      for (const gx of [40, 48, 56, 64, 72]) p.set(gx, y(-15), "#fff1b0");
      for (const [bx, by] of [[18, 20], [90, 16]]) {
        p.rect(bx, y(by), 6, 4, "#e0794f");
        p.hline(bx + 1, y(by + 1), 4, "#f3ead6");
      }
    }
    if (stage >= 5) {
      p.rect(50, y(-9), 12, 4, "#f2c14e");
      for (const cx of [50, 55, 61]) p.rect(cx, y(-12), 1, 3, "#f2c14e");
      p.set(56, y(-8), "#e05f8a");
    }
  });
}

function physical(stage: number): Pixels {
  const base = arena(stage >= 3);
  if (stage >= 2) {
    base.swap("#f4efe4", "#f2c14e");
    base.swap("#9fc3e0", "#ffe9a0");
  }
  if (stage >= 5) base.swap("#74625b", "#f2c14e");
  return staged(base, (p, y) => {
    if (stage >= 1) {
      for (const bx of [10, 94]) {
        p.rect(bx, y(44), 8, 14, "#e0794f");
        p.rect(bx + 2, y(47), 4, 4, "#f4efe4");
        p.set(bx + 1, y(58), "#e0794f");
        p.set(bx + 6, y(58), "#e0794f");
      }
    }
    if (stage >= 2) {
      p.rect(78, y(80), 14, 3, "#5e6474");
      for (const kx of [79, 84, 89]) p.ellipse(kx - 1, y(76), 4, 4, "#26262e");
    }
    if (stage >= 3) {
      p.rect(51, y(-6), 10, 7, "#f2c14e");
      p.rect(54, y(1), 4, 3, "#b88a1e");
      p.rect(52, y(4), 8, 2, "#b88a1e");
    }
    if (stage >= 4) {
      for (const sx of [20, 86]) {
        p.rect(sx, y(14), 6, 6, "#4b5160");
        for (let i = 0; i < 12; i++) p.set(sx + 2 + Math.round(i * (sx < 50 ? -0.5 : 0.5)), y(12 - i), "#fff6c8aa");
      }
    }
    if (stage >= 5) {
      // Laurel wreath around the trophy
      const leaf = "#5fc4a4";
      for (const [lx, ly] of [[48, 2], [47, 0], [46, -2], [46, -4], [47, -6], [48, -8]]) {
        p.set(lx, y(ly), leaf);
        p.set(lx - 1, y(ly - 1), leaf);
        p.set(108 - lx + 4, y(ly), leaf);
        p.set(108 - lx + 5, y(ly - 1), leaf);
      }
    }
  });
}

function spiritual(stage: number): Pixels {
  const base = sanctuary(stage >= 1);
  if (stage >= 4) base.swap("#4a918a", "#9fe0d0");
  return staged(base, (p, y) => {
    if (stage >= 2) for (const lx of [30, 46, 62, 78]) lantern(p, lx, y(62), "#d24b4b", "#ffd36a");
    if (stage >= 3) {
      flowers(p, 2, y(98), 12, ["#f7a8c4", "#ffffff"]);
      flowers(p, 98, y(98), 12, ["#f7a8c4", "#ffffff"]);
      p.ellipse(48, y(-10), 16, 10, "#f2c14e");
      p.ellipse(51, y(-8), 10, 6, "#00000000");
    }
    if (stage >= 5) {
      // Blossom clusters along both eaves
      for (let x = 4; x < 106; x += 8) {
        p.rect(x, y(58), 3, 2, "#f7a8c4");
        p.set(x + 1, y(57), "#ffd6e6");
      }
      for (let x = 20; x < 92; x += 8) {
        p.rect(x, y(25), 3, 2, "#f7a8c4");
        p.set(x + 1, y(24), "#ffd6e6");
      }
      p.ellipse(42, y(-18), 28, 8, "#fff1b0");
      p.ellipse(45, y(-16), 22, 4, "#00000000");
    }
  });
}

function financial(stage: number): Pixels {
  const base = bank(stage >= 4);
  if (stage >= 2) base.swap("#c4b384", "#f2c14e");
  if (stage >= 3) {
    // Royal Treasury: gilded columns
    base.swap("#fbf6e8", "#f7e3a0");
    base.swap("#ded2b2", "#e0b84a");
  }
  if (stage >= 5) base.swap("#d6c79f", "#e8c766");
  return staged(base, (p, y) => {
    if (stage >= 1) {
      p.vline(56, y(stage >= 4 ? -18 : -2), stage >= 4 ? 18 : 20, "#5a3a24");
      p.rect(57, y(stage >= 4 ? -18 : -2), 9, 6, "#d24b4b");
      p.rect(57, y(stage >= 4 ? -16 : 0), 9, 2, "#f2c14e");
    }
    if (stage >= 2) {
      lantern(p, 42, y(64));
      lantern(p, 65, y(64));
    }
    if (stage >= 3) {
      for (const cx of [6, 94]) {
        p.ellipse(cx, y(94), 12, 7, "#e0a92e");
        p.ellipse(cx + 2, y(93), 8, 4, "#f2c14e");
      }
    }
    if (stage >= 5) {
      for (const fx of [10, 100]) {
        p.vline(fx, y(10), 30, "#5a3a24");
        p.rect(fx + 1, y(10), 7, 5, "#f2c14e");
      }
      p.rect(54, y(-22), 4, 4, "#5fc4f0");
    }
  });
}

export function buildingStage(pillar: Pillar, stage: number): Pixels {
  return { mental, physical, spiritual, financial }[pillar](stage);
}

// ── Daily decorations ─────────────────────────────────────────────────────

function deco(w: number, h: number, draw: (p: Pixels) => void): Pixels {
  const p = new Pixels(w, h);
  draw(p);
  p.outline(OUT);
  return p;
}

const sapling = (leaf: string, light: string) =>
  deco(12, 16, (p) => {
    p.rect(5, 9, 2, 6, "#7a5232");
    p.ellipse(1, 1, 10, 10, leaf);
    p.set(4, 3, light);
    p.set(7, 5, light);
  });

const bloom = (petal: string, centre: string) =>
  deco(12, 8, (p) => {
    p.rect(1, 5, 10, 2, "#4f9a46");
    for (const [x, y] of [[2, 3], [6, 1], [9, 3]]) {
      p.rect(x - 1, y, 3, 2, petal);
      p.set(x, y, centre);
    }
  });

/** Six items per pillar, cycled as the district grows. */
export const DECORATIONS: Record<Pillar, (() => Pixels)[]> = {
  mental: [
    () =>
      deco(12, 10, (p) => {
        ["#8f7cf0", "#e0794f", "#5fc4a4"].forEach((c, i) => {
          p.rect(1 + (i % 2), 7 - i * 3, 9, 3, c);
          p.hline(2 + (i % 2), 8 - i * 3, 7, "#f7f1e3");
        });
      }),
    () =>
      deco(8, 16, (p) => {
        p.vline(3, 6, 10, "#3a3646");
        lantern(p, 1, 0, "#8fd3ff", "#e6f4ff");
      }),
    () => bloom("#b49be8", "#fff1b0"),
    () =>
      deco(10, 12, (p) => {
        p.rect(4, 5, 2, 7, "#5e3d24");
        p.rect(0, 1, 10, 5, "#f3ead6");
        p.hline(1, 3, 8, "#b9ad93");
        p.rect(0, 0, 2, 6, "#c9a46a");
        p.rect(8, 0, 2, 6, "#c9a46a");
      }),
    () =>
      deco(8, 11, (p) => {
        p.rect(2, 2, 4, 8, "#8fd3ff");
        p.set(3, 0, "#8fd3ff");
        p.set(4, 1, "#8fd3ff");
        p.vline(3, 3, 5, "#e6f4ff");
      }),
    () => sapling("#7d64c9", "#fff1b0"),
  ],
  physical: [
    () =>
      deco(9, 9, (p) => {
        p.ellipse(0, 3, 9, 6, "#26262e");
        p.rect(2, 0, 5, 2, "#26262e");
        p.set(2, 5, "#4b5160");
      }),
    () =>
      deco(8, 9, (p) => {
        for (let i = 0; i < 7; i++) p.hline(3 - Math.floor(i / 2), i + 1, 1 + Math.floor(i / 2) * 2, i === 3 ? "#f4efe4" : "#e0794f");
        p.hline(0, 8, 8, "#e0794f");
      }),
    () =>
      deco(10, 10, (p) => {
        p.ellipse(0, 0, 10, 10, "#4b5160");
        p.ellipse(3, 3, 4, 4, "#26262e");
      }),
    () =>
      deco(9, 15, (p) => {
        p.vline(1, 0, 15, "#5a3a24");
        p.rect(2, 1, 7, 5, "#e0794f");
        p.rect(4, 2, 2, 3, "#f4efe4");
      }),
    () =>
      deco(12, 6, (p) => {
        p.rect(2, 2, 8, 2, "#c9ced8");
        p.rect(0, 0, 3, 6, "#26262e");
        p.rect(9, 0, 3, 6, "#26262e");
      }),
    () =>
      deco(6, 10, (p) => {
        p.rect(1, 2, 4, 8, "#5fc4f0");
        p.rect(2, 0, 2, 2, "#f4efe4");
        p.hline(1, 5, 4, "#ffffff");
      }),
  ],
  spiritual: [
    () => bloom("#f7a8c4", "#ffffff"),
    () => bloom("#ffffff", "#f2c14e"),
    () =>
      deco(9, 13, (p) => {
        p.rect(3, 9, 3, 4, "#9d9484");
        p.rect(1, 4, 7, 5, "#b8b0a0");
        p.rect(3, 5, 3, 3, "#f7d27a");
        p.rect(0, 2, 9, 2, "#8a8478");
      }),
    () =>
      deco(12, 11, (p) => {
        p.rect(2, 7, 8, 4, "#3a5a8a");
        p.rect(5, 4, 2, 3, "#7a5232");
        p.ellipse(1, 0, 10, 6, "#4f9a46");
      }),
    () =>
      deco(11, 7, (p) => {
        p.ellipse(0, 3, 11, 4, "#4f9a46");
        p.rect(3, 1, 5, 3, "#f7a8c4");
        p.set(5, 0, "#ffd6e6");
      }),
    () => sapling("#f2a3c0", "#ffffff"),
  ],
  financial: [
    () =>
      deco(9, 8, (p) => {
        for (let i = 0; i < 3; i++) p.rect(1 + (i % 2), 5 - i * 2, 6, 2, i === 2 ? "#fff1b0" : "#f2c14e");
        p.hline(1, 7, 7, "#b88a1e");
      }),
    () =>
      deco(10, 11, (p) => {
        p.ellipse(0, 3, 10, 8, "#c9a46a");
        p.rect(3, 0, 4, 4, "#c9a46a");
        p.rect(4, 6, 2, 3, "#f2c14e");
      }),
    () =>
      deco(11, 9, (p) => {
        p.rect(0, 0, 11, 9, "#9a6a3e");
        p.hline(0, 4, 11, "#7a5030");
        p.vline(5, 0, 9, "#7a5030");
        p.set(2, 2, "#f2c14e");
      }),
    () =>
      deco(9, 15, (p) => {
        p.vline(1, 0, 15, "#5a3a24");
        p.rect(2, 1, 7, 5, "#f2c14e");
        p.set(5, 3, "#b88a1e");
      }),
    () =>
      deco(7, 17, (p) => {
        p.vline(3, 5, 12, "#3a3646");
        p.rect(1, 0, 5, 5, "#f2c14e");
        p.rect(2, 1, 3, 3, "#fff1b0");
      }),
    () =>
      deco(8, 8, (p) => {
        p.hline(2, 0, 4, "#5fc4f0");
        p.hline(1, 1, 6, "#5fc4f0");
        for (let i = 0; i < 5; i++) p.hline(1 + Math.ceil(i / 2), 2 + i, 6 - Math.ceil(i / 2) * 2, i === 0 ? "#e6f4ff" : "#3e9cc9");
      }),
  ],
};

/** A golden lantern lit for every complete Four Wins day. */
export function victoryLantern(): Pixels {
  return deco(9, 19, (p) => {
    p.vline(4, 6, 13, "#5a3a24");
    p.hline(1, 18, 7, "#5a3a24");
    p.rect(1, 0, 7, 2, "#b88a1e");
    p.rrect(1, 2, 7, 6, "#f2c14e");
    p.rect(3, 3, 3, 4, "#fff6c8");
  });
}

// ── Character evolution overlays ──────────────────────────────────────────

export function disciplineRing(): Pixels {
  const p = new Pixels(24, 9);
  p.ellipse(0, 0, 24, 9, "#ffffff");
  p.ellipse(2, 1, 20, 7, "#00000000");
  return p;
}

export function fourCrest(): Pixels {
  const p = new Pixels(11, 11);
  const colors = ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e"];
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 11; x++) {
      const d = Math.abs(x - 5) + Math.abs(y - 5);
      if (d > 5) continue;
      p.set(x, y, d === 5 ? "#fff1b0" : colors[(x < 5 ? 0 : 1) + (y < 5 ? 0 : 2)]);
    }
  p.set(5, 5, "#ffffff");
  p.outline(OUT);
  return p;
}
