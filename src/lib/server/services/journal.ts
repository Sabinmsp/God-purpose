import "server-only";
import type { GameEvent, JournalEntryView } from "@/lib/shared/types";
import type { Q } from "../db";
import { mutate, today, type Ctx } from "./progress";
import { autoComplete } from "./quests";

export async function journalForDay(q: Q, playerId: string, date: string): Promise<JournalEntryView[]> {
  const rows = await q<{ id: string; local_date: string; kind: JournalEntryView["kind"]; body: string }[]>`
    select id, local_date, kind, body from journal_entries
    where player_id = ${playerId} and local_date = ${date}
    order by created_at
  `;
  return rows.map((r) => ({ id: r.id, date: r.local_date, kind: r.kind, body: r.body }));
}

export function addJournalEntry(ctx: Ctx, input: { kind: JournalEntryView["kind"]; body: string }) {
  return mutate(ctx, async (tx) => {
    const date = today(ctx);
    await tx`
      insert into journal_entries (player_id, local_date, kind, body, created_at)
      values (${ctx.playerId}, ${date}, ${input.kind}, ${input.body}, ${ctx.now})
    `;
    const events: GameEvent[] = [];
    if (input.kind === "gratitude") {
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from journal_entries
        where player_id = ${ctx.playerId} and local_date = ${date} and kind = 'gratitude'
      `;
      if (n >= 3) events.push(...(await autoComplete(tx, ctx, "gratitude3")));
    } else {
      events.push(...(await autoComplete(tx, ctx, input.kind)));
    }
    return events;
  });
}
