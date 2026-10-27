export const PILLARS = ["mental", "physical", "spiritual", "financial"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_META: Record<
  Pillar,
  { name: string; world: string; icon: string; color: string; soft: string; blurb: string }
> = {
  mental: {
    name: "Mental",
    world: "Mind Temple",
    icon: "🧠",
    color: "#8f7cf0",
    soft: "#2c2550",
    blurb: "Mindset, focus, discipline, learning",
  },
  physical: {
    name: "Physical",
    world: "Strength Arena",
    icon: "💪",
    color: "#e0794f",
    soft: "#4a2418",
    blurb: "Training, body, sleep, nutrition",
  },
  spiritual: {
    name: "Spiritual",
    world: "Spirit Sanctuary",
    icon: "🧘",
    color: "#5fc4a4",
    soft: "#163a33",
    blurb: "Reflection, gratitude, meditation, peace",
  },
  financial: {
    name: "Financial",
    world: "Wealth Kingdom",
    icon: "💰",
    color: "#f2c14e",
    soft: "#40330f",
    blurb: "Savings, budgeting, financial freedom",
  },
};

export function isPillar(value: unknown): value is Pillar {
  return typeof value === "string" && (PILLARS as readonly string[]).includes(value);
}
