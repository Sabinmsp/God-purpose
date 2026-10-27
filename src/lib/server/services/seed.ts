// Default world content for a brand-new player. No progress is assumed:
// zero XP, empty vaults, no workouts. Every value here is editable in-game.
import type postgres from "postgres";

type Seeder = postgres.ISql;

interface QuestSeed {
  pillar: string;
  title: string;
  xp: number;
  autoKey?: string;
  autoOnly?: boolean;
  onBoard?: boolean;
  goal?: string;
}

const QUESTS: QuestSeed[] = [
  { pillar: "mental", title: "Code for 60 minutes", xp: 50, onBoard: true, goal: "engineer" },
  { pillar: "mental", title: "Read for 20 minutes", xp: 20, onBoard: true, goal: "focus" },
  { pillar: "mental", title: "Complete 2 hours of deep work", xp: 100, goal: "focus" },
  { pillar: "mental", title: "Learn a new technical concept", xp: 25, autoKey: "learning", goal: "engineer" },
  { pillar: "mental", title: "Journal: plan & review your focus", xp: 15 },
  { pillar: "mental", title: "One-hour phone-free focus block", xp: 20 },
  { pillar: "physical", title: "Complete a gym workout", xp: 100, autoKey: "workout", onBoard: true, goal: "training" },
  { pillar: "physical", title: "Meet your nutrition goal", xp: 30, onBoard: true },
  { pillar: "physical", title: "Walk 8,000 steps", xp: 30 },
  { pillar: "physical", title: "Meet your sleep goal", xp: 40 },
  { pillar: "physical", title: "Set a new personal record", xp: 100, autoKey: "pr", autoOnly: true },
  { pillar: "physical", title: "Log body measurements", xp: 15, autoKey: "measurement", goal: "weight" },
  { pillar: "spiritual", title: "Meditate for 10 minutes", xp: 30, onBoard: true, goal: "mindful" },
  { pillar: "spiritual", title: "Evening reflection", xp: 30, autoKey: "reflection", onBoard: true, goal: "mindful" },
  { pillar: "spiritual", title: "Write three gratitude notes", xp: 20, autoKey: "gratitude3", autoOnly: true, goal: "gratitude" },
  { pillar: "spiritual", title: "Journal about the day", xp: 25, autoKey: "journal" },
  { pillar: "spiritual", title: "One hour without social media", xp: 20 },
  { pillar: "spiritual", title: "Meaningful time with family", xp: 25 },
  { pillar: "financial", title: "Record today's expenses", xp: 15, autoKey: "expense_log", onBoard: true },
  { pillar: "financial", title: "Contribute to a savings goal (if affordable)", xp: 30, autoKey: "savings_deposit", onBoard: true, goal: "tuition" },
  { pillar: "financial", title: "Weekly budget review", xp: 25 },
  { pillar: "financial", title: "Learn one money concept", xp: 20 },
];

interface GoalSeed {
  ref: string;
  pillar: string;
  title: string;
  description: string;
  unit: string;
  start: number | null;
  target: number | null;
  current?: number | null;
  linked?: string;
  milestones?: { label: string; value: number }[];
}

const pctMilestones = (target: number) =>
  [10, 25, 50, 75, 100].map((p) => ({ label: `${p}%`, value: Math.round((target * p) / 100) }));

const GOALS: GoalSeed[] = [
  { ref: "focus", pillar: "mental", title: "Improve focus and discipline", description: "Win at least one Mental quest on 30 different days.", unit: "days", start: 0, target: 30, linked: "days:mental", milestones: [{ label: "First week", value: 7 }, { label: "Two weeks", value: 14 }, { label: "30 days", value: 30 }] },
  { ref: "engineer", pillar: "mental", title: "Become a better software & AI engineer", description: "Hours of deliberate coding and AI study. Update as you go.", unit: "hours", start: 0, target: 100, current: 0, milestones: [{ label: "25 h", value: 25 }, { label: "50 h", value: 50 }, { label: "100 h", value: 100 }] },
  { ref: "weight", pillar: "physical", title: "Reach your 80 kg body-weight target", description: "A target you chose. Measured from your recorded weigh-ins only — edit it any time.", unit: "kg", start: null, target: 80, linked: "body:weight" },
  { ref: "training", pillar: "physical", title: "Build consistent training habits", description: "Workouts logged this week (resets every Monday).", unit: "workouts / week", start: 0, target: 4, linked: "workouts:week" },
  { ref: "strength", pillar: "physical", title: "Build a stronger physique", description: "Set a measurable strength target, e.g. a lift you want to reach.", unit: "kg", start: null, target: null, current: null },
  { ref: "gratitude", pillar: "spiritual", title: "Develop gratitude", description: "Write gratitude notes on 30 different days.", unit: "days", start: 0, target: 30, linked: "days:gratitude" },
  { ref: "mindful", pillar: "spiritual", title: "Practise mindfulness and reflection", description: "Win at least one Spiritual quest on 30 different days.", unit: "days", start: 0, target: 30, linked: "days:spiritual" },
  { ref: "tuition", pillar: "financial", title: "Save A$13,000 for university tuition", description: "Linked to the Tuition Vault.", unit: "A$", start: 0, target: 13000, linked: "savings:tuition", milestones: pctMilestones(13000) },
  { ref: "car", pillar: "financial", title: "Save A$10,000 for a car", description: "Linked to the Car Vault.", unit: "A$", start: 0, target: 10000, linked: "savings:car", milestones: pctMilestones(10000) },
];

export async function seedPlayer(tx: Seeder, playerId: string, today: string) {
  const goalIds: Record<string, string> = {};
  let order = 0;
  for (const g of GOALS) {
    const [row] = await tx<{ id: string }[]>`
      insert into goals (player_id, pillar, title, description, unit, start_value, target_value, current_value,
                         linked_source, start_date, milestones, sort_order)
      values (${playerId}, ${g.pillar}, ${g.title}, ${g.description}, ${g.unit}, ${g.start}, ${g.target},
              ${g.current ?? null}, ${g.linked ?? null}, ${today}, ${tx.json((g.milestones ?? []) as never)}, ${order++})
      returning id
    `;
    goalIds[g.ref] = row.id;
  }

  order = 0;
  for (const q of QUESTS) {
    await tx`
      insert into quest_definitions (player_id, pillar, title, xp, auto_key, auto_only, on_board, goal_id, sort_order)
      values (${playerId}, ${q.pillar}, ${q.title}, ${q.xp}, ${q.autoKey ?? null}, ${q.autoOnly ?? false},
              ${q.onBoard ?? false}, ${q.goal ? goalIds[q.goal] : null}, ${order++})
    `;
  }

  await tx`
    insert into savings_goals (player_id, key, name, target_cents, start_date, sort_order) values
      (${playerId}, 'tuition', 'Tuition Vault', 1300000, ${today}, 0),
      (${playerId}, 'car', 'Car Vault', 1000000, ${today}, 1)
  `;
}
