import { authed, json } from "@/lib/server/http";
import { exportPlayerData } from "@/lib/server/services/export";
import { localDate } from "@/lib/shared/time";

export const GET = authed(async (ctx) => {
  const data = await exportPlayerData(ctx.sql, ctx.playerId);
  return json(data, 200, {
    "Content-Disposition": `attachment; filename="four-wins-backup-${localDate(ctx.now)}.json"`,
  });
});
