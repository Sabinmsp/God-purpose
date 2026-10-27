import * as Phaser from "phaser";

export type Facing = "up" | "down" | "left" | "right";
export type Activity = "exercise" | "read" | "meditate" | "work" | "sleep" | "celebrate" | "levelup";

/** A walking pixel character (player or NPC) with shadow and depth sorting. */
export class Actor {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  facing: Facing = "down";
  activity: Activity | null = null;
  private activityTimer?: Phaser.Time.TimerEvent;

  constructor(
    protected scene: Phaser.Scene,
    public textureKey: string,
    x: number,
    y: number,
  ) {
    this.shadow = scene.add.image(x, y, "shadow").setOrigin(0.5, 0.7).setAlpha(0.8);
    this.sprite = scene.physics.add.sprite(x, y, textureKey, "idle-down-0").setOrigin(0.5, 1);
    this.sprite.body!.setSize(10, 6).setOffset(11, 25);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.play("idle-down");
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  play(anim: string, ignoreIfPlaying = true) {
    const key = `${this.textureKey}:${anim}`;
    if (this.scene.anims.exists(key)) this.sprite.play(key, ignoreIfPlaying);
  }

  setTextureKey(key: string) {
    this.textureKey = key;
    this.sprite.setTexture(key, "idle-down-0");
    this.refreshAnim(true);
  }

  /** Picks the right walk/idle clip for the current facing. */
  animateMove(moving: boolean, running = false) {
    if (this.activity && !moving) return;
    if (moving && this.activity) this.stopActivity();
    const dir = this.facing === "left" ? "right" : this.facing;
    this.sprite.setFlipX(this.facing === "left");
    this.play(`${moving ? "walk" : "idle"}-${dir}`);
    this.sprite.anims.timeScale = running ? 1.6 : 1;
  }

  refreshAnim(force = false) {
    if (this.activity) this.play(this.activity, !force);
    else this.animateMove(false);
  }

  doActivity(activity: Activity, durationMs = 2400) {
    this.activity = activity;
    this.sprite.setFlipX(false);
    this.sprite.anims.timeScale = 1;
    this.play(activity, false);
    this.activityTimer?.remove();
    if (durationMs > 0) this.activityTimer = this.scene.time.delayedCall(durationMs, () => this.stopActivity());
  }

  stopActivity() {
    this.activityTimer?.remove();
    this.activity = null;
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
