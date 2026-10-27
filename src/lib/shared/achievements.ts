import type { Pillar } from "./pillars";

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** Pillar that receives the XP bonus, if any. */
  pillar?: Pillar;
  xp: number;
}

const vault = (goal: "tuition" | "car", label: string): AchievementDef[] =>
  (
    [
      [10, 25],
      [25, 50],
      [50, 75],
      [75, 100],
      [100, 200],
    ] as const
  ).map(([at, xp]) => ({
    key: `${goal}_${at}`,
    name: `${label} ${at}%`,
    description: `Reach ${at}% of the ${label} goal.`,
    icon: goal === "car" ? "🚗" : "🎓",
    pillar: "financial" as const,
    xp,
  }));

/**
 * Achievements are permanent trophies. Only savings milestones grant XP (once
 * each), so withdrawing and re-depositing can never farm XP.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_quest", name: "First Step", description: "Complete your first real-life quest.", icon: "👣", xp: 0 },
  { key: "four_wins_day", name: "Four Wins", description: "Win in all four pillars on the same day.", icon: "🏆", xp: 0 },
  { key: "streak_3", name: "Kindling", description: "Keep a 3-day streak.", icon: "🔥", xp: 0 },
  { key: "streak_7", name: "On Fire", description: "Keep a 7-day streak.", icon: "🔥", xp: 0 },
  { key: "streak_30", name: "Unbreakable", description: "Keep a 30-day streak.", icon: "💎", xp: 0 },
  { key: "level_5", name: "Rising", description: "Reach level 5 in any pillar.", icon: "⭐", xp: 0 },
  { key: "level_10", name: "Seasoned", description: "Reach level 10 in any pillar.", icon: "🌟", xp: 0 },
  { key: "overall_5", name: "Life Builder", description: "Reach overall level 5.", icon: "🏗️", xp: 0 },
  { key: "overall_10", name: "Master Builder", description: "Reach overall level 10.", icon: "🏰", xp: 0 },
  { key: "mental_days_7", name: "Scholar's Path", description: "Win a Mental quest on 7 different days.", icon: "📚", xp: 0 },
  { key: "spiritual_days_7", name: "Inner Peace", description: "Win a Spiritual quest on 7 different days.", icon: "🪷", xp: 0 },
  { key: "gratitude_7", name: "Grateful Heart", description: "Write gratitude notes on 7 different days.", icon: "🙏", xp: 0 },
  { key: "first_workout", name: "First Rep", description: "Log your first workout.", icon: "🏋️", xp: 0 },
  { key: "workouts_10", name: "Regular", description: "Log 10 workouts.", icon: "💪", xp: 0 },
  { key: "workouts_50", name: "Iron Habit", description: "Log 50 workouts.", icon: "🦾", xp: 0 },
  { key: "first_pr", name: "Personal Best", description: "Set a new personal record.", icon: "📈", xp: 0 },
  { key: "first_weigh_in", name: "Baseline", description: "Record your first body measurement.", icon: "⚖️", xp: 0 },
  { key: "physique_1", name: "Transformation I", description: "One third of the way to your body goal (measured).", icon: "🥉", xp: 0 },
  { key: "physique_2", name: "Transformation II", description: "Two thirds of the way to your body goal (measured).", icon: "🥈", xp: 0 },
  { key: "physique_3", name: "Transformation III", description: "Body goal reached (measured).", icon: "🥇", xp: 0 },
  { key: "first_deposit", name: "First Coin", description: "Make your first savings contribution.", icon: "🪙", xp: 0 },
  ...vault("tuition", "Tuition Vault"),
  ...vault("car", "Car Fund"),
];

export const ACHIEVEMENTS_BY_KEY: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.key, a]),
);
