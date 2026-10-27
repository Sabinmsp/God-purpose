import * as Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { HomeScene } from "./scenes/HomeScene";
import { VillageScene } from "./scenes/VillageScene";

export function createGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0b1030",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    input: { keyboard: { capture: [] } },
    fps: { target: 60, smoothStep: true },
    banner: false,
    scene: [BootScene, VillageScene, HomeScene],
  });
}
