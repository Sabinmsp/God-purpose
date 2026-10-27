import { z } from "zod";
import { PILLARS } from "./pillars";
import { ALLOWED_QUEST_XP } from "./progression";
import { isValidDate } from "./time";

const id = z.uuid();
const pillar = z.enum(PILLARS);
const isoDate = z.string().refine(isValidDate, "Invalid date");
const text = (max: number) => z.string().trim().max(max);
/** Money arrives as integer cents; the client never sends balances. */
const cents = z.number().int().positive().max(100_000_000_00);

export const loginSchema = z.object({ password: z.string().min(1).max(256) });
export const pinSchema = z.object({ pin: z.string().regex(/^\d{4,8}$/) });

export const questActionSchema = z.object({ dailyQuestId: id });
export const addToTodaySchema = z.object({ questDefId: id });

const questXp = z
  .number()
  .int()
  .refine((v) => (ALLOWED_QUEST_XP as readonly number[]).includes(v), "XP must be one of the allowed values");
const daysOfWeek = z.array(z.number().int().min(0).max(6)).min(1).max(7);

export const createQuestSchema = z.object({
  pillar,
  title: text(80).min(2),
  xp: questXp,
  onBoard: z.boolean().default(true),
  daysOfWeek: daysOfWeek.default([0, 1, 2, 3, 4, 5, 6]),
  goalId: id.nullable().optional(),
});

export const updateQuestSchema = z.object({
  title: text(80).min(2).optional(),
  xp: questXp.optional(),
  onBoard: z.boolean().optional(),
  daysOfWeek: daysOfWeek.optional(),
  goalId: id.nullable().optional(),
});

export const restDaySchema = z.object({
  scope: z.enum(["all", "physical"]),
  on: z.boolean(),
  note: text(200).default(""),
});

export const financeEntrySchema = z.object({
  requestId: id,
  kind: z.enum(["income", "expense", "transfer"]),
  amountCents: cents,
  category: text(40).default(""),
  note: text(200).default(""),
  occurredOn: isoDate.optional(),
});

export const savingsMoveSchema = z.object({
  requestId: id,
  goalId: id,
  direction: z.enum(["deposit", "withdrawal"]),
  amountCents: cents,
  note: text(200).default(""),
});

export const savingsSetBalanceSchema = z.object({
  requestId: id,
  goalId: id,
  balanceCents: z.number().int().min(0).max(100_000_000_00),
  note: text(200).default(""),
});

export const savingsGoalUpdateSchema = z.object({
  name: text(60).min(2).optional(),
  targetCents: cents.optional(),
  targetDate: isoDate.nullable().optional(),
});

export const measurementSchema = z
  .object({
    date: isoDate.optional(),
    weightKg: z.number().min(20).max(400).nullable().optional(),
    waistCm: z.number().min(30).max(300).nullable().optional(),
    bodyFatPct: z.number().min(2).max(70).nullable().optional(),
    notes: text(300).default(""),
  })
  .refine((m) => m.weightKg != null || m.waistCm != null || m.bodyFatPct != null, "Record at least one measurement");

export const workoutSchema = z.object({
  requestId: id,
  title: text(60).min(1),
  kind: z.enum(["strength", "cardio", "mobility", "sport", "other"]),
  durationMin: z.number().int().min(1).max(600),
  notes: text(500).default(""),
  sets: z
    .array(
      z.object({
        exercise: text(60).min(1),
        weightKg: z.number().min(0).max(1000),
        reps: z.number().int().min(1).max(500),
        sets: z.number().int().min(1).max(50),
      }),
    )
    .max(40)
    .default([]),
});

export const journalSchema = z.object({
  kind: z.enum(["journal", "gratitude", "reflection", "learning"]),
  body: text(4000).min(1),
});

const goalMilestones = z.array(z.object({ label: text(60).min(1), value: z.number() })).max(12);

export const goalCreateSchema = z.object({
  pillar,
  title: text(100).min(2),
  description: text(500).default(""),
  unit: text(20).default(""),
  startValue: z.number().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().nullable().optional(),
  startDate: isoDate.optional(),
  targetDate: isoDate.nullable().optional(),
  milestones: goalMilestones.default([]),
  notes: text(2000).default(""),
});

export const goalUpdateSchema = z.object({
  title: text(100).min(2).optional(),
  description: text(500).optional(),
  unit: text(20).optional(),
  startValue: z.number().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().nullable().optional(),
  startDate: isoDate.optional(),
  targetDate: isoDate.nullable().optional(),
  milestones: goalMilestones.optional(),
  notes: text(2000).optional(),
  status: z.enum(["active", "completed", "paused", "archived"]).optional(),
});

export const positionSchema = z.object({
  scene: z.enum(["village", "home"]),
  x: z.number().int().min(0).max(10_000),
  y: z.number().int().min(0).max(10_000),
  facing: z.enum(["up", "down", "left", "right"]),
});

export const settingsSchema = z.object({
  displayName: text(24).min(1).optional(),
  muted: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  showSidePanel: z.boolean().optional(),
  textScale: z.number().min(0.85).max(1.4).optional(),
});

export const equipSchema = z.object({
  slot: z.enum(["outfit", "hat", "aura", "companion"]),
  key: z.string().max(40).nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(4).max(256),
});

export const setPinSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  pin: z.string().regex(/^\d{4,8}$/).nullable(),
});

export const guideSchema = z.object({
  question: z.enum(["focus_today", "gym_consistency", "tuition_progress", "neglected_habit", "improve_week"]),
});
