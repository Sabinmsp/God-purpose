import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { queuePixelLab, registerPixelLab } from "../pixellab";
import { buildAllTextures } from "../textures";

/** Draws all procedural art, loads optional PixelLab sprites, then enters the scene the player last stood in. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Missing PixelLab art is fine: the procedural sprites are always available.
    queuePixelLab(this);
  }

  create() {
    buildAllTextures(this);
    registerPixelLab(this);
    const scene = bridge.state?.player.position.scene === "home" ? "home" : "village";
    this.scene.start(scene);
  }
}
