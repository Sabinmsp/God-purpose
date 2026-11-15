import { z } from "zod";
import { PILLARS, type Pillar } from "./pillars";
import { ALLOWED_QUEST_XP } from "./progression";

export const MEMORY_CATEGORIES = ["goal", "routine", "preference", "career", "fitness", "financial", "deadline", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_LABELS: Record<MemoryCategory, string> = {
  goal: "Personal goal",
  routine: "Routine",
  preference: "Preference",
  career: "Career",
  fitness: "Fitness target",
  financial: "Financial target",
  deadline: "Deadline",
  other: "Other",
};

/** Starting points for the Coach tab; the player can edit them freely. */
export const COACH_PRESETS = [
  {
    label: "Strict coach",
    text: "Be a strict coach. Hold me accountable with my records every time. If I didn't log it, say I didn't do it. No excuses, no sugar-coating, short sentences. Push me to do the hard thing first.",
  },
  {
    label: "Kind mentor",
    text: "Be a kind, patient mentor. I get discouraged easily, so notice small wins first, then tell me honestly what to fix. Explain why each step matters.",
  },
  {
    label: "Short and direct",
    text: "Keep every answer under 5 lines. Tell me the single most important thing to do next and nothing else unless I ask.",
  },
  {
    label: "Job-hunt focus",
    text: "My number one priority is getting a job. Connect every answer to that. Each day give me at least one job-hunt action and ask me how many applications I sent.",
  },
] as const;

export const SUGGESTED_QUESTIONS = [
  "What should I focus on today?",
  "Why am I not progressing? Be honest and use my records.",
  "I have no job and no money. Help me start.",
  "Give me one thing I can do in the next hour to get closer to a job.",
  "Make me a 7-day plan to find work.",
  "What skills can I learn for free that employers pay for?",
  "How can I earn some money this week?",
  "Help me improve my CV. Ask me what you need.",
  "I feel stuck and unmotivated. What is the smallest step?",
  "How am I progressing?",
  "Help me plan tomorrow.",
  "Review my Four Wins.",
  "Suggest a mission for today.",
] as const;

export const AI_LIMITS = {
  messageChars: 2000,
  /** The player's own "how my coach should act" instructions. */
  coachChars: 1500,
  memoryChars: 300,
  /** Requests per player per window (spend and abuse protection). */
  perWindow: 20,
  windowMs: 10 * 60 * 1000,
  perDay: 150,
  historyTurns: 12,
  maxMissionProposals: 4,
  maxMemoryProposals: 3,
};

// ── Request bodies ────────────────────────────────────────────────────────

/** Approximate location, sent only on messages where the player ticked "share". */
export const approxLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const aiChatSchema = z.object({
  message: z.string().trim().min(1).max(AI_LIMITS.messageChars),
  location: approxLocationSchema.nullable().optional(),
});

export const memoryInputSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().trim().min(1).max(AI_LIMITS.memoryChars),
});

export const memoryPatchSchema = memoryInputSchema.partial().refine((m) => m.category || m.content, "Nothing to update");

export const proposalDecisionSchema = z.object({
  decision: z.enum(["approve", "dismiss"]),
  /** Missions only: also keep it on the daily board (default: today only). */
  repeat: z.boolean().default(false),
});

// ── What the model must return (structured output) ────────────────────────

export const aiReplySchema = z.object({
  reply: z.string().describe("The message shown to the player. Plain text, short paragraphs or simple lists."),
  proposed_missions: z
    .array(
      z.object({
        pillar: z.enum(PILLARS),
        title: z.string().describe("Concrete, doable action, under 80 characters."),
        xp: z.number().int().describe(`One of ${ALLOWED_QUEST_XP.join(", ")} — larger for harder tasks.`),
        reason: z.string().describe("One sentence on why this helps, based on the player's data."),
      }),
    )
    .describe("Missions to offer as approval cards. Empty unless suggesting specific new missions helps."),
  proposed_memories: z
    .array(
      z.object({
        category: z.enum(MEMORY_CATEGORIES),
        content: z.string().describe("A durable fact the player stated explicitly in this conversation."),
      }),
    )
    .describe("Facts the player explicitly told you that are worth remembering. Never your own guesses."),
});
export type AiReply = z.infer<typeof aiReplySchema>;

// ── API views ─────────────────────────────────────────────────────────────

export interface AiMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface MissionProposal {
  pillar: Pillar;
  title: string;
  xp: number;
  reason: string;
}

export interface MemoryProposal {
  category: MemoryCategory;
  content: string;
}

export type AiProposalView =
  | { id: string; messageId: string | null; kind: "mission"; payload: MissionProposal; status: "pending" | "approved" | "dismissed" }
  | { id: string; messageId: string | null; kind: "memory"; payload: MemoryProposal; status: "pending" | "approved" | "dismissed" };

export interface AiMemoryView {
  id: string;
  category: MemoryCategory;
  content: string;
  source: "user" | "ai_approved";
  updatedAt: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  memoryEnabled: boolean;
  remainingToday: number;
}

/** Rounds coordinates to ~1 km before they can leave the browser. */
export function approximate(lat: number, lon: number) {
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}
