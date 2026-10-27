import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { buildAllTextures } from "../textures";

/** Draws all procedural art, then enters the scene the player last stood in. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    buildAllTextures(this);
    const scene = bridge.state?.player.position.scene === "home" ? "home" : "village";
    this.scene.start(scene);
  }
}
