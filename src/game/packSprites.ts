import type * as Phaser from "phaser";
import { PACK_DIR } from "./art/pack";

/**
 * Animated sprites from the Ninja Adventure pack (CC0): village animals, emote
 * bubbles, the daily chest and pond ripples. They are loaded by Phaser at boot.
 * Everything that uses them checks `hasPackSprite` first, so a missing file
 * only means that piece of village life is absent.
 */
const SHEETS: Record<string, { file: string; w: number; h: number }> = {
  "na-cat": { file: "animals/CatOrange.png", w: 22, h: 17 },
  "na-dog": { file: "animals/DogYellow.png", w: 21, h: 17 },
  "na-chicken-white": { file: "animals/ChickenWhite.png", w: 16, h: 16 },
  "na-chicken-brown": { file: "animals/ChickenBrown.png", w: 16, h: 16 },
  "na-chicken-black": { file: "animals/ChickenBlack.png", w: 16, h: 16 },
  "na-frog": { file: "animals/Frog.png", w: 16, h: 16 },
  "na-fish-red": { file: "animals/FishRed.png", w: 16, h: 16 },
  "na-fish-yellow": { file: "animals/FishYellow.png", w: 16, h: 16 },
  "na-chest": { file: "items/BigTreasureChest.png", w: 16, h: 14 },
  "na-ripple": { file: "fx/WaterRipples.png", w: 16, h: 16 },
};

export const EMOTES = { alert: "emote22", heart: "emote27", sleep: "emote28", dots: "emote20", star: "emote29" } as const;
export type Emote = keyof typeof EMOTES;
const emoteKey = (e: Emote) => `na-${EMOTES[e]}`;

/** Call from a scene's preload(). */
export function queuePackSprites(scene: Phaser.Scene) {
  for (const [key, s] of Object.entries(SHEETS)) scene.load.spritesheet(key, `${PACK_DIR}/${s.file}`, { frameWidth: s.w, frameHeight: s.h });
  for (const e of Object.keys(EMOTES) as Emote[]) scene.load.image(emoteKey(e), `${PACK_DIR}/emotes/${EMOTES[e]}.png`);
}

export const hasPackSprite = (scene: Phaser.Scene, key: string) => scene.textures.exists(key);

/** Call from a scene's create(), after loading. */
export function registerPackSprites(scene: Phaser.Scene) {
  const loop = (key: string, tex: string, frames: number[], rate: number) => {
    if (!hasPackSprite(scene, tex) || scene.anims.exists(key)) return;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(tex, { frames }), frameRate: rate, repeat: -1 });
  };
  for (const key of Object.keys(SHEETS)) if (key !== "na-chest" && key !== "na-ripple") loop(`${key}:walk`, key, [0, 1], 6);
  if (hasPackSprite(scene, "na-ripple") && !scene.anims.exists("na-ripple")) {
    scene.anims.create({ key: "na-ripple", frames: scene.anims.generateFrameNumbers("na-ripple", { frames: [0, 1, 2, 3] }), frameRate: 5, repeat: 0 });
  }
}

/** Pops an emote bubble above something for a moment; it follows the target while shown. */
export function showEmote(scene: Phaser.Scene, target: { x: number; y: number }, emote: Emote, above = 30, ms = 1300) {
  const key = emoteKey(emote);
  if (!hasPackSprite(scene, key)) return;
  const img = scene.add.image(target.x, target.y - above, key).setOrigin(0.5, 1).setDepth(99990).setScale(0.2);
  const follow = () => img.setPosition(target.x, target.y - above);
  scene.events.on("postupdate", follow);
  const done = () => {
    scene.events.off("postupdate", follow);
    img.destroy();
  };
  scene.events.once("shutdown", done);
  scene.tweens.add({ targets: img, scale: 1, duration: 140, ease: "Back.easeOut" });
  scene.tweens.add({ targets: img, alpha: 0, delay: ms, duration: 200, onComplete: done });
}
