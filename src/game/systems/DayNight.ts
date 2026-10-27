import * as Phaser from "phaser";
import { localClock } from "@/lib/shared/time";

interface Phase {
  at: number;
  color: number;
  alpha: number;
  night: number;
}

// Hours in Australia/Darwin. Light is interpolated between these keyframes.
const PHASES: Phase[] = [
  { at: 0, color: 0x0b1030, alpha: 0.58, night: 1 },
  { at: 5, color: 0x0b1030, alpha: 0.5, night: 1 },
  { at: 6.2, color: 0xff9a6a, alpha: 0.22, night: 0.4 },
  { at: 7.5, color: 0xfff1d0, alpha: 0, night: 0 },
  { at: 16.8, color: 0xfff1d0, alpha: 0, night: 0 },
  { at: 18, color: 0xff9a4a, alpha: 0.18, night: 0.2 },
  { at: 19, color: 0x5a3a8a, alpha: 0.38, night: 0.7 },
  { at: 20.2, color: 0x0b1030, alpha: 0.55, night: 1 },
  { at: 24, color: 0x0b1030, alpha: 0.58, night: 1 },
];

export function lightAt(hour: number) {
  let i = 0;
  while (i < PHASES.length - 2 && PHASES[i + 1].at <= hour) i++;
  const a = PHASES[i];
  const b = PHASES[i + 1];
  const t = Phaser.Math.Clamp((hour - a.at) / (b.at - a.at), 0, 1);
  const ca = Phaser.Display.Color.ValueToColor(a.color);
  const cb = Phaser.Display.Color.ValueToColor(b.color);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, t * 100);
  return {
    color: Phaser.Display.Color.GetColor(c.r, c.g, c.b),
    alpha: a.alpha + (b.alpha - a.alpha) * t,
    night: a.night + (b.night - a.night) * t,
  };
}

/**
 * Tints the world to the real time of day in Darwin and fades lamps,
 * windows and lanterns in after sunset.
 */
export class DayNight {
  private overlay: Phaser.GameObjects.Rectangle;
  private lights: Phaser.GameObjects.Image[] = [];
  night = 0;
  private timer: Phaser.Time.TimerEvent;
  onChange?: (night: number) => void;

  constructor(private scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    this.overlay = scene.add
      .rectangle(0, 0, cam.width * 4, cam.height * 4, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(200000);
    this.timer = scene.time.addEvent({ delay: 30_000, loop: true, callback: () => this.refresh() });
    scene.scale.on("resize", this.resize, this);
    this.resize();
    this.refresh();
  }

  private resize() {
    const cam = this.scene.cameras.main;
    // The overlay ignores scroll but still scales with zoom, so cover generously.
    this.overlay.setPosition(-cam.width, -cam.height).setSize(cam.width * 4, cam.height * 4);
  }

  addLight(x: number, y: number, size: number, texture: string) {
    const img = this.scene.add
      .image(x, y, texture)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(200001)
      .setDisplaySize(size, size)
      .setAlpha(0);
    this.lights.push(img);
    this.apply();
    return img;
  }

  /** Forced hour for testing/screenshots; otherwise the real Darwin clock. */
  refresh(hourOverride?: number) {
    const hour = hourOverride ?? localClock().hourFloat;
    const l = lightAt(hour);
    this.overlay.setFillStyle(l.color, l.alpha);
    this.night = l.night;
    this.apply();
  }

  private apply() {
    for (const img of this.lights) img.setAlpha(this.night * 0.85);
    this.onChange?.(this.night);
  }

  destroy() {
    this.timer.remove();
    this.scene.scale.off("resize", this.resize, this);
  }
}
