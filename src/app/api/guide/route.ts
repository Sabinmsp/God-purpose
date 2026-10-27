import { guideSchema } from "@/lib/shared/schemas";
import { authed, json, readJson } from "@/lib/server/http";
import { askGuide } from "@/lib/server/services/guide";

export const POST = authed(async (ctx) => {
  const { question } = await readJson(ctx.req, guideSchema);
  return json({ ok: true, answer: await askGuide(ctx, question) });
});
