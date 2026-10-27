import { Pixels } from "./paint";

const OUT = "#1b1424";

function canopy(p: Pixels, x: number, y: number, w: number, h: number, c: { base: string; dark: string; light: string }, dots?: string) {
  p.ellipse(x, y + 2, w, h - 2, c.dark);
  p.ellipse(x + 1, y, w - 2, h - 4, c.base);
  p.ellipse(x + 3, y + 1, Math.floor(w / 2), Math.floor(h / 3), c.light);
  if (dots) for (let i = 0; i < 6; i++) p.set(x + 4 + ((i * 7) % (w - 8)), y + 4 + ((i * 5) % (h - 10)), dots);
}

function trunk(p: Pixels, x: number, y: number, h: number) {
  p.rect(x, y, 6, h, "#7a5232");
  p.vline(x + 4, y, h, "#5e3d24");
  p.set(x - 1, y + h - 1, "#7a5232");
  p.set(x + 6, y + h - 1, "#5e3d24");
}

export function tree(kind: "oak" | "pine" | "cherry" | "knowledge" | "autumn"): Pixels {
  const p = new Pixels(32, 44);
  if (kind === "pine") {
    trunk(p, 13, 34, 9);
    for (let i = 0; i < 4; i++) {
      const y = 2 + i * 8;
      const half = 5 + i * 3;
      for (let j = 0; j < 11; j++) p.hline(16 - Math.round((half * j) / 10), y + j, Math.round((half * j) / 5) + 1, j > 7 ? "#2b5a34" : "#356e3d");
    }
    p.set(15, 4, "#5a9a5a");
    p.set(14, 13, "#5a9a5a");
  } else {
    trunk(p, 13, 28, 15);
    const palette = {
      oak: { base: "#4f9a46", dark: "#3a7537", light: "#6dbb5a" },
      cherry: { base: "#f2a3c0", dark: "#d97ea2", light: "#ffd1e2" },
      knowledge: { base: "#7d64c9", dark: "#5d48a2", light: "#a993f0" },
      autumn: { base: "#e0a040", dark: "#c07a2a", light: "#f2c96a" },
    }[kind];
    canopy(p, 1, 2, 30, 30, palette, kind === "knowledge" ? "#fff1b0" : kind === "cherry" ? "#ffffff" : undefined);
  }
  p.outline(OUT);
  return p;
}

export function bush(berries = false): Pixels {
  const p = new Pixels(18, 14);
  p.ellipse(0, 1, 18, 13, "#3a7537");
  p.ellipse(1, 0, 15, 10, "#4f9a46");
  p.ellipse(3, 1, 6, 4, "#6dbb5a");
  if (berries) [4, 9, 13].forEach((x, i) => p.set(x, 6 + (i % 2) * 2, "#e05f5f"));
  p.outline(OUT);
  return p;
}

export function rock(): Pixels {
  const p = new Pixels(16, 11);
  p.ellipse(0, 1, 16, 10, "#8a8478");
  p.ellipse(2, 0, 10, 7, "#a8a294");
  p.set(4, 2, "#c4beb0");
  p.outline(OUT);
  return p;
}

export function stoneLantern(): Pixels {
  const p = new Pixels(14, 24);
  p.rect(4, 18, 6, 6, "#9d9484");
  p.rect(5, 12, 4, 6, "#b8b0a0");
  p.rect(2, 7, 10, 6, "#b8b0a0");
  p.rect(4, 8, 6, 4, "#f7d27a");
  p.rect(0, 4, 14, 3, "#8a8478");
  p.rect(5, 1, 4, 3, "#8a8478");
  p.outline(OUT);
  return p;
}

export function lampPost(): Pixels {
  const p = new Pixels(10, 30);
  p.rect(4, 8, 2, 20, "#3a3646");
  p.rect(2, 27, 6, 3, "#3a3646");
  p.rect(1, 2, 8, 7, "#3a3646");
  p.rect(2, 3, 6, 5, "#ffe39a");
  p.rect(3, 0, 4, 2, "#3a3646");
  p.outline(OUT);
  return p;
}

export function bench(): Pixels {
  const p = new Pixels(26, 14);
  p.rect(1, 2, 24, 3, "#9a6a3e");
  p.rect(1, 6, 24, 3, "#b07a4a");
  p.rect(3, 9, 2, 5, "#5e3d24");
  p.rect(21, 9, 2, 5, "#5e3d24");
  p.outline(OUT);
  return p;
}

export function questBoard(): Pixels {
  const p = new Pixels(36, 34);
  p.rect(3, 6, 2, 28, "#5e3d24");
  p.rect(31, 6, 2, 28, "#5e3d24");
  p.rect(1, 4, 34, 22, "#8a5a36");
  p.rect(3, 6, 30, 18, "#c99a63");
  const notes = ["#8f7cf0", "#e0794f", "#5fc4a4", "#f2c14e"];
  notes.forEach((c, i) => {
    const x = 5 + i * 7;
    p.rect(x, 8 + (i % 2), 6, 7, "#f7f1e3");
    p.rect(x, 8 + (i % 2), 6, 2, c);
    p.hline(x + 1, 12 + (i % 2), 4, "#b9ad93");
  });
  p.rect(0, 1, 36, 4, "#6b4226");
  p.rect(14, 0, 8, 2, "#f2c14e");
  p.outline(OUT);
  return p;
}

export function fountain(frame: number): Pixels {
  const p = new Pixels(48, 40);
  p.ellipse(0, 18, 48, 22, "#b5a585");
  p.ellipse(3, 20, 42, 16, "#3d7dc0");
  p.ellipse(8, 22, 14, 6, "#6aa8e0");
  p.rect(21, 8, 6, 20, "#cfc2a2");
  p.ellipse(15, 6, 18, 7, "#b5a585");
  p.ellipse(17, 7, 14, 4, "#6aa8e0");
  const off = frame ? 1 : 0;
  for (const [x, y] of [[23, 2], [21, 3 + off], [26, 3 - off], [19, 6], [28, 6]]) p.set(x, y, "#c9e6ff");
  p.set(12 + off * 2, 26, "#c9e6ff");
  p.set(34 - off * 2, 27, "#c9e6ff");
  p.outline(OUT);
  return p;
}

export function signpost(): Pixels {
  const p = new Pixels(22, 24);
  p.rect(10, 6, 2, 18, "#5e3d24");
  p.rect(1, 3, 20, 5, "#b07a4a");
  p.rect(19, 4, 3, 3, "#b07a4a");
  p.rect(3, 9, 16, 5, "#b07a4a");
  p.rect(0, 10, 3, 3, "#b07a4a");
  p.outline(OUT);
  return p;
}

export function dumbbellRack(): Pixels {
  const p = new Pixels(34, 20);
  p.rect(1, 6, 32, 3, "#5e6474");
  p.rect(1, 13, 32, 3, "#5e6474");
  p.rect(2, 9, 2, 11, "#4b5160");
  p.rect(30, 9, 2, 11, "#4b5160");
  for (let i = 0; i < 4; i++) {
    const x = 5 + i * 7;
    p.rect(x, 3, 6, 2, "#c9ced8");
    p.rect(x, 2, 1, 4, "#26262e");
    p.rect(x + 5, 2, 1, 4, "#26262e");
    p.rect(x, 10, 6, 2, "#c9ced8");
    p.rect(x, 9, 2, 4, "#26262e");
    p.rect(x + 4, 9, 2, 4, "#26262e");
  }
  p.outline(OUT);
  return p;
}

export function dummy(): Pixels {
  const p = new Pixels(18, 30);
  p.rect(8, 18, 2, 12, "#5e3d24");
  p.rect(4, 28, 10, 2, "#5e3d24");
  p.rrect(4, 8, 10, 12, "#c9a46a");
  p.hline(4, 13, 10, "#a8844a");
  p.ellipse(5, 1, 8, 8, "#c9a46a");
  p.rect(1, 10, 3, 2, "#c9a46a");
  p.rect(14, 10, 3, 2, "#c9a46a");
  p.ellipse(7, 12, 4, 4, "#d24b4b");
  p.outline(OUT);
  return p;
}

export function barbell(): Pixels {
  const p = new Pixels(28, 12);
  p.rect(2, 5, 24, 2, "#c9ced8");
  for (const x of [1, 4, 21, 24]) p.rect(x, 1, 3, 10, x < 10 ? "#26262e" : "#26262e");
  p.rect(3, 2, 1, 8, "#4b5160");
  p.rect(24, 2, 1, 8, "#4b5160");
  p.outline(OUT);
  return p;
}

export function stall(awning: [string, string]): Pixels {
  const p = new Pixels(42, 38);
  p.rect(3, 12, 2, 26, "#5e3d24");
  p.rect(37, 12, 2, 26, "#5e3d24");
  for (let x = 1; x < 41; x += 6) {
    p.rect(x, 4, 6, 8, ((x - 1) / 6) % 2 ? awning[1] : awning[0]);
    p.rect(x + 1, 12, 4, 2, ((x - 1) / 6) % 2 ? awning[1] : awning[0]);
  }
  p.rect(1, 2, 40, 2, "#6b4226");
  p.rect(2, 24, 38, 10, "#9a6a3e");
  p.hline(2, 24, 38, "#c28c5a");
  for (let i = 0; i < 5; i++) {
    p.ellipse(5 + i * 7, 20, 5, 5, ["#e05f5f", "#f2c14e", "#5fc4a4", "#e0794f", "#8f7cf0"][i]);
  }
  p.outline(OUT);
  return p;
}

export function gate(): Pixels {
  const p = new Pixels(52, 44);
  p.rect(8, 8, 4, 36, "#c4402f");
  p.rect(40, 8, 4, 36, "#c4402f");
  p.vline(11, 8, 36, "#9a3022");
  p.vline(43, 8, 36, "#9a3022");
  p.rect(0, 2, 52, 5, "#c4402f");
  p.rect(0, 0, 4, 3, "#c4402f");
  p.rect(48, 0, 4, 3, "#c4402f");
  p.hline(0, 6, 52, "#9a3022");
  p.rect(4, 13, 44, 3, "#c4402f");
  p.rect(24, 7, 4, 6, "#c4402f");
  p.outline(OUT);
  return p;
}

export function bamboo(): Pixels {
  const p = new Pixels(14, 36);
  for (const [x, h] of [[2, 34], [6, 30], [10, 36]] as const) {
    p.rect(x, 36 - h, 2, h, "#6dbb5a");
    for (let y = 36 - h + 5; y < 36; y += 7) p.hline(x, y, 2, "#3a7537");
    p.set(x + 2, 36 - h + 3, "#4f9a46");
    p.set(x + 3, 36 - h + 2, "#4f9a46");
  }
  p.outline(OUT);
  return p;
}

export function flowerPot(color: string): Pixels {
  const p = new Pixels(12, 14);
  p.rect(2, 8, 8, 6, "#b8603e");
  p.hline(1, 8, 10, "#9a4a2e");
  p.ellipse(1, 1, 10, 8, "#4f9a46");
  for (const [x, y] of [[3, 2], [7, 3], [5, 5]]) p.set(x, y, color);
  p.outline(OUT);
  return p;
}

export function mailbox(): Pixels {
  const p = new Pixels(10, 18);
  p.rect(4, 8, 2, 10, "#5e3d24");
  p.rrect(0, 1, 10, 8, "#3e7cc9");
  p.hline(1, 1, 8, "#5a9ad6");
  p.rect(8, 0, 2, 4, "#d24b4b");
  p.outline(OUT);
  return p;
}

export function bookStack(): Pixels {
  const p = new Pixels(14, 12);
  [["#8f7cf0", 0], ["#e0794f", 1], ["#5fc4a4", 0], ["#f2c14e", 1]].forEach(([c, o], i) => {
    p.rect(1 + (o as number), 9 - i * 3, 11, 3, c as string);
    p.hline(2 + (o as number), 10 - i * 3, 9, "#f7f1e3");
  });
  p.outline(OUT);
  return p;
}

export function tablet(): Pixels {
  const p = new Pixels(16, 22);
  p.rrect(1, 0, 14, 20, "#a8a294");
  p.vline(13, 1, 18, "#8a8478");
  for (let y = 4; y < 16; y += 3) p.hline(4, y, 7, "#7d64c9");
  p.rect(0, 19, 16, 3, "#8a8478");
  p.outline(OUT);
  return p;
}

export function lilyPad(): Pixels {
  const p = new Pixels(10, 7);
  p.ellipse(0, 0, 10, 7, "#4f9a46");
  p.set(5, 1, null);
  p.set(5, 2, null);
  p.set(3, 2, "#f7a8c4");
  p.set(4, 2, "#ffd6e6");
  p.outline(OUT);
  return p;
}

export function waterfall(frame: number): Pixels {
  const p = new Pixels(36, 52);
  p.rect(0, 0, 36, 10, "#7a7468");
  p.rect(0, 8, 6, 44, "#8a8478");
  p.rect(30, 8, 6, 44, "#8a8478");
  p.rect(6, 6, 24, 40, "#5a9ad6");
  for (let y = 6; y < 46; y += 4) {
    p.vline(9 + ((y / 4 + frame) % 3) * 6, y, 3, "#c9e6ff");
    p.vline(12 + ((y / 4 + frame + 1) % 3) * 5, y + 1, 2, "#a8d4f0");
  }
  p.ellipse(2, 42, 32, 10, "#e6f4ff");
  p.outline(OUT);
  return p;
}

export function fence(): Pixels {
  const p = new Pixels(16, 14);
  p.rect(0, 4, 16, 2, "#c99a63");
  p.rect(0, 9, 16, 2, "#c99a63");
  p.rect(2, 1, 3, 13, "#b07a4a");
  p.rect(11, 1, 3, 13, "#b07a4a");
  p.outline(OUT);
  return p;
}

export function coinPile(): Pixels {
  const p = new Pixels(16, 10);
  p.ellipse(0, 3, 16, 7, "#e0a92e");
  p.ellipse(2, 2, 12, 5, "#f2c14e");
  [3, 7, 11].forEach((x) => p.set(x, 3, "#fff1b0"));
  p.outline(OUT);
  return p;
}

export function moneyBag(): Pixels {
  const p = new Pixels(12, 14);
  p.ellipse(0, 4, 12, 10, "#c9a46a");
  p.rect(4, 1, 4, 4, "#c9a46a");
  p.hline(3, 4, 6, "#8a5a36");
  p.rect(5, 7, 2, 4, "#f2c14e");
  p.outline(OUT);
  return p;
}

export function banner(color: string): Pixels {
  const p = new Pixels(10, 30);
  p.rect(4, 0, 2, 30, "#5a3a24");
  p.rect(0, 2, 10, 2, "#5a3a24");
  p.rect(1, 4, 8, 14, color);
  p.set(1, 18, color);
  p.set(8, 18, color);
  p.rect(3, 8, 4, 4, "#f2c14e");
  p.outline(OUT);
  return p;
}

// ── Companions (2-frame bob) ──────────────────────────────────────────────

export function owl(frame: number): Pixels {
  const p = new Pixels(14, 14);
  const y = frame;
  p.ellipse(2, 2 + y, 10, 11, "#8a6a4a");
  p.ellipse(4, 6 + y, 6, 6, "#e9dcc0");
  p.rect(3, 4 + y, 3, 3, "#fff6c8");
  p.rect(8, 4 + y, 3, 3, "#fff6c8");
  p.set(4, 5 + y, "#1d1626");
  p.set(9, 5 + y, "#1d1626");
  p.set(6, 7 + y, "#f2c14e");
  p.set(7, 7 + y, "#f2c14e");
  p.set(2, 2 + y, "#5e4630");
  p.set(11, 2 + y, "#5e4630");
  p.rect(0, 6 + y - frame, 2, 4, "#6e5238");
  p.rect(12, 6 + y - frame, 2, 4, "#6e5238");
  p.outline(OUT);
  return p;
}

export function fox(frame: number): Pixels {
  const p = new Pixels(16, 14);
  p.ellipse(3, 6, 10, 7, "#f0a060");
  p.rect(1, 2 + frame, 2, 3, "#f0a060");
  p.rect(13, 2 + frame, 2, 3, "#f0a060");
  p.ellipse(4, 2 + frame, 8, 7, "#f0a060");
  p.rect(6, 6 + frame, 4, 2, "#fff6e8");
  p.set(6, 4 + frame, "#1d1626");
  p.set(9, 4 + frame, "#1d1626");
  p.rect(4, 12, 2, 2, "#c06a30");
  p.rect(10, 12, 2, 2, "#c06a30");
  p.set(14, 8 - frame, "#fff6e8");
  p.outline("#2a5a6a");
  return p;
}

export function coinSprite(frame: number): Pixels {
  const p = new Pixels(12, 12);
  const w = frame ? 6 : 10;
  p.ellipse(6 - w / 2, 1, w, 10, "#f2c14e");
  p.ellipse(6 - w / 2 + 1, 2, Math.max(2, w - 3), 7, "#e0a92e");
  p.set(5, 4, "#1d1626");
  p.set(7, 4, "#1d1626");
  p.set(6, 6, "#fff1b0");
  p.outline(OUT);
  return p;
}
