import * as Phaser from "phaser";
import { STAGE_NAMES } from "@/lib/shared/campaign";
import { carStage } from "@/lib/shared/money";
import { PILLARS, PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import type { GameState } from "@/lib/shared/types";
import { bookshelf } from "../art/furniture";
import { addPixels } from "../textures";
import { STAGE_TOP } from "../art/evolution";
import { buildingKey, decorationKey } from "../art/registry";
import { T, TILE } from "../art/tiles";
import { play } from "../audio";
import { bridge } from "../bridge";
import type { Facing } from "../objects/Actor";
import { Critter, type CritterSpec } from "../objects/Critter";
import { Npc } from "../objects/Npc";
import { hasPackSprite, showEmote } from "../packSprites";
import { burst, coinShower, floatText, pillarColor } from "../systems/effects";
import { CHEST_SPOT, chestLines, chestOpened, chestStatus, markChestOpened } from "../world/chest";
import { PILLAR_BUILDING, worldStages } from "../world/growth";
import { SPOTS, buildVillage, type InteractAction, type Interactable } from "../world/village";
import { WorldScene } from "./WorldScene";

/** Village animals (sprites from the asset pack). They live on open grass, away from doors. */
const CRITTERS: CritterSpec[] = [
  { id: "cat", tex: "na-cat", name: "Miso the cat", x: 704, y: 206, roam: 22, speed: 22, pet: true },
  { id: "dog", tex: "na-dog", name: "Kuma the dog", x: 540, y: 410, roam: 48, speed: 30, pet: true, loyal: true },
  { id: "hen-a", tex: "na-chicken-white", name: "Hen", x: 693, y: 247, roam: 23, speed: 16, skittish: true },
  { id: "hen-b", tex: "na-chicken-brown", name: "Hen", x: 652, y: 648, roam: 30, speed: 16, skittish: true },
  { id: "hen-c", tex: "na-chicken-black", name: "Hen", x: 620, y: 652, roam: 30, speed: 16, skittish: true },
  { id: "frog", tex: "na-frog", name: "Frog", x: 152, y: 664, roam: 9, speed: 34, skittish: true, hops: true },
];

/** Open water of the pond, in world pixels (clear of the shore and the waterfall). */
const POND = { x0: 62, x1: 136, y0: 630, y1: 682 };

const LIGHT_TEX = { warm: "glow-warm", cool: "glow-cool", purple: "glow-purple", pink: "glow-pink" } as const;

export class VillageScene extends WorldScene {
  readonly sceneName = "village" as const;
  private buildings: Record<string, Phaser.GameObjects.Image> = {};
  private shelf!: Phaser.GameObjects.Image;
  private shelfCount = -1;
  private pennant!: Phaser.GameObjects.Image;
  private reflectionLantern!: Phaser.GameObjects.Image;
  private reflectionLight?: Phaser.GameObjects.Image;
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

    this.shelfCount = -1;
    this.reflectionLight = undefined;
    for (const p of v.props) {
      const obj = p.anim ? this.add.sprite(p.x, p.y, p.anim).play(p.anim) : this.add.image(p.x, p.y, p.key);
      obj.setOrigin(0.5, 1).setDepth(p.flat ? -5 : p.y);
      if (p.key === "empty-shelf") this.shelf = obj;
      if (p.key === "reeds" && !bridge.state?.player.settings.reducedMotion) {
        this.tweens.add({ targets: obj, angle: 5, duration: 1100 + p.x, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      if (p.key === "ai-bot") this.setupAiCompanion(obj);
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
    this.plates = {};
    const roof = (img: Phaser.GameObjects.Image, headroom: number) => img.y - (img.height - headroom) * 0.66;
    this.makePlate(SPOTS.home.x, roof(this.buildings.home, 0), bridge.state?.player.name ?? "Home", "Home", 0xf2c14e);
    for (const p of PILLARS) {
      const b = this.buildings[p];
      this.plates[p] = this.makePlate(b.x, roof(b, STAGE_TOP), STAGE_NAMES[p][0], PILLAR_META[p].name, pillarColor(p));
    }
    this.makePlate(SPOTS.ai.x - 14, SPOTS.ai.y - 66, "Four Wins AI", "Your guide", 0x5ff0e0);
    this.buildings.vault = this.add.image(SPOTS.vault.x, SPOTS.vault.y, "vault-0").setOrigin(0.5, 1).setDepth(SPOTS.vault.y);
    this.buildings.garage = this.add.image(SPOTS.garage.x, SPOTS.garage.y, "garage-0").setOrigin(0.5, 1).setDepth(SPOTS.garage.y);

    const flagX = SPOTS.arena.x + 34;
    const flagBase = SPOTS.arena.y - 4;
    this.add.rectangle(flagX, flagBase, 2, 52, 0x81572f).setOrigin(.5, 1).setDepth(flagBase + 1);
    this.pennant = this.add.image(flagX, flagBase - 25, "banner-red").setOrigin(.5, 1).setDepth(flagBase + 2).setVisible(false);
    this.reflectionLantern = this.add.image(254, 550, "victory-lantern").setOrigin(.5, 1).setDepth(550).setVisible(false);
    this.interactables = v.interact;
    for (const spawn of v.npcs) this.npcs.push(new Npc(this, spawn));
    this.addVillageLife();

    this.ambient();
    // Lights are added after DayNight exists (see create override).
    this.pendingLights = v.lights;
    return { width: v.width, height: v.height };
  }

  private critters: Critter[] = [];
  private chest?: Phaser.GameObjects.Sprite;
  private chestReady = false;

  /** Animals, pond life and the daily chest. Each piece is skipped if its sprite isn't installed. */
  private addVillageLife() {
    this.critters = [];
    for (const spec of CRITTERS) {
      if (!hasPackSprite(this, spec.tex)) continue;
      const c = new Critter(this, spec);
      this.physics.add.collider(c.sprite, this.solids);
      this.critters.push(c);
    }

    // Fish glide under the surface of the pond.
    ["na-fish-red", "na-fish-yellow", "na-fish-red"].forEach((tex, i) => {
      if (!hasPackSprite(this, tex)) return;
      const y = POND.y0 + 8 + i * 18;
      const fish = this.add.sprite(i % 2 ? POND.x1 : POND.x0, y, tex, 0).setDepth(-6).setAlpha(0.75).setFlipX(i % 2 === 1);
      this.tweens.add({
        targets: fish,
        x: i % 2 ? POND.x0 : POND.x1,
        duration: 5200 + i * 1400,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
        hold: 500,
        repeatDelay: 500,
        onYoyo: () => fish.toggleFlipX(),
        onRepeat: () => fish.toggleFlipX(),
      });
      this.tweens.add({ targets: fish, y: y + 4, duration: 1700 + i * 300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    });
    if (hasPackSprite(this, "na-ripple")) {
      this.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          const ripple = this.add.sprite(Phaser.Math.Between(POND.x0, POND.x1), Phaser.Math.Between(POND.y0, POND.y1), "na-ripple").setDepth(-7).setAlpha(0.8);
          ripple.play("na-ripple").once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => ripple.destroy());
        },
      });
    }

    this.chest = undefined;
    this.chestReady = false;
    if (hasPackSprite(this, "na-chest")) {
      this.chest = this.add.sprite(CHEST_SPOT.x, CHEST_SPOT.y, "na-chest", 0).setOrigin(0.5, 1).setDepth(CHEST_SPOT.y);
      this.addSolid(CHEST_SPOT.x, CHEST_SPOT.y - 4, 14, 8);
      this.interactables.push({ id: "chest", x: CHEST_SPOT.x, y: CHEST_SPOT.y + 4, r: 20, label: "Daily Chest", verb: "Open", action: { type: "chest" }, arrow: 26 });
      // A chest that can be opened asks for attention.
      this.time.addEvent({
        delay: 2600,
        loop: true,
        callback: () => {
          if (!this.chestReady || !this.chest) return;
          showEmote(this, this.chest, "star", 18, 900);
          this.tweens.add({ targets: this.chest, y: CHEST_SPOT.y - 2, duration: 110, yoyo: true, repeat: 1 });
        },
      });
    }
  }

  /** The chest is shut until today's four pillars are won, and stays open once opened that day. */
  private syncChest(state: GameState) {
    if (!this.chest) return;
    const c = chestStatus(state);
    const opened = c.unlocked && chestOpened(state.player.name, c.date);
    this.chest.setFrame(opened ? 1 : 0);
    this.chestReady = c.unlocked && !opened;
  }

  private openChest() {
    const state = bridge.state;
    if (!state || !this.chest) return;
    const c = chestStatus(state);
    const opened = chestOpened(state.player.name, c.date);
    if (c.unlocked && !opened) {
      markChestOpened(state.player.name, c.date);
      this.syncChest(state);
      const reduced = state.player.settings.reducedMotion;
      play("fanfare");
      coinShower(this, CHEST_SPOT.x, CHEST_SPOT.y, reduced);
      burst(this, CHEST_SPOT.x, CHEST_SPOT.y - 10, "fx-spark", [0xf2c14e, 0xfff1b0, 0xffffff], 22, reduced);
      floatText(this, CHEST_SPOT.x, CHEST_SPOT.y - 30, "Four Wins chest opened!", 0xf2c14e);
    } else {
      play(c.unlocked ? "click" : "error");
      if (!c.unlocked) this.tweens.add({ targets: this.chest, x: CHEST_SPOT.x + 1, duration: 45, yoyo: true, repeat: 3 });
    }
    bridge.emit("dialog", { speaker: "Daily Chest", lines: chestLines(c, opened) });
  }

  protected dynamicFocus(): Interactable | null {
    for (const c of this.critters) {
      if (!c.spec.pet || Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y) > 24) continue;
      return { id: `pet:${c.spec.id}`, x: c.x, y: c.y, r: 24, label: c.spec.name, verb: "Pet", action: { type: "pet", id: c.spec.id }, arrow: 26 };
    }
    return null;
  }

  protected runAction(action: InteractAction) {
    if (action.type === "shelf") {
      const count = bridge.state?.learningEntries ?? 0;
      bridge.emit("dialog", {
        speaker: "Learning shelf",
        lines: [count ? `Your collection holds ${count} learning ${count === 1 ? "note" : "notes"}.` : "The first space is yours. Write down something you learned today."],
        action: { label: "Visit Mind Temple", panel: "mental" },
      });
      return;
    }
    if (action.type === "chest") return this.openChest();
    if (action.type === "pet") {
      if (this.critters.find((c) => c.spec.id === action.id)?.pet()) play("pet");
      return;
    }
    super.runAction(action);
  }

  update(time: number, dt: number) {
    super.update(time, dt);
    for (const c of this.critters) c.update(dt, this.player);
  }

  private pendingLights: { x: number; y: number; size: number; color: keyof typeof LIGHT_TEX }[] = [];

  create() {
    super.create();
    for (const l of this.pendingLights) this.dayNight.addLight(l.x, l.y, l.size, LIGHT_TEX[l.color]);
    // Warm house and temple windows at night.
    for (const [x, y] of [[490, 200], [530, 200], [240, 200], [176, 200], [208, 520], [232, 520]]) this.dayNight.addLight(x, y, 36, "glow-warm");
    this.cameras.main.fadeIn(250, 11, 16, 48);
  }

  private plates: Partial<Record<Pillar, (title: string) => void>> = {};

  /**
   * Name sign floating over a place. It sits above the night overlay so it
   * stays readable after dark. Returns a setter for the title.
   */
  private makePlate(x: number, top: number, title: string, sub: string | null, accent: number) {
    const bg = this.add.graphics();
    const head = this.add.bitmapText(0, 4, "pixel", "").setOrigin(0.5, 0).setLetterSpacing(-1).setTint(0xfff1b0);
    const tail = sub ? this.add.bitmapText(0, 13, "pixel", sub.toUpperCase()).setOrigin(0.5, 0).setLetterSpacing(-1).setTint(accent) : null;
    const h = sub ? 26 : 17;
    const set = (text: string) => {
      head.setText(text.toUpperCase());
      const w = Math.ceil(Math.max(head.width, tail?.width ?? 0) / 2) * 2 + 10;
      bg.clear()
        .fillStyle(0x212538, 1)
        .fillRoundedRect(-w / 2 - 1, -1, w + 2, h + 3, 3)
        .fillStyle(0x292f3b, 0.96)
        .fillRoundedRect(-w / 2, 0, w, h, 2)
        .lineStyle(1, accent, 0.85)
        .strokeRoundedRect(-w / 2 + 1.5, 1.5, w - 3, h - 3, 2);
    };
    set(title);
    this.add
      .container(Math.round(x), Math.round(top), tail ? [bg, head, tail] : [bg, head])
      .setDepth(200010);
    return set;
  }

  /** Four Wins AI: click/tap opens the chat; a bobbing bubble shows it can talk. */
  private setupAiCompanion(bot: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    bot.setInteractive({ useHandCursor: true, pixelPerfect: false });
    bot.on("pointerdown", () => {
      if (bridge.blocked) return;
      play("open");
      bridge.emit("open-panel", "ai");
    });
    const bubble = this.add.image(bot.x + 9, bot.y - 34, "chat-bubble").setDepth(bot.y + 1);
    this.tweens.add({ targets: bubble, y: bubble.y - 3, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
    bubble.setInteractive({ useHandCursor: true }).on("pointerdown", () => !bridge.blocked && bridge.emit("open-panel", "ai"));
  }

  private ambient() {
    // Chimney smoke
    this.add
      .particles(SPOTS.home.x + 30, SPOTS.home.y - 70, "fx-dot", {
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
        this.plates[p]?.(STAGE_NAMES[p][stage]);
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
    const trained = state.body.workouts.some((workout) => workout.date === state.now.date);
    const hoisted = this.pennant.visible;
    this.pennant.setVisible(trained);
    if (trained && !hoisted && this.live) {
      const coach = this.npcs.find((npc) => npc.spawn.id === "coach");
      if (coach && !state.player.settings.reducedMotion) {
        coach.doActivity("celebrate", 1600);
        showEmote(this, coach.sprite, "star", 36, 1500);
        this.tweens.add({ targets: this.pennant, y: { from: this.pennant.y + 22, to: this.pennant.y }, duration: 850 });
      }
      floatText(this, this.pennant.x, this.pennant.y - 30, "Pennant raised!", 0xffdf86);
    }

    const count = Math.min(21, state.learningEntries);
    if (count !== this.shelfCount) {
      const key = `learning-shelf-${count}`;
      if (!this.textures.exists(key)) addPixels(this, key, bookshelf(count));
      this.shelf.setTexture(key);
      this.shelfCount = count;
    }
    const reflected = state.today.journal.some((entry) => entry.kind === "reflection");
    this.reflectionLantern.setVisible(reflected);
    if (reflected && !this.reflectionLight) this.reflectionLight = this.dayNight.addLight(254, 537, 64, "glow-gold");
    if (!reflected && this.reflectionLight) {
      this.dayNight.removeLight(this.reflectionLight);
      this.reflectionLight = undefined;
    }
    this.syncGrowth(state);
    this.syncChest(state);

    const tuition = state.savings.goals.find((g) => g.key === "tuition");
    const car = state.savings.goals.find((g) => g.key === "car");
    const vaultLevel = tuition ? Math.min(10, Math.floor(tuition.progress * 10 + (tuition.balanceCents > 0 ? 0.999 : 0))) : 0;
    this.buildings.vault?.setTexture(`vault-${vaultLevel}`);
    this.buildings.garage?.setTexture(`garage-${car ? carStage(car.progress) : 0}`);
  }
}
