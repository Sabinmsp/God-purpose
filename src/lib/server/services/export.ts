import "server-only";
import type { Q } from "../db";

/** Full JSON backup of the player's records. Credentials and sessions are never included. */
export async function exportPlayerData(q: Q, playerId: string) {
  const tables = [
    "goals",
    "quest_definitions",
    "daily_quests",
    "xp_transactions",
    "rest_days",
    "achievements",
    "unlocks",
    "journal_entries",
    "workouts",
    "workout_sets",
    "body_measurements",
    "finance_entries",
    "savings_goals",
    "savings_ledger",
  ] as const;
  const [player] = await q`
    select id, display_name, character_class, starting_age, created_at, pos_scene, pos_x, pos_y, facing, equipped, settings
    from players where id = ${playerId}
  `;
  const data: Record<string, unknown> = { player };
  for (const table of tables) {
    data[table] = await q`select * from ${q(table)} where player_id = ${playerId}`;
  }
  return { app: "four-wins", version: 1, exportedAt: new Date().toISOString(), data };
}
