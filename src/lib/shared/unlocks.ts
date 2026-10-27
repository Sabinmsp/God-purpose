import { PILLARS, type Pillar } from "./pillars";

export type UnlockKind = "outfit" | "hat" | "aura" | "companion" | "effect" | "home" | "building";
export type EquipSlot = "outfit" | "hat" | "aura" | "companion";
export const EQUIP_SLOTS: EquipSlot[] = ["outfit", "hat", "aura", "companion"];

export interface UnlockDef {
  key: string;
  pillar: Pillar;
  level: number;
  kind: UnlockKind;
  name: string;
  description: string;
}

/** Everything the character or world can earn. Unlocked purely by pillar level. */
export const UNLOCKS: UnlockDef[] = [
  // Mental — Mind Temple
  { key: "desk_lamp", pillar: "mental", level: 2, kind: "home", name: "Study Lamp", description: "A warm lamp for late-night learning." },
  { key: "bookshelf", pillar: "mental", level: 3, kind: "home", name: "Bookshelf", description: "Your home library begins." },
  { key: "scholar_outfit", pillar: "mental", level: 5, kind: "outfit", name: "Scholar Outfit", description: "A deep-violet coat worn by focused minds." },
  { key: "better_desk", pillar: "mental", level: 7, kind: "home", name: "Engineer's Desk", description: "Dual monitors for serious building." },
  { key: "knowledge_aura", pillar: "mental", level: 10, kind: "aura", name: "Knowledge Aura", description: "Glyphs of light orbit you." },
  { key: "owl_companion", pillar: "mental", level: 15, kind: "companion", name: "Owl Companion", description: "A wise owl follows your journey." },
  { key: "master_temple", pillar: "mental", level: 20, kind: "building", name: "Master Mind Temple", description: "The temple is crowned in gold." },
  { key: "focus_crown", pillar: "mental", level: 30, kind: "hat", name: "Legendary Focus Crown", description: "Proof of a mind that will not be distracted." },
  // Physical — Strength Arena
  { key: "dumbbells", pillar: "physical", level: 2, kind: "home", name: "Dumbbell Rack", description: "Home training gear." },
  { key: "sweatband", pillar: "physical", level: 3, kind: "hat", name: "Training Headband", description: "Earned through sweat." },
  { key: "athletic_outfit", pillar: "physical", level: 5, kind: "outfit", name: "Athlete Kit", description: "Built for the work." },
  { key: "weight_bench", pillar: "physical", level: 7, kind: "home", name: "Weight Bench", description: "Your home gym grows." },
  { key: "power_aura", pillar: "physical", level: 10, kind: "aura", name: "Power Aura", description: "Embers rise with every step." },
  { key: "squat_rack", pillar: "physical", level: 12, kind: "home", name: "Squat Rack", description: "A proper rack for heavy days." },
  { key: "champion_arena", pillar: "physical", level: 20, kind: "building", name: "Champion Arena", description: "The arena flies champion banners." },
  // Spiritual — Spirit Sanctuary
  { key: "house_plant", pillar: "spiritual", level: 2, kind: "home", name: "House Plant", description: "Something green to care for." },
  { key: "meditation_cushion", pillar: "spiritual", level: 3, kind: "home", name: "Meditation Cushion", description: "A quiet corner at home." },
  { key: "zen_robe", pillar: "spiritual", level: 5, kind: "outfit", name: "Sanctuary Robe", description: "Light, calm and unhurried." },
  { key: "fireflies", pillar: "spiritual", level: 6, kind: "effect", name: "Firefly Friends", description: "Fireflies gather around you at night." },
  { key: "bonsai", pillar: "spiritual", level: 8, kind: "home", name: "Bonsai Tree", description: "Patience, made visible." },
  { key: "serenity_aura", pillar: "spiritual", level: 10, kind: "aura", name: "Serenity Aura", description: "Petals drift around you." },
  { key: "spirit_fox", pillar: "spiritual", level: 15, kind: "companion", name: "Spirit Fox", description: "A gentle fox spirit walks beside you." },
  { key: "sacred_garden", pillar: "spiritual", level: 20, kind: "building", name: "Sacred Garden", description: "The sanctuary blooms in full." },
  // Financial — Wealth Kingdom
  { key: "piggy_bank", pillar: "financial", level: 2, kind: "home", name: "Piggy Bank", description: "Every coin counts." },
  { key: "cozy_rug", pillar: "financial", level: 3, kind: "home", name: "Cozy Rug", description: "A little comfort, paid in full." },
  { key: "smart_outfit", pillar: "financial", level: 5, kind: "outfit", name: "Smart Casual", description: "Sharp, responsible, ready." },
  { key: "comfy_sofa", pillar: "financial", level: 7, kind: "home", name: "Comfy Sofa", description: "Comfort earned by consistency." },
  { key: "golden_aura", pillar: "financial", level: 10, kind: "aura", name: "Golden Aura", description: "Coins of light shimmer around you." },
  { key: "coin_sprite", pillar: "financial", level: 15, kind: "companion", name: "Coin Sprite", description: "A cheerful coin follows you." },
  { key: "grand_treasury", pillar: "financial", level: 20, kind: "building", name: "Grand Treasury", description: "The kingdom bank gains a golden dome." },
];

export const UNLOCKS_BY_KEY: Record<string, UnlockDef> = Object.fromEntries(UNLOCKS.map((u) => [u.key, u]));

export function unlockedKeys(levels: Record<Pillar, number>): string[] {
  return UNLOCKS.filter((u) => levels[u.pillar] >= u.level).map((u) => u.key);
}

export function nextUnlocks(levels: Record<Pillar, number>): UnlockDef[] {
  return PILLARS.map((p) =>
    UNLOCKS.filter((u) => u.pillar === p && levels[p] < u.level).sort((a, b) => a.level - b.level)[0],
  ).filter((u): u is UnlockDef => Boolean(u));
}

export function isEquippable(def: UnlockDef): def is UnlockDef & { kind: EquipSlot } {
  return (EQUIP_SLOTS as string[]).includes(def.kind);
}

export type Equipped = Partial<Record<EquipSlot, string>>;

/** Drops anything that is not currently unlocked or sits in the wrong slot. */
export function sanitizeEquipped(equipped: Equipped, unlocked: string[]): Equipped {
  const out: Equipped = {};
  for (const slot of EQUIP_SLOTS) {
    const key = equipped[slot];
    const def = key ? UNLOCKS_BY_KEY[key] : undefined;
    if (def && def.kind === slot && unlocked.includes(key!)) out[slot] = key;
  }
  return out;
}

/**
 * Body transformation is driven only by recorded measurements, never by
 * check-ins. Progress is directional, so a target can be above or below the
 * starting weight.
 */
export function physiqueProgress(start: number | null, current: number | null, target: number | null): number {
  if (start == null || current == null || target == null) return 0;
  if (start === target) return current === target ? 1 : 0;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
}

export function physiqueTier(progress: number): 0 | 1 | 2 | 3 {
  if (progress >= 1) return 3;
  if (progress >= 2 / 3) return 2;
  if (progress >= 1 / 3) return 1;
  return 0;
}

export const PHYSIQUE_NAMES = ["Starting Out", "Building", "Transforming", "Goal Physique"] as const;
