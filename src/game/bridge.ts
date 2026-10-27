import type { GameEvent, GameState } from "@/lib/shared/types";

export type PanelId =
  | "quests"
  | "mental"
  | "physical"
  | "spiritual"
  | "financial"
  | "profile"
  | "goals"
  | "achievements"
  | "settings"
  | "guide";

export interface Focus {
  id: string;
  label: string;
  verb: string;
}

export interface Dialog {
  speaker: string;
  lines: string[];
  action?: { label: string; panel: PanelId };
}

type Events = {
  // React → Phaser
  state: [GameState];
  events: [GameEvent[]];
  "ui-blocking": [boolean];
  interact: [];
  // Phaser → React
  "open-panel": [PanelId];
  focus: [Focus | null];
  dialog: [Dialog];
  position: [{ scene: "village" | "home"; x: number; y: number; facing: "up" | "down" | "left" | "right" }];
  scene: ["village" | "home"];
  ready: [];
};

type Handler<K extends keyof Events> = (...args: Events[K]) => void;

/** Typed event bus between the React UI and the Phaser game. */
class Bridge {
  private handlers = new Map<keyof Events, Set<(...args: never[]) => void>>();
  /** Last state sent, so scenes created later can read it immediately. */
  state: GameState | null = null;
  /** True while a panel or dialog covers the game: movement is paused. */
  blocked = false;

  on<K extends keyof Events>(event: K, fn: Handler<K>) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn as (...args: never[]) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Handler<K>) {
    this.handlers.get(event)?.delete(fn as (...args: never[]) => void);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]) {
    if (event === "state") this.state = args[0] as GameState;
    if (event === "ui-blocking") this.blocked = args[0] as boolean;
    this.handlers.get(event)?.forEach((fn) => (fn as (...a: Events[K]) => void)(...args));
  }
}

export const bridge = new Bridge();

/** Analog input from the on-screen joystick (-1..1). */
export const touchInput = { x: 0, y: 0 };
