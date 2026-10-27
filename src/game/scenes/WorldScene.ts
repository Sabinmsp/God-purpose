import * as Phaser from "phaser";
import { formatAud } from "@/lib/shared/money";
import { PILLAR_META, type Pillar } from "@/lib/shared/pillars";
import type { GameEvent, GameState } from "@/lib/shared/types";
import { UNLOCKS_BY_KEY, nextUnlocks } from "@/lib/shared/unlocks";
import { play } from "../audio";
import { bridge, type Dialog, type Focus } from "../bridge";
import type { Activity, Facing } from "../objects/Actor";
import { Npc } from "../objects/Npc";
import { Player } from "../objects/Player";
import { DayNight } from "../systems/DayNight";
import { burst, coinShower, floatText, levelUpFx, pillarColor } from "../systems/effects";
import type { InteractAction, Interactable } from "../world/village";

const ACTIVITY_FOR: Record<Pillar, Activity> = {
  mental: "read",
  physical: "exercise",
  spiritual: "meditate",
  financial: "celebrate",
};

/** Shared behaviour for every explorable scene (village, home). */
export abstract class WorldScene extends Phaser.Scene {
  protected player!: Player;
  protected npcs: Npc[] = [];
  protected interactables: Interactable[] = [];
  protected dayNight!: DayNight;
  protected solids!: Phaser.Physics.Arcade.StaticGroup;
  private focus: Interactable | null = null;
  private focusArrow!: Phaser.GameObjects.Image;
  private unsubscribers: (() => void)[] = [];
  abstract readonly sceneName: "village" | "home";

  protected abstract buildWorld(): { width: number; height: number };
  protected abstract spawnPoint(): { x: number; y: number; facing: Facing };
  protected onState(state: GameState): void {
    void state;
  }
  protected npcDialog(_npc: Npc, _state: GameState): Dialog | null {
    return null;
  }

  create() {
    this.npcs = [];
    this.interactables = [];
    this.solids = this.physics.add.staticGroup();
    const { width, height } = this.buildWorld();
    this.physics.world.setBounds(0, 0, width, height);

    const spawn = this.spawnPoint();
    this.player = new Player(this, spawn.x, spawn.y, spawn.facing, this.sceneName);
    this.physics.add.collider(this.player.sprite, this.solids);
    for (const npc of this.npcs) {
      this.physics.add.collider(npc.sprite, this.solids);
      this.physics.add.collider(this.player.sprite, npc.sprite);
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, height);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on("resize", this.fitZoom, this);

    this.dayNight = new DayNight(this);
    this.dayNight.onChange = (n) => this.player?.setNight(n);
    this.focusArrow = this.add.image(0, 0, "arrow").setDepth(150000).setVisible(false);

    const kb = this.input.keyboard!;
    const onKey = (e: KeyboardEvent) => {
      if (bridge.blocked || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      if (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " ") this.interact();
      if (e.key === "q" || e.key === "Q") bridge.emit("open-panel", "quests");
    };
    kb.on("keydown", onKey);

    this.unsubscribers.push(
      bridge.on("state", (s) => this.applyState(s)),
      bridge.on("events", (ev) => this.playEvents(ev)),
      bridge.on("interact", () => this.interact()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    if (bridge.state) this.applyState(bridge.state);
    bridge.emit("scene", this.sceneName);
    bridge.emit("ready");
  }

  private teardown() {
    this.player?.savePosition();
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.scale.off("resize", this.fitZoom, this);
    this.dayNight?.destroy();
    bridge.emit("focus", null);
  }

  protected fitZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.floor(Math.min(width / 300, height / 220)), 2, 5);
    this.cameras.main.setZoom(zoom);
  }

  protected addSolid(x: number, y: number, w: number, h: number) {
    const zone = this.add.zone(x, y, w, h);
    this.solids.add(zone);
    return zone;
  }

  private applyState(state: GameState) {
    this.player.applyState(state);
    this.onState(state);
  }

  update(time: number, dt: number) {
    this.player.update(dt);
    let nearest: Interactable | null = null;
    let best = Infinity;
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, it.x, it.y);
      if (d < it.r && d < best) {
        best = d;
        nearest = it;
      }
    }
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      const near = d < 26;
      npc.update(dt, near);
      if (near && d < best) {
        best = d;
        nearest = { id: `npc:${npc.spawn.id}`, x: npc.x, y: npc.y, r: 26, label: npc.spawn.name, verb: "Talk", action: { type: "npc", npc: npc.spawn.id } };
      }
    }
    if (nearest?.id !== this.focus?.id) {
      this.focus = nearest;
      const f: Focus | null = nearest ? { id: nearest.id, label: nearest.label, verb: nearest.verb } : null;
      bridge.emit("focus", f);
    }
    if (this.focus) {
      const target = this.focus.action.type === "npc" ? this.npcs.find((n) => `npc:${n.spawn.id}` === this.focus!.id) : null;
      this.focusArrow
        .setVisible(true)
        .setPosition(target ? target.x : this.focus.x, this.arrowY() + Math.round(Math.sin(time / 160) * 1.5));
    } else {
      this.focusArrow.setVisible(false);
    }
  }

  private arrowY() {
    if (!this.focus) return 0;
    if (this.focus.action.type === "npc") {
      const n = this.npcs.find((x) => `npc:${x.spawn.id}` === this.focus!.id);
      return (n?.y ?? this.focus.y) - 38;
    }
    return this.focus.y - 34;
  }

  interact() {
    if (bridge.blocked || !this.focus) return;
    this.runAction(this.focus.action);
  }

  protected runAction(action: InteractAction) {
    const state = bridge.state;
    switch (action.type) {
      case "panel":
        play("open");
        bridge.emit("open-panel", action.panel);
        break;
      case "scene":
        play("door");
        this.player.savePosition();
        this.cameras.main.fadeOut(220, 11, 16, 48);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
          this.scene.start(action.scene, { from: this.sceneName }),
        );
        break;
      case "talk":
        play("click");
        bridge.emit("dialog", { speaker: action.speaker, lines: action.lines });
        break;
      case "npc": {
        const npc = this.npcs.find((n) => n.spawn.id === action.npc);
        if (!npc || !state) return;
        npc.faceToward(this.player.x, this.player.y);
        const dialog = this.npcDialog(npc, state) ?? defaultNpcDialog(npc.spawn.id, npc.spawn.name, state);
        play("click");
        bridge.emit("dialog", dialog);
        break;
      }
    }
  }

  /** Visual feedback for real changes reported by the server. */
  private playEvents(events: GameEvent[]) {
    const reduced = this.player.reducedMotion;
    const { x, y } = this.player;
    let delay = 0;
    let levelled = false;
    for (const e of events) {
      switch (e.type) {
        case "action":
          this.player.doActivity(ACTIVITY_FOR[e.pillar], 2200);
          if (e.pillar === "financial") coinShower(this, x, y, reduced);
          break;
        case "xp":
          floatText(this, x, y - 34, `+${e.amount} ${PILLAR_META[e.pillar].name} XP`, pillarColor(e.pillar), delay);
          delay += 250;
          break;
        case "levelup":
          levelled = true;
          this.time.delayedCall(600, () => {
            levelUpFx(this, this.player.x, this.player.y, e.pillar === "overall" ? `Level ${e.level}!` : `${PILLAR_META[e.pillar].name} Lv ${e.level}!`, pillarColor(e.pillar), reduced);
            this.player.doActivity("levelup", 2600);
          });
          break;
        case "unlock":
          this.time.delayedCall(1400, () => {
            burst(this, this.player.x, this.player.y - 16, "fx-spark", [0xfff1b0, 0xffffff], 18, reduced);
            floatText(this, this.player.x, this.player.y - 46, `Unlocked: ${UNLOCKS_BY_KEY[e.key]?.name ?? e.key}`, 0xfff1b0);
          });
          break;
        case "achievement":
          burst(this, x, y - 16, "fx-spark", [0xf2c14e, 0xffffff], 10, reduced);
          break;
        case "pr":
          floatText(this, x, y - 52, `New PR! ${e.exercise} ${e.weightKg}kg`, 0xff9a4a, delay);
          delay += 250;
          break;
        case "cap":
          floatText(this, x, y - 52, "Daily cap reached", 0xc9ced8, delay);
          break;
      }
    }
    if (!levelled && events.some((e) => e.type === "xp")) this.time.delayedCall(2300, () => this.player.activity || this.player.doActivity("celebrate", 1500));
  }
}

/** NPC lines are built only from stored data — never invented progress. */
export function defaultNpcDialog(id: string, name: string, s: GameState): Dialog {
  const lvl = (p: Pillar) => s.stats.pillars[p].level;
  const next = (p: Pillar) => nextUnlocks({ mental: lvl("mental"), physical: lvl("physical"), spiritual: lvl("spiritual"), financial: lvl("financial") }).find((u) => u.pillar === p);
  const nextLine = (p: Pillar) => {
    const n = next(p);
    return n ? `Reach ${PILLAR_META[p].name} level ${n.level} to unlock the ${n.name}.` : `You've unlocked everything in this pillar. Legendary.`;
  };
  switch (id) {
    case "guide":
      return {
        speaker: name,
        lines: [`Welcome, ${s.player.name}. I only speak from what you've actually logged.`, "Ask me anything about your four pillars."],
        action: { label: "Ask The Guide", panel: "guide" },
      };
    case "librarian":
      return {
        speaker: name,
        lines: [`Mental level ${lvl("mental")} · ${s.today.xpToday.mental} Mental XP earned today.`, nextLine("mental")],
        action: { label: "Enter Mind Temple", panel: "mental" },
      };
    case "coach": {
      const b = s.body;
      const lines = [
        b.workoutsTotal
          ? `This week: ${b.workoutsThisWeek} workout${b.workoutsThisWeek === 1 ? "" : "s"} logged. ${b.workoutsTotal} all-time.`
          : "No workouts logged yet. Log your first session inside the Arena!",
      ];
      if (s.today.rest.physical || s.today.rest.all) lines.push("Rest day today — recovery builds strength too.");
      else lines.push(nextLine("physical"));
      return { speaker: name, lines, action: { label: "Enter Strength Arena", panel: "physical" } };
    }
    case "keeper":
      return {
        speaker: name,
        lines: [
          `Spiritual level ${lvl("spiritual")}. Your streak: ${s.stats.streak.current} day${s.stats.streak.current === 1 ? "" : "s"}.`,
          "Rest days never break a streak here. Breathe.",
        ],
        action: { label: "Enter Sanctuary", panel: "spiritual" },
      };
    case "banker": {
      const t = s.savings.goals.find((g) => g.key === "tuition");
      const c = s.savings.goals.find((g) => g.key === "car");
      return {
        speaker: name,
        lines: [
          t ? `Tuition Vault: ${Math.floor(t.progress * 100)}% — ${formatAud(t.balanceCents)} of ${formatAud(t.targetCents, { whole: true })}.` : "",
          c ? `Car Vault: ${Math.floor(c.progress * 100)}% — ${formatAud(c.balanceCents)} of ${formatAud(c.targetCents, { whole: true })}.` : "",
          "Only balances you record count here.",
        ].filter(Boolean),
        action: { label: "Enter the Bank", panel: "financial" },
      };
    }
    default:
      return { speaker: name, lines: ["Hello!"] };
  }
}
