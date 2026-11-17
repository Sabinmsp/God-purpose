import * as Phaser from "phaser";
import { showEmote } from "../packSprites";

export interface CritterSpec {
  id: string;
  /** Sprite sheet key (two frames, facing right). */
  tex: string;
  name: string;
  x: number;
  y: number;
  /** How far it strays from its spot. */
  roam: number;
  speed: number;
  /** Can be petted (E / action button). */
  pet?: boolean;
  /** Follows the player for a while after being petted. */
  loyal?: boolean;
  /** Runs from a player who gets close. */
  skittish?: boolean;
  /** Moves in hops (frame 1 in the air, frame 0 sitting). */
  hops?: boolean;
}

const FOLLOW_MS = 40_000;

/**
 * A village animal from the asset pack. It wanders near its spot, never blocks
 * the player (no collision with them), and reacts to them: chickens and frogs
 * scatter, the cat and dog can be petted, and the dog tags along afterwards.
 */
export class Critter {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private target?: { x: number; y: number };
  private wait = 800 + Math.random() * 2500;
  private fleeMs = 0;
  private followMs = 0;
  private emoteCooldown = 0;
  private napping = false;

  constructor(
    private scene: Phaser.Scene,
    readonly spec: CritterSpec,
  ) {
    this.shadow = scene.add.image(spec.x, spec.y, "shadow").setOrigin(0.5, 0.7).setAlpha(0.6).setScale(0.7);
    this.sprite = scene.physics.add.sprite(spec.x, spec.y, spec.tex, 0).setOrigin(0.5, 1);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setSize(8, 5).setOffset((this.sprite.width - 8) / 2, this.sprite.height - 5);
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  get following() {
    return this.followMs > 0;
  }

  /** The player pets it. Returns false if it can't be petted. */
  pet(): boolean {
    if (!this.spec.pet) return false;
    this.napping = false;
    this.target = undefined;
    this.wait = 1600;
    showEmote(this.scene, this.sprite, "heart", this.sprite.height + 4);
    this.scene.tweens.add({ targets: this.sprite, scaleY: 0.82, duration: 90, yoyo: true, repeat: 1 });
    if (this.spec.loyal) this.followMs = FOLLOW_MS;
    return true;
  }

  private stop() {
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.sprite.anims.stop();
    this.sprite.setFrame(0);
  }

  private moveTo(dx: number, dy: number, speed: number) {
    const dist = Math.hypot(dx, dy) || 1;
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity((dx / dist) * speed, (dy / dist) * speed);
    if (Math.abs(dx) > 0.5) this.sprite.setFlipX(dx < 0);
    if (this.spec.hops) {
      this.sprite.anims.stop();
      this.sprite.setFrame(1);
    } else {
      this.sprite.play(`${this.spec.tex}:walk`, true);
    }
  }

  update(dt: number, player: { x: number; y: number }) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const px = player.x - this.x;
    const py = player.y - this.y;
    const playerDist = Math.hypot(px, py);
    this.emoteCooldown -= dt;
    // Just north of the player, their body covers it.
    const hidden = py > 0 && py < 30 && Math.abs(px) < 13;

    if (this.spec.skittish && playerDist < 26 && this.fleeMs <= 0) {
      this.fleeMs = 700;
      this.target = undefined;
      if (this.emoteCooldown <= 0) {
        showEmote(this.scene, this.sprite, "alert", this.sprite.height + 4, 600);
        this.emoteCooldown = 2500;
      }
    }

    if (this.fleeMs > 0) {
      this.fleeMs -= dt;
      // Run away from the player, but not past the edge of its patch.
      const home = Math.hypot(this.spec.x - this.x, this.spec.y - this.y);
      if (home > this.spec.roam * 1.6) this.moveTo(this.spec.x - this.x, this.spec.y - this.y, this.spec.speed * 2.4);
      else this.moveTo(-px, -py, this.spec.speed * 2.4);
      if (this.fleeMs <= 0) {
        this.stop();
        this.wait = 900 + Math.random() * 1500;
      }
    } else if (this.spec.pet && (playerDist < 13 || hidden)) {
      // Steps out from under the player's feet, or from behind them, so it can be seen (and petted).
      if (hidden) this.moveTo(px > 0 ? -1 : 1, 0.5, 40);
      else this.moveTo(px === 0 && py === 0 ? 1 : -px, -py, 40);
      this.target = undefined;
    } else if (this.followMs > 0) {
      this.followMs -= dt;
      if (playerDist > 150) this.followMs = 0;
      else if (playerDist > 26) this.moveTo(px, py, playerDist > 60 ? 150 : 70);
      else this.stop();
      if (this.followMs <= 0) {
        this.stop();
        this.wait = 600;
      }
    } else if (playerDist < 22 && this.spec.pet) {
      // Stays put next to the player so it can be petted.
      this.stop();
      this.target = undefined;
    } else if (!this.target) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.napping = false;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.spec.roam;
        this.target = { x: this.spec.x + Math.cos(a) * d, y: this.spec.y + Math.sin(a) * d };
      } else if (this.spec.pet && !this.spec.loyal && !this.napping && this.wait > 5000) {
        // A long rest is a nap.
        this.napping = true;
        showEmote(this.scene, this.sprite, "sleep", this.sprite.height + 4, this.wait - 600);
      }
    } else {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      if (Math.hypot(dx, dy) < 3 || !body.blocked.none) {
        this.stop();
        this.target = undefined;
        this.wait = this.spec.hops ? 600 + Math.random() * 1800 : 1500 + Math.random() * (this.spec.pet && !this.spec.loyal ? 7000 : 3500);
      } else {
        this.moveTo(dx, dy, this.spec.speed);
      }
    }

    this.sprite.setDepth(this.sprite.y);
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 1).setDepth(this.sprite.y - 1);
  }
}
