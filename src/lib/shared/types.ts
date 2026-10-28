import type { Pillar } from "./pillars";
import type { LevelProgress } from "./progression";
import type { Equipped } from "./unlocks";

export type QuestStatus = "open" | "done" | "skipped" | "moved";

export interface DailyQuest {
  id: string;
  questDefId: string;
  pillar: Pillar;
  title: string;
  xp: number;
  status: QuestStatus;
  xpAwarded: number;
  autoKey: string | null;
  autoOnly: boolean;
}

export interface QuestDefinition {
  id: string;
  pillar: Pillar;
  title: string;
  xp: number;
  autoKey: string | null;
  autoOnly: boolean;
  onBoard: boolean;
  daysOfWeek: number[];
  goalId: string | null;
}

export interface SavingsGoalView {
  id: string;
  key: string;
  name: string;
  targetCents: number;
  balanceCents: number;
  progress: number;
  startDate: string;
  targetDate: string | null;
  /** Cents per month still needed to hit the target date, if one is set. */
  monthlyNeededCents: number | null;
}

export interface LedgerRow {
  id: string;
  goalId: string;
  goalName: string;
  kind: "deposit" | "withdrawal" | "adjustment";
  amountCents: number;
  note: string;
  occurredOn: string;
}

export interface FinanceEntryView {
  id: string;
  kind: "income" | "expense" | "transfer";
  amountCents: number;
  category: string;
  note: string;
  occurredOn: string;
}

export interface FinanceSummary {
  monthStart: string;
  incomeCents: number;
  expenseCents: number;
  transferCents: number;
  netCents: number;
  todayExpenseCount: number;
  recent: FinanceEntryView[];
}

export interface MeasurementView {
  id: string;
  date: string;
  weightKg: number | null;
  waistCm: number | null;
  bodyFatPct: number | null;
  notes: string;
}

export interface WorkoutSetView {
  exercise: string;
  weightKg: number;
  reps: number;
  sets: number;
}

export interface WorkoutView {
  id: string;
  date: string;
  title: string;
  kind: "strength" | "cardio" | "mobility" | "sport" | "other";
  durationMin: number;
  notes: string;
  sets: WorkoutSetView[];
}

export interface BodySummary {
  latest: MeasurementView | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  physiqueProgress: number;
  physiqueTier: 0 | 1 | 2 | 3;
  measurements: MeasurementView[];
  workouts: WorkoutView[];
  workoutsThisWeek: number;
  workoutsTotal: number;
  prs: { exercise: string; weightKg: number; date: string }[];
}

export interface GoalMilestone {
  label: string;
  value: number;
}

export interface GoalView {
  id: string;
  pillar: Pillar;
  title: string;
  description: string;
  unit: string;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  linkedSource: string | null;
  startDate: string;
  targetDate: string | null;
  milestones: GoalMilestone[];
  notes: string;
  status: "active" | "completed" | "paused" | "archived";
  progress: number;
  linkedQuestIds: string[];
}

export interface JournalEntryView {
  id: string;
  date: string;
  kind: "journal" | "gratitude" | "reflection" | "learning";
  body: string;
}

export interface ProgressSnapshot {
  at: string;
  pillarXp: Record<Pillar, number>;
  levels: Record<Pillar, number>;
  overallLevel: number;
  savings: Record<string, number>;
  unlocks: string[];
  achievements: string[];
  streak: number;
  physiqueTier: number;
}

export interface WelcomeData {
  firstVisit: boolean;
  since: string | null;
  xpGained: Record<Pillar, number>;
  levelUps: { pillar: Pillar | "overall"; from: number; to: number }[];
  newUnlocks: string[];
  newAchievements: string[];
  vaults: { key: string; name: string; progress: number; deltaCents: number }[];
  streak: number;
  physiqueChanged: boolean;
}

export interface DayProgress {
  date: string;
  xp: number;
  quests: number;
  pillars: Pillar[];
  rest: boolean;
}

export interface GameState {
  now: { date: string; hour: number; minute: number; weekday: number; timezone: string };
  player: {
    name: string;
    characterClass: string;
    startingAge: number;
    position: { scene: string; x: number | null; y: number | null; facing: string };
    equipped: Equipped;
    settings: PlayerSettings;
  };
  stats: {
    pillars: Record<Pillar, LevelProgress>;
    overall: LevelProgress & { totalXp: number };
    streak: { current: number; best: number; activeToday: boolean };
    pillarStreaks: Record<Pillar, number>;
  };
  today: {
    quests: DailyQuest[];
    xpToday: Record<Pillar, number>;
    dailyCap: number;
    rest: { all: boolean; physical: boolean };
    fourWins: boolean;
    journal: JournalEntryView[];
  };
  week: DayProgress[];
  /** Current month up to today, for the habit calendar. */
  calendar: { month: string; days: DayProgress[] };
  questLibrary: QuestDefinition[];
  savings: {
    goals: SavingsGoalView[];
    totalTargetCents: number;
    totalBalanceCents: number;
    recent: LedgerRow[];
  };
  finance: FinanceSummary;
  body: BodySummary;
  goals: GoalView[];
  unlocks: { key: string; unlockedAt: string }[];
  achievements: { key: string; earnedAt: string }[];
  welcome: WelcomeData | null;
  security: { pinEnabled: boolean; weakPassword: boolean };
}

export interface PlayerSettings {
  muted: boolean;
  reducedMotion: boolean;
  showSidePanel: boolean;
  textScale: number;
  /** PixelLab sprites (when installed) or the classic look that shows outfits and physique. */
  characterArt: "pixellab" | "classic";
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  muted: false,
  reducedMotion: false,
  showSidePanel: true,
  textScale: 1,
  characterArt: "pixellab",
};

export type GameEvent =
  | { type: "xp"; pillar: Pillar; amount: number }
  | { type: "levelup"; pillar: Pillar | "overall"; level: number }
  | { type: "unlock"; key: string }
  | { type: "achievement"; key: string }
  | { type: "pr"; exercise: string; weightKg: number }
  | { type: "cap"; pillar: Pillar }
  | { type: "action"; pillar: Pillar };

export interface MutationResult {
  ok: true;
  state: GameState;
  events: GameEvent[];
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}
