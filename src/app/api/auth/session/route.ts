import { authed, json } from "@/lib/server/http";

export const GET = authed(async ({ locked }) => json({ ok: true, locked }), { allowLocked: true });
