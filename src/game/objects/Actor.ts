import * as Phaser from "phaser";
import { CLASSIC_METRICS, PIXELLAB_KEY, pixelLabMetrics } from "../pixellab";

export type Facing = "up" | "down" | "left" | "right";
export type Activity = "exercise" | "read" | "meditate" | "work" | "sleep" | "celebrate" | "levelup";

/** First idle frame of a character, whether it lives on one sheet or in loose frames. */
function firstFrame(scene: Phaser.Scene, key: string) {
  const f = scene.anims.get(`${key}:idle-down`)?.frames[0];
  return f ? { key: f.textureKey, frame: f.textureFrame } : { key, frame: "idle-down-0" };
}

const metricsFor = (key: string) => (key === PIXELLAB_KEY ? (pixelLabMetrics() ?? CLASSIC_METRICS) : CLASSIC_METRICS);

/** A walking pixel character (player or NPC) with shadow and depth sorting. */
export class Actor {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  facing: Facing = "down";
  activity: Activity | null = null;
  /** Art used for activities the main art has no clip for (e.g. PixelLab → procedural). */
  fallbackKey?: string;
  private activityKey?: string;
  private activityTimer?: Phaser.Time.TimerEvent;

  constructor(
    protected scene: Phaser.Scene,
    public textureKey: string,
    x: number,
    y: number,
  ) {
    this.shadow = scene.add.image(x, y, "shadow").setOrigin(0.5, 0.7).setAlpha(0.8);
    const first = firstFrame(scene, textureKey);
    this.sprite = scene.physics.add.sprite(x, y, first.key, first.frame);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.applyMetrics(textureKey);
    this.play("idle-down");
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  /** Puts the sprite's origin and collision box on the character's feet. */
  private applyMetrics(key: string) {
    const m = metricsFor(key);
    this.sprite.setOrigin(0.5, (m.footY + 1) / m.h);
    this.sprite.body!.setSize(10, 6).setOffset((m.w - 10) / 2, m.footY - 5);
  }

  play(anim: string, ignoreIfPlaying = true, key = this.textureKey) {
    const animKey = `${key}:${anim}`;
    if (this.scene.anims.exists(animKey)) this.sprite.play(animKey, ignoreIfPlaying);
  }

  setTextureKey(key: string) {
    this.textureKey = key;
    const first = firstFrame(this.scene, key);
    this.sprite.setTexture(first.key, first.frame);
    if (!this.activityKey) this.applyMetrics(key);
    this.refreshAnim(true);
  }

  /** Picks the right walk/idle clip for the current facing. */
  animateMove(moving: boolean, running = false) {
    if (this.activity && !moving) return;
    if (moving && this.activity) this.stopActivity();
    const clip = moving ? "walk" : "idle";
    const ownLeft = this.facing === "left" && this.scene.anims.exists(`${this.textureKey}:${clip}-left`);
    const mirror = this.facing === "left" && !ownLeft;
    this.sprite.setFlipX(mirror);
    this.play(`${clip}-${mirror ? "right" : this.facing}`);
    this.sprite.anims.timeScale = running ? 1.6 : 1;
  }

  refreshAnim(force = false) {
    if (this.activity) this.play(this.activity, !force, this.activityKey ?? this.textureKey);
    else this.animateMove(false);
  }

  doActivity(activity: Activity, durationMs = 2400) {
    this.activity = activity;
    const own = this.scene.anims.exists(`${this.textureKey}:${activity}`);
    this.activityKey = own ? undefined : this.fallbackKey;
    if (this.activityKey) this.applyMetrics(this.activityKey);
    this.sprite.setFlipX(false);
    this.sprite.anims.timeScale = 1;
    this.play(activity, false, this.activityKey ?? this.textureKey);
    this.activityTimer?.remove();
    if (durationMs > 0) this.activityTimer = this.scene.time.delayedCall(durationMs, () => this.stopActivity());
  }

  stopActivity() {
    this.activityTimer?.remove();
    this.activity = null;
    if (this.activityKey) {
      this.activityKey = undefined;
      this.applyMetrics(this.textureKey);
    }
    this.animateMove(false);
  }

  syncShadow() {
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 2);
    this.sprite.setDepth(this.sprite.y);
    this.shadow.setDepth(this.sprite.y - 1);
    this.shadow.setVisible(this.activity !== "sleep");
  }

  destroy() {
    this.activityTimer?.remove();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

export function facingFrom(dx: number, dy: number, current: Facing): Facing {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return current;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
}
