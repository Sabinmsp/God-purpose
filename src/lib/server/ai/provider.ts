import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiReplySchema, type AiReply } from "@/lib/shared/ai";

export interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  /** Stable instructions (cached). */
  system: string;
  /** Earlier turns, oldest first. */
  history: AiTurn[];
  /** Fresh game data for this turn, labelled as data. */
  context: string;
  message: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  reply(req: AiRequest): Promise<AiReply>;
}

export type AiErrorKind = "unavailable" | "rate_limited" | "refused" | "bad_output" | "auth" | "timeout";

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Models that accept the server-side refusal fallback in its "default" form. */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/** Claude through the official Anthropic SDK, with a schema-validated reply. */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(
    private client: Anthropic,
    readonly model: string,
    private effort: Effort,
  ) {}

  async reply(req: AiRequest): Promise<AiReply> {
    const fallback = FALLBACK_MODELS.has(this.model);
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        output_config: { effort: this.effort, format: betaZodOutputFormat(aiReplySchema) },
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [
          ...req.history.map((t) => ({ role: t.role, content: t.content })),
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: req.context },
              { type: "text" as const, text: req.message },
            ],
          },
        ],
      });
      if (res.stop_reason === "refusal") {
        throw new AiError("refused", "The AI declined to answer that. Try rephrasing your question.");
      }
      if (!res.parsed_output) {
        throw new AiError("bad_output", res.stop_reason === "max_tokens" ? "The answer was too long — try a narrower question." : "The AI's answer couldn't be read. Please try again.");
      }
      return res.parsed_output;
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AiError("auth", "The AI provider rejected the server's credentials. Check ANTHROPIC_API_KEY.");
      }
      if (err instanceof Anthropic.RateLimitError) throw new AiError("rate_limited", "The AI is busy right now. Please try again in a minute.");
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("timeout", "The AI took too long to answer. Please try again.");
      if (err instanceof Anthropic.APIConnectionError) throw new AiError("unavailable", "Couldn't reach the AI service. Check your connection and try again.");
      if (err instanceof Anthropic.APIError) {
        console.error("[ai] provider error", err.status, err.message);
        throw new AiError("unavailable", "The AI service had a problem. Please try again shortly.");
      }
      console.error("[ai] unexpected error", err);
      throw new AiError("unavailable", "Something went wrong talking to the AI.");
    }
  }
}

let override: AiProvider | null | undefined;

/** Tests inject a provider here; `undefined` restores the configured one. */
export function setAiProvider(provider: AiProvider | null | undefined) {
  override = provider;
}

/**
 * The configured provider, or null when no credentials are set. Everything is
 * read from server-only environment variables:
 *   AI_PROVIDER        anthropic (default)
 *   ANTHROPIC_API_KEY  required for anthropic
 *   AI_MODEL           default claude-opus-5-5
 *   AI_EFFORT          low | medium (default) | high | xhigh | max
 */
export function getAiProvider(): AiProvider | null {
  if (override !== undefined) return override;
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider !== "anthropic") return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const effortEnv = (process.env.AI_EFFORT ?? "medium") as Effort;
  const effort = EFFORTS.includes(effortEnv) ? effortEnv : "medium";
  return new AnthropicProvider(new Anthropic({ timeout: 90_000, maxRetries: 1 }), process.env.AI_MODEL || "claude-opus-5-5", effort);
}

export function configuredProviderName() {
  return (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
}
