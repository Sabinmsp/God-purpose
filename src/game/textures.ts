import * as Phaser from "phaser";
import { NPC_LOOKS, buildCharacter, type Look } from "./art/character";
import { disciplineRing, fourCrest } from "./art/evolution";
import { FONT_CELL, FONT_CHARS, buildFont } from "./art/font";
import * as F from "./art/furniture";
import * as X from "./art/fx";
import { packFrames, type Pixels } from "./art/paint";
import * as P from "./art/props";
import { ANIMATED_PROPS, WORLD_ART } from "./art/registry";
import { buildTileset } from "./art/tiles";

export function addPixels(scene: Phaser.Scene, key: string, px: Pixels) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, px.toCanvas());
}

export function addSheet(scene: Phaser.Scene, key: string, frames: { name: string; px: Pixels }[]) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const { canvas, rects } = packFrames(frames);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (const r of rects) tex.add(r.name, 0, r.x, r.y, r.w, r.h);
}

/** Registers a character sheet + its animations under `key` (e.g. "player-3"). */
export function registerCharacter(scene: Phaser.Scene, key: string, look: Look) {
  const { frames, anims } = buildCharacter(look);
  addSheet(scene, key, frames);
  for (const a of anims) {
    const animKey = `${key}:${a.key}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: a.frames.map((frame) => ({ key, frame })),
      frameRate: a.rate,
      repeat: a.repeat,
    });
  }
}

function anim2(scene: Phaser.Scene, key: string, frames: Pixels[], rate: number) {
  addSheet(scene, key, frames.map((px, i) => ({ name: String(i), px })));
  if (!scene.anims.exists(key)) {
    scene.anims.create({ key, frames: frames.map((_, i) => ({ key, frame: String(i) })), frameRate: rate, repeat: -1 });
  }
}

/** Draws every texture the game uses. Runs once at boot (~100 ms). */
export function buildAllTextures(scene: Phaser.Scene) {
  addPixels(scene, "tiles", buildTileset());

  // Buildings (all evolution stages), props, decorations, victory lanterns
  for (const [key, draw] of Object.entries(WORLD_ART)) if (!ANIMATED_PROPS.has(key)) addPixels(scene, key, draw());
  addPixels(scene, "discipline-ring", disciplineRing());
  addPixels(scene, "four-crest", fourCrest());

  anim2(scene, "fountain", [P.fountain(0), P.fountain(1)], 3);
  anim2(scene, "waterfall", [P.waterfall(0), P.waterfall(1), P.waterfall(2)], 6);
  anim2(scene, "owl", [P.owl(0), P.owl(1)], 3);
  anim2(scene, "fox", [P.fox(0), P.fox(1)], 3);
  anim2(scene, "coin-sprite", [P.coinSprite(0), P.coinSprite(1)], 4);

  // Home furniture (+ ghost silhouettes for items not yet unlocked)
  const furniture: Record<string, Pixels> = {
    bed: F.bed(),
    "desk-basic": F.desk(false, false),
    "desk-lamp": F.desk(false, true),
    "desk-fancy": F.desk(true, true),
    chair: F.chair(),
    bookshelf: F.bookshelf(),
    "weight-bench": F.weightBench(),
    "squat-rack": F.squatRack(),
    dumbbells: F.smallDumbbells(),
    plant: F.plant(),
    cushion: F.cushion(),
    bonsai: F.bonsai(),
    "piggy-bank": F.piggyBank(),
    rug: F.rug(),
    sofa: F.sofa(),
    wardrobe: F.wardrobe(),
    "window-day": F.windowFrame(false),
    "window-night": F.windowFrame(true),
  };
  for (const [key, px] of Object.entries(furniture)) {
    addPixels(scene, key, px);
    addPixels(scene, `${key}-ghost`, F.ghost(px));
  }
  for (let n = 0; n <= 10; n++) addPixels(scene, `trophies-${n}`, F.trophyShelf(n));

  // Effects
  addPixels(scene, "fx-dot", X.dot(2));
  addPixels(scene, "fx-dot1", X.dot(1));
  addPixels(scene, "fx-spark", X.spark());
  addPixels(scene, "fx-petal", X.petal());
  addPixels(scene, "fx-glyph", X.glyph());
  addPixels(scene, "fx-coin", X.coin());
  addPixels(scene, "fx-z", X.zee());
  addPixels(scene, "shadow", X.shadow());
  addPixels(scene, "arrow", X.arrow());
  const glows: [string, string][] = [
    ["glow-warm", "rgba(255,214,140,0.9)"],
    ["glow-cool", "rgba(150,200,255,0.9)"],
    ["glow-purple", "rgba(190,160,255,0.9)"],
    ["glow-pink", "rgba(255,170,210,0.9)"],
    ["glow-gold", "rgba(255,225,120,1)"],
    ["glow-white", "rgba(255,255,255,1)"],
  ];
  for (const [key, color] of glows) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, X.glowCanvas(128, color));
  }

  // Pixel font
  addPixels(scene, "font-img", buildFont());
  scene.cache.bitmapFont.add(
    "pixel",
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: "font-img",
      width: FONT_CELL.w,
      height: FONT_CELL.h,
      chars: FONT_CHARS,
      charsPerRow: FONT_CHARS.length,
      "spacing.x": 0,
      "spacing.y": 0,
      "offset.x": 0,
      "offset.y": 0,
      lineSpacing: 1,
    }),
  );

  // NPCs
  for (const [id, look] of Object.entries(NPC_LOOKS)) registerCharacter(scene, `npc-${id}`, look);
}
