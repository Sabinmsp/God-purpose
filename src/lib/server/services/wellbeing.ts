import "server-only";
import { addDays } from "@/lib/shared/time";
import { WELLBEING_FIELDS, type WellbeingInput, type WellbeingView } from "@/lib/shared/wellbeing";
import type { Q } from "../db";
import { today, type Ctx } from "./progress";

interface Row {
  local_date: string;
  sleep_minutes: number | null;
  energy: number | null;
  mood: number | null;
  focus: number | null;
  distraction_minutes: number | null;
}

const view = (r: Row): WellbeingView => ({
  date: r.local_date,
  sleepMinutes: r.sleep_minutes,
  energy: r.energy,
  mood: r.mood,
  focus: r.focus,
  distractionMinutes: r.distraction_minutes,
});

/** Today's check-in (if any) and the last seven days that have one. */
export async function wellbeingSummary(q: Q, playerId: string, date: string) {
  const rows = await q<Row[]>`
    select local_date, sleep_minutes, energy, mood, focus, distraction_minutes from wellbeing_checkins
    where player_id = ${playerId} and local_date between ${addDays(date, -6)} and ${date}
    order by local_date desc
  `;
  const recent = rows.map(view);
  return { today: recent.find((r) => r.date === date) ?? null, recent };
}

/**
 * Saves today's self-reported check-in. Omitted fields keep their value, null
 * clears one. Check-ins never award XP, so there is nothing to farm.
 */
export async function saveCheckin(ctx: Ctx, input: WellbeingInput) {
  const date = today(ctx);
  await ctx.sql.begin(async (tx) => {
    const [existing] = await tx<Row[]>`
      select local_date, sleep_minutes, energy, mood, focus, distraction_minutes from wellbeing_checkins
      where player_id = ${ctx.playerId} and local_date = ${date} for update
    `;
    const merged = { ...(existing ? view(existing) : {}), ...input };
    const v = (k: (typeof WELLBEING_FIELDS)[number]) => merged[k] ?? null;
    if (WELLBEING_FIELDS.every((k) => v(k) === null)) {
      await tx`delete from wellbeing_checkins where player_id = ${ctx.playerId} and local_date = ${date}`;
      return;
    }
    await tx`
      insert into wellbeing_checkins (player_id, local_date, sleep_minutes, energy, mood, focus, distraction_minutes, updated_at)
      values (${ctx.playerId}, ${date}, ${v("sleepMinutes")}, ${v("energy")}, ${v("mood")}, ${v("focus")}, ${v("distractionMinutes")}, ${ctx.now})
      on conflict (player_id, local_date) do update set
        sleep_minutes = excluded.sleep_minutes, energy = excluded.energy, mood = excluded.mood,
        focus = excluded.focus, distraction_minutes = excluded.distraction_minutes, updated_at = excluded.updated_at
    `;
  });
}
