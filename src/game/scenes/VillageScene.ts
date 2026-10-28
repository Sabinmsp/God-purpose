import * as Phaser from "phaser";
import { STAGE_NAMES } from "@/lib/shared/campaign";
import { carStage } from "@/lib/shared/money";
import { PILLARS, type Pillar } from "@/lib/shared/pillars";
import type { GameState } from "@/lib/shared/types";
import { buildingKey, decorationKey } from "../art/registry";
import { T, TILE } from "../art/tiles";
import { bridge } from "../bridge";
import type { Facing } from "../objects/Actor";
import { Npc } from "../objects/Npc";
import { burst, floatText, pillarColor } from "../systems/effects";
import { PILLAR_BUILDING, worldStages } from "../world/growth";
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

    this.buildings.home = this.add.image(SPOTS.home.x, SPOTS.home.y, "home").setOrigin(0.5, 1).setDepth(SPOTS.home.y);
    for (const p of PILLARS) {
      const spot = SPOTS[PILLAR_BUILDING[p]];
      this.buildings[p] = this.add.image(spot.x, spot.y, buildingKey(p, 0)).setOrigin(0.5, 1).setDepth(spot.y);
    }
    this.decorSlots = v.decorSlots as Record<Pillar, { x: number; y: number }[]>;
    this.lanternSlots = v.lanternSlots;
    this.decorations = { mental: [], physical: [], spiritual: [], financial: [] };
    this.lanterns = [];
    this.stageAuras = {};
    this.shownStages = {};
    this.live = false;
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

  // ── Real-life growth ──────────────────────────────────────────────────
  private decorSlots!: Record<Pillar, { x: number; y: number }[]>;
  private lanternSlots: { x: number; y: number }[] = [];
  private decorations!: Record<Pillar, Phaser.GameObjects.Image[]>;
  private lanterns: { img: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image }[] = [];
  private stageAuras: Partial<Record<Pillar, Phaser.GameObjects.Particles.ParticleEmitter>> = {};
  private shownStages: Partial<Record<Pillar, number>> = {};
  /** False while applying the first state: growth that already existed appears without fanfare. */
  private live = false;

  /** Pops a new world object into place so the change is noticeable. */
  private grow(obj: Phaser.GameObjects.Image) {
    if (!this.live || this.player?.reducedMotion) return;
    obj.setScale(0);
    this.tweens.add({ targets: obj, scale: 1, duration: 520, ease: "Back.easeOut" });
    burst(this, obj.x, obj.y - 6, "fx-spark", [0xfff1b0, 0xffffff], 10);
  }

  private syncGrowth(state: GameState) {
    const progress = state.campaign.progress;
    const stages = worldStages(state);

    for (const p of PILLARS) {
      const building = this.buildings[p];
      const stage = stages[p];
      if (this.shownStages[p] !== stage) {
        const upgraded = this.live && this.shownStages[p] !== undefined && stage > this.shownStages[p]!;
        building.setTexture(buildingKey(p, stage));
        this.shownStages[p] = stage;
        if (upgraded) this.celebrateBuilding(p, building);
        this.stageAuras[p]?.destroy();
        delete this.stageAuras[p];
        if (stage >= 4) {
          this.stageAuras[p] = this.add
            .particles(building.x, building.y - building.height * 0.55, stage >= 5 ? "fx-spark" : "fx-dot", {
              emitZone: { type: "random", source: new Phaser.Geom.Rectangle(-50, -40, 100, 70) } as never,
              speedY: { min: -14, max: -4 },
              lifespan: 1800,
              frequency: stage >= 5 ? 160 : 360,
              scale: { start: 1, end: 0 },
              alpha: { start: 0.9, end: 0 },
              tint: [pillarColor(p), 0xfff1b0],
              blendMode: Phaser.BlendModes.ADD,
            })
            .setDepth(building.depth + 1);
        }
      }

      // One decoration per real day won in this pillar.
      const want = Math.min(progress.pillarDays[p], this.decorSlots[p].length);
      const list = this.decorations[p];
      while (list.length < want) {
        const slot = this.decorSlots[p][list.length];
        const img = this.add.image(slot.x, slot.y, decorationKey(p, list.length)).setOrigin(0.5, 1).setDepth(slot.y);
        list.push(img);
        this.grow(img);
      }
      while (list.length > want) list.pop()!.destroy();
    }

    // One victory lantern per complete Four Wins day.
    const lanternsWanted = Math.min(progress.fourWinsDays, this.lanternSlots.length);
    while (this.lanterns.length < lanternsWanted) {
      const slot = this.lanternSlots[this.lanterns.length];
      const img = this.add.image(slot.x, slot.y, "victory-lantern").setOrigin(0.5, 1).setDepth(slot.y);
      const light = this.dayNight.addLight(slot.x, slot.y - 14, 46, "glow-gold");
      this.lanterns.push({ img, light });
      this.grow(img);
    }
    while (this.lanterns.length > lanternsWanted) {
      const l = this.lanterns.pop()!;
      l.img.destroy();
      this.dayNight.removeLight(l.light);
    }

    if (this.petals) this.petals.frequency = stages.spiritual >= 5 ? 200 : stages.spiritual >= 3 ? 380 : 700;

    bridge.emit("world", {
      decorations: PILLARS.reduce((n, p) => n + this.decorations[p].length, 0),
      lanterns: this.lanterns.length,
      stages,
    });
    this.live = true;
  }

  private celebrateBuilding(p: Pillar, building: Phaser.GameObjects.Image) {
    const reduced = this.player?.reducedMotion;
    const y = building.y - building.height / 2;
    building.setTintFill(0xffffff);
    this.time.delayedCall(140, () => building.clearTint());
    burst(this, building.x, y, "fx-spark", [pillarColor(p), 0xfff1b0, 0xffffff], 40, reduced);
    floatText(this, building.x, building.y - building.height - 4, `${STAGE_NAMES[p][this.shownStages[p] ?? 0]}!`, pillarColor(p));
  }

  protected onState(state: GameState) {
    this.syncGrowth(state);

    const tuition = state.savings.goals.find((g) => g.key === "tuition");
    const car = state.savings.goals.find((g) => g.key === "car");
    const vaultLevel = tuition ? Math.min(10, Math.floor(tuition.progress * 10 + (tuition.balanceCents > 0 ? 0.999 : 0))) : 0;
    this.buildings.vault?.setTexture(`vault-${vaultLevel}`);
    this.buildings.garage?.setTexture(`garage-${car ? carStage(car.progress) : 0}`);
  }
}
