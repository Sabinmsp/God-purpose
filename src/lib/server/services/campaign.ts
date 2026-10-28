import "server-only";
import { DEFAULT_CAMPAIGN, campaignDates, dayNumber, type CampaignDay, type CampaignInfo } from "@/lib/shared/campaign";
import type { Pillar } from "@/lib/shared/pillars";
import type { Q } from "../db";

export async function getCampaign(q: Q, playerId: string): Promise<CampaignInfo> {
  const [row] = await q<{ title: string; start_date: string; end_date: string }[]>`
    select title, start_date, end_date from campaigns where player_id = ${playerId}
  `;
  return row ? { title: row.title, startDate: row.start_date, endDate: row.end_date } : { ...DEFAULT_CAMPAIGN };
}

/** Every campaign day up to `today`, with the pillars actually won that day. */
export async function campaignDays(q: Q, playerId: string, c: CampaignInfo, today: string): Promise<CampaignDay[]> {
  const dates = campaignDates(c, today);
  if (!dates.length) return [];
  const last = dates[dates.length - 1];
  const [quests, xp] = await Promise.all([
    q<{ local_date: string; pillars: Pillar[]; n: number }[]>`
      select local_date, array_agg(distinct pillar) as pillars, count(*)::int as n
      from daily_quests
      where player_id = ${playerId} and status = 'done' and local_date between ${c.startDate} and ${last}
      group by local_date
    `,
    q<{ local_date: string; xp: number }[]>`
      select local_date, sum(amount)::int as xp from xp_transactions
      where player_id = ${playerId} and local_date between ${c.startDate} and ${last}
      group by local_date
    `,
  ]);
  const byDate = new Map(quests.map((r) => [r.local_date, r]));
  const xpByDate = new Map(xp.map((r) => [r.local_date, r.xp]));
  return dates.map((date) => ({
    date,
    pillars: byDate.get(date)?.pillars ?? [],
    quests: byDate.get(date)?.n ?? 0,
    xp: Math.max(0, xpByDate.get(date) ?? 0),
  }));
}

/** Everything recorded on one day, for the timeline. */
export async function dayDetail(q: Q, playerId: string, date: string) {
  const c = await getCampaign(q, playerId);
  const [quests, journal, workouts, measurements, savings, finance, achievements, unlocks] = await Promise.all([
    q<{ title: string; pillar: Pillar; xp_awarded: number }[]>`
      select title, pillar, xp_awarded from daily_quests
      where player_id = ${playerId} and local_date = ${date} and status = 'done'
      order by completed_at
    `,
    q<{ kind: string; body: string }[]>`
      select kind, body from journal_entries where player_id = ${playerId} and local_date = ${date} order by created_at
    `,
    q<{ title: string; kind: string; duration_min: number }[]>`
      select title, kind, duration_min from workouts where player_id = ${playerId} and local_date = ${date} order by created_at
    `,
    q<{ weight_kg: number | null; waist_cm: number | null; body_fat_pct: number | null }[]>`
      select weight_kg, waist_cm, body_fat_pct from body_measurements where player_id = ${playerId} and local_date = ${date}
    `,
    q<{ name: string; kind: string; amount_cents: number }[]>`
      select g.name, l.kind, l.amount_cents from savings_ledger l join savings_goals g on g.id = l.goal_id
      where l.player_id = ${playerId} and l.occurred_on = ${date} order by l.created_at
    `,
    q<{ kind: string; n: number }[]>`
      select kind, count(*)::int as n from finance_entries
      where player_id = ${playerId} and occurred_on = ${date} and deleted_at is null group by kind
    `,
    q<{ key: string }[]>`
      select key from achievements
      where player_id = ${playerId} and (earned_at at time zone 'Australia/Darwin')::date = ${date}
      order by earned_at
    `,
    q<{ key: string }[]>`
      select key from unlocks
      where player_id = ${playerId} and (unlocked_at at time zone 'Australia/Darwin')::date = ${date}
      order by unlocked_at
    `,
  ]);
  return {
    date,
    dayNumber: dayNumber(c, date),
    quests: quests.map((r) => ({ title: r.title, pillar: r.pillar, xp: r.xp_awarded })),
    journal: journal.map((r) => ({ kind: r.kind, body: r.body })),
    workouts: workouts.map((r) => ({ title: r.title, kind: r.kind, durationMin: r.duration_min })),
    measurements: measurements.map((r) => ({ weightKg: r.weight_kg, waistCm: r.waist_cm, bodyFatPct: r.body_fat_pct })),
    savings: savings.map((r) => ({ goalName: r.name, kind: r.kind, amountCents: r.amount_cents })),
    finance: Object.fromEntries(finance.map((r) => [r.kind, r.n])),
    achievements: achievements.map((r) => r.key),
    unlocks: unlocks.map((r) => r.key),
  };
}

export type DayDetail = Awaited<ReturnType<typeof dayDetail>>;
