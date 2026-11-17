import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { queuePackSprites, registerPackSprites } from "../packSprites";
import { queuePixelLab, registerPixelLab } from "../pixellab";
import { buildAllTextures } from "../textures";

/** Draws all procedural art, loads optional PixelLab and asset-pack sprites, then enters the scene the player last stood in. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Missing PixelLab art is fine: the procedural sprites are always available.
    queuePixelLab(this);
    // Animals, emotes and the daily chest from the asset pack; also optional.
    queuePackSprites(this);
  }

  create() {
    buildAllTextures(this);
    registerPixelLab(this);
    registerPackSprites(this);
    const scene = bridge.state?.player.position.scene === "home" ? "home" : "village";
    this.scene.start(scene);
  }
}
