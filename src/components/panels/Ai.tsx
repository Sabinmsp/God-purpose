"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/client/api";
import { useGame, useGameState } from "@/client/store";
import { aiBot } from "@/game/art/companion";
import { play } from "@/game/audio";
import {
  AI_LIMITS,
  MEMORY_CATEGORIES,
  MEMORY_LABELS,
  SUGGESTED_QUESTIONS,
  approximate,
  type AiMemoryView,
  type AiMessageView,
  type AiProposalView,
  type AiStatus,
  type MemoryCategory,
} from "@/lib/shared/ai";
import { getLocation, setLocation, useLocation } from "@/client/location";
import { checkLocation, LocationError, permissionState } from "@/lib/location/geolocation";
import { PLACE_LABELS } from "@/lib/location/places";
import { dailyBrief } from "@/lib/shared/brief";
import { PILLAR_META } from "@/lib/shared/pillars";
import { localDate } from "@/lib/shared/time";
import type { GameEvent, GameState } from "@/lib/shared/types";
import { Empty, Field, Section, Sheet, Tabs, useBusy } from "../ui";
import { PixelArt } from "./common";

const drawBot = () => aiBot(0);

export function BotAvatar({ size = 1.5 }: { size?: number }) {
  return (
    <div className="shrink-0 rounded bg-navy-950 p-0.5">
      <PixelArt draw={drawBot} scale={size} label="Four Wins AI" />
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-sm text-cream-dim" role="status" aria-live="polite" data-testid="ai-thinking">
      <BotAvatar size={1} />
      <span className="font-pixel">Four Wins AI is thinking</span>
      <span className="ai-dots" aria-hidden>
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
}

/** Today's opening card: computed from your records, not written by the model. */
function DailyBriefCard() {
  const s = useGameState();
  const b = dailyBrief(s);
  const names = (ps: typeof b.wonToday) => {
    const n = ps.map((p) => PILLAR_META[p].name);
    return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n.join("");
  };
  return (
    <div className="flex gap-2" data-testid="ai-brief">
      <BotAvatar />
      <div className="px-card min-w-0 flex-1 space-y-2 px-3 py-2.5 text-sm leading-snug">
        <p>
          {b.greeting} 👋
          {b.journey && (
            <>
              <br />
              {b.journey}
            </>
          )}
        </p>
        {b.yesterday && (
          <div>
            {b.yesterday.length ? (
              <>
                <p>Yesterday you won:</p>
                <ul className="mt-0.5">
                  {b.yesterday.map((p) => (
                    <li key={p}>
                      <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded-sm bg-forest-light text-[10px] text-white">✓</span>
                      {PILLAR_META[p].name} Win
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-cream-dim">Yesterday: no wins logged. Today is a fresh start.</p>
            )}
          </div>
        )}
        <p>
          {b.wonToday.length === 4
            ? "All four pillars are won today — Four Wins! 🏮"
            : b.openToday.length
              ? `${names(b.openToday)} ${b.openToday.length === 1 ? "is" : "are"} still open today.`
              : b.wonToday.length
                ? `${names(b.wonToday)} won today.`
                : "No missions on today's board yet."}
        </p>
        {b.focus.length > 0 && (
          <div>
            <p className="font-pixel text-[#5ff0e0]">🎯 Today&apos;s focus:</p>
            <ul className="ml-4 list-disc">
              {b.focus.map((f) => (
                <li key={f.pillar}>
                  {f.title} <span style={{ color: PILLAR_META[f.pillar].color }}>+{f.xp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-cream-faint">Daily brief · from your records</p>
      </div>
    </div>
  );
}

function ProposalCard({ p, onDecide }: { p: AiProposalView; onDecide: (p: AiProposalView, decision: "approve" | "dismiss", repeat?: boolean) => Promise<void> }) {
  const { busy, run } = useBusy();
  const decided = p.status !== "pending";
  if (p.kind === "mission") {
    const m = PILLAR_META[p.payload.pillar];
    return (
      <div className="px-card mt-2 p-2.5" style={{ boxShadow: `inset 3px 0 0 ${m.color}` }} data-testid="ai-mission-proposal">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-pixel text-[11px]" style={{ color: m.color }}>
              {m.icon} SUGGESTED {m.name.toUpperCase()} MISSION
            </div>
            <div className="leading-tight">{p.payload.title}</div>
            {p.payload.reason && <div className="mt-0.5 text-xs text-cream-faint">{p.payload.reason}</div>}
          </div>
          <span className="font-pixel shrink-0 text-xs" style={{ color: m.color }}>
            +{p.payload.xp} XP
          </span>
        </div>
        {decided ? (
          <p className="font-pixel mt-2 text-xs text-cream-dim">{p.status === "approved" ? "✓ Added to your quests" : "Dismissed"}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="px-btn small" disabled={busy} onClick={() => run(() => onDecide(p, "approve", false))}>
              Add to today
            </button>
            <button className="px-btn secondary small" disabled={busy} onClick={() => run(() => onDecide(p, "approve", true))}>
              Add as daily quest
            </button>
            <button className="px-ghost text-xs" disabled={busy} onClick={() => run(() => onDecide(p, "dismiss"))}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="px-card mt-2 p-2.5" style={{ boxShadow: "inset 3px 0 0 #5ff0e0" }} data-testid="ai-memory-proposal">
      <div className="font-pixel text-[11px] text-[#5ff0e0]">REMEMBER THIS? · {MEMORY_LABELS[p.payload.category].toUpperCase()}</div>
      <div className="leading-tight">{p.payload.content}</div>
      {decided ? (
        <p className="font-pixel mt-2 text-xs text-cream-dim">{p.status === "approved" ? "✓ Saved to memory" : "Not saved"}</p>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <button className="px-btn small" disabled={busy} onClick={() => run(() => onDecide(p, "approve"))}>
            Save memory
          </button>
          <button className="px-ghost text-xs" disabled={busy} onClick={() => run(() => onDecide(p, "dismiss"))}>
            Don&apos;t save
          </button>
        </div>
      )}
    </div>
  );
}

function Message({
  m,
  proposals,
  onDecide,
}: {
  m: AiMessageView;
  proposals: AiProposalView[];
  onDecide: (p: AiProposalView, decision: "approve" | "dismiss", repeat?: boolean) => Promise<void>;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded border-2 border-[#04061a] bg-navy-700 px-3 py-2 text-sm" data-testid="ai-user-message">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <BotAvatar />
      <div className="min-w-0 max-w-[90%]">
        <div className="px-card whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed" data-testid="ai-reply">
          {m.content}
        </div>
        {proposals
          .filter((p) => p.messageId === m.id)
          .map((p) => (
            <ProposalCard key={p.id} p={p} onDecide={onDecide} />
          ))}
      </div>
    </div>
  );
}

function ChatTab({
  status,
  messages,
  proposals,
  setMessages,
  setProposals,
  setStatus,
  onDecide,
  onClear,
}: {
  status: AiStatus | null;
  messages: AiMessageView[];
  proposals: AiProposalView[];
  setMessages: (fn: (m: AiMessageView[]) => AiMessageView[]) => void;
  setProposals: (fn: (p: AiProposalView[]) => AiProposalView[]) => void;
  setStatus: (s: AiStatus) => void;
  onDecide: (p: AiProposalView, decision: "approve" | "dismiss", repeat?: boolean) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const s = useGameState();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; text: string } | null>(null);
  const [shareLocation, setShareLocation] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const canShare = s.player.settings.locationAwareness && location !== null;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending, proposals.length]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setPending(message);
    setError(null);
    setDraft("");
    try {
      const here = getLocation();
      const res = await api<{ messages: AiMessageView[]; proposals: AiProposalView[]; status: AiStatus }>("/api/ai/chat", {
        body: { message, location: shareLocation && here ? approximate(here.lat, here.lon) : null },
      });
      setMessages((m) => [...m, ...res.messages]);
      setProposals((p) => [...res.proposals, ...p]);
      setStatus(res.status);
      play("xp");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return window.location.replace("/login");
      setError({ message: err instanceof Error ? err.message : "Something went wrong.", text: message });
      setDraft(message);
      play("error");
    } finally {
      setPending(null);
    }
  };

  if (status && !status.configured) {
    return (
      <div className="space-y-3">
        <DailyBriefCard />
        <div className="px-card p-4" data-testid="ai-not-configured">
          <p className="font-pixel mb-1 text-gold">💤 Chat is sleeping</p>
          <p className="text-sm text-cream-dim">
            The AI companion needs an AI key on the server before it can chat. Add <code className="text-cream">ANTHROPIC_API_KEY</code> to the server environment (for local
            development, in <code className="text-cream">.env.local</code>) and restart the game. Keys stay on the server and are never sent to your browser.
          </p>
          <p className="mt-2 text-sm text-cream-dim">Until then, The Guide in the plaza can still answer questions from your records.</p>
        </div>
      </div>
    );
  }

  // Today's brief sits where today's conversation begins.
  const firstToday = messages.findIndex((m) => localDate(new Date(m.createdAt)) === s.now.date);
  const briefAt = firstToday === -1 ? messages.length : firstToday;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-3" aria-live="polite" data-testid="ai-messages">
        {messages.slice(0, briefAt).map((m) => (
          <Message key={m.id} m={m} proposals={proposals} onDecide={onDecide} />
        ))}
        <DailyBriefCard />
        {messages.slice(briefAt).map((m) => (
          <Message key={m.id} m={m} proposals={proposals} onDecide={onDecide} />
        ))}
        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded border-2 border-[#04061a] bg-navy-700 px-3 py-2 text-sm opacity-70">{pending}</div>
            </div>
            <Thinking />
          </>
        )}
        {error && (
          <div className="px-card border-l-4 !border-l-[var(--danger)] p-3 text-sm" role="alert" data-testid="ai-error">
            <p>{error.message}</p>
            <button className="px-btn secondary small mt-2" onClick={() => send(error.text)}>
              ↻ Retry
            </button>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 mt-3 bg-navy-900 pt-2">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} className="px-btn secondary small shrink-0" disabled={Boolean(pending)} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label className="sr-only" htmlFor="ai-input">
            Message Four Wins AI
          </label>
          <textarea
            id="ai-input"
            className="px-input max-h-32 min-h-11 flex-1 resize-none"
            rows={1}
            value={draft}
            maxLength={AI_LIMITS.messageChars}
            placeholder="Ask about your day, your progress, or a plan…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button className="px-btn !h-11" disabled={!draft.trim() || Boolean(pending)} aria-label="Send message">
            Send ▸
          </button>
        </form>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-cream-faint">
          {canShare ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} /> Include my approximate location (±1 km) in this message
            </label>
          ) : (
            <span>{status ? `${status.remainingToday} messages left today` : ""}</span>
          )}
          {messages.length > 0 && (
            <button className="px-ghost text-[11px]" onClick={() => confirm("Delete this conversation? Saved memories are kept.") && void onClear()}>
              Clear conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoryTab({ memories, setMemories }: { memories: AiMemoryView[]; setMemories: (m: AiMemoryView[]) => void }) {
  const s = useGameState();
  const { act, toast } = useGame();
  const { busy, run } = useBusy();
  const [category, setCategory] = useState<MemoryCategory>("goal");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const enabled = s.player.settings.aiMemory;

  const call = (path: string, method: string, body?: unknown) =>
    run(async () => {
      try {
        const res = await api<{ memories: AiMemoryView[] }>(path, { method, body });
        setMemories(res.memories);
        return true;
      } catch (err) {
        toast({ kind: "error", title: err instanceof Error ? err.message : "Couldn't update memory" });
        return false;
      }
    });

  return (
    <>
      <Section title="Memory">
        <button className={`px-btn w-full !justify-start ${enabled ? "" : "secondary"}`} disabled={busy} aria-pressed={enabled} onClick={() => act("/api/player/settings", { aiMemory: !enabled }, "PATCH")}>
          🧠 Memory is {enabled ? "ON — Four Wins AI can read what's saved below" : "OFF — Four Wins AI won't read or suggest memories"}
        </button>
        <p className="mt-2 text-xs text-cream-faint">
          Only things you add here, or explicitly approve in chat, are saved. The AI never stores its own guesses. Memories are private to your account and included in your data export.
        </p>
      </Section>
      <Section title="Add a memory">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call("/api/ai/memories", "POST", { category, content: content.trim() }).then((ok) => ok && setContent(""));
          }}
        >
          <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2">
            <Field label="Type">
              <select className="px-input" value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)}>
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {MEMORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What should Four Wins AI remember?">
              <input className="px-input" value={content} maxLength={AI_LIMITS.memoryChars} onChange={(e) => setContent(e.target.value)} placeholder="e.g. I'm at uni Mon–Wed until 3pm" />
            </Field>
          </div>
          <button className="px-btn w-full" disabled={busy || !content.trim()}>
            Save memory
          </button>
        </form>
      </Section>
      <Section
        title={`Saved memories (${memories.length})`}
        right={
          memories.length > 0 && (
            <button className="px-ghost text-xs text-danger" onClick={() => confirm("Delete every saved memory?") && void call("/api/ai/memories", "DELETE")}>
              Delete all
            </button>
          )
        }
      >
        {memories.length === 0 ? (
          <Empty>No memories yet.</Empty>
        ) : (
          <ul className="space-y-1.5" data-testid="ai-memory-list">
            {memories.map((m) => (
              <li key={m.id} className="px-card p-2.5 text-sm">
                <div className="font-pixel text-[11px] text-[#5ff0e0]">
                  {MEMORY_LABELS[m.category].toUpperCase()}
                  {m.source === "ai_approved" && <span className="text-cream-faint"> · approved from chat</span>}
                </div>
                {editing === m.id ? (
                  <form
                    className="mt-1 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void call(`/api/ai/memories/${m.id}`, "PATCH", { content: editText.trim() }).then((ok) => ok && setEditing(null));
                    }}
                  >
                    <input className="px-input flex-1 !py-1" value={editText} maxLength={AI_LIMITS.memoryChars} onChange={(e) => setEditText(e.target.value)} aria-label="Edit memory" autoFocus />
                    <button className="px-btn small" disabled={busy || !editText.trim()}>
                      Save
                    </button>
                    <button type="button" className="px-ghost text-xs" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span>{m.content}</span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        className="px-ghost text-xs"
                        onClick={() => {
                          setEditing(m.id);
                          setEditText(m.content);
                        }}
                      >
                        Edit
                      </button>
                      <button className="px-ghost text-xs text-danger" onClick={() => void call(`/api/ai/memories/${m.id}`, "DELETE")}>
                        Delete
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function LocationTab() {
  const s = useGameState();
  const { act } = useGame();
  const enabled = s.player.settings.locationAwareness;
  const coords = useLocation();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [permission, setPermission] = useState<string>("unknown");

  useEffect(() => {
    void permissionState().then(setPermission);
  }, [coords, error]);

  const check = async () => {
    setChecking(true);
    setError("");
    try {
      setLocation(await checkLocation());
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location.");
    } finally {
      setChecking(false);
    }
  };
  const forget = () => setLocation(null);

  return (
    <>
      <Section title="Location awareness">
        <button
          className={`px-btn w-full !justify-start ${enabled ? "" : "secondary"}`}
          aria-pressed={enabled}
          data-testid="location-toggle"
          onClick={() => {
            if (enabled) forget();
            void act("/api/player/settings", { locationAwareness: !enabled }, "PATCH");
          }}
        >
          📍 {enabled ? "Location awareness is ON" : "Enable location awareness"}
        </button>
        <p className="mt-2 text-xs text-cream-faint">
          Off by default. When on, you can check your location here — once, when you press the button. There&apos;s no background tracking, coordinates are never saved, and
          Four Wins AI only receives an approximate location (±1 km) on messages where you tick the box.
        </p>
      </Section>
      {enabled && (
        <Section title="Check my location">
          <button className="px-btn" onClick={() => void check()} disabled={checking} data-testid="location-check">
            {checking ? "Locating…" : "📍 Check my location"}
          </button>
          {coords && (
            <div className="px-card mt-3 p-3 text-sm" data-testid="location-result">
              <div className="font-pixel text-gold">You are here</div>
              <div>
                {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
              </div>
              <div className="text-xs text-cream-faint">
                Accurate to about {Math.round(coords.accuracy)} m · checked {new Date(coords.at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
              </div>
              <button className="px-ghost mt-1 text-xs" onClick={forget}>
                Forget location
              </button>
            </div>
          )}
          {error && (
            <p className="mt-3 text-sm text-danger" role="alert" data-testid="location-error">
              {error}
            </p>
          )}
          <p className="mt-2 text-xs text-cream-faint">Browser permission: {permission}. You can revoke it any time in your browser&apos;s site settings.</p>
        </Section>
      )}
      <Section title="Coming later">
        <p className="mb-2 text-sm text-cream-dim">Nearby places will appear here once a maps provider is connected:</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.values(PLACE_LABELS).map((l) => (
            <span key={l} className="px-card px-2 py-1 text-xs text-cream-faint">
              {l}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}

export function AiPanel({ onClose }: { onClose: () => void }) {
  const { applyResult, toast } = useGame();
  const [tab, setTab] = useState<"chat" | "memory" | "location">("chat");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [messages, setMessages] = useState<AiMessageView[]>([]);
  const [proposals, setProposals] = useState<AiProposalView[]>([]);
  const [memories, setMemories] = useState<AiMemoryView[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ status: AiStatus; messages: AiMessageView[]; proposals: AiProposalView[] }>("/api/ai/chat"),
      api<{ memories: AiMemoryView[] }>("/api/ai/memories"),
    ])
      .then(([c, m]) => {
        if (!alive) return;
        setStatus(c.status);
        setMessages(c.messages);
        setProposals(c.proposals);
        setMemories(m.memories);
      })
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : "Couldn't load Four Wins AI"));
    return () => {
      alive = false;
    };
  }, []);

  const decide = useCallback(
    async (p: AiProposalView, decision: "approve" | "dismiss", repeat = false) => {
      try {
        const res = await api<{ state: GameState; events: GameEvent[]; proposals: AiProposalView[]; memories: AiMemoryView[] }>(`/api/ai/proposals/${p.id}`, {
          body: { decision, repeat },
        });
        setProposals(res.proposals);
        setMemories(res.memories);
        applyResult(res);
        if (decision === "approve") {
          play("unlock");
          toast(
            p.kind === "mission"
              ? { kind: "info", title: "Mission added", detail: `“${p.payload.title}” is on today's board${repeat ? " and will repeat daily" : ""}.` }
              : { kind: "info", title: "Memory saved", detail: p.payload.content },
          );
        }
      } catch (err) {
        toast({ kind: "error", title: err instanceof Error ? err.message : "Couldn't update that suggestion" });
      }
    },
    [applyResult, toast],
  );

  const clear = useCallback(async () => {
    await api("/api/ai/chat", { method: "DELETE" });
    setMessages([]);
    setProposals([]);
  }, []);

  return (
    <Sheet title="Four Wins AI" subtitle="Your Personal Guide" icon={<BotAvatar size={1} />} accent="#5ff0e0" onClose={onClose} variant="float">
      <Tabs
        tabs={[
          { id: "chat", label: "Chat" },
          { id: "memory", label: `Memory (${memories.length})` },
          { id: "location", label: "Location" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {tab === "chat" && (
        <ChatTab
          status={status}
          messages={messages}
          proposals={proposals}
          setMessages={setMessages}
          setProposals={setProposals}
          setStatus={setStatus}
          onDecide={decide}
          onClear={clear}
        />
      )}
      {tab === "memory" && <MemoryTab memories={memories} setMemories={setMemories} />}
      {tab === "location" && <LocationTab />}
    </Sheet>
  );
}
