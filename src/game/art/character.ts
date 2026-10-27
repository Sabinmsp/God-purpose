import { Pixels } from "./paint";

/**
 * Procedural, layered pixel character (32×32 frames). Clothing, hats and
 * physique are parameters, so outfits unlock as palette/shape changes and
 * body transformation (from recorded measurements) widens the build.
 */

export type HairStyle = "short" | "spiky" | "long" | "bun" | "bald";
export type TopStyle = "tee" | "coat" | "tank" | "robe" | "blazer";
export type BottomStyle = "jeans" | "shorts" | "robe";

export interface Look {
  skin: [string, string];
  hair: [string, string, string];
  hairStyle: HairStyle;
  top: [string, string];
  topStyle: TopStyle;
  accent: string;
  bottom: [string, string];
  bottomStyle: BottomStyle;
  shoes: [string, string];
  backpack: [string, string, string] | null;
  hat: "none" | "sweatband" | "crown";
  bulk: 0 | 1 | 2;
  beard?: string;
  glasses?: boolean;
}

export type Dir = "down" | "up" | "right";
type Eyes = "open" | "closed" | "down" | "happy" | "blink";
type Mouth = "smile" | "open" | "flat";

interface Pose {
  bodyY: number;
  headY: number;
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  eyes: Eyes;
  mouth: Mouth;
  /** side view: leg stride (-2..2) and arm swing (-2..2) */
  stride: number;
  swing: number;
}

const OUTLINE = "#1b1424";
const EYE = "#1d1626";
const MOUTH = "#7a3b34";
const BLUSH = "#de8f80";

const base: Pose = { bodyY: 0, headY: 0, legL: 0, legR: 0, armL: 0, armR: 0, eyes: "open", mouth: "smile", stride: 0, swing: 0 };
const pose = (p: Partial<Pose>): Pose => ({ ...base, ...p });

export const SABIN: Look = {
  skin: ["#c98e62", "#a46c47"],
  hair: ["#2b2024", "#1a1216", "#4a383d"],
  hairStyle: "spiky",
  top: ["#3e7cc9", "#2c5c9a"],
  topStyle: "tee",
  accent: "#e9e2d0",
  bottom: ["#36425f", "#262f47"],
  bottomStyle: "jeans",
  shoes: ["#efe9dc", "#b3a998"],
  backpack: ["#a0612f", "#77461f", "#c07d42"],
  hat: "none",
  bulk: 0,
};

/** Outfit unlocks are palette + cut changes on the base look. */
export const OUTFITS: Record<string, Partial<Look>> = {
  casual: {},
  scholar_outfit: { top: ["#5b3f9e", "#422d78"], topStyle: "coat", accent: "#e3c15a", bottom: ["#2a2340", "#1d182d"] },
  athletic_outfit: { top: ["#d2553b", "#a43e28"], topStyle: "tank", accent: "#f4efe4", bottom: ["#26262e", "#18181e"], bottomStyle: "shorts", shoes: ["#5fd0a0", "#2f8f6a"] },
  zen_robe: { top: ["#e9dcc0", "#c8b78f"], topStyle: "robe", accent: "#4aa38b", bottom: ["#e9dcc0", "#c8b78f"], bottomStyle: "robe" },
  smart_outfit: { top: ["#2b3550", "#1e263b"], topStyle: "blazer", accent: "#d8b444", bottom: ["#b59a6a", "#8f7750"], shoes: ["#4a3123", "#2e1e15"] },
};

function drawHeadFront(p: Pixels, L: Look, y0: number, eyes: Eyes, mouth: Mouth, back = false) {
  const [skin, skinS] = L.skin;
  const [hair, hairS, hairH] = L.hair;
  // ears
  p.rect(9, y0 + 8, 1, 2, skin);
  p.rect(22, y0 + 8, 1, 2, skinS);
  // face
  p.rrect(10, y0 + 3, 12, 11, skin);
  p.vline(21, y0 + 5, 7, skinS);
  p.hline(12, y0 + 13, 8, skinS);

  if (back) {
    if (L.hairStyle !== "bald") {
      p.rrect(10, y0 + 1, 12, 12, hair);
      p.vline(20, y0 + 3, 9, hairS);
      p.hline(12, y0 + 12, 8, hairS);
      p.set(13, y0 + 3, hairH);
      p.set(14, y0 + 2, hairH);
      if (L.hairStyle === "long") p.rect(10, y0 + 12, 12, 3, hair);
      if (L.hairStyle === "bun") p.rrect(13, y0 - 1, 6, 4, hair);
    }
    p.hline(14, y0 + 14, 4, skinS);
    return;
  }

  // hair
  if (L.hairStyle !== "bald") {
    p.rrect(10, y0 + 1, 12, 6, hair);
    p.vline(10, y0 + 6, 4, hair);
    p.vline(21, y0 + 6, 4, hairS);
    p.hline(12, y0 + 1, 8, hair);
    p.set(14, y0 + 2, hairH);
    p.set(15, y0 + 2, hairH);
    p.set(13, y0 + 3, hairH);
    if (L.hairStyle === "spiky") {
      p.set(12, y0, hair);
      p.set(15, y0, hair);
      p.set(18, y0, hair);
      [11, 12, 14, 15, 17, 19, 20].forEach((x) => p.set(x, y0 + 7, hair));
      p.set(13, y0 + 7, hairS);
    } else if (L.hairStyle === "short") {
      [11, 12, 13, 16, 17, 19, 20].forEach((x) => p.set(x, y0 + 7, hair));
    } else if (L.hairStyle === "long") {
      p.rect(9, y0 + 5, 2, 9, hair);
      p.rect(21, y0 + 5, 2, 9, hairS);
      [11, 12, 13, 18, 19, 20].forEach((x) => p.set(x, y0 + 7, hair));
    } else if (L.hairStyle === "bun") {
      p.rrect(13, y0 - 2, 6, 4, hair);
      p.set(14, y0 - 1, hairH);
    }
  } else {
    p.set(13, y0 + 4, "#ffffff55");
  }

  // eyes
  const ey = y0 + 9;
  if (eyes === "open") {
    p.rect(13, ey, 1, 2, EYE);
    p.rect(18, ey, 1, 2, EYE);
  } else if (eyes === "down") {
    p.set(13, ey + 1, EYE);
    p.set(18, ey + 1, EYE);
  } else if (eyes === "happy") {
    p.set(12, ey + 1, EYE);
    p.set(13, ey, EYE);
    p.set(14, ey + 1, EYE);
    p.set(17, ey + 1, EYE);
    p.set(18, ey, EYE);
    p.set(19, ey + 1, EYE);
  } else {
    p.hline(12, ey + 1, 2, EYE);
    p.hline(18, ey + 1, 2, EYE);
  }
  if (L.glasses) {
    p.hline(11, ey - 1, 4, "#2a2733");
    p.hline(17, ey - 1, 4, "#2a2733");
    p.hline(15, ey - 1, 2, "#2a2733");
  }
  p.set(11, y0 + 11, BLUSH);
  p.set(20, y0 + 11, BLUSH);
  // mouth
  const my = y0 + 12;
  if (mouth === "smile") {
    p.hline(15, my, 2, MOUTH);
    p.set(14, my - 1, skinS);
    p.set(17, my - 1, skinS);
  } else if (mouth === "open") {
    p.rect(15, my - 1, 2, 2, "#5a2228");
    p.set(15, my, "#c4555a");
  } else {
    p.hline(15, my, 2, skinS);
  }
  if (L.beard) {
    p.hline(11, y0 + 12, 10, L.beard);
    p.hline(12, y0 + 13, 8, L.beard);
    p.hline(15, my, 2, MOUTH);
  }
}

function drawHat(p: Pixels, L: Look, y0: number, dir: Dir) {
  if (L.hat === "sweatband") {
    const x0 = dir === "right" ? 11 : 10;
    p.hline(x0, y0 + 5, dir === "right" ? 10 : 12, "#e04848");
    p.hline(x0, y0 + 6, dir === "right" ? 10 : 12, "#b33434");
    if (dir === "up") p.rect(13, y0 + 7, 2, 3, "#e04848");
  } else if (L.hat === "crown") {
    const gold = "#f2c14e";
    const dark = "#b88a1e";
    p.rect(11, y0 - 1, 10, 3, gold);
    p.hline(11, y0 + 1, 10, dark);
    [11, 14, 17, 20].forEach((x) => p.rect(x, y0 - 3, 1, 2, gold));
    p.rect(15, y0 - 3, 2, 2, gold);
    p.set(15, y0, "#5fc4f0");
    p.set(16, y0, "#e05f8a");
  }
}

function drawTorsoFront(p: Pixels, L: Look, y: number, back: boolean) {
  const b = L.bulk;
  const x = 11 - b;
  const w = 10 + 2 * b;
  const [top, topS] = L.top;
  const long = L.topStyle === "coat" || L.topStyle === "robe";
  p.rect(x, y + 15, w, long ? 10 : 8, top);
  p.rect(x + w - 2, y + 15, 2, long ? 10 : 8, topS);
  p.hline(x, y + (long ? 24 : 22), w, topS);
  if (back) return;
  switch (L.topStyle) {
    case "tee":
      p.hline(14, y + 15, 4, L.skin[1]);
      p.set(15, y + 16, L.skin[1]);
      p.set(16, y + 16, L.skin[1]);
      break;
    case "tank":
      p.rect(13, y + 15, 6, 2, L.skin[0]);
      p.hline(13, y + 17, 6, L.accent);
      break;
    case "coat":
      p.vline(15, y + 16, 9, L.accent);
      p.vline(16, y + 16, 9, topS);
      p.hline(13, y + 15, 6, L.accent);
      p.set(14, y + 19, L.accent);
      p.set(17, y + 19, L.accent);
      break;
    case "robe":
      p.hline(14, y + 15, 4, L.skin[1]);
      p.set(15, y + 16, topS);
      p.set(16, y + 17, topS);
      p.hline(x, y + 20, w, L.accent);
      break;
    case "blazer":
      p.rect(15, y + 15, 2, 7, "#f1efe9");
      p.vline(15, y + 16, 5, L.accent);
      p.set(14, y + 16, topS);
      p.set(17, y + 16, topS);
      break;
  }
  if (L.backpack && L.topStyle !== "robe") {
    p.vline(x + 1, y + 15, 6, L.backpack[1]);
    p.vline(x + w - 2, y + 15, 6, L.backpack[1]);
    p.set(x + 1, y + 18, L.backpack[2]);
    p.set(x + w - 2, y + 18, L.backpack[2]);
  }
}

function drawArmFront(p: Pixels, L: Look, side: -1 | 1, y: number, lift: number) {
  const b = L.bulk;
  const w = b >= 2 ? 3 : 2;
  const x = side < 0 ? 11 - b - w : 21 + b;
  const sleeve = L.topStyle === "tank" ? 0 : L.topStyle === "tee" ? 3 : 5;
  const top = y + 15 + lift;
  p.rect(x, top, w, sleeve, side < 0 ? L.top[0] : L.top[1]);
  p.rect(x, top + sleeve, w, 6 - sleeve, side < 0 ? L.skin[0] : L.skin[1]);
}

function drawLegsFront(p: Pixels, L: Look, pose: Pose, back: boolean) {
  const [pants, pantsS] = L.bottom;
  const [shoe, sole] = L.shoes;
  for (const side of [-1, 1] as const) {
    const lift = side < 0 ? pose.legL : pose.legR;
    const x = side < 0 ? 12 : 16;
    const bottom = 27 + lift;
    if (L.bottomStyle === "shorts") {
      p.rect(x, 23, 4, 2, pants);
      p.rect(x + 1, 25, 2, bottom - 24, L.skin[side < 0 ? 0 : 1]);
    } else {
      p.rect(x, 23, 4, bottom - 22, side < 0 ? pants : pantsS);
    }
    if (L.bottomStyle === "robe") p.rect(x - 1, 23, 6, Math.max(1, bottom - 24), side < 0 ? L.bottom[0] : L.bottom[1]);
    const sx = side < 0 ? x - 1 : x;
    p.rect(sx, bottom + 1, 5, 2, shoe);
    p.hline(sx, bottom + 2, 5, sole);
    if (!back) p.set(side < 0 ? sx + 1 : sx + 3, bottom + 1, "#d24b4b");
  }
}

function drawBackpackBack(p: Pixels, L: Look, y: number) {
  if (!L.backpack) return;
  const [pack, packS, packL] = L.backpack;
  p.rrect(11, y + 15, 10, 9, pack);
  p.rect(11, y + 15, 10, 2, packS);
  p.rect(13, y + 19, 6, 4, packL);
  p.hline(13, y + 19, 6, packS);
  p.set(15, y + 17, "#d9b26a");
}

function front(L: Look, P: Pose): Pixels {
  const p = new Pixels(32, 32);
  drawLegsFront(p, L, P, false);
  drawTorsoFront(p, L, P.bodyY, false);
  drawArmFront(p, L, -1, P.bodyY, P.armL);
  drawArmFront(p, L, 1, P.bodyY, P.armR);
  drawHeadFront(p, L, P.bodyY + P.headY + 1, P.eyes, P.mouth);
  drawHat(p, L, P.bodyY + P.headY + 1, "down");
  p.outline(OUTLINE);
  return p;
}

function backView(L: Look, P: Pose): Pixels {
  const p = new Pixels(32, 32);
  drawLegsFront(p, L, P, true);
  drawTorsoFront(p, L, P.bodyY, true);
  drawArmFront(p, L, -1, P.bodyY, P.armL);
  drawArmFront(p, L, 1, P.bodyY, P.armR);
  drawBackpackBack(p, L, P.bodyY);
  drawHeadFront(p, L, P.bodyY + P.headY + 1, "open", "flat", true);
  drawHat(p, L, P.bodyY + P.headY + 1, "up");
  p.outline(OUTLINE);
  return p;
}

function side(L: Look, P: Pose): Pixels {
  const p = new Pixels(32, 32);
  const [skin, skinS] = L.skin;
  const [hair, hairS, hairH] = L.hair;
  const y = P.bodyY;
  const b = L.bulk;
  const [pants, pantsS] = L.bottom;
  const [shoe, sole] = L.shoes;

  // legs: back leg first (darker), front leg second
  const legs: [number, string][] = [
    [14 - P.stride, pantsS],
    [14 + P.stride, pants],
  ];
  for (const [lx, color] of legs) {
    if (L.bottomStyle === "shorts") {
      p.rect(lx, 23, 4, 2, color);
      p.rect(lx + 1, 25, 2, 3, color === pants ? skin : skinS);
    } else {
      p.rect(lx, 23, 4, 5, color);
    }
    p.rect(lx, 28, 6, 2, shoe);
    p.hline(lx, 29, 6, sole);
  }

  // backpack behind the body
  if (L.backpack && L.topStyle !== "robe") {
    const [pack, packS, packL] = L.backpack;
    p.rrect(8 - b, y + 15, 5, 9, pack);
    p.vline(8 - b, y + 16, 7, packS);
    p.rect(9 - b, y + 19, 3, 3, packL);
  }

  // torso
  const long = L.topStyle === "coat" || L.topStyle === "robe";
  p.rect(12 - b, y + 15, 8 + 2 * b, long ? 10 : 8, L.top[0]);
  p.rect(12 - b, y + 15, 2, long ? 10 : 8, L.top[1]);
  if (L.topStyle === "coat" || L.topStyle === "blazer") p.vline(18 + b, y + 15, long ? 9 : 7, L.accent);
  if (L.topStyle === "robe") p.hline(12 - b, y + 20, 8 + 2 * b, L.accent);
  if (L.topStyle === "tank") p.rect(17, y + 15, 2, 2, skin);
  if (L.backpack && L.topStyle !== "robe") p.vline(14, y + 15, 6, L.backpack[1]);

  // front arm swings with the stride
  const ax = 15 + P.swing;
  const sleeve = L.topStyle === "tank" ? 0 : L.topStyle === "tee" ? 3 : 5;
  const aw = b >= 2 ? 3 : 2;
  p.rect(ax, y + 15, aw, sleeve, L.top[1]);
  p.rect(ax, y + 15 + sleeve, aw, 6 - sleeve, skin);

  // head
  const hy = y + P.headY + 1;
  p.rrect(11, hy + 3, 10, 11, skin);
  p.set(21, hy + 9, skin);
  p.set(21, hy + 10, skinS);
  p.hline(13, hy + 13, 7, skinS);
  if (L.hairStyle !== "bald") {
    p.rrect(10, hy + 1, 11, 6, hair);
    p.rect(10, hy + 5, 6, 8, hair);
    p.rect(10, hy + 10, 4, 3, hairS);
    p.set(14, hy + 2, hairH);
    p.set(15, hy + 2, hairH);
    if (L.hairStyle === "spiky") {
      [11, 14, 17].forEach((x) => p.set(x, hy, hair));
      p.set(9, hy + 4, hair);
      [17, 18, 20].forEach((x) => p.set(x, hy + 7, hair));
    }
    if (L.hairStyle === "long") p.rect(9, hy + 6, 4, 9, hair);
    if (L.hairStyle === "bun") p.rrect(9, hy - 1, 5, 4, hair);
  }
  p.rect(15, hy + 8, 2, 2, skinS); // ear
  if (P.eyes === "closed" || P.eyes === "blink" || P.eyes === "happy") p.hline(18, hy + 10, 2, EYE);
  else if (P.eyes === "down") p.set(19, hy + 10, EYE);
  else p.rect(19, hy + 9, 1, 2, EYE);
  if (L.glasses) p.hline(17, hy + 8, 4, "#2a2733");
  p.set(19, hy + 11, BLUSH);
  p.set(20, hy + 12, P.mouth === "open" ? "#5a2228" : MOUTH);
  if (L.beard) p.rect(16, hy + 12, 5, 2, L.beard);
  drawHat(p, L, hy, "right");
  p.outline(OUTLINE);
  return p;
}

// ── Activity poses (front-facing) ─────────────────────────────────────────

function celebrate(L: Look, jump: number, open: boolean): Pixels {
  const p = new Pixels(32, 32);
  const y = -jump;
  const P = pose({ bodyY: y, eyes: "happy", mouth: open ? "open" : "smile", legL: jump > 0 ? -1 : 0, legR: jump > 0 ? -1 : 0 });
  const legsY = new Pixels(32, 32);
  drawLegsFront(legsY, L, P, false);
  p.blit(legsY, 0, y);
  drawTorsoFront(p, L, y, false);
  // arms raised beside the head
  const b = L.bulk;
  for (const s of [-1, 1] as const) {
    const x = s < 0 ? 8 - b : 22 + b;
    p.rect(x, y + 8, 2, 4, s < 0 ? L.skin[0] : L.skin[1]);
    p.rect(x, y + 12, 2, 4, s < 0 ? L.top[0] : L.top[1]);
  }
  drawHeadFront(p, L, y + 1, P.eyes, P.mouth);
  drawHat(p, L, y + 1, "down");
  p.outline(OUTLINE);
  return p;
}

function exercise(L: Look, phase: number): Pixels {
  // phase 0 = arms down, 1 = half, 2 = curled
  const p = new Pixels(32, 32);
  const P = pose({ mouth: phase === 2 ? "flat" : "smile", eyes: phase === 2 ? "closed" : "open" });
  drawLegsFront(p, L, P, false);
  drawTorsoFront(p, L, 0, false);
  const b = L.bulk;
  for (const s of [-1, 1] as const) {
    const x = s < 0 ? 9 - b : 21 + b;
    const handY = [21, 18, 15][phase];
    p.rect(x, 15, 2, 3, s < 0 ? L.top[0] : L.top[1]);
    p.rect(x, Math.min(18, handY), 2, Math.abs(18 - handY) + 2, s < 0 ? L.skin[0] : L.skin[1]);
    // dumbbell
    const dx = s < 0 ? x - 2 : x - 1;
    p.rect(dx, handY, 5, 1, "#8e95a6");
    p.rect(dx, handY - 1, 1, 3, "#4b5160");
    p.rect(dx + 4, handY - 1, 1, 3, "#4b5160");
  }
  drawHeadFront(p, L, 1, P.eyes, P.mouth);
  drawHat(p, L, 1, "down");
  if (phase === 2) p.set(23, 6, "#8fd3ff");
  p.outline(OUTLINE);
  return p;
}

function read(L: Look, flip: boolean): Pixels {
  const p = new Pixels(32, 32);
  const P = pose({ eyes: "down", mouth: "smile" });
  drawLegsFront(p, L, P, false);
  drawTorsoFront(p, L, 0, false);
  drawArmFront(p, L, -1, 0, -1);
  drawArmFront(p, L, 1, 0, -1);
  // open book held at chest
  p.rect(11, 17, 10, 6, "#6b4fa0");
  p.rect(12, 17, 8, 5, "#f3ead6");
  p.vline(15, 17, 5, "#cfc3a8");
  p.vline(16, 17, 5, "#e6dcc4");
  [18, 20].forEach((yy) => p.hline(12, yy, 3, "#b9ad93"));
  [18, 20].forEach((yy) => p.hline(17, yy, 3, "#b9ad93"));
  if (flip) p.rect(16, 16, 3, 5, "#fffaf0");
  p.set(10, 19, L.skin[0]);
  p.set(21, 19, L.skin[1]);
  drawHeadFront(p, L, 1, P.eyes, P.mouth);
  drawHat(p, L, 1, "down");
  p.outline(OUTLINE);
  return p;
}

function meditate(L: Look, breath: number): Pixels {
  const p = new Pixels(32, 32);
  const y = 5 + breath;
  const [pants, pantsS] = L.bottom;
  // crossed legs
  p.rrect(7, 26, 18, 4, pants);
  p.hline(8, 29, 16, pantsS);
  p.rect(14, 26, 4, 2, pantsS);
  p.rect(6, 28, 3, 2, L.shoes[0]);
  p.rect(23, 28, 3, 2, L.shoes[0]);
  drawTorsoFront(p, L, y - 1, false);
  // arms resting on knees
  const b = L.bulk;
  p.rect(9 - b, y + 15, 2, 4, L.top[0]);
  p.rect(21 + b, y + 15, 2, 4, L.top[1]);
  p.rect(8 - b, y + 19, 3, 2, L.skin[0]);
  p.rect(21 + b, y + 19, 3, 2, L.skin[1]);
  drawHeadFront(p, L, y, "closed", "smile");
  drawHat(p, L, y, "down");
  p.outline(OUTLINE);
  return p;
}

function work(L: Look, tap: number): Pixels {
  const p = new Pixels(32, 32);
  // seated: upper body only, laptop in front
  drawTorsoFront(p, L, 2, false);
  drawArmFront(p, L, -1, 2, 0);
  drawArmFront(p, L, 1, 2, 0);
  drawHeadFront(p, L, 3, "down", "flat");
  drawHat(p, L, 3, "down");
  p.rect(8, 20, 16, 7, "#3b3f4f");
  p.rect(9, 21, 14, 5, "#4a5064");
  p.set(15, 23, "#9fb4ff");
  p.set(16, 23, "#9fb4ff");
  p.rect(6, 27, 20, 2, "#8e95a6");
  p.hline(6, 28, 20, "#5e6474");
  p.rect(tap ? 10 : 12, 26, 2, 1, L.skin[0]);
  p.rect(tap ? 20 : 18, 26, 2, 1, L.skin[1]);
  p.outline(OUTLINE);
  return p;
}

function sleep(L: Look, breath: number): Pixels {
  const p = new Pixels(32, 32);
  const [hair] = L.hair;
  // head on pillow (face up, rotated), blanket over the body
  p.rrect(3, 12, 10, 10, L.skin[0]);
  if (L.hairStyle !== "bald") {
    p.rect(2, 12, 4, 10, hair);
    p.rect(3, 11, 6, 2, hair);
    p.rect(3, 21, 6, 2, hair);
  }
  p.vline(8, 14, 2, EYE);
  p.vline(8, 18, 2, EYE);
  p.vline(11, 16, 2, MOUTH);
  const top = 11 - breath;
  p.rrect(12, top, 18, 24 - top, "#4f6fae");
  p.rect(12, top, 3, 24 - top, "#e9e2d0");
  p.hline(16, 17, 13, "#3d5a92");
  p.hline(16, 20, 13, "#6d8bc4");
  p.outline(OUTLINE);
  return p;
}

/** Golden glow outline for the level-up animation. */
function glow(px: Pixels, color: string): Pixels {
  const p = new Pixels(32, 32);
  p.blit(px, 0, 0);
  p.outline(color);
  return p;
}

export interface CharacterFrames {
  frames: { name: string; px: Pixels }[];
  anims: { key: string; frames: string[]; rate: number; repeat: number }[];
}

/** Builds every frame + animation definition for one look. */
export function buildCharacter(L: Look): CharacterFrames {
  const frames: { name: string; px: Pixels }[] = [];
  const anims: CharacterFrames["anims"] = [];
  const add = (name: string, px: Pixels) => {
    frames.push({ name, px });
    return name;
  };

  // walking: contact / passing / contact / passing
  const walkDown = [
    pose({}),
    pose({ bodyY: -1, legL: -1, armL: 1, armR: -1 }),
    pose({}),
    pose({ bodyY: -1, legR: -1, armL: -1, armR: 1 }),
  ];
  const walkSide = [
    pose({ stride: 0, swing: 0 }),
    pose({ bodyY: -1, stride: 2, swing: -2 }),
    pose({ stride: 0, swing: 0 }),
    pose({ bodyY: -1, stride: -2, swing: 2 }),
  ];
  anims.push({ key: "walk-down", frames: walkDown.map((P, i) => add(`walk-down-${i}`, front(L, P))), rate: 8, repeat: -1 });
  anims.push({ key: "walk-up", frames: walkDown.map((P, i) => add(`walk-up-${i}`, backView(L, P))), rate: 8, repeat: -1 });
  anims.push({ key: "walk-right", frames: walkSide.map((P, i) => add(`walk-right-${i}`, side(L, P))), rate: 8, repeat: -1 });

  // idle: breathing with an occasional blink
  const idleDown = [pose({}), pose({ headY: 1 }), pose({}), pose({ eyes: "blink" })];
  anims.push({ key: "idle-down", frames: idleDown.map((P, i) => add(`idle-down-${i}`, front(L, P))), rate: 2.5, repeat: -1 });
  anims.push({
    key: "idle-up",
    frames: [pose({}), pose({ headY: 1 })].map((P, i) => add(`idle-up-${i}`, backView(L, P))),
    rate: 2,
    repeat: -1,
  });
  anims.push({
    key: "idle-right",
    frames: [pose({}), pose({ headY: 1 }), pose({}), pose({ eyes: "blink" })].map((P, i) => add(`idle-right-${i}`, side(L, P))),
    rate: 2.5,
    repeat: -1,
  });

  anims.push({
    key: "celebrate",
    frames: [celebrate(L, 0, false), celebrate(L, 2, true), celebrate(L, 3, true), celebrate(L, 1, false)].map((px, i) =>
      add(`celebrate-${i}`, px),
    ),
    rate: 8,
    repeat: 2,
  });
  anims.push({
    key: "levelup",
    frames: [0, 2, 3, 1].map((j, i) => add(`levelup-${i}`, glow(celebrate(L, j, true), i % 2 ? "#fff3b0" : "#f2c14e"))),
    rate: 8,
    repeat: 4,
  });
  anims.push({ key: "exercise", frames: [0, 1, 2, 1].map((ph, i) => add(`exercise-${i}`, exercise(L, ph))), rate: 4, repeat: -1 });
  anims.push({ key: "read", frames: [false, false, true].map((f, i) => add(`read-${i}`, read(L, f))), rate: 1.5, repeat: -1 });
  anims.push({ key: "meditate", frames: [0, 1].map((b, i) => add(`meditate-${i}`, meditate(L, b))), rate: 1, repeat: -1 });
  anims.push({ key: "work", frames: [0, 1].map((t, i) => add(`work-${i}`, work(L, t))), rate: 5, repeat: -1 });
  anims.push({ key: "sleep", frames: [0, 1].map((b, i) => add(`sleep-${i}`, sleep(L, b))), rate: 1, repeat: -1 });

  return { frames, anims };
}

/** The player's look given equipped cosmetics and measured physique tier. */
export function playerLook(equipped: { outfit?: string; hat?: string }, physiqueTier: number): Look {
  const outfit = OUTFITS[equipped.outfit ?? "casual"] ?? {};
  const hat = equipped.hat === "focus_crown" ? "crown" : equipped.hat === "sweatband" ? "sweatband" : "none";
  const bulk = (physiqueTier >= 3 ? 2 : physiqueTier >= 1 ? 1 : 0) as Look["bulk"];
  return { ...SABIN, ...outfit, hat, bulk, backpack: outfit.topStyle === "robe" ? null : SABIN.backpack };
}

export const NPC_LOOKS: Record<string, Look> = {
  guide: {
    ...SABIN,
    skin: ["#d9a982", "#b88660"],
    hair: ["#e4ded4", "#bdb5a8", "#ffffff"],
    hairStyle: "bun",
    top: ["#35558a", "#263f69"],
    topStyle: "robe",
    accent: "#f2c14e",
    bottom: ["#35558a", "#263f69"],
    bottomStyle: "robe",
    shoes: ["#5a3b28", "#3a2618"],
    backpack: null,
    beard: "#e4ded4",
  },
  librarian: {
    ...SABIN,
    skin: ["#e3b896", "#c39270"],
    hair: ["#6b3f2a", "#4d2c1d", "#8a5a3f"],
    hairStyle: "long",
    top: ["#7d5bb5", "#5d4290"],
    topStyle: "coat",
    accent: "#e3c15a",
    bottom: ["#3a2d55", "#2a2040"],
    backpack: null,
    glasses: true,
  },
  coach: {
    ...SABIN,
    skin: ["#8d5a3b", "#6e432a"],
    hair: ["#1b1b1b", "#0f0f0f", "#333333"],
    hairStyle: "short",
    top: ["#e07a2f", "#b35d1e"],
    topStyle: "tank",
    accent: "#ffffff",
    bottom: ["#26262e", "#18181e"],
    bottomStyle: "shorts",
    backpack: null,
    hat: "sweatband",
    bulk: 2,
  },
  keeper: {
    ...SABIN,
    skin: ["#e0b088", "#bf8e66"],
    hair: ["#2b2024", "#1a1216", "#4a383d"],
    hairStyle: "bun",
    top: ["#e9dcc0", "#c8b78f"],
    topStyle: "robe",
    accent: "#4aa38b",
    bottom: ["#e9dcc0", "#c8b78f"],
    bottomStyle: "robe",
    backpack: null,
  },
  banker: {
    ...SABIN,
    skin: ["#b97f55", "#985f3a"],
    hair: ["#3a2a1e", "#261b13", "#58412f"],
    hairStyle: "short",
    top: ["#2b3550", "#1e263b"],
    topStyle: "blazer",
    accent: "#d8b444",
    bottom: ["#2b3550", "#1e263b"],
    shoes: ["#2e1e15", "#1a110c"],
    backpack: null,
    glasses: true,
  },
};
