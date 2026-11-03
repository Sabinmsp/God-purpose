import { z } from "zod";

/** One self-reported Brain & Wellbeing check-in. Missing fields were not logged. */
export interface WellbeingView {
  date: string;
  sleepMinutes: number | null;
  energy: number | null;
  mood: number | null;
  focus: number | null;
  distractionMinutes: number | null;
}

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();

/** Today's check-in; every field can be left out (null clears it). */
export const wellbeingSchema = z
  .object({
    sleepMinutes: optionalInt(0, 1440),
    energy: optionalInt(1, 5),
    mood: optionalInt(1, 5),
    focus: optionalInt(0, 100),
    distractionMinutes: optionalInt(0, 1440),
  })
  .partial();

export type WellbeingInput = z.infer<typeof wellbeingSchema>;

export const WELLBEING_FIELDS = ["focus", "sleepMinutes", "energy", "mood", "distractionMinutes"] as const;
export type WellbeingField = (typeof WELLBEING_FIELDS)[number];

export const WELLBEING_META: Record<WellbeingField, { label: string; icon: string; color: string; max: number }> = {
  focus: { label: "Focus", icon: "🎯", color: "#5fc4a4", max: 100 },
  sleepMinutes: { label: "Sleep", icon: "🌙", color: "#6aa8ff", max: 9 * 60 },
  energy: { label: "Energy", icon: "⚡", color: "#f2c14e", max: 5 },
  mood: { label: "Mood", icon: "🙂", color: "#e0794f", max: 5 },
  distractionMinutes: { label: "Distractions", icon: "📱", color: "#8f7cf0", max: 180 },
};

export function formatWellbeing(field: WellbeingField, v: number | null): string {
  if (v == null) return "—";
  if (field === "focus") return `${v}%`;
  if (field === "sleepMinutes") return `${Math.round((v / 60) * 10) / 10}h`;
  if (field === "distractionMinutes") return `${v} min`;
  return `${v}/5`;
}

/** Bar fill for a value; sleep counts 9h as full, distractions 3h. */
export function wellbeingFill(field: WellbeingField, v: number | null): number {
  if (v == null) return 0;
  return Math.max(0, Math.min(1, v / WELLBEING_META[field].max));
}
