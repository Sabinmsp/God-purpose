import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider, compatibleProviderFromEnv, readCompatibleReply } from "@/lib/server/ai/openai-compatible";
import { AiError, FallbackProvider, getAiProvider, type AiProvider } from "@/lib/server/ai/provider";

interface Seen {
  path: string | undefined;
  auth: string | undefined;
  body: { model: string; response_format?: unknown; messages: { role: string; content: string }[] };
}

let server: Server;
let url: string;
let seen: Seen[] = [];
let respond: (n: number, path: string) => { status: number; content?: string };

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
      const r = respond(seen.length, req.url ?? "");
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.status === 200 ? { choices: [{ message: { role: "assistant", content: r.content } }] } : { error: { message: "nope" } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise((done) => server.close(done)));
afterEach(() => {
  seen = [];
  for (const k of ["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "GROQ_API_KEY", "AI_FALLBACK", "AI_FALLBACK_API_KEY", "AI_FALLBACK_MODEL", "OPENROUTER_API_KEY"]) delete process.env[k];
});

const request = { system: "SYSTEM", history: [], context: "<game_data>\nx\n</game_data>", message: "Why am I not progressing?" };
const good = JSON.stringify({
  reply: "Three days had nothing logged.",
  proposed_missions: [
    { pillar: "financial", title: "Apply to 2 jobs", xp: "20", reason: "First income." },
    { pillar: "career", title: "Not a pillar", xp: 20, reason: "x" },
  ],
  proposed_memories: [{ category: "career", content: "Looking for work in Darwin" }],
});

describe("open-source models over the OpenAI-compatible API", () => {
  it("sends the system prompt, game data and key, and reads the JSON reply", async () => {
    respond = () => ({ status: 200, content: good });
    const reply = await new OpenAiCompatibleProvider("groq", url, "some-model", "secret").reply(request);
    expect(reply.reply).toBe("Three days had nothing logged.");
    // The malformed mission is dropped; the valid one keeps a numeric XP.
    expect(reply.proposed_missions).toEqual([{ pillar: "financial", title: "Apply to 2 jobs", xp: 20, reason: "First income." }]);
    expect(reply.proposed_memories).toEqual([{ category: "career", content: "Looking for work in Darwin" }]);
    expect(seen[0].auth).toBe("Bearer secret");
    expect(seen[0].body.model).toBe("some-model");
    expect(seen[0].body.response_format).toEqual({ type: "json_object" });
    expect(seen[0].body.messages[0].content).toMatch(/^SYSTEM[\s\S]*one JSON object/);
    expect(seen[0].body.messages.at(-1)).toEqual({ role: "user", content: "<game_data>\nx\n</game_data>\n\nWhy am I not progressing?" });
  });

  it("retries without JSON mode when the server rejects it", async () => {
    respond = (n) => (n === 1 ? { status: 400 } : { status: 200, content: good });
    const reply = await new OpenAiCompatibleProvider("ollama", url, "m", null).reply(request);
    expect(reply.reply).toBe("Three days had nothing logged.");
    expect(seen).toHaveLength(2);
    expect(seen[1].body.response_format).toBeUndefined();
    expect(seen[1].auth).toBeUndefined();
  });

  it("keeps only the most recent turns so free token limits aren't blown", async () => {
    respond = () => ({ status: 200, content: good });
    const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `turn ${i}` }));
    await new OpenAiCompatibleProvider("groq", url, "m", "k").reply({ ...request, history });
    expect(seen[0].body.messages.map((m) => m.content).slice(1, -1)).toEqual(["turn 6", "turn 7", "turn 8", "turn 9", "turn 10", "turn 11"]);
  });

  it("maps provider failures to friendly errors", async () => {
    const provider = new OpenAiCompatibleProvider("groq", url, "m", "k");
    respond = () => ({ status: 401 });
    await expect(provider.reply(request)).rejects.toMatchObject({ kind: "auth" });
    respond = () => ({ status: 429 });
    await expect(provider.reply(request)).rejects.toMatchObject({ kind: "rate_limited" });
    respond = () => ({ status: 413 });
    await expect(provider.reply(request)).rejects.toMatchObject({ kind: "rate_limited" });
    respond = () => ({ status: 200, content: '{"oops": true}' });
    await expect(provider.reply(request)).rejects.toMatchObject({ kind: "bad_output" });
  });

  it("reads replies that aren't clean JSON", () => {
    expect(readCompatibleReply("<think>hmm</think>\n```json\n" + good + "\n```")?.reply).toBe("Three days had nothing logged.");
    expect(readCompatibleReply("Just do one thing today.")).toEqual({ reply: "Just do one thing today.", proposed_missions: [], proposed_memories: [] });
    expect(readCompatibleReply("")).toBeNull();
  });

  it("is chosen by AI_PROVIDER and stays off until it has what it needs", () => {
    process.env.AI_PROVIDER = "groq";
    expect(getAiProvider()).toBeNull();
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()).toMatchObject({ name: "groq", model: "openai/gpt-oss-120b" });
    process.env.AI_MODEL = "other-model";
    expect(getAiProvider()).toMatchObject({ model: "other-model" });
    // Ollama needs no key but does need a model name.
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    expect(compatibleProviderFromEnv("ollama")).toBeNull();
    process.env.AI_MODEL = "local-model";
    expect(compatibleProviderFromEnv("ollama")).toMatchObject({ name: "ollama", model: "local-model" });
    expect(compatibleProviderFromEnv("nonsense")).toBeNull();
  });
});

describe("backup AI when the main one is busy", () => {
  const groq = () => new OpenAiCompatibleProvider("groq", `${url.replace(/\/v1$/, "")}/groq/v1`, "big-model", "groq-key");
  const backup = () => new OpenAiCompatibleProvider("openrouter", `${url.replace(/\/v1$/, "")}/openrouter/v1`, "free-model", "or-key", { key: "OPENROUTER_API_KEY", model: "AI_FALLBACK_MODEL" });

  it("asks the backup when the main AI is at its limit", async () => {
    respond = (_, path) => (path.startsWith("/groq") ? { status: 429 } : { status: 200, content: good });
    const reply = await new FallbackProvider(groq(), backup()).reply(request);
    expect(reply.reply).toBe("Three days had nothing logged.");
    expect(seen.map((x) => [x.path, x.auth, x.body.model])).toEqual([
      ["/groq/v1/chat/completions", "Bearer groq-key", "big-model"],
      ["/openrouter/v1/chat/completions", "Bearer or-key", "free-model"],
    ]);
  });

  it("only uses the main AI when it answers", async () => {
    respond = () => ({ status: 200, content: good });
    await new FallbackProvider(groq(), backup()).reply(request);
    expect(seen).toHaveLength(1);
  });

  it("explains when both are busy, and names the backup's settings when the backup is misconfigured", async () => {
    respond = () => ({ status: 429 });
    await expect(new FallbackProvider(groq(), backup()).reply(request)).rejects.toMatchObject({
      kind: "rate_limited",
      message: "Both free AIs are at their limit right now. Wait a minute and try again.",
    });
    respond = (_, path) => (path.startsWith("/groq") ? { status: 429 } : { status: 401 });
    await expect(new FallbackProvider(groq(), backup()).reply(request)).rejects.toMatchObject({ kind: "auth", message: expect.stringContaining("Check OPENROUTER_API_KEY") });
  });

  it("never retries a refusal on the backup", async () => {
    const refusing: AiProvider = { name: "x", model: "x", reply: async () => Promise.reject(new AiError("refused", "declined")) };
    respond = () => ({ status: 200, content: good });
    await expect(new FallbackProvider(refusing, backup()).reply(request)).rejects.toMatchObject({ kind: "refused" });
    expect(seen).toHaveLength(0);
  });

  it("is set up from AI_FALLBACK with the backup's own key and model", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "groq-key";
    process.env.AI_MODEL = "groq-model";
    process.env.AI_FALLBACK = "openrouter";
    // Without its own key the backup isn't set up, and the main AI works alone.
    expect(getAiProvider()).toMatchObject({ name: "groq", model: "groq-model" });
    process.env.AI_FALLBACK_API_KEY = "or-key";
    const both = getAiProvider();
    expect(both).toBeInstanceOf(FallbackProvider);
    expect(both).toMatchObject({ name: "groq (backup: openrouter)", model: "groq-model" });
    // The main AI's model setting never leaks into the backup.
    expect(compatibleProviderFromEnv("openrouter", "fallback")).toMatchObject({ model: "openrouter/free" });
    process.env.AI_FALLBACK_MODEL = "some/free-model";
    expect(compatibleProviderFromEnv("openrouter", "fallback")).toMatchObject({ model: "some/free-model" });
    // If only the backup is set up, the chat still works with it.
    delete process.env.AI_API_KEY;
    expect(getAiProvider()).toMatchObject({ name: "openrouter", model: "some/free-model" });
  });
});
