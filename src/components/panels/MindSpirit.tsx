"use client";

import { useState } from "react";
import { useGame, useGameState } from "@/client/store";
import { PILLAR_META } from "@/lib/shared/pillars";
import type { JournalEntryView } from "@/lib/shared/types";
import { AddFromLibrary, QuestList } from "../quests";
import { Empty, Field, Section, Sheet, Tabs, useBusy } from "../ui";
import { PillarGoals, PillarHeader, UnlockTrack } from "./common";

function Entries({ kind }: { kind: JournalEntryView["kind"] }) {
  const s = useGameState();
  const entries = s.today.journal.filter((j) => j.kind === kind);
  if (!entries.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {entries.map((e) => (
        <li key={e.id} className="px-card whitespace-pre-wrap px-3 py-2 text-sm text-cream-dim">
          {e.body}
        </li>
      ))}
    </ul>
  );
}

function JournalBox({ kind, label, placeholder, cta }: { kind: JournalEntryView["kind"]; label: string; placeholder: string; cta: string }) {
  const { act } = useGame();
  const { busy, run } = useBusy();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          if (await act("/api/journal", { kind, body: text.trim() })) setText("");
        });
      }}
    >
      <Field label={label}>
        <textarea className="px-input min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={4000} />
      </Field>
      <button className="px-btn mt-2 w-full" disabled={busy || !text.trim()}>
        {cta}
      </button>
      <Entries kind={kind} />
    </form>
  );
}

export function MindPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"quests" | "learn" | "goals">("quests");
  return (
    <Sheet title="Mind Temple" subtitle="Focus · discipline · learning" icon="🧠" accent={PILLAR_META.mental.color} onClose={onClose}>
      <PillarHeader pillar="mental" />
      <Tabs
        tabs={[
          { id: "quests", label: "Quests" },
          { id: "learn", label: "Learning log" },
          { id: "goals", label: "Goals" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "quests" && (
        <>
          <Section title="Today's mental quests">
            <QuestList pillar="mental" />
            <AddFromLibrary pillar="mental" />
          </Section>
          <Section title="Temple unlocks">
            <UnlockTrack pillar="mental" />
          </Section>
        </>
      )}
      {tab === "learn" && (
        <Section title="What did you learn today?">
          <p className="mb-2 text-sm text-cream-dim">Writing a learning note completes “Learn a new technical concept”.</p>
          <JournalBox kind="learning" label="Learning note" placeholder="e.g. How transformer attention scales with sequence length…" cta="Save learning note" />
        </Section>
      )}
      {tab === "goals" && <PillarGoals pillar="mental" />}
    </Sheet>
  );
}

function GratitudeForm() {
  const { act } = useGame();
  const s = useGameState();
  const { busy, run } = useBusy();
  const [notes, setNotes] = useState(["", "", ""]);
  const count = s.today.journal.filter((j) => j.kind === "gratitude").length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const filled = notes.map((n) => n.trim()).filter(Boolean);
          for (const body of filled) {
            if (!(await act("/api/journal", { kind: "gratitude", body }))) return;
          }
          setNotes(["", "", ""]);
        });
      }}
    >
      <p className="mb-2 text-sm text-cream-dim">
        {count >= 3 ? `You've written ${count} gratitude notes today. 🙏` : `${count}/3 notes today — three complete the gratitude quest.`}
      </p>
      <div className="space-y-2">
        {notes.map((n, i) => (
          <input
            key={i}
            className="px-input"
            value={n}
            maxLength={300}
            placeholder={["I'm grateful for…", "Something good that happened…", "Someone who helped me…"][i]}
            onChange={(e) => setNotes((ns) => ns.map((x, j) => (j === i ? e.target.value : x)))}
            aria-label={`Gratitude note ${i + 1}`}
          />
        ))}
      </div>
      <button className="px-btn mt-2 w-full" disabled={busy || notes.every((n) => !n.trim())}>
        Save gratitude
      </button>
      <Entries kind="gratitude" />
    </form>
  );
}

export function SanctuaryPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"quests" | "gratitude" | "reflect" | "goals">("quests");
  const s = useGameState();
  return (
    <Sheet title="Spirit Sanctuary" subtitle="Reflection · gratitude · stillness" icon="🧘" accent={PILLAR_META.spiritual.color} onClose={onClose}>
      <PillarHeader pillar="spiritual" />
      <Tabs
        tabs={[
          { id: "quests", label: "Quests" },
          { id: "gratitude", label: "Gratitude" },
          { id: "reflect", label: "Reflect" },
          { id: "goals", label: "Goals" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "quests" && (
        <>
          <Section title="Today's spiritual quests">
            <QuestList pillar="spiritual" />
            <AddFromLibrary pillar="spiritual" />
          </Section>
          <p className="mb-4 text-xs text-cream-faint">
            Prayer, meditation or quiet reflection — practise in whatever way is meaningful to you. The Sanctuary never prescribes a belief.
          </p>
          <Section title="Sanctuary unlocks">
            <UnlockTrack pillar="spiritual" />
          </Section>
        </>
      )}
      {tab === "gratitude" && (
        <Section title="Three good things">
          <GratitudeForm />
        </Section>
      )}
      {tab === "reflect" && (
        <>
          <Section title="Evening reflection">
            <JournalBox
              kind="reflection"
              label="How did today go?"
              placeholder="What went well? What would you do differently? What are you letting go of?"
              cta="Save reflection"
            />
          </Section>
          <Section title="Journal">
            <JournalBox kind="journal" label="Free writing" placeholder="Anything on your mind…" cta="Save journal entry" />
          </Section>
          {s.today.journal.length === 0 && <Empty>Entries are private and saved to your account only.</Empty>}
        </>
      )}
      {tab === "goals" && <PillarGoals pillar="spiritual" />}
    </Sheet>
  );
}
