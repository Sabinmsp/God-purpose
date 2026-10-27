import { Pixels } from "./paint";

const OUT = "#1b1424";

function trapezoidRoof(
  p: Pixels,
  cx: number,
  top: number,
  bottom: number,
  topHalf: number,
  bottomHalf: number,
  colors: { base: string; dark: string; light: string },
  curve = 0,
) {
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, bottom - top);
    const half = Math.round(topHalf + (bottomHalf - topHalf) * t);
    const row = y - top;
    const color = row % 4 === 3 ? colors.dark : colors.base;
    p.hline(cx - half, y, half * 2, color);
    if (row % 4 === 1) for (let x = cx - half + ((row >> 2) % 2) * 3; x < cx + half; x += 6) p.set(x, y, colors.light);
    if (curve && y >= bottom - 2) {
      p.rect(cx - half - curve, y - curve, curve, curve + 1, colors.dark);
      p.rect(cx + half, y - curve, curve, curve + 1, colors.dark);
    }
  }
  p.hline(cx - bottomHalf, bottom, bottomHalf * 2, colors.dark);
}

function windowPane(p: Pixels, x: number, y: number, w: number, h: number, frame: string, glass = "#8cc3e6") {
  p.rect(x, y, w, h, frame);
  p.rect(x + 1, y + 1, w - 2, h - 2, glass);
  p.vline(x + Math.floor(w / 2), y + 1, h - 2, frame);
  p.hline(x + 1, y + Math.floor(h / 2), w - 2, frame);
  p.set(x + 2, y + 2, "#e6f4ff");
  p.set(x + 3, y + 2, "#e6f4ff");
}

function bricks(p: Pixels, x: number, y: number, w: number, h: number, fill: string, mortar: string) {
  p.rect(x, y, w, h, fill);
  for (let j = 0; j < h; j += 4) {
    p.hline(x, y + j, w, mortar);
    for (let i = (j / 4) % 2 ? 0 : 4; i < w; i += 8) p.vline(x + i, y + j, 4, mortar);
  }
}

function planks(p: Pixels, x: number, y: number, w: number, h: number, fill: string, line: string) {
  p.rect(x, y, w, h, fill);
  for (let j = 3; j < h; j += 4) p.hline(x, y + j, w, line);
}

function stoneBlocks(p: Pixels, x: number, y: number, w: number, h: number, fill: string, line: string) {
  p.rect(x, y, w, h, fill);
  for (let j = 0; j < h; j += 6) {
    p.hline(x, y + j, w, line);
    for (let i = (j / 6) % 2 ? 3 : 9; i < w; i += 12) p.vline(x + i, y + j, 6, line);
  }
}

function coin(p: Pixels, x: number, y: number) {
  p.rect(x, y, 3, 2, "#f2c14e");
  p.set(x + 1, y, "#fff1b0");
  p.set(x + 2, y + 1, "#b88a1e");
}

// ── Home ──────────────────────────────────────────────────────────────────

export function home(): Pixels {
  const p = new Pixels(80, 72);
  // chimney
  bricks(p, 56, 4, 8, 16, "#9a4a36", "#7a3628");
  p.rect(55, 2, 10, 3, "#5c2a20");
  // walls
  planks(p, 6, 34, 68, 38, "#c99a63", "#a97c4a");
  p.rect(6, 34, 3, 38, "#7a5232");
  p.rect(71, 34, 3, 38, "#7a5232");
  // roof
  trapezoidRoof(p, 40, 4, 34, 18, 40, { base: "#c4553e", dark: "#9a3c2b", light: "#de7a5c" });
  p.hline(22, 3, 36, "#7d2e22");
  p.hline(22, 4, 36, "#7d2e22");
  // windows + flower boxes
  for (const wx of [14, 52]) {
    windowPane(p, wx, 43, 14, 12, "#f3ead6");
    p.rect(wx - 1, 55, 16, 4, "#8a5a36");
    for (let i = 0; i < 6; i++) p.set(wx + 1 + i * 2, 54, i % 2 ? "#e05f5f" : "#f2c14e");
  }
  // door
  p.rect(32, 47, 16, 25, "#4a2c18");
  p.rect(34, 49, 12, 23, "#6b4226");
  p.vline(40, 49, 23, "#5a3720");
  p.set(43, 60, "#f2c14e");
  p.rect(30, 70, 20, 2, "#bfb39a");
  // little sign
  p.rect(35, 40, 10, 5, "#e9dcc0");
  p.set(39, 42, "#c4553e");
  p.set(40, 42, "#c4553e");
  p.outline(OUT);
  return p;
}

// ── Mind Temple ───────────────────────────────────────────────────────────

export function mindTemple(master: boolean): Pixels {
  const p = new Pixels(112, 104);
  const purple = { base: "#6a4fb0", dark: "#4f3a8c", light: "#8a72d0" };
  // steps
  p.rect(18, 96, 76, 4, "#cfc6b5");
  p.rect(22, 100, 68, 4, "#bdb3a0");
  // walls
  stoneBlocks(p, 10, 50, 92, 46, "#d8d0e4", "#bdb3cf");
  for (const cx of [12, 92]) {
    p.rect(cx, 50, 8, 46, "#efe9f6");
    p.vline(cx + 6, 50, 46, "#c9bfdc");
    p.rect(cx - 1, 50, 10, 3, "#c9bfdc");
  }
  // stained-glass windows
  for (const wx of [28, 76]) {
    p.rect(wx, 62, 8, 22, "#4f3a8c");
    p.rect(wx + 1, 63, 6, 20, "#7fd0e8");
    p.rect(wx + 1, 70, 6, 3, "#b49be8");
    p.rect(wx + 1, 77, 6, 2, "#f2c14e");
    p.set(wx + 3, 64, "#e6f4ff");
  }
  // arched door
  p.rect(44, 66, 24, 30, "#2a1f4a");
  p.ellipse(44, 58, 24, 18, "#2a1f4a");
  p.rect(46, 68, 20, 28, "#3c2c66");
  p.ellipse(46, 60, 20, 16, "#3c2c66");
  p.vline(56, 62, 34, "#2a1f4a");
  p.set(53, 80, "#f2c14e");
  p.set(59, 80, "#f2c14e");
  // book emblem
  p.rect(48, 52, 16, 6, master ? "#f2c14e" : "#efe9f6");
  p.vline(56, 52, 6, "#6a4fb0");
  p.hline(49, 54, 5, "#bdb3cf");
  p.hline(58, 54, 5, "#bdb3cf");
  // roofs
  trapezoidRoof(p, 56, 32, 50, 36, 56, purple, 3);
  stoneBlocks(p, 30, 22, 52, 10, "#d8d0e4", "#bdb3cf");
  trapezoidRoof(p, 56, 6, 22, 14, 32, purple, 2);
  if (master) {
    p.hline(0, 50, 112, "#f2c14e");
    p.hline(24, 22, 64, "#f2c14e");
    p.hline(42, 6, 28, "#f2c14e");
  }
  // finial
  p.ellipse(52, 0, 8, 7, master ? "#fff1b0" : "#f2c14e");
  p.rect(55, 6, 2, 2, "#b88a1e");
  p.outline(OUT);
  return p;
}

// ── Strength Arena ────────────────────────────────────────────────────────

export function arena(champion: boolean): Pixels {
  const p = new Pixels(112, 92);
  bricks(p, 6, 30, 100, 62, "#a5503a", "#8a3f2c");
  // parapet + roof
  p.rect(4, 22, 104, 10, "#5b4a44");
  p.hline(4, 22, 104, "#74625b");
  // striped awning
  for (let x = 4; x < 108; x += 8) {
    p.rect(x, 32, 8, 8, ((x - 4) / 8) % 2 ? "#f4efe4" : "#e0794f");
    p.set(x + 3, 40, ((x - 4) / 8) % 2 ? "#f4efe4" : "#e0794f");
    p.set(x + 4, 40, ((x - 4) / 8) % 2 ? "#f4efe4" : "#e0794f");
  }
  // sign with dumbbell
  p.rect(30, 6, 52, 16, "#2b2230");
  p.rect(32, 8, 48, 12, "#3a2f42");
  p.rect(44, 13, 24, 2, "#c9ced8");
  p.rect(40, 10, 4, 8, "#e0794f");
  p.rect(68, 10, 4, 8, "#e0794f");
  if (champion) {
    p.rect(54, 2, 4, 4, "#f2c14e");
    for (const fx of [8, 100]) {
      p.vline(fx, 0, 24, "#5a3a24");
      p.rect(fx + 1, 1, 9, 7, "#d24b4b");
      p.rect(fx + 1, 3, 9, 2, "#f2c14e");
    }
  }
  // open gate showing the gym
  p.rect(38, 52, 36, 40, "#2b2230");
  for (let y = 52; y < 58; y += 2) p.hline(38, y, 36, "#8e95a6");
  p.rect(42, 74, 28, 2, "#8e95a6");
  p.rect(42, 70, 3, 10, "#4b5160");
  p.rect(67, 70, 3, 10, "#4b5160");
  p.rect(48, 84, 16, 3, "#5a3a24");
  // windows
  for (const wx of [12, 82]) {
    p.rect(wx, 54, 18, 14, "#5b4a44");
    p.rect(wx + 1, 55, 16, 12, "#9fc3e0");
    for (let i = wx + 4; i < wx + 18; i += 4) p.vline(i, 55, 12, "#5b4a44");
  }
  p.outline(OUT);
  return p;
}

// ── Spirit Sanctuary ──────────────────────────────────────────────────────

export function sanctuary(sacred: boolean): Pixels {
  const p = new Pixels(112, 108);
  const roof = { base: "#2f6f6a", dark: "#22524e", light: "#4a918a" };
  p.rect(14, 98, 84, 5, "#cfc6b5");
  p.rect(18, 103, 76, 5, "#bdb3a0");
  // ground floor
  p.rect(12, 62, 88, 36, "#f1ece0");
  for (const x of [12, 36, 74, 98]) p.rect(x, 62, 2, 36, "#5a3a2a");
  p.hline(12, 62, 88, "#5a3a2a");
  p.rect(16, 64, 4, 34, "#b8432f");
  p.rect(92, 64, 4, 34, "#b8432f");
  // shoji door
  p.rect(42, 68, 28, 30, "#8a6a4a");
  p.rect(43, 69, 26, 29, "#f7f1e3");
  for (let x = 49; x < 69; x += 6) p.vline(x, 69, 29, "#b39a7a");
  for (let y = 75; y < 98; y += 6) p.hline(43, y, 26, "#b39a7a");
  p.vline(56, 68, 30, "#8a6a4a");
  // side windows (round)
  for (const wx of [22, 80]) {
    p.ellipse(wx, 70, 10, 10, "#8a6a4a");
    p.ellipse(wx + 1, 71, 8, 8, "#f7e9b8");
    p.vline(wx + 4, 71, 8, "#b39a7a");
  }
  // lower roof with upturned eaves
  trapezoidRoof(p, 56, 44, 62, 34, 54, roof, 4);
  // upper floor
  p.rect(32, 28, 48, 16, "#f1ece0");
  for (const x of [32, 55, 78]) p.rect(x, 28, 2, 16, "#5a3a2a");
  p.rect(40, 32, 8, 8, "#f7e9b8");
  p.rect(64, 32, 8, 8, "#f7e9b8");
  trapezoidRoof(p, 56, 10, 28, 10, 40, roof, 3);
  // spire
  p.rect(54, 0, 4, 10, "#d9b44a");
  p.rect(52, 3, 8, 2, "#d9b44a");
  // hanging lanterns
  for (const lx of [6, 102]) {
    p.vline(lx + 1, 62, 3, "#5a3a2a");
    p.rrect(lx - 1, 65, 6, 7, "#d24b4b");
    p.hline(lx - 1, 68, 6, "#f2c14e");
  }
  if (sacred) {
    for (let x = 4; x < 108; x += 7) {
      p.set(x, 61, "#f7a8c4");
      p.set(x + 1, 60, "#ffd6e6");
    }
    for (let x = 18; x < 96; x += 6) p.set(x, 27, "#f7a8c4");
  }
  p.outline(OUT);
  return p;
}

// ── Wealth Kingdom bank ───────────────────────────────────────────────────

export function bank(grand: boolean): Pixels {
  const p = new Pixels(112, 104);
  p.rect(14, 94, 84, 5, "#e9e0c8");
  p.rect(18, 99, 76, 5, "#d6caa9");
  stoneBlocks(p, 10, 44, 92, 50, "#ece2c6", "#d6c79f");
  // columns
  for (const cx of [18, 38, 68, 88]) {
    p.rect(cx, 48, 7, 46, "#fbf6e8");
    p.vline(cx + 5, 48, 46, "#ded2b2");
    for (let y = 52; y < 92; y += 4) p.set(cx + 2, y, "#ded2b2");
    p.rect(cx - 1, 46, 9, 3, "#d6c79f");
    p.rect(cx - 1, 92, 9, 2, "#d6c79f");
  }
  // door
  p.rect(49, 62, 14, 32, "#3d2818");
  p.rect(50, 63, 12, 31, "#5a3a24");
  p.vline(56, 63, 31, "#3d2818");
  p.set(54, 78, "#f2c14e");
  p.set(58, 78, "#f2c14e");
  // entablature + pediment
  p.rect(6, 40, 100, 6, "#d6c79f");
  p.hline(6, 40, 100, "#c4b384");
  for (let y = 20; y < 40; y++) {
    const half = Math.round(((y - 20) / 20) * 50) + 2;
    p.hline(56 - half, y, half * 2, "#e2d6b4");
  }
  p.hline(6, 39, 100, "#c4b384");
  // coin emblem
  p.ellipse(49, 25, 14, 14, "#f2c14e");
  p.ellipse(51, 27, 10, 10, "#e0a92e");
  p.rect(55, 28, 2, 8, "#fff1b0");
  p.rect(53, 29, 6, 1, "#fff1b0");
  p.rect(53, 34, 6, 1, "#fff1b0");
  if (grand) {
    p.ellipse(34, 2, 44, 36, "#f2c14e");
    p.rect(34, 20, 44, 2, "#b88a1e");
    p.ellipse(40, 6, 12, 10, "#fff1b0");
    p.vline(56, 0, 4, "#5a3a24");
  }
  p.outline(OUT);
  return p;
}

// ── Car garage (6 stages) ─────────────────────────────────────────────────

function car(p: Pixels, x: number, y: number, stage: number) {
  // stage 2 frame, 3 primer body, 4 painted, 5 painted + shine
  const body = stage >= 4 ? "#d24b4b" : "#9aa0ac";
  const shade = stage >= 4 ? "#a8363a" : "#7a808c";
  if (stage === 2) {
    p.hline(x + 2, y + 12, 44, "#5e6474");
    p.hline(x + 6, y + 4, 28, "#5e6474");
    p.vline(x + 6, y + 4, 8, "#5e6474");
    p.vline(x + 34, y + 4, 8, "#5e6474");
    p.vline(x + 20, y + 4, 8, "#5e6474");
  } else {
    p.rrect(x, y + 8, 48, 9, body);
    p.hline(x, y + 15, 48, shade);
    p.rect(x + 8, y + 1, 26, 8, body);
    p.rect(x + 10, y + 2, 10, 6, "#a8d4f0");
    p.rect(x + 22, y + 2, 10, 6, "#a8d4f0");
    p.rect(x + 45, y + 10, 3, 2, stage >= 5 ? "#fff6c8" : "#e8e2d0");
    p.rect(x, y + 10, 2, 2, "#e05f5f");
    if (stage >= 5) {
      p.set(x + 12, y + 3, "#ffffff");
      p.set(x + 24, y + 3, "#ffffff");
      p.hline(x + 4, y + 9, 10, "#f07a7a");
    }
  }
  for (const wx of [x + 6, x + 34]) {
    p.ellipse(wx, y + 12, 9, 9, "#26262e");
    p.rect(wx + 3, y + 15, 3, 3, "#8e95a6");
  }
}

export function garage(stage: number): Pixels {
  const p = new Pixels(76, 68);
  if (stage === 0) {
    p.rect(4, 44, 68, 22, "#a9844f");
    p.dither(4, 44, 68, 22, "#b8925f", 0.3, 4);
    for (let x = 4; x < 72; x += 10) p.rect(x, 38, 2, 10, "#8a5a36");
    p.hline(4, 40, 68, "#a97c4a");
    p.rect(30, 22, 18, 12, "#f3ead6");
    p.vline(38, 34, 12, "#8a5a36");
    p.rect(33, 26, 12, 4, "#d24b4b");
    p.rect(35, 25, 7, 2, "#d24b4b");
  } else if (stage === 1) {
    p.rect(4, 50, 68, 14, "#b9bdc6");
    p.hline(4, 50, 68, "#d7dae0");
    bricks(p, 4, 38, 10, 12, "#a5503a", "#8a3f2c");
    bricks(p, 62, 42, 10, 8, "#a5503a", "#8a3f2c");
    p.rect(30, 30, 16, 10, "#f3ead6");
    p.vline(37, 40, 10, "#8a5a36");
    p.rect(33, 33, 10, 3, "#e0794f");
  } else {
    bricks(p, 2, 18, 72, 48, "#8f8a96", "#77727e");
    p.rect(0, 8, 76, 12, "#4a4352");
    p.hline(0, 8, 76, "#6a6372");
    p.rect(8, 26, 60, 40, "#2f2a35");
    p.rect(8, 26, 60, 4, "#5e6474");
    car(p, 14, 42, stage);
    if (stage >= 5) {
      p.rect(30, 0, 16, 8, "#f2c14e");
      p.rect(36, 2, 4, 4, "#fff1b0");
    }
  }
  p.outline(OUT);
  return p;
}

// ── Tuition vault (fill level 0..10) ──────────────────────────────────────

export function vault(level: number): Pixels {
  const p = new Pixels(68, 68);
  stoneBlocks(p, 4, 18, 60, 50, "#b8b0a0", "#9d9484");
  p.rect(0, 10, 68, 10, "#5b4a6e");
  p.hline(0, 10, 68, "#7a6890");
  // graduation cap emblem
  p.rect(26, 0, 16, 4, "#2a2340");
  p.rect(30, 4, 8, 4, "#2a2340");
  p.vline(41, 2, 7, "#f2c14e");
  // vault window
  p.rect(10, 26, 48, 38, "#4b5160");
  p.rect(12, 28, 44, 34, "#1f1b2a");
  // coin pile grows with savings
  const h = Math.round((level / 10) * 30);
  for (let y = 0; y < h; y++) {
    const half = Math.round(22 - (y / 30) * 14 + (y < h - 2 ? 0 : -3));
    const yy = 61 - y;
    p.hline(34 - half, yy, half * 2, y % 3 === 0 ? "#e0a92e" : "#f2c14e");
  }
  for (let i = 0; i < h * 2; i++) coin(p, 14 + ((i * 7) % 38), 60 - ((i * 5) % Math.max(1, h)));
  for (let x = 16; x < 56; x += 8) p.vline(x, 28, 34, "#6a7080");
  // door wheel
  p.ellipse(54, 36, 8, 8, "#8e95a6");
  p.outline(OUT);
  return p;
}
