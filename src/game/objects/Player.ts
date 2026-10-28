import * as Phaser from "phaser";
import type { GameState } from "@/lib/shared/types";
import { playerLook } from "../art/character";
import { bridge, touchInput } from "../bridge";
import { PIXELLAB_KEY, hasPixelLab } from "../pixellab";
import { registerCharacter } from "../textures";
import { Actor, facingFrom, type Facing } from "./Actor";

const WALK = 72;
const RUN = 124;
let lookVersion = 0;
let lastLookSig = "";
let lastLookKey = "";

/**
 * The player's art: PixelLab sprites when installed and selected, otherwise
 * the procedural look (which also shows outfits, headwear and physique).
 */
export function playerArt(scene: Phaser.Scene, state: GameState | null) {
  const classic = ensurePlayerTexture(scene, state);
  const usePixelLab = hasPixelLab(scene) && (state?.player.settings.characterArt ?? "pixellab") === "pixellab";
  return { main: usePixelLab ? PIXELLAB_KEY : classic, classic };
}

/** Builds (or reuses) the procedural sprite sheet for the current cosmetics. */
export function ensurePlayerTexture(scene: Phaser.Scene, state: GameState | null): string {
  const equipped = state?.player.equipped ?? {};
  const tier = state?.body.physiqueTier ?? 0;
  const sig = JSON.stringify([equipped.outfit, equipped.hat, tier]);
  if (sig === lastLookSig && lastLookKey && scene.textures.exists(lastLookKey)) return lastLookKey;
  const key = `player-${++lookVersion}`;
  registerCharacter(scene, key, playerLook(equipped, tier));
  lastLookSig = sig;
  lastLookKey = key;
  return key;
}

const AURA: Record<string, { tex: string; tint: number[]; mode: "orbit" | "rise" | "drift" }> = {
  knowledge_aura: { tex: "fx-glyph", tint: [0xb49be8, 0x8fd3ff], mode: "orbit" },
  power_aura: { tex: "fx-dot", tint: [0xff9a4a, 0xffd36a], mode: "rise" },
  serenity_aura: { tex: "fx-petal", tint: [0xf7a8c4, 0xffffff], mode: "drift" },
  golden_aura: { tex: "fx-coin", tint: [0xffffff], mode: "orbit" },
};

const COMPANION: Record<string, string> = { owl_companion: "owl", spirit_fox: "fox", coin_sprite: "coin-sprite" };

export class Player extends Actor {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private companion?: Phaser.GameObjects.Sprite;
  private aura?: Phaser.GameObjects.Particles.ParticleEmitter;
  private auraKey?: string;
  private fireflies?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastSaved = { x: 0, y: 0, facing: "down" };
  private saveTimer = 0;
  reducedMotion = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: Facing,
    private sceneName: "village" | "home",
  ) {
    const art = playerArt(scene, bridge.state);
    super(scene, art.main, x, y);
    this.fallbackKey = art.classic;
    this.facing = facing;
    this.animateMove(false);
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.lastSaved = { x: Math.round(x), y: Math.round(y), facing };
  }

  /** Applies cosmetics from the latest server state. */
  applyState(state: GameState) {
    const art = playerArt(this.scene, state);
    this.fallbackKey = art.classic;
    if (art.main !== this.textureKey) this.setTextureKey(art.main);
    this.reducedMotion = state.player.settings.reducedMotion;

    const aura = state.player.equipped.aura;
    if (aura !== this.auraKey) {
      this.aura?.destroy();
      this.aura = undefined;
      this.auraKey = aura;
      const cfg = aura ? AURA[aura] : undefined;
      if (cfg) {
        this.aura = this.scene.add.particles(0, 0, cfg.tex, {
          follow: this.sprite,
          followOffset: { x: 0, y: -14 },
          lifespan: cfg.mode === "orbit" ? 1400 : 1200,
          frequency: this.reducedMotion ? 400 : 160,
          speedY: cfg.mode === "rise" ? { min: -28, max: -12 } : { min: -6, max: 6 },
          speedX: cfg.mode === "drift" ? { min: -14, max: 14 } : { min: -8, max: 8 },
          emitZone: { type: "edge", source: new Phaser.Geom.Circle(0, 0, 13), quantity: 12 } as never,
          scale: { start: 1, end: 0.4 },
          alpha: { start: 0.9, end: 0 },
          tint: cfg.tint,
          blendMode: Phaser.BlendModes.ADD,
        });
        this.aura.setDepth(99999);
      }
    }

    const companion = state.player.equipped.companion ? COMPANION[state.player.equipped.companion] : undefined;
    if (companion && this.companion?.texture.key !== companion) {
      this.companion?.destroy();
      this.companion = this.scene.add.sprite(this.x - 14, this.y - 18, companion).play(companion);
    } else if (!companion && this.companion) {
      this.companion.destroy();
      this.companion = undefined;
    }

    const wantFireflies = state.unlocks.some((u) => u.key === "fireflies");
    if (wantFireflies && !this.fireflies) {
      this.fireflies = this.scene.add.particles(0, 0, "fx-dot1", {
        follow: this.sprite,
        followOffset: { x: 0, y: -12 },
        lifespan: 2600,
        frequency: 500,
        speed: { min: 4, max: 10 },
        emitZone: { type: "random", source: new Phaser.Geom.Circle(0, 0, 26) } as never,
        alpha: { start: 1, end: 0 },
        tint: 0xe8ff9a,
        blendMode: Phaser.BlendModes.ADD,
      });
      this.fireflies.setDepth(99998);
    }
  }

  /** Fireflies only glow at night. */
  setNight(amount: number) {
    if (this.fireflies) this.fireflies.setAlpha(Math.min(1, amount * 1.6));
  }

  update(dt: number) {
    let dx = 0;
    let dy = 0;
    const typing = typeof document !== "undefined" && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (!bridge.blocked && !typing) {
      const k = this.keys;
      if (k.A.isDown || k.LEFT.isDown) dx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) dx += 1;
      if (k.W.isDown || k.UP.isDown) dy -= 1;
      if (k.S.isDown || k.DOWN.isDown) dy += 1;
      dx += touchInput.x;
      dy += touchInput.y;
    }
    const mag = Math.hypot(dx, dy);
    const moving = mag > 0.15;
    const running = moving && (this.keys.SHIFT.isDown || Math.hypot(touchInput.x, touchInput.y) > 0.92);
    const speed = running ? RUN : WALK;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (moving) {
      const n = Math.min(1, mag) / mag;
      body.setVelocity(dx * n * speed, dy * n * speed);
      this.facing = facingFrom(dx, dy, this.facing);
    } else {
      body.setVelocity(0, 0);
    }
    this.animateMove(moving, running);
    this.syncShadow();

    if (this.companion) {
      const tx = this.x + (this.facing === "left" ? 16 : -16);
      const ty = this.y - 20;
      this.companion.x += (tx - this.companion.x) * Math.min(1, dt * 0.004);
      this.companion.y += (ty - this.companion.y) * Math.min(1, dt * 0.004);
      this.companion.setDepth(this.y + 1);
      this.companion.setFlipX(this.companion.x > this.x);
    }

    // Persist where the character stands (never affects progress).
    this.saveTimer += dt;
    if (this.saveTimer > 4000) {
      this.saveTimer = 0;
      this.savePosition();
    }
  }

  savePosition() {
    const pos = { x: Math.round(this.x), y: Math.round(this.y), facing: this.facing };
    if (pos.x === this.lastSaved.x && pos.y === this.lastSaved.y && pos.facing === this.lastSaved.facing) return;
    this.lastSaved = pos;
    bridge.emit("position", { scene: this.sceneName, ...pos });
  }

  destroy() {
    this.aura?.destroy();
    this.fireflies?.destroy();
    this.companion?.destroy();
    super.destroy();
  }
}
