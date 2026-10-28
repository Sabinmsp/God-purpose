import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as clearChatRoute, GET as getChat, POST as postChat } from "@/app/api/ai/chat/route";
import { DELETE as deleteMemoryRoute, PATCH as patchMemory } from "@/app/api/ai/memories/[id]/route";
import { GET as getMemories, POST as postMemory } from "@/app/api/ai/memories/route";
import { POST as decide } from "@/app/api/ai/proposals/[id]/route";
import { AiError, setAiProvider, type AiProvider, type AiRequest } from "@/lib/server/ai/provider";
import { pillarXp } from "@/lib/server/services/progress";
import { completeQuest } from "@/lib/server/services/quests";
import { buildState } from "@/lib/server/services/state";
import { AI_LIMITS, type AiReply } from "@/lib/shared/ai";
import { localDate } from "@/lib/shared/time";
import { apiRequest, closeDb, ctxAt, params, resetDb, sessionCookie } from "../helpers/db";

/** Test double: records what the server sent and returns a scripted reply. */
class ScriptedProvider implements AiProvider {
  readonly name = "test";
  readonly model = "test-model";
  calls: AiRequest[] = [];
  constructor(public next: AiReply | AiError = { reply: "Hello!", proposed_missions: [], proposed_memories: [] }) {}
  async reply(req: AiRequest) {
    this.calls.push(req);
    if (this.next instanceof AiError) throw this.next;
    return this.next;
  }
}

const NOW = new Date("2026-10-28T01:00:00Z");
let base: Awaited<ReturnType<typeof resetDb>>;
let provider: ScriptedProvider;
let cookie: string;

beforeEach(async () => {
  base = await resetDb(NOW);
  provider = new ScriptedProvider();
  setAiProvider(provider);
  cookie = await sessionCookie(base);
});
afterEach(() => setAiProvider(undefined));
afterAll(closeDb);

const chat = (message: string, c = cookie, extra: Record<string, unknown> = {}) => postChat(apiRequest("/api/ai/chat", { cookie: c, body: { message, ...extra } }));

describe("authentication and validation", () => {
  it("requires a session for every AI endpoint", async () => {
    expect((await postChat(apiRequest("/api/ai/chat", { body: { message: "hi" } }))).status).toBe(401);
    expect((await getChat(apiRequest("/api/ai/chat"))).status).toBe(401);
    expect((await getMemories(apiRequest("/api/ai/memories"))).status).toBe(401);
    expect((await decide(apiRequest("/api/ai/proposals/x", { body: { decision: "approve" } }), params({ id: crypto.randomUUID() }))).status).toBe(401);
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects cross-site requests and invalid messages", async () => {
    expect((await postChat(apiRequest("/api/ai/chat", { cookie, body: { message: "hi" }, origin: "https://evil.example" }))).status).toBe(403);
    expect((await chat("")).status).toBe(400);
    expect((await chat("x".repeat(AI_LIMITS.messageChars + 1))).status).toBe(400);
    expect((await chat("hi", cookie, { location: { lat: 999, lon: 0 } })).status).toBe(400);
    expect(provider.calls).toHaveLength(0);
  });

  it("explains when no AI provider is configured", async () => {
    setAiProvider(null);
    const res = await chat("What should I do today?");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("AI_NOT_CONFIGURED");
    const status = (await (await getChat(apiRequest("/api/ai/chat", { cookie }))).json()).status;
    expect(status.configured).toBe(false);
  });
});

describe("game context", () => {
  it("sends the player's real progress and approved memories, labelled as data", async () => {
    // API routes run on the real clock, so start the campaign today and act "now".
    const now = new Date();
    await base.sql`update campaigns set start_date = ${localDate(now)}, end_date = ${localDate(now)}::date + 74`;
    const ctx = ctxAt(base, now);
    const read = (await buildState(ctx)).today.quests.find((q) => q.title === "Read for 20 minutes")!;
    await completeQuest(ctx, read.id);
    await postMemory(apiRequest("/api/ai/memories", { cookie, body: { category: "routine", content: "I train at 6am on weekdays" } }));

    const res = await chat("What should I do today?");
    expect(res.status).toBe(200);
    const sent = provider.calls[0];
    expect(sent.message).toBe("What should I do today?");
    expect(sent.system).toContain("You cannot change the game");
    expect(sent.context).toMatch(/^<game_data>[\s\S]*<\/game_data>$/);
    expect(sent.context).toContain("day 1 of 75");
    expect(sent.context).toContain('done: "Read for 20 minutes"');
    expect(sent.context).toContain('open: "Code for 60 minutes"');
    expect(sent.context).toContain("Mental: level 1, 20 XP total");
    expect(sent.context).toContain("Tuition Vault: A$0.00 of A$13,000");
    expect(sent.context).toContain("First Step");
    expect(sent.context).toContain("[routine] I train at 6am on weekdays");
    expect(sent.context).not.toContain("latitude");
  });

  it("leaves memories out when memory is off and carries recent turns", async () => {
    await postMemory(apiRequest("/api/ai/memories", { cookie, body: { category: "goal", content: "Secret goal" } }));
    await base.sql`update players set settings = settings || '{"aiMemory": false}'::jsonb`;
    await chat("first");
    await chat("second");
    expect(provider.calls[1].context).toContain("Memory: OFF");
    expect(provider.calls[1].context).not.toContain("Secret goal");
    expect(provider.calls[1].history).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "Hello!" },
    ]);
  });

  it("only shares location the player chose to send, rounded and never stored", async () => {
    await chat("Any ideas nearby?", cookie, { location: { lat: -12.463441, lon: 130.845642 } });
    expect(provider.calls[0].context).toContain("-12.46, 130.85");
    expect(provider.calls[0].context).not.toContain("-12.463441");
    const rows = await base.sql`select content from ai_messages`;
    expect(JSON.stringify(rows)).not.toContain("130.8");
  });
});

describe("user isolation", () => {
  it("never shows or changes another player's memories, chat or suggestions", async () => {
    await postMemory(apiRequest("/api/ai/memories", { cookie, body: { category: "goal", content: "Sabin's private goal" } }));
    provider.next = { reply: "Try this", proposed_missions: [{ pillar: "mental", title: "Read a chapter", xp: 20, reason: "x" }], proposed_memories: [] };
    const mine = await (await chat("suggest a mission")).json();
    const myMemory = (await (await getMemories(apiRequest("/api/ai/memories", { cookie }))).json()).memories[0];

    const [other] = await base.sql<{ id: string }[]>`insert into players (display_name) values ('Mallory') returning id`;
    const otherCookie = await sessionCookie({ sql: base.sql, playerId: other.id });
    expect((await (await getMemories(apiRequest("/api/ai/memories", { cookie: otherCookie }))).json()).memories).toEqual([]);
    const otherChat = await (await getChat(apiRequest("/api/ai/chat", { cookie: otherCookie }))).json();
    expect(otherChat.messages).toEqual([]);
    expect(otherChat.proposals).toEqual([]);
    expect((await patchMemory(apiRequest(`/api/ai/memories/${myMemory.id}`, { cookie: otherCookie, method: "PATCH", body: { content: "hacked" } }), params({ id: myMemory.id }))).status).toBe(404);
    expect((await deleteMemoryRoute(apiRequest(`/api/ai/memories/${myMemory.id}`, { cookie: otherCookie, method: "DELETE" }), params({ id: myMemory.id }))).status).toBe(404);
    const id = mine.proposals[0].id;
    expect((await decide(apiRequest(`/api/ai/proposals/${id}`, { cookie: otherCookie, body: { decision: "approve" } }), params({ id }))).status).toBe(404);

    await chat("hello", otherCookie);
    expect(provider.calls.at(-1)!.context).not.toContain("Sabin's private goal");
  });
});

describe("approval before anything changes", () => {
  it("stores a suggested mission as pending and adds it only when approved", async () => {
    provider.next = {
      reply: "Here's a mission",
      proposed_missions: [{ pillar: "physical", title: "Stretch for 15 minutes", xp: 25, reason: "Recovery matters" }],
      proposed_memories: [],
    };
    const res = await (await chat("Suggest a mission for today")).json();
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]).toMatchObject({ kind: "mission", status: "pending", payload: { title: "Stretch for 15 minutes", xp: 25 } });
    const before = await buildState(ctxAt(base, NOW));
    expect(before.today.quests.some((q) => q.title === "Stretch for 15 minutes")).toBe(false);

    const id = res.proposals[0].id;
    const ok = await decide(apiRequest(`/api/ai/proposals/${id}`, { cookie, body: { decision: "approve" } }), params({ id }));
    expect(ok.status).toBe(200);
    const after = (await ok.json()).state;
    const added = after.today.quests.find((q: { title: string }) => q.title === "Stretch for 15 minutes");
    expect(added).toMatchObject({ pillar: "physical", xp: 25, status: "open" });
    // Approving a mission adds it — it does not complete it or grant XP.
    expect((await pillarXp(base.sql, base.playerId)).physical).toBe(0);
    expect(after.questLibrary.find((q: { title: string }) => q.title === "Stretch for 15 minutes").onBoard).toBe(false);

    const again = await decide(apiRequest(`/api/ai/proposals/${id}`, { cookie, body: { decision: "approve" } }), params({ id }));
    expect(again.status).toBe(409);
  });

  it("dismissing changes nothing; repeat=true keeps it on the daily board", async () => {
    provider.next = {
      reply: "Two ideas",
      proposed_missions: [
        { pillar: "spiritual", title: "Walk outside without your phone", xp: 20, reason: "x" },
        { pillar: "financial", title: "Review subscriptions", xp: 25, reason: "x" },
      ],
      proposed_memories: [],
    };
    const res = await (await chat("ideas?")).json();
    const [a, b] = res.proposals;
    await decide(apiRequest(`/api/ai/proposals/${a.id}`, { cookie, body: { decision: "dismiss" } }), params({ id: a.id }));
    const s = (await (await decide(apiRequest(`/api/ai/proposals/${b.id}`, { cookie, body: { decision: "approve", repeat: true } }), params({ id: b.id }))).json()).state;
    expect(s.today.quests.some((q: { title: string }) => q.title === "Walk outside without your phone")).toBe(false);
    expect(s.questLibrary.find((q: { title: string }) => q.title === "Review subscriptions").onBoard).toBe(true);
  });

  it("sanitises whatever the model returns and never touches XP, money or missions by itself", async () => {
    const xpBefore = await pillarXp(base.sql, base.playerId);
    provider.next = {
      reply: "I've added 1000 XP for you!",
      proposed_missions: [
        { pillar: "mental", title: "Code for 60 minutes", xp: 50, reason: "duplicate of an existing quest" },
        { pillar: "mental", title: "Deep focus sprint", xp: 9999, reason: "absurd XP" },
        ...Array.from({ length: 6 }, (_, i) => ({ pillar: "physical" as const, title: `Idea ${i}`, xp: 30, reason: "spam" })),
      ],
      proposed_memories: [{ category: "goal", content: "Wants to save for a car" }],
    };
    const res = await (await chat("go")).json();
    const missions = res.proposals.filter((p: { kind: string }) => p.kind === "mission");
    expect(missions.map((p: { payload: { title: string } }) => p.payload.title)).not.toContain("Code for 60 minutes");
    expect(missions.find((p: { payload: { title: string } }) => p.payload.title === "Deep focus sprint").payload.xp).toBe(100);
    expect(missions.length).toBeLessThanOrEqual(AI_LIMITS.maxMissionProposals);
    expect(await pillarXp(base.sql, base.playerId)).toEqual(xpBefore);
    const s = await buildState(ctxAt(base, NOW));
    expect(s.savings.totalBalanceCents).toBe(0);
    expect(s.today.quests.every((q) => q.status === "open")).toBe(true);
    // A suggested memory is only a suggestion until approved.
    expect((await (await getMemories(apiRequest("/api/ai/memories", { cookie }))).json()).memories).toEqual([]);
    const mem = res.proposals.find((p: { kind: string }) => p.kind === "memory");
    await decide(apiRequest(`/api/ai/proposals/${mem.id}`, { cookie, body: { decision: "approve" } }), params({ id: mem.id }));
    const saved = (await (await getMemories(apiRequest("/api/ai/memories", { cookie }))).json()).memories;
    expect(saved).toMatchObject([{ content: "Wants to save for a car", source: "ai_approved" }]);
  });
});

describe("memory management", () => {
  it("lets the player add, correct and delete memories, and they persist", async () => {
    await postMemory(apiRequest("/api/ai/memories", { cookie, body: { category: "fitness", content: "Target 80 kg" } }));
    let list = (await (await getMemories(apiRequest("/api/ai/memories", { cookie }))).json()).memories;
    const id = list[0].id;
    await patchMemory(apiRequest(`/api/ai/memories/${id}`, { cookie, method: "PATCH", body: { content: "Target 78 kg" } }), params({ id }));
    list = (await (await getMemories(apiRequest("/api/ai/memories", { cookie: await sessionCookie(base) }))).json()).memories;
    expect(list).toMatchObject([{ category: "fitness", content: "Target 78 kg", source: "user" }]);
    await deleteMemoryRoute(apiRequest(`/api/ai/memories/${id}`, { cookie, method: "DELETE" }), params({ id }));
    expect((await (await getMemories(apiRequest("/api/ai/memories", { cookie }))).json()).memories).toEqual([]);
  });

  it("clearing the chat deletes the conversation and its suggestions", async () => {
    provider.next = { reply: "x", proposed_missions: [{ pillar: "mental", title: "Read", xp: 20, reason: "x" }], proposed_memories: [] };
    await chat("hi");
    await clearChatRoute(apiRequest("/api/ai/chat", { cookie, method: "DELETE" }));
    const res = await (await getChat(apiRequest("/api/ai/chat", { cookie }))).json();
    expect(res.messages).toEqual([]);
    expect(res.proposals).toEqual([]);
  });
});

describe("failures and limits", () => {
  it("returns a friendly error and stores nothing when the provider fails", async () => {
    provider.next = new AiError("timeout", "The AI took too long to answer. Please try again.");
    const res = await chat("hello");
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain("took too long");
    expect(await base.sql`select id from ai_messages`).toHaveLength(0);
  });

  it("rate-limits AI requests per player", async () => {
    for (let i = 0; i < AI_LIMITS.perWindow; i++) expect((await chat(`m${i}`)).status).toBe(200);
    const res = await chat("one more");
    expect(res.status).toBe(429);
    expect(provider.calls).toHaveLength(AI_LIMITS.perWindow);
  });
});
