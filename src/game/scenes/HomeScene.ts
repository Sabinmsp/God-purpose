import * as Phaser from "phaser";
import { PILLAR_META } from "@/lib/shared/pillars";
import { localClock } from "@/lib/shared/time";
import type { GameState } from "@/lib/shared/types";
import { UNLOCKS_BY_KEY } from "@/lib/shared/unlocks";
import { T, TILE } from "../art/tiles";
import { bridge } from "../bridge";
import type { Activity, Facing } from "../objects/Actor";
import type { InteractAction } from "../world/village";
import { WorldScene } from "./WorldScene";

const W = 20;
const H = 13;

interface Furniture {
  id: string;
  /** Texture key, or a function of state for items with upgrades. */
  tex: string | ((s: GameState) => string);
  x: number;
  y: number;
  unlock?: string;
  collide?: { w: number; h: number };
  flat?: boolean;
  wall?: boolean;
  label: string;
  activity?: Activity;
  panel?: "profile" | "achievements" | "financial";
  /** Where the character stands while using it. */
  use?: { x: number; y: number };
}

const FURNITURE: Furniture[] = [
  { id: "bed", tex: "bed", x: 34, y: 100, collide: { w: 32, h: 40 }, label: "Bed", activity: "sleep", use: { x: 34, y: 92 } },
  { id: "wardrobe", tex: "wardrobe", x: 80, y: 84, collide: { w: 24, h: 12 }, label: "Wardrobe", panel: "profile" },
  { id: "window", tex: "window-day", x: 124, y: 38, wall: true, label: "Window" },
  { id: "bookshelf", tex: "bookshelf", x: 168, y: 84, unlock: "bookshelf", collide: { w: 28, h: 12 }, label: "Bookshelf", activity: "read" },
  {
    id: "desk",
    tex: (s) => (has(s, "better_desk") ? "desk-fancy" : has(s, "desk_lamp") ? "desk-lamp" : "desk-basic"),
    x: 228,
    y: 88,
    collide: { w: 42, h: 12 },
    label: "Desk",
    activity: "work",
    use: { x: 228, y: 104 },
  },
  { id: "trophies", tex: (s) => `trophies-${Math.min(10, s.achievements.length)}`, x: 292, y: 44, wall: true, label: "Trophy Shelf", panel: "achievements" },
  { id: "rug", tex: "rug", x: 160, y: 156, unlock: "cozy_rug", flat: true, label: "Cozy Rug" },
  { id: "cushion", tex: "cushion", x: 112, y: 152, unlock: "meditation_cushion", label: "Meditation Cushion", activity: "meditate", use: { x: 112, y: 152 } },
  { id: "plant", tex: "plant", x: 18, y: 196, unlock: "house_plant", collide: { w: 12, h: 6 }, label: "House Plant" },
  { id: "bonsai", tex: "bonsai", x: 56, y: 140, unlock: "bonsai", collide: { w: 16, h: 6 }, label: "Bonsai" },
  { id: "sofa", tex: "sofa", x: 72, y: 200, unlock: "comfy_sofa", collide: { w: 42, h: 10 }, label: "Comfy Sofa" },
  { id: "piggy", tex: "piggy-bank", x: 132, y: 196, unlock: "piggy_bank", collide: { w: 12, h: 6 }, label: "Piggy Bank", panel: "financial" },
  { id: "dumbbells", tex: "dumbbells", x: 236, y: 152, unlock: "dumbbells", collide: { w: 20, h: 6 }, label: "Dumbbells", activity: "exercise", use: { x: 236, y: 168 } },
  { id: "bench", tex: "weight-bench", x: 252, y: 200, unlock: "weight_bench", collide: { w: 34, h: 8 }, label: "Weight Bench", activity: "exercise" },
  { id: "rack", tex: "squat-rack", x: 298, y: 160, unlock: "squat_rack", collide: { w: 30, h: 8 }, label: "Squat Rack", activity: "exercise" },
];

function has(s: GameState, key: string) {
  const def = UNLOCKS_BY_KEY[key];
  return def ? s.stats.pillars[def.pillar].level >= def.level : false;
}

export class HomeScene extends WorldScene {
  readonly sceneName = "home" as const;
  private items: Record<string, Phaser.GameObjects.Image> = {};
  private from?: string;

  constructor() {
    super("home");
  }

  init(data: { from?: string }) {
    this.from = data?.from;
  }

  protected spawnPoint(): { x: number; y: number; facing: Facing } {
    const pos = bridge.state?.player.position;
    if (this.from !== "village" && pos?.scene === "home" && pos.x != null && pos.y != null) {
      return { x: pos.x, y: pos.y, facing: (pos.facing as Facing) ?? "up" };
    }
    return { x: 160, y: 176, facing: "up" };
  }

  protected buildWorld() {
    const ground = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => (y < 2 ? T.WALL : y === 2 ? T.WALL_BASE : (x + y) % 3 ? T.WOOD : T.WOOD_ALT)),
    );
    const map = this.make.tilemap({ data: ground, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    map.createLayer(0, tiles, 0, 0)!.setDepth(-10);
    this.add.rectangle(160, 206, 28, 4, 0x8a5a36).setDepth(-5); // door mat

    this.addSolid(160, 20, 320, 40); // back wall
    for (const f of FURNITURE) {
      const img = this.add.image(f.x, f.y, typeof f.tex === "string" ? f.tex : "desk-basic").setOrigin(0.5, f.wall ? 0.5 : 1);
      img.setDepth(f.flat ? -4 : f.wall ? 1 : f.y);
      this.items[f.id] = img;
      if (f.collide) this.addSolid(f.x, f.y - f.collide.h / 2, f.collide.w, f.collide.h);
      this.interactables.push({
        id: f.id,
        x: f.use?.x ?? f.x,
        y: f.wall ? f.y + 52 : (f.use?.y ?? f.y + 6),
        r: f.wall ? 30 : 22,
        label: f.label,
        verb: f.panel ? "Open" : f.activity ? "Use" : "Look",
        action: { type: "talk", speaker: f.label, lines: [] },
      });
    }
    this.interactables.push({ id: "door", x: 160, y: 200, r: 18, label: "Village", verb: "Exit to", action: { type: "scene", scene: "village" } });
    return { width: W * TILE, height: H * TILE };
  }

  create() {
    super.create();
    this.dayNight.addLight(124, 38, 60, "glow-cool");
    this.dayNight.addLight(228, 60, 50, "glow-warm");
    this.cameras.main.fadeIn(250, 11, 16, 48);
  }

  protected fitZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.floor(Math.min(width / 330, height / 220)), 2, 5);
    this.cameras.main.setZoom(zoom);
  }

  protected onState(state: GameState) {
    const night = this.dayNight ? this.dayNight.night > 0.5 : false;
    for (const f of FURNITURE) {
      const img = this.items[f.id];
      if (!img) continue;
      let tex = typeof f.tex === "string" ? f.tex : f.tex(state);
      if (f.id === "window") tex = night ? "window-night" : "window-day";
      const unlocked = !f.unlock || has(state, f.unlock);
      img.setTexture(unlocked || f.wall ? tex : `${tex}-ghost`);
    }
  }

  protected runAction(action: InteractAction) {
    if (action.type !== "talk") return super.runAction(action);
    const state = bridge.state;
    const f = FURNITURE.find((x) => x.label === action.speaker);
    if (!state || !f) return;
    if (f.unlock && !has(state, f.unlock)) {
      const def = UNLOCKS_BY_KEY[f.unlock];
      bridge.emit("dialog", {
        speaker: f.label,
        lines: [`Not yet. Reach ${PILLAR_META[def.pillar].name} level ${def.level} to unlock the ${def.name}.`, def.description],
      });
      return;
    }
    if (f.panel) {
      bridge.emit("open-panel", f.panel);
      return;
    }
    if (f.activity) {
      if (f.use) this.player.sprite.setPosition(f.use.x, f.use.y);
      this.player.doActivity(f.activity, f.activity === "sleep" ? 6000 : 3500);
      if (f.activity === "sleep") this.sleepZs();
      return;
    }
    if (f.id === "window") {
      const { hour } = localClock();
      bridge.emit("dialog", {
        speaker: "Window",
        lines: [hour >= 19 || hour < 6 ? "Stars over Darwin. A good night to rest and reflect." : "Sunlight over the village. A good day to win."],
      });
    }
  }

  private sleepZs() {
    const e = this.add.particles(this.player.x + 8, this.player.y - 26, "fx-z", {
      speedY: { min: -14, max: -8 },
      speedX: { min: 4, max: 10 },
      lifespan: 1800,
      frequency: 700,
      alpha: { start: 1, end: 0 },
      scale: { start: 0.6, end: 1.2 },
      tint: 0xc9e6ff,
    });
    e.setDepth(100000);
    this.time.delayedCall(6000, () => e.destroy());
  }
}
