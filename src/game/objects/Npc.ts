import * as Phaser from "phaser";
import type { NpcSpawn } from "../world/village";
import { Actor, facingFrom } from "./Actor";

/** Villager that idles, wanders a little around home, and sometimes practises its craft. */
export class Npc extends Actor {
  private target?: { x: number; y: number };
  private wait = 1500 + Math.random() * 3000;

  constructor(
    scene: Phaser.Scene,
    readonly spawn: NpcSpawn,
  ) {
    super(scene, `npc-${spawn.look}`, spawn.x, spawn.y);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    if (spawn.activity) this.doActivity(spawn.activity, 0);
  }

  faceToward(x: number, y: number) {
    if (this.activity) return;
    this.facing = facingFrom(x - this.x, y - this.y, this.facing);
    this.animateMove(false);
  }

  update(dt: number, nearPlayer: boolean) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (nearPlayer || this.spawn.wander === 0) {
      body.setVelocity(0, 0);
      if (!this.target) this.animateMove(false);
      this.target = undefined;
      this.syncShadow();
      return;
    }
    if (!this.target) {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (this.activity) this.stopActivity();
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.spawn.wander;
        this.target = { x: this.spawn.x + Math.cos(a) * d, y: this.spawn.y + Math.sin(a) * d };
      }
    } else {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3 || body.blocked.none === false) {
        body.setVelocity(0, 0);
        this.target = undefined;
        this.wait = 2500 + Math.random() * 4000;
        if (this.spawn.activity && Math.random() < 0.5) this.doActivity(this.spawn.activity, 0);
        else this.animateMove(false);
      } else {
        body.setVelocity((dx / dist) * 34, (dy / dist) * 34);
        this.facing = facingFrom(dx, dy, this.facing);
        this.animateMove(true);
      }
    }
    this.syncShadow();
  }
}
