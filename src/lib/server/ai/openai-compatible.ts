import "server-only";
import { z } from "zod";
import { MEMORY_CATEGORIES, type AiReply } from "@/lib/shared/ai";
import { PILLARS } from "@/lib/shared/pillars";
import { AiError, type AiProvider, type AiRequest } from "./provider";

/**
 * Open-weight models served behind the OpenAI chat-completions wire format:
 * hosted free tiers (Groq, OpenRouter) or a model on your own machine (Ollama).
 * These endpoints differ in how well they enforce a JSON schema, so the reply
 * is requested as JSON, read leniently, and anything malformed is dropped
 * rather than failing the whole message.
 */

export const COMPATIBLE_PRESETS: Record<string, { baseUrl: string; model: string | null; keyEnv: string | null }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyEnv: "GROQ_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free", keyEnv: "OPENROUTER_API_KEY" },
  // Runs on your own computer: no key, no cost, nothing leaves the machine.
  ollama: { baseUrl: "http://localhost:11434/v1", model: null, keyEnv: null },
  "openai-compatible": { baseUrl: "", model: null, keyEnv: null },
};

/** Free tiers cap tokens per minute, so the conversation sent along is kept short. */
const HISTORY_TURNS = 6;
const MAX_REPLY_TOKENS = 1500;

const JSON_INSTRUCTIONS = `

Output format (required):
Reply with one JSON object and nothing else, no markdown fences, in exactly this shape:
{"reply": string, "proposed_missions": [{"pillar": ${PILLARS.map((p) => `"${p}"`).join(" | ")}, "title": string, "xp": number, "reason": string}], "proposed_memories": [{"category": ${MEMORY_CATEGORIES.map((c) => `"${c}"`).join(" | ")}, "content": string}]}
"reply" is the plain-text message shown to the player. Use empty arrays when you are not proposing missions or memories.`;

const missionSchema = z.object({ pillar: z.enum(PILLARS), title: z.string().min(1), xp: z.coerce.number().int(), reason: z.string().default("") });
const memorySchema = z.object({ category: z.enum(MEMORY_CATEGORIES), content: z.string().min(1) });

/** Keeps every well-formed item and drops the rest. */
function keepValid<T>(schema: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Turns whatever the model wrote into a reply; plain prose becomes a reply with no proposals. */
export function readCompatibleReply(raw: string): AiReply | null {
  // Some reasoning models print their scratch work in <think> tags before the answer.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      if (typeof obj.reply === "string" && obj.reply.trim()) {
        return {
          reply: obj.reply.trim(),
          proposed_missions: keepValid(missionSchema, obj.proposed_missions),
          proposed_memories: keepValid(memorySchema, obj.proposed_memories),
        };
      }
    } catch {
      /* not JSON after all: fall through and show the text */
    }
  }
  // A JSON-looking answer we couldn't read is not something to show the player.
  return text.startsWith("{") ? null : { reply: text, proposed_missions: [], proposed_memories: [] };
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    readonly name: string,
    private baseUrl: string,
    readonly model: string,
    private apiKey: string | null,
  ) {}

  async reply(req: AiRequest): Promise<AiReply> {
    const recent = req.history.slice(-HISTORY_TURNS);
    const firstUser = recent.findIndex((t) => t.role === "user");
    const body = {
      model: this.model,
      max_tokens: MAX_REPLY_TOKENS,
      messages: [
        { role: "system", content: req.system + JSON_INSTRUCTIONS },
        ...(firstUser >= 0 ? recent.slice(firstUser) : []),
        { role: "user", content: `${req.context}\n\n${req.message}` },
      ],
    };
    // Not every server accepts JSON mode; when one rejects the request, ask again without it.
    let res = await this.post({ ...body, response_format: { type: "json_object" } });
    if (res.status === 400) res = await this.post(body);
    if (!res.ok) throw await this.failure(res);

    let content: unknown;
    try {
      content = ((await res.json()) as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
    } catch {
      content = null;
    }
    const reply = typeof content === "string" ? readCompatibleReply(content) : null;
    if (!reply) throw new AiError("bad_output", "The AI's answer couldn't be read. Please try again.");
    return reply;
  }

  private async post(body: unknown): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") throw new AiError("timeout", "The AI took too long to answer. Please try again.");
      console.error("[ai] could not reach", this.name, err instanceof Error ? err.message : err);
      throw new AiError("unavailable", this.name === "ollama" ? "Couldn't reach Ollama. Is it running on this computer?" : "Couldn't reach the AI service. Check your connection and try again.");
    }
  }

  private async failure(res: Response): Promise<AiError> {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error("[ai] provider error", this.name, res.status, detail);
    if (res.status === 401 || res.status === 403) return new AiError("auth", "The AI provider rejected the server's key. Check AI_API_KEY.");
    // 413 is how free tiers report a request larger than the per-minute token allowance.
    if (res.status === 429 || res.status === 413) return new AiError("rate_limited", "The free AI has hit its limit for now. Wait a minute and try again.");
    if (res.status === 404) return new AiError("unavailable", `The AI service doesn't know the model "${this.model}". Check AI_MODEL.`);
    return new AiError("unavailable", "The AI service had a problem. Please try again shortly.");
  }
}

/** Builds the provider from server-only environment variables, or null when it isn't fully configured. */
export function compatibleProviderFromEnv(name: string): AiProvider | null {
  const preset = COMPATIBLE_PRESETS[name];
  if (!preset) return null;
  const baseUrl = process.env.AI_BASE_URL || preset.baseUrl;
  const model = process.env.AI_MODEL || preset.model;
  const apiKey = process.env.AI_API_KEY || (preset.keyEnv ? process.env[preset.keyEnv] : undefined) || null;
  if (!baseUrl || !model) return null;
  // Hosted services need a key; a model on your own machine does not.
  if (preset.keyEnv && !apiKey) return null;
  return new OpenAiCompatibleProvider(name, baseUrl, model, apiKey);
}
