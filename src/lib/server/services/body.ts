import "server-only";
import { startOfWeek } from "@/lib/shared/time";
import type { BodySummary, GameEvent, MeasurementView, WorkoutView } from "@/lib/shared/types";
import type { Q } from "../db";
import { conflict, notFound } from "../errors";
import { grantAchievement, mutate, today, weightProgress, type Ctx } from "./progress";
import { autoComplete } from "./quests";

export async function bodySummary(q: Q, playerId: string, date: string): Promise<BodySummary> {
  const measurements = await q<
    { id: string; local_date: string; weight_kg: number | null; waist_cm: number | null; body_fat_pct: number | null; notes: string }[]
  >`
    select id, local_date, weight_kg, waist_cm, body_fat_pct, notes from body_measurements
    where player_id = ${playerId} order by local_date desc limit 60
  `;
  const workouts = await q<
    { id: string; local_date: string; title: string; kind: WorkoutView["kind"]; duration_min: number; notes: string; sets: WorkoutView["sets"] | null }[]
  >`
    select w.id, w.local_date, w.title, w.kind, w.duration_min, w.notes,
      (select json_agg(json_build_object('exercise', s.exercise, 'weightKg', s.weight_kg::float8, 'reps', s.reps, 'sets', s.sets))
         from workout_sets s where s.workout_id = w.id) as sets
    from workouts w where w.player_id = ${playerId}
    order by w.local_date desc, w.created_at desc limit 30
  `;
  const [counts] = await q<{ total: number; week: number }[]>`
    select count(*)::int as total, count(*) filter (where local_date >= ${startOfWeek(date)})::int as week
    from workouts where player_id = ${playerId}
  `;
  const prs = await q<{ exercise: string; weight_kg: number; local_date: string }[]>`
    select distinct on (lower(s.exercise)) s.exercise, s.weight_kg, w.local_date
    from workout_sets s join workouts w on w.id = s.workout_id
    where s.player_id = ${playerId} and s.weight_kg > 0
    order by lower(s.exercise), s.weight_kg desc, w.local_date asc
  `;
  const physique = await weightProgress(q, playerId);
  const toMeasurement = (m: (typeof measurements)[number]): MeasurementView => ({
    id: m.id,
    date: m.local_date,
    weightKg: m.weight_kg,
    waistCm: m.waist_cm,
    bodyFatPct: m.body_fat_pct,
    notes: m.notes,
  });
  return {
    latest: measurements[0] ? toMeasurement(measurements[0]) : null,
    startWeightKg: physique.start,
    targetWeightKg: physique.target,
    physiqueProgress: physique.progress,
    physiqueTier: physique.tier,
    measurements: measurements.map(toMeasurement),
    workouts: workouts.map((w) => ({
      id: w.id,
      date: w.local_date,
      title: w.title,
      kind: w.kind,
      durationMin: w.duration_min,
      notes: w.notes,
      sets: w.sets ?? [],
    })),
    workoutsThisWeek: counts.week,
    workoutsTotal: counts.total,
    prs: prs.map((p) => ({ exercise: p.exercise, weightKg: p.weight_kg, date: p.local_date })),
  };
}

export function recordMeasurement(
  ctx: Ctx,
  input: { date?: string; weightKg?: number | null; waistCm?: number | null; bodyFatPct?: number | null; notes: string },
) {
  return mutate(ctx, async (tx) => {
    const date = input.date ?? today(ctx);
    if (date > today(ctx)) throw conflict("Measurements can't be dated in the future");
    // One row per day; later entries on the same day refine it.
    await tx`
      insert into body_measurements (player_id, local_date, weight_kg, waist_cm, body_fat_pct, notes, created_at)
      values (${ctx.playerId}, ${date}, ${input.weightKg ?? null}, ${input.waistCm ?? null}, ${input.bodyFatPct ?? null}, ${input.notes}, ${ctx.now})
      on conflict (player_id, local_date) do update set
        weight_kg = coalesce(excluded.weight_kg, body_measurements.weight_kg),
        waist_cm = coalesce(excluded.waist_cm, body_measurements.waist_cm),
        body_fat_pct = coalesce(excluded.body_fat_pct, body_measurements.body_fat_pct),
        notes = case when excluded.notes = '' then body_measurements.notes else excluded.notes end
    `;
    return date === today(ctx) ? autoComplete(tx, ctx, "measurement") : [];
  });
}

export function logWorkout(
  ctx: Ctx,
  input: {
    requestId: string;
    title: string;
    kind: WorkoutView["kind"];
    durationMin: number;
    notes: string;
    sets: WorkoutView["sets"];
  },
) {
  return mutate(ctx, async (tx) => {
    const [dupe] = await tx`select id from workouts where player_id = ${ctx.playerId} and request_id = ${input.requestId}`;
    if (dupe) return [];
    const date = today(ctx);
    const events: GameEvent[] = [];

    // Personal records: heaviest weight per exercise beats every earlier set.
    const bestByExercise = new Map<string, { exercise: string; weight: number }>();
    for (const s of input.sets) {
      const key = s.exercise.trim().toLowerCase();
      const cur = bestByExercise.get(key);
      if (s.weightKg > 0 && (!cur || s.weightKg > cur.weight)) bestByExercise.set(key, { exercise: s.exercise.trim(), weight: s.weightKg });
    }
    const prs: { exercise: string; weight: number }[] = [];
    for (const [key, best] of bestByExercise) {
      const [prev] = await tx<{ max: number | null }[]>`
        select max(weight_kg)::float8 as max from workout_sets where player_id = ${ctx.playerId} and lower(exercise) = ${key}
      `;
      // The first time an exercise is logged sets a baseline, not a record.
      if (prev.max != null && prev.max > 0 && best.weight > prev.max) prs.push(best);
    }

    const [w] = await tx<{ id: string }[]>`
      insert into workouts (player_id, request_id, local_date, title, kind, duration_min, notes, created_at)
      values (${ctx.playerId}, ${input.requestId}, ${date}, ${input.title}, ${input.kind}, ${input.durationMin}, ${input.notes}, ${ctx.now})
      returning id
    `;
    for (const s of input.sets) {
      await tx`
        insert into workout_sets (workout_id, player_id, exercise, weight_kg, reps, sets)
        values (${w.id}, ${ctx.playerId}, ${s.exercise.trim()}, ${s.weightKg}, ${s.reps}, ${s.sets})
      `;
    }

    events.push(...(await autoComplete(tx, ctx, "workout")));
    if (prs.length) {
      for (const pr of prs) events.push({ type: "pr", exercise: pr.exercise, weightKg: pr.weight });
      await grantAchievement(tx, ctx, "first_pr");
      events.push(...(await autoComplete(tx, ctx, "pr")));
    }
    return events;
  });
}

/** Removes a mistaken log. XP already earned for the day is left alone. */
export function deleteWorkout(ctx: Ctx, id: string) {
  return mutate(ctx, async (tx) => {
    const deleted = await tx`delete from workouts where id = ${id} and player_id = ${ctx.playerId} returning id`;
    if (!deleted.length) throw notFound("Workout not found");
  });
}
