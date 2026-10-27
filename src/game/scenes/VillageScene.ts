import * as Phaser from "phaser";
import { carStage } from "@/lib/shared/money";
import type { GameState } from "@/lib/shared/types";
import { T, TILE } from "../art/tiles";
import { bridge } from "../bridge";
import type { Facing } from "../objects/Actor";
import { Npc } from "../objects/Npc";
import { SPOTS, buildVillage } from "../world/village";
import { WorldScene } from "./WorldScene";

const LIGHT_TEX = { warm: "glow-warm", cool: "glow-cool", purple: "glow-purple", pink: "glow-pink" } as const;

export class VillageScene extends WorldScene {
  readonly sceneName = "village" as const;
  private buildings: Record<string, Phaser.GameObjects.Image> = {};
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private from?: string;
  private petals?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super("village");
  }

  init(data: { from?: string }) {
    this.from = data?.from;
  }

  protected spawnPoint(): { x: number; y: number; facing: Facing } {
    const pos = bridge.state?.player.position;
    if (this.from === "home") return { x: SPOTS.spawn.x, y: SPOTS.spawn.y + 4, facing: "down" };
    if (pos && pos.scene === "village" && pos.x != null && pos.y != null) {
      return { x: pos.x, y: pos.y, facing: (pos.facing as Facing) ?? "down" };
    }
    return { x: SPOTS.spawn.x, y: SPOTS.spawn.y, facing: "down" };
  }

  protected buildWorld() {
    const v = buildVillage();
    const map = this.make.tilemap({ data: v.ground, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    this.layer = map.createLayer(0, tiles, 0, 0)!.setDepth(-10);

    // Animated water: swap tiles every half second.
    let phase = false;
    this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        phase = !phase;
        this.layer.replaceByIndex(phase ? T.WATER_A : T.WATER_B, phase ? T.WATER_B : T.WATER_A);
        this.layer.replaceByIndex(phase ? T.SHORE_A : T.SHORE_B, phase ? T.SHORE_B : T.SHORE_A);
      },
    });

    for (const p of v.props) {
      const obj = p.anim ? this.add.sprite(p.x, p.y, p.anim).play(p.anim) : this.add.image(p.x, p.y, p.key);
      obj.setOrigin(0.5, 1).setDepth(p.flat ? -5 : p.y);
    }
    for (const c of v.colliders) this.addSolid(c.x, c.y, c.w, c.h);

    const place = (key: string, spot: { x: number; y: number }) => {
      this.buildings[key] = this.add.image(spot.x, spot.y, key).setOrigin(0.5, 1).setDepth(spot.y);
    };
    place("home", SPOTS.home);
    place("temple", SPOTS.temple);
    place("arena", SPOTS.arena);
    place("sanctuary", SPOTS.sanctuary);
    place("bank", SPOTS.bank);
    this.buildings.vault = this.add.image(SPOTS.vault.x, SPOTS.vault.y, "vault-0").setOrigin(0.5, 1).setDepth(SPOTS.vault.y);
    this.buildings.garage = this.add.image(SPOTS.garage.x, SPOTS.garage.y, "garage-0").setOrigin(0.5, 1).setDepth(SPOTS.garage.y);

    this.interactables = v.interact;
    for (const spawn of v.npcs) this.npcs.push(new Npc(this, spawn));

    this.ambient();
    // Lights are added after DayNight exists (see create override).
    this.pendingLights = v.lights;
    return { width: v.width, height: v.height };
  }

  private pendingLights: { x: number; y: number; size: number; color: keyof typeof LIGHT_TEX }[] = [];

  create() {
    super.create();
    for (const l of this.pendingLights) this.dayNight.addLight(l.x, l.y, l.size, LIGHT_TEX[l.color]);
    // Warm house and temple windows at night.
    for (const [x, y] of [[490, 200], [530, 200], [240, 200], [176, 200], [208, 520], [232, 520]]) this.dayNight.addLight(x, y, 36, "glow-warm");
    this.cameras.main.fadeIn(250, 11, 16, 48);
  }

  private ambient() {
    // Chimney smoke
    this.add
      .particles(SPOTS.home.x + 20, SPOTS.home.y - 70, "fx-dot", {
        speedY: { min: -14, max: -8 },
        speedX: { min: -3, max: 6 },
        lifespan: 2600,
        frequency: 450,
        scale: { start: 1.5, end: 3 },
        alpha: { start: 0.45, end: 0 },
        tint: 0xd9d4cc,
      })
      .setDepth(5000);
    // Butterflies over the meadow and around the plaza
    for (const [x, y, tint] of [[180, 320, 0xf7a8c4], [600, 470, 0xfff1b0], [300, 700, 0xb49be8], [760, 360, 0x8fd3ff]] as const) {
      const b = this.add.image(x, y, "fx-petal").setTint(tint).setDepth(9000);
      this.tweens.add({ targets: b, x: x + Phaser.Math.Between(-40, 40), y: y + Phaser.Math.Between(-24, 24), duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: b, scaleX: 0.3, duration: 140, yoyo: true, repeat: -1 });
    }
    // Falling blossom around the sanctuary
    this.petals = this.add
      .particles(0, 0, "fx-petal", {
        x: { min: 60, max: 360 },
        y: 420,
        speedY: { min: 10, max: 22 },
        speedX: { min: -8, max: 12 },
        lifespan: 9000,
        frequency: 700,
        rotate: { min: 0, max: 360 },
        tint: [0xf7a8c4, 0xffd6e6],
        alpha: { start: 0.9, end: 0.2 },
      })
      .setDepth(9001);
  }

  protected onState(state: GameState) {
    const has = (key: string) => state.unlocks.some((u) => u.key === key) && unlockedNow(state, key);
    this.buildings.temple?.setTexture(has("master_temple") ? "temple-master" : "temple");
    this.buildings.arena?.setTexture(has("champion_arena") ? "arena-champion" : "arena");
    this.buildings.sanctuary?.setTexture(has("sacred_garden") ? "sanctuary-sacred" : "sanctuary");
    this.buildings.bank?.setTexture(has("grand_treasury") ? "bank-grand" : "bank");
    if (this.petals) this.petals.frequency = has("sacred_garden") ? 250 : 700;

    const tuition = state.savings.goals.find((g) => g.key === "tuition");
    const car = state.savings.goals.find((g) => g.key === "car");
    const vaultLevel = tuition ? Math.min(10, Math.floor(tuition.progress * 10 + (tuition.balanceCents > 0 ? 0.999 : 0))) : 0;
    this.buildings.vault?.setTexture(`vault-${vaultLevel}`);
    this.buildings.garage?.setTexture(`garage-${car ? carStage(car.progress) : 0}`);
  }
}

/** Cosmetic world upgrades follow the current level (history rows are permanent). */
function unlockedNow(state: GameState, key: string) {
  const req: Record<string, ["mental" | "physical" | "spiritual" | "financial", number]> = {
    master_temple: ["mental", 20],
    champion_arena: ["physical", 20],
    sacred_garden: ["spiritual", 20],
    grand_treasury: ["financial", 20],
  };
  const r = req[key];
  return r ? state.stats.pillars[r[0]].level >= r[1] : true;
}
