"use client";

import type { HabitLogKey } from "@/game/bridge";
import { Sheet } from "../ui";
import { GratitudeForm, JournalBox } from "./MindSpirit";
import { MeasurementForm, WorkoutForm } from "./Strength";
import { CashFlowForm, WealthPanel } from "./Wealth";

export const HABIT_LOG_LABELS: Record<HabitLogKey, string> = {
  workout: "Log a workout",
  pr: "Log a workout",
  measurement: "Log a measurement",
  expense_log: "Log an expense",
  savings_deposit: "Log a savings deposit",
  gratitude3: "Log gratitude notes",
  journal: "Write a journal entry",
  reflection: "Write a reflection",
  learning: "Log a learning note",
};

export function isHabitLogKey(key: string | null | undefined): key is HabitLogKey {
  return Boolean(key && Object.hasOwn(HABIT_LOG_LABELS, key));
}

export function HabitLogPanel({ kind, onClose }: { kind: HabitLogKey; onClose: () => void }) {
  if (kind === "savings_deposit") return <WealthPanel onClose={onClose} />;

  let form;
  switch (kind) {
    case "workout":
    case "pr":
      form = <WorkoutForm onSaved={onClose} />;
      break;
    case "measurement":
      form = <MeasurementForm onSaved={onClose} />;
      break;
    case "expense_log":
      form = <CashFlowForm onSaved={onClose} />;
      break;
    case "gratitude3":
      form = <GratitudeForm />;
      break;
    case "journal":
    case "reflection":
    case "learning": {
      const label = { journal: "Journal entry", reflection: "Reflection", learning: "Learning note" }[kind];
      form = <JournalBox kind={kind} label={label} placeholder="" cta={`Save ${label.toLowerCase()}`} onSaved={onClose} />;
      break;
    }
  }
  return <Sheet title={HABIT_LOG_LABELS[kind]} onClose={onClose}>{form}</Sheet>;
}
